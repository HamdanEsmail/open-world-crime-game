// The bed of the world under everything else: gusting desert wind and its whistle out in the Amber
// Dunes, surf rolling in from the gulf to the north, the low hum of the city with distant horns and the
// murmur of crowds, gulls over the shore by day, crickets by night, and the howl of the khamsin when
// the sandstorm comes. Each layer fades in by where the camera is, the hour and the weather, and the
// whole bed ducks under the car radio.
import { startNoiseLoop, playTone } from './synthPrimitives.js';
import { startHornVoice } from './soundEffects.js';

/**
 * What the bed should be right now, from the camera's place, the hour and the weather.
 * Fills and returns `out`: {desert, shore, city, crowd, night, storm, height, seaPan, duck}.
 */
export function ambienceMixFor(game, radioPlaying, out) {
  const camera = game.camera;
  const e = camera && camera.matrixWorld ? camera.matrixWorld.elements : null;
  const z = e ? e[14] : 0;
  const y = e ? e[13] : 10;
  out.desert = smooth(780, 950, z);
  out.shore = smooth(-560, -760, z);
  const hour = typeof game.time?.hour === 'number' ? game.time.hour : 12;
  const skyNight = game.sky && typeof game.sky.night === 'number' ? game.sky.night : null;
  out.night = skyNight !== null ? skyNight : Math.max(smooth(19, 20.5, hour), 1 - smooth(4.5, 6, hour));
  out.height = smooth(40, 160, y);
  out.city = (1 - out.desert) * (1 - 0.45 * out.shore) * (1 - 0.6 * out.height);
  out.crowd = out.city * (1 - 0.75 * out.night);
  out.storm = Math.max(0, Math.min(1, game.weather?.sandstorm || 0));
  const rightZ = e ? e[2] : 0;
  const rightX = e ? e[0] : 1;
  out.seaPan = Math.max(-1, Math.min(1, -rightZ / (Math.sqrt(rightX * rightX + rightZ * rightZ) || 1))) * 0.7;
  out.duck = radioPlaying ? 0.5 : 1;
  return out;
}

/**
 * Build the ambience bed on any audio context. apply(mix, when) moves each layer toward `mix`
 * (call it every frame live, or on a schedule offline).
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} destination
 */
export function createCityAmbience(ctx, destination) {
  const t0 = ctx.currentTime;
  const sources = [];
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(destination);
  const pink = stereoNoise(ctx, 'pink', t0, sources);
  const brown = stereoNoise(ctx, 'brown', t0, sources);
  const white = startNoiseLoop(ctx, 'white', t0);
  sources.push(white);

  const wind = layer(ctx, brown, out, 'bandpass', 360, 0.8);
  const whistle = layer(ctx, pink, out, 'bandpass', 1100, 11);
  const surfPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const surfBus = ctx.createGain();
  if (surfPan) surfBus.connect(surfPan).connect(out);
  else surfBus.connect(out);
  const surf = layer(ctx, pink, surfBus, 'lowpass', 600, 0.7);
  const surfLow = layer(ctx, brown, surfBus, 'lowpass', 140, 0.7);
  const hum = layer(ctx, brown, out, 'lowpass', 170, 0.7);
  const swish = layer(ctx, pink, out, 'bandpass', 800, 0.5);
  const crowd = ctx.createGain();
  crowd.gain.value = 0;
  crowd.connect(out);
  const voices = [layer(ctx, pink, crowd, 'bandpass', 520, 2.5), layer(ctx, pink, crowd, 'bandpass', 1500, 3), layer(ctx, pink, crowd, 'bandpass', 2550, 4)];
  const storm = ctx.createGain();
  storm.gain.value = 0;
  storm.connect(out);
  const howl = layer(ctx, pink, storm, 'bandpass', 520, 5);
  const howlHigh = layer(ctx, pink, storm, 'bandpass', 1300, 12);
  const roar = layer(ctx, brown, storm, 'lowpass', 260, 0.7);
  const grit = layer(ctx, white, storm, 'highpass', 4500, 0.7);
  const crickets = ctx.createGain();
  crickets.gain.value = 0;
  crickets.connect(out);
  makeCricket(ctx, crickets, 4450, 29, 1.7, t0, sources);
  makeCricket(ctx, crickets, 5150, 33, 1.25, t0, sources);
  const distant = ctx.createBiquadFilter();
  distant.type = 'lowpass';
  distant.frequency.value = 1400;
  const distantGain = ctx.createGain();
  distantGain.gain.value = 0.5;
  distant.connect(distantGain).connect(out);

  let nextBabble = 0;
  let nextHorn = t0 + 3;
  let nextGull = t0 + 2;

  /** Move every layer toward `mix` from time `when`. */
  function apply(mix, when) {
    const t = when;
    const gust = 0.5 + 0.26 * Math.sin(t * 0.31) + 0.15 * Math.sin(t * 0.73 + 1.3) + 0.09 * Math.sin(t * 1.37 + 0.4);
    const duck = mix.duck ?? 1;
    const tc = 0.25;
    const open = Math.max(mix.desert, mix.height * 0.7);
    wind.filter.frequency.setTargetAtTime(240 + 480 * gust, t, tc);
    wind.gain.gain.setTargetAtTime(open * (0.22 + 0.32 * gust) * duck, t, tc);
    whistle.filter.frequency.setTargetAtTime(900 + 700 * gust, t, tc);
    whistle.gain.gain.setTargetAtTime(open * Math.max(0, gust - 0.55) * 0.5 * duck, t, tc);

    const wave = Math.max(surfEnvelope(t, 7.3), 0.8 * surfEnvelope(t + 2.9, 10.9));
    surf.filter.frequency.setTargetAtTime(320 + 2600 * wave, t, 0.12);
    surf.gain.gain.setTargetAtTime(mix.shore * (0.08 + 0.42 * wave) * duck, t, 0.12);
    surfLow.gain.gain.setTargetAtTime(mix.shore * (0.15 + 0.35 * wave) * duck, t, 0.15);
    if (surfPan) surfPan.pan.setTargetAtTime(mix.seaPan || 0, t, 0.3);

    const traffic = 0.6 + 0.4 * Math.sin(t * 0.21 + 2);
    hum.gain.gain.setTargetAtTime(mix.city * (0.32 - 0.14 * mix.night) * duck, t, tc);
    swish.filter.frequency.setTargetAtTime(600 + 500 * traffic, t, tc);
    swish.gain.gain.setTargetAtTime(mix.city * 0.07 * traffic * (1 - 0.5 * mix.night) * duck, t, tc);

    crowd.gain.setTargetAtTime(mix.crowd * 0.16 * duck, t, tc);
    if (t >= nextBabble) {
      nextBabble = t + 0.07 + Math.random() * 0.1;
      for (let i = 0; i < voices.length; i += 1) voices[i].gain.gain.setTargetAtTime(Math.random() * (i === 0 ? 1 : 0.7), t, 0.035);
      voices[0].filter.frequency.setTargetAtTime(380 + Math.random() * 400, t, 0.04);
      voices[1].filter.frequency.setTargetAtTime(1100 + Math.random() * 900, t, 0.04);
    }

    const s = mix.storm || 0;
    const stormGust = 0.6 + 0.4 * gust;
    storm.gain.setTargetAtTime(s * (0.5 + 0.5 * stormGust), t, 0.3);
    howl.filter.frequency.setTargetAtTime(380 + 520 * gust, t, 0.2);
    howl.gain.gain.setTargetAtTime(0.55, t, 0.5);
    howlHigh.filter.frequency.setTargetAtTime(1100 + 600 * gust, t, 0.2);
    howlHigh.gain.gain.setTargetAtTime(0.22 * gust, t, 0.3);
    roar.gain.gain.setTargetAtTime(0.5, t, 0.5);
    grit.gain.gain.setTargetAtTime(0.05 + 0.05 * gust, t, 0.3);

    crickets.gain.setTargetAtTime(mix.night * (1 - mix.desert * 0.5) * (1 - s) * 0.05 * duck, t, 0.6);

    if (mix.city > 0.3 && t >= nextHorn) {
      nextHorn = t + 5 + Math.random() * 10;
      distantHorn(t, mix.city * (1 - 0.6 * mix.night) * duck);
    }
    if (mix.shore > 0.3 && mix.night < 0.5 && s < 0.3 && t >= nextGull) {
      nextGull = t + 6 + Math.random() * 12;
      gullCry(t, mix.shore * (1 - mix.night) * duck);
    }
  }

  function distantHorn(t, level) {
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain();
    g.gain.value = 0.35 * level;
    if (panner) {
      panner.pan.value = Math.random() * 1.6 - 0.8;
      g.connect(panner).connect(distant);
    } else g.connect(distant);
    const classes = ['sedan', 'compact', 'taxi', 'van', 'truck'];
    const horn = startHornVoice(ctx, g, classes[Math.floor(Math.random() * classes.length)], t);
    horn.stop(t + 0.15 + Math.random() * 0.35);
  }

  function gullCry(t, level) {
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain();
    g.gain.value = level * 0.5;
    if (panner) {
      panner.pan.value = Math.random() * 1.4 - 0.7;
      g.connect(panner).connect(out);
    } else g.connect(out);
    const calls = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < calls; i += 1) {
      const start = t + i * (0.32 + Math.random() * 0.1);
      const f = 1500 + Math.random() * 300;
      playTone(ctx, g, start, { type: 'triangle', freq: f, freqEnd: f * 1.4, sweep: 0.06, attack: 0.02, hold: 0.05, decay: 0.16, gain: 0.05, filter: { type: 'bandpass', freq: f * 1.2, q: 2 } });
      playTone(ctx, g, start + 0.07, { type: 'sawtooth', freq: f * 1.35, freqEnd: f * 0.8, sweep: 0.18, attack: 0.01, decay: 0.18, gain: 0.02, filter: { type: 'bandpass', freq: f * 1.3, q: 3 } });
    }
  }

  return {
    apply,
    stop(when) {
      out.gain.setTargetAtTime(0, when, 0.2);
      for (const source of sources) source.stop(when + 1);
    },
  };
}

/** One wave on the shore: a slow build, the break, then the long wash back. 0..1. */
function surfEnvelope(t, period) {
  const phase = (((t / period) % 1) + 1) % 1;
  if (phase < 0.55) return 0.45 * (phase / 0.55) * (phase / 0.55);
  if (phase < 0.62) return 0.45 + 0.55 * ((phase - 0.55) / 0.07);
  return 0.15 + 0.85 * Math.pow(1 - (phase - 0.62) / 0.38, 1.6);
}

/** Two looping noise sources at different offsets merged into one decorrelated stereo signal. */
function stereoNoise(ctx, color, t0, sources) {
  const merger = ctx.createChannelMerger(2);
  const left = startNoiseLoop(ctx, color, t0);
  const right = startNoiseLoop(ctx, color, t0);
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  sources.push(left, right);
  return merger;
}

/** A filtered layer of the bed with its own gain (starting silent). */
function layer(ctx, source, destination, type, frequency, q) {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(destination);
  return { filter, gain };
}

/** A cricket: a high tone chopped into pulses, the pulses grouped into chirps. */
function makeCricket(ctx, destination, pitch, pulseRate, chirpRate, t0, sources) {
  const tone = ctx.createOscillator();
  tone.frequency.value = pitch;
  const pulses = ctx.createGain();
  pulses.gain.value = 0.5;
  const pulseLfo = ctx.createOscillator();
  pulseLfo.type = 'square';
  pulseLfo.frequency.value = pulseRate;
  const pulseDepth = ctx.createGain();
  pulseDepth.gain.value = 0.5;
  pulseLfo.connect(pulseDepth).connect(pulses.gain);
  const chirps = ctx.createGain();
  chirps.gain.value = 0.3;
  const chirpLfo = ctx.createOscillator();
  chirpLfo.type = 'square';
  chirpLfo.frequency.value = chirpRate;
  const chirpDepth = ctx.createGain();
  chirpDepth.gain.value = 0.3;
  chirpLfo.connect(chirpDepth).connect(chirps.gain);
  const soften = ctx.createBiquadFilter();
  soften.type = 'bandpass';
  soften.frequency.value = pitch;
  soften.Q.value = 4;
  tone.connect(pulses).connect(chirps).connect(soften).connect(destination);
  tone.start(t0);
  pulseLfo.start(t0);
  chirpLfo.start(t0);
  sources.push(tone, pulseLfo, chirpLfo);
}

function smooth(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
