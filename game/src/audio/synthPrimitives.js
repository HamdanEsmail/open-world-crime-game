// The raw material every sound in Port Sarab is cut from: shared noise (white, pink, brown and vinyl
// dust), pulse waves, a reverb tail and soft-clip curves, made once per audio context and reused, plus
// the small building blocks (an enveloped tone, a filtered noise burst) that the gunshots, engines,
// radio stations and the city's ambience are all assembled from.

const kitsByContext = new WeakMap();
const driveCurves = new Map();

/**
 * The shared sound material of one audio context (live or offline), made on first use.
 * @param {BaseAudioContext} ctx
 */
export function getSoundKit(ctx) {
  let kit = kitsByContext.get(ctx);
  if (!kit) {
    kit = {
      white: makeNoiseBuffer(ctx, 2.0, 'white'),
      pink: makeNoiseBuffer(ctx, 3.0, 'pink'),
      brown: makeNoiseBuffer(ctx, 3.0, 'brown'),
      dust: makeVinylDustBuffer(ctx, 4.0),
      pulseWaves: new Map(),
      reverb: null,
    };
    kitsByContext.set(ctx, kit);
  }
  return kit;
}

/**
 * One enveloped oscillator note: a quick attack, an optional hold, then an exponential fall to
 * silence, with an optional pitch sweep and filter. Returns the time the note has died away.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} destination
 * @param {number} when  start time on the context clock
 * @param {{type?:string, wave?:PeriodicWave, freq:number, freqEnd?:number, sweep?:number, detune?:number,
 *          attack?:number, hold?:number, decay?:number, gain?:number,
 *          filter?:{type?:string, freq:number, freqEnd?:number, q?:number, sweep?:number}}} o
 */
export function playTone(ctx, destination, when, o) {
  const attack = o.attack ?? 0.004;
  const hold = o.hold ?? 0;
  const decay = o.decay ?? 0.2;
  const total = attack + hold + decay;
  const osc = ctx.createOscillator();
  if (o.wave) osc.setPeriodicWave(o.wave);
  else osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, when);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), when + (o.sweep ?? total));
  if (o.detune) osc.detune.setValueAtTime(o.detune, when);
  const amp = ctx.createGain();
  shapeEnvelope(amp.gain, when, o.gain ?? 0.5, attack, hold, decay);
  if (o.filter) osc.connect(makeSweptFilter(ctx, when, o.filter, total)).connect(amp);
  else osc.connect(amp);
  amp.connect(destination);
  const end = when + total + 0.03;
  osc.start(when);
  osc.stop(end);
  return end;
}

/**
 * A burst of filtered noise with the same envelope shape as playTone. Returns its end time.
 * @param {{color?:'white'|'pink'|'brown', filter?:string, freq?:number, freqEnd?:number, sweep?:number, q?:number,
 *          attack?:number, hold?:number, decay?:number, gain?:number, rate?:number}} o
 */
export function playNoise(ctx, destination, when, o) {
  const kit = getSoundKit(ctx);
  const attack = o.attack ?? 0.002;
  const hold = o.hold ?? 0;
  const decay = o.decay ?? 0.15;
  const total = attack + hold + decay;
  const src = ctx.createBufferSource();
  const buffer = kit[o.color || 'white'];
  src.buffer = buffer;
  src.loop = true;
  if (o.rate) src.playbackRate.setValueAtTime(o.rate, when);
  const amp = ctx.createGain();
  shapeEnvelope(amp.gain, when, o.gain ?? 0.5, attack, hold, decay);
  if (o.filter) {
    src.connect(makeSweptFilter(ctx, when, { type: o.filter, freq: o.freq ?? 1000, freqEnd: o.freqEnd, q: o.q, sweep: o.sweep }, total)).connect(amp);
  } else {
    src.connect(amp);
  }
  amp.connect(destination);
  const end = when + total + 0.03;
  src.start(when, Math.random() * buffer.duration * 0.8);
  src.stop(end);
  return end;
}

/**
 * Shape a gain parameter: silence, a linear attack to `peak`, a hold, and an exponential decay.
 * @param {AudioParam} param
 */
export function shapeEnvelope(param, when, peak, attack, hold, decay) {
  const top = Math.max(peak, 0.0002);
  param.setValueAtTime(0.0001, when);
  param.linearRampToValueAtTime(top, when + Math.max(attack, 0.0005));
  if (hold > 0) param.setValueAtTime(top, when + attack + hold);
  param.exponentialRampToValueAtTime(0.0001, when + attack + hold + Math.max(decay, 0.005));
}

/** A biquad filter whose cutoff may sweep (exponentially) over `seconds`. */
export function makeSweptFilter(ctx, when, f, seconds) {
  const filter = ctx.createBiquadFilter();
  filter.type = f.type || 'lowpass';
  filter.frequency.setValueAtTime(f.freq, when);
  if (f.freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(20, f.freqEnd), when + (f.sweep ?? seconds));
  if (f.q !== undefined) filter.Q.setValueAtTime(f.q, when);
  return filter;
}

/** A looping noise source, already started at `when` from a random place in the buffer. */
export function startNoiseLoop(ctx, color, when = ctx.currentTime) {
  const kit = getSoundKit(ctx);
  const src = ctx.createBufferSource();
  src.buffer = kit[color] || kit.white;
  src.loop = true;
  src.start(when, Math.random() * src.buffer.duration * 0.9);
  return src;
}

/**
 * A band-limited pulse wave with the given duty cycle (0.5 is a square, 0.1 a thin nasal buzz),
 * cached per context. Engines and leads use it for their reedy edge.
 */
export function getPulseWave(ctx, duty) {
  const kit = getSoundKit(ctx);
  const key = Math.round(duty * 100);
  let wave = kit.pulseWaves.get(key);
  if (!wave) {
    const harmonics = 48;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    const d = key / 100;
    for (let k = 1; k < harmonics; k += 1) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
    wave = ctx.createPeriodicWave(real, imag);
    kit.pulseWaves.set(key, wave);
  }
  return wave;
}

/** A tanh saturation curve for a WaveShaperNode; `amount` 1 is gentle warmth, 8 is fuzz. Shared by all contexts. */
export function getDriveCurve(amount) {
  const key = Math.round(amount * 10);
  let curve = driveCurves.get(key);
  if (!curve) {
    const k = Math.max(0.1, key / 10);
    const norm = Math.tanh(k);
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * k) / norm;
    }
    driveCurves.set(key, curve);
  }
  return curve;
}

/** A WaveShaperNode set to `amount` of drive. */
export function makeDrive(ctx, amount) {
  const shaper = ctx.createWaveShaper();
  shaper.curve = getDriveCurve(amount);
  shaper.oversample = 'none';
  return shaper;
}

/**
 * A stereo reverb tail (about two seconds of darkening, decaying noise) for the radio's sense of
 * space, made once per context.
 */
export function getReverbImpulse(ctx) {
  const kit = getSoundKit(ctx);
  if (kit.reverb) return kit.reverb;
  const seconds = 2.2;
  const rate = ctx.sampleRate;
  const length = Math.floor(seconds * rate);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / rate;
      const decay = Math.exp(-t / 0.42);
      const darken = Math.min(0.92, 0.25 + t * 0.5);
      smooth = smooth * darken + (Math.random() * 2 - 1) * (1 - darken);
      data[i] = smooth * decay * (t < 0.012 ? t / 0.012 : 1);
    }
  }
  normalizeBuffer(buffer, 0.5);
  kit.reverb = buffer;
  return buffer;
}

/** Note number to frequency (69 is A440). */
export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Linear gain of a level in decibels. */
export function dbToGain(db) {
  return Math.pow(10, db / 20);
}

/** Fill a buffer with white, pink or brown noise, normalized and seamless when looped. */
function makeNoiseBuffer(ctx, seconds, color) {
  const rate = ctx.sampleRate;
  const length = Math.floor(seconds * rate);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let a = 0;
  let b = 0;
  let c = 0;
  let brown = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    if (color === 'pink') {
      // Three leaky integrators at spread time constants tilt white noise toward -3 dB per octave.
      a = 0.9965 * a + 0.031 * white;
      b = 0.9830 * b + 0.036 * white;
      c = 0.9400 * c + 0.052 * white;
      data[i] = a + b + c + white * 0.11;
    } else if (color === 'brown') {
      brown = (brown + 0.025 * white) * 0.996;
      data[i] = brown;
    } else {
      data[i] = white;
    }
  }
  // Remove the drift between the first and last sample so the loop point never clicks.
  const drift = data[length - 1] - data[0];
  for (let i = 0; i < length; i += 1) data[i] -= drift * (i / (length - 1));
  normalizeBuffer(buffer, 0.9);
  return buffer;
}

/** Sparse crackle and pops over a faint hiss: the dust of an old record for the lounge station. */
function makeVinylDustBuffer(ctx, seconds) {
  const rate = ctx.sampleRate;
  const length = Math.floor(seconds * rate);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let hiss = 0;
  for (let i = 0; i < length; i += 1) {
    hiss = hiss * 0.6 + (Math.random() * 2 - 1) * 0.4;
    data[i] += hiss * 0.025;
    const roll = Math.random();
    if (roll < 0.00045 || roll > 0.999985) {
      const size = roll > 0.999985 ? 1 : 0.15 + Math.random() * 0.55;
      const width = 8 + Math.floor(Math.random() * (roll > 0.999985 ? 120 : 40));
      let sign = Math.random() < 0.5 ? -1 : 1;
      for (let k = 0; k < width && i + k < length; k += 1) {
        data[i + k] += sign * size * Math.exp(-k / (width * 0.25));
        if (k % 3 === 2) sign = -sign;
      }
    }
  }
  normalizeBuffer(buffer, 0.8);
  return buffer;
}

/** Scale a buffer so its loudest sample reaches `peak`. */
function normalizeBuffer(buffer, peak) {
  let max = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
  }
  if (max <= 0) return;
  const scale = peak / max;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) data[i] *= scale;
  }
}
