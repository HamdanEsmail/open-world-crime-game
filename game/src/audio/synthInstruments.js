// The band behind Port Sarab's radio, all synthesized: a drum kit, hand drums for Radio Khamsin (the deep
// doum and sharp tek of a goblet drum, a jingling frame drum), basses, pads, chord stabs, an electric
// piano, gritty power chords, leads, an oud-like pluck, a breathy reed flute and drones. Every voice is
// one function (ctx, out, time, event) that schedules its own nodes and lets them go.
import { playTone, playNoise, midiToHz, getPulseWave, makeDrive } from './synthPrimitives.js';

/**
 * Play one sequenced event on its channel. `channels` maps channel names to mixer inputs.
 * @param {BaseAudioContext} ctx
 * @param {Object<string, AudioNode>} channels
 * @param {{inst:string, vel?:number, midi?:number, notes?:number[], dur?:number, from?:number, p?:Object, ch?:string}} ev
 * @param {number} t
 */
export function playInstrument(ctx, channels, ev, t) {
  const voice = INSTRUMENTS[ev.inst];
  if (!voice) return;
  const out = channels[ev.ch || INSTRUMENT_CHANNELS[ev.inst]] || channels.keys;
  if (!out) return;
  voice(ctx, out, t, ev, ev.p || NO_PARAMS, ev.vel ?? 0.8);
}

/** Which mixer channel each instrument plays into. */
export const INSTRUMENT_CHANNELS = {
  kick: 'drums', snare: 'drums', clap: 'drums', hat: 'drums', openHat: 'drums', ride: 'drums', crash: 'drums',
  tom: 'drums', shaker: 'drums', rim: 'drums', doum: 'drums', tek: 'drums', ka: 'drums', frameDrum: 'drums',
  frameSlap: 'drums', bass: 'bass', pad: 'keys', stab: 'keys', keys: 'keys', powerChord: 'keys', drone: 'keys',
  lead: 'lead', pluck: 'lead', ney: 'lead', bell: 'lead', blip: 'lead', riser: 'fx',
};

const NO_PARAMS = {};

const INSTRUMENTS = {
  kick(ctx, out, t, ev, p, vel) {
    const tune = p.tune || 1;
    playTone(ctx, out, t, { freq: 165 * tune, freqEnd: 47 * tune, sweep: 0.09, attack: 0.002, decay: 0.3 * (p.decay || 1), gain: 0.85 * vel });
    playNoise(ctx, out, t, { filter: 'highpass', freq: 2500, attack: 0.0005, decay: 0.008, gain: 0.14 * vel * (p.click ?? 1) });
  },
  snare(ctx, out, t, ev, p, vel) {
    playTone(ctx, out, t, { type: 'triangle', freq: 200 * (p.tune || 1), freqEnd: 165, attack: 0.001, decay: 0.09, gain: 0.32 * vel });
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 1900, q: 0.7, attack: 0.001, decay: 0.16 * (p.decay || 1), gain: 0.42 * vel });
    playNoise(ctx, out, t, { filter: 'highpass', freq: 5200, attack: 0.001, decay: 0.08, gain: 0.14 * vel });
  },
  clap(ctx, out, t, ev, p, vel) {
    for (const d of [0, 0.011, 0.023]) playNoise(ctx, out, t + d, { filter: 'bandpass', freq: 1300, q: 1.2, attack: 0.0006, decay: 0.01, gain: 0.32 * vel });
    playNoise(ctx, out, t + 0.03, { filter: 'bandpass', freq: 1200, q: 1, attack: 0.001, decay: 0.15, gain: 0.3 * vel });
  },
  hat(ctx, out, t, ev, p, vel) {
    playNoise(ctx, out, t, { filter: 'highpass', freq: 7600, attack: 0.0006, decay: 0.035, gain: 0.17 * vel });
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 10500, q: 2, attack: 0.0006, decay: 0.02, gain: 0.07 * vel });
  },
  openHat(ctx, out, t, ev, p, vel) {
    playNoise(ctx, out, t, { filter: 'highpass', freq: 7000, attack: 0.001, decay: 0.22, gain: 0.13 * vel });
  },
  ride(ctx, out, t, ev, p, vel) {
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 6500, q: 1.5, attack: 0.001, decay: 0.42, gain: 0.09 * vel });
    playTone(ctx, out, t, { type: 'triangle', freq: 3150, attack: 0.001, decay: 0.2, gain: 0.025 * vel });
  },
  crash(ctx, out, t, ev, p, vel) {
    playNoise(ctx, out, t, { filter: 'highpass', freq: 4500, attack: 0.002, decay: 1.3, gain: 0.17 * vel });
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 8000, q: 1, attack: 0.002, decay: 0.6, gain: 0.07 * vel });
  },
  tom(ctx, out, t, ev, p, vel) {
    const f = ev.midi ? midiToHz(ev.midi) : 140;
    playTone(ctx, out, t, { freq: f * 1.5, freqEnd: f, sweep: 0.05, attack: 0.001, decay: 0.3, gain: 0.6 * vel });
    playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 900, attack: 0.001, decay: 0.05, gain: 0.14 * vel });
  },
  shaker(ctx, out, t, ev, p, vel) {
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 6200, q: 1.2, attack: 0.012, decay: 0.04, gain: 0.11 * vel });
  },
  rim(ctx, out, t, ev, p, vel) {
    playTone(ctx, out, t, { type: 'triangle', freq: 1700, attack: 0.0006, decay: 0.025, gain: 0.2 * vel });
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 3500, q: 2, attack: 0.0006, decay: 0.012, gain: 0.14 * vel });
  },
  /** The goblet drum's deep centre stroke. */
  doum(ctx, out, t, ev, p, vel) {
    playTone(ctx, out, t, { freq: 122, freqEnd: 78, sweep: 0.12, attack: 0.002, decay: 0.42, gain: 0.72 * vel });
    playTone(ctx, out, t, { freq: 225, freqEnd: 150, attack: 0.001, decay: 0.12, gain: 0.14 * vel });
    playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 420, attack: 0.001, decay: 0.04, gain: 0.16 * vel });
  },
  /** The goblet drum's ringing rim stroke. */
  tek(ctx, out, t, ev, p, vel) {
    playTone(ctx, out, t, { freq: 660, freqEnd: 610, attack: 0.0006, decay: 0.065, gain: 0.3 * vel });
    playTone(ctx, out, t, { freq: 1190, attack: 0.0006, decay: 0.05, gain: 0.08 * vel });
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 3200, q: 1.5, attack: 0.0006, decay: 0.03, gain: 0.26 * vel });
  },
  /** The softer off-hand rim stroke. */
  ka(ctx, out, t, ev, p, vel) {
    playTone(ctx, out, t, { freq: 575, attack: 0.0006, decay: 0.04, gain: 0.17 * vel });
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 2600, q: 1.5, attack: 0.0006, decay: 0.02, gain: 0.13 * vel });
  },
  frameDrum(ctx, out, t, ev, p, vel) {
    playTone(ctx, out, t, { freq: 96, freqEnd: 70, sweep: 0.15, attack: 0.003, decay: 0.5, gain: 0.62 * vel });
    playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 600, attack: 0.002, decay: 0.08, gain: 0.2 * vel });
    playNoise(ctx, out, t + 0.004, { filter: 'bandpass', freq: 5600, q: 1, attack: 0.004, decay: 0.22, gain: 0.05 * vel });
  },
  frameSlap(ctx, out, t, ev, p, vel) {
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 1500, q: 0.9, attack: 0.0008, decay: 0.05, gain: 0.32 * vel });
    playTone(ctx, out, t, { freq: 300, freqEnd: 200, attack: 0.001, decay: 0.06, gain: 0.18 * vel });
    playNoise(ctx, out, t + 0.004, { filter: 'bandpass', freq: 5800, q: 1, attack: 0.003, decay: 0.16, gain: 0.05 * vel });
  },

  /** A bass note: oscillator plus a clean sub through a low-pass whose envelope gives the pluck. */
  bass(ctx, out, t, ev, p, vel) {
    const f = midiToHz(ev.midi);
    const dur = Math.max(0.05, ev.dur || 0.2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = p.q ?? 4;
    const cutoff = p.cutoff ?? 400;
    filter.frequency.setValueAtTime(cutoff + (p.env ?? 1800) * vel, t);
    filter.frequency.exponentialRampToValueAtTime(cutoff, t + (p.decay ?? 0.14));
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.42 * vel, t + 0.004);
    amp.gain.setValueAtTime(0.34 * vel, t + dur);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.07);
    let head = filter;
    if (p.drive) {
      const drive = makeDrive(ctx, p.drive);
      drive.connect(filter);
      head = drive;
    }
    filter.connect(amp).connect(out);
    const osc = ctx.createOscillator();
    if (p.wave === 'pulse') osc.setPeriodicWave(getPulseWave(ctx, 0.25));
    else osc.type = p.wave || 'sawtooth';
    osc.frequency.setValueAtTime(ev.from ? midiToHz(ev.from) : f, t);
    if (ev.from) osc.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    osc.connect(head);
    const sub = ctx.createOscillator();
    sub.frequency.value = f;
    const subGain = ctx.createGain();
    subGain.gain.value = p.sub ?? 0.5;
    sub.connect(subGain).connect(amp);
    const end = t + dur + 0.09;
    osc.start(t);
    sub.start(t);
    osc.stop(end);
    sub.stop(end);
  },

  /** A held chord: two detuned saws per note, a gentle low-pass, slow in and slow out. */
  pad(ctx, out, t, ev, p, vel) {
    const dur = ev.dur || 2;
    const attack = p.attack ?? 0.35;
    const release = p.release ?? 0.7;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.cutoff ?? 1400;
    filter.Q.value = 0.6;
    const amp = ctx.createGain();
    const level = (0.09 * vel) / Math.sqrt(ev.notes.length);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(level, t + attack);
    amp.gain.setValueAtTime(level, t + Math.max(attack, dur));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, dur) + release);
    filter.connect(amp).connect(out);
    const end = t + Math.max(attack, dur) + release + 0.05;
    for (const midi of ev.notes) {
      for (const cents of [-(p.detune ?? 8), p.detune ?? 8]) {
        const osc = ctx.createOscillator();
        osc.type = p.wave || 'sawtooth';
        osc.frequency.value = midiToHz(midi);
        osc.detune.value = cents;
        osc.connect(filter);
        osc.start(t);
        osc.stop(end);
      }
    }
  },

  /** A short brassy chord stab with a snapping filter. */
  stab(ctx, out, t, ev, p, vel) {
    const decay = p.decay ?? 0.18;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    const cutoff = p.cutoff ?? 1800;
    filter.frequency.setValueAtTime(cutoff * 2.4, t);
    filter.frequency.exponentialRampToValueAtTime(cutoff * 0.4, t + decay);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime((0.16 * vel) / Math.sqrt(ev.notes.length), t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay + 0.05);
    filter.connect(amp).connect(out);
    for (const midi of ev.notes) {
      for (const wave of ['sawtooth', 'square']) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = midiToHz(midi);
        osc.detune.value = wave === 'square' ? 7 : -4;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + decay + 0.08);
      }
    }
  },

  /** An electric piano: a sine carrier lit by a decaying FM shimmer, with a soft tine on top. */
  keys(ctx, out, t, ev, p, vel) {
    const notes = ev.notes || [ev.midi];
    const dur = ev.dur || 0.5;
    const level = (0.2 * vel) / Math.sqrt(notes.length);
    for (const midi of notes) {
      const f = midiToHz(midi);
      const carrier = ctx.createOscillator();
      carrier.frequency.value = f;
      const mod = ctx.createOscillator();
      mod.frequency.value = f;
      const index = ctx.createGain();
      index.gain.setValueAtTime(f * (p.bright ?? 1.8), t);
      index.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.35);
      mod.connect(index).connect(carrier.frequency);
      if (p.wow) {
        const wow = ctx.createOscillator();
        wow.frequency.value = 0.55;
        const wowDepth = ctx.createGain();
        wowDepth.gain.value = p.wow;
        wow.connect(wowDepth).connect(carrier.detune);
        wow.start(t);
        wow.stop(t + dur + 0.6);
      }
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.linearRampToValueAtTime(level, t + 0.005);
      amp.gain.setTargetAtTime(level * 0.25, t + 0.01, 0.9);
      amp.gain.setTargetAtTime(0.0001, t + dur, 0.12);
      carrier.connect(amp).connect(out);
      playTone(ctx, out, t, { freq: f * 4, attack: 0.001, decay: 0.12, gain: level * 0.18 });
      const end = t + dur + 0.6;
      carrier.start(t);
      mod.start(t);
      carrier.stop(end);
      mod.stop(end);
    }
  },

  /** A distorted root-fifth-octave chord, the desert-rock guitar of Dune FM. */
  powerChord(ctx, out, t, ev, p, vel) {
    const dur = ev.dur || 0.3;
    const drive = makeDrive(ctx, p.drive ?? 6);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = p.cutoff ?? 2600;
    tone.Q.value = 0.9;
    const low = ctx.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 90;
    const amp = ctx.createGain();
    const level = 0.14 * vel;
    const muted = dur < 0.2;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(level, t + 0.005);
    if (muted) amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    else {
      amp.gain.setTargetAtTime(level * 0.7, t + 0.02, 0.3);
      amp.gain.setTargetAtTime(0.0001, t + dur, 0.06);
    }
    const pre = ctx.createGain();
    pre.gain.value = 0.7;
    pre.connect(drive).connect(tone).connect(low).connect(amp).connect(out);
    const end = t + dur + 0.35;
    for (const midi of ev.notes) {
      for (const cents of [-6, 5]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToHz(midi);
        osc.detune.value = cents;
        osc.connect(pre);
        osc.start(t);
        osc.stop(end);
      }
    }
  },

  /** A held drone: saws through a slowly breathing low-pass. */
  drone(ctx, out, t, ev, p, vel) {
    const dur = ev.dur || 4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.cutoff ?? 520;
    filter.Q.value = 1.5;
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.13;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = (p.cutoff ?? 520) * 0.4;
    breath.connect(breathDepth).connect(filter.frequency);
    const amp = ctx.createGain();
    const level = (0.1 * vel) / Math.sqrt(ev.notes.length);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(level, t + Math.min(1.2, dur * 0.3));
    amp.gain.setValueAtTime(level, t + dur);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
    filter.connect(amp).connect(out);
    const end = t + dur + 1.25;
    breath.start(t);
    breath.stop(end);
    for (const midi of ev.notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = (Math.random() - 0.5) * 10;
      osc.connect(filter);
      osc.start(t);
      osc.stop(end);
    }
  },

  /** A lead line: one or two oscillators, optional drive, a delayed vibrato and glide from the last note. */
  lead(ctx, out, t, ev, p, vel) {
    const f = midiToHz(ev.midi);
    const dur = Math.max(0.06, ev.dur || 0.25);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = p.q ?? 2;
    filter.frequency.setValueAtTime(Math.min(12000, (p.cutoff ?? 2800) * 1.6), t);
    filter.frequency.exponentialRampToValueAtTime(p.cutoff ?? 2800, t + 0.12);
    const amp = ctx.createGain();
    const level = 0.2 * vel;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(level, t + (p.attack ?? 0.012));
    amp.gain.setValueAtTime(level * 0.85, t + dur);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + (p.release ?? 0.12));
    let head = filter;
    if (p.drive) {
      const drive = makeDrive(ctx, p.drive);
      drive.connect(filter);
      head = drive;
    }
    filter.connect(amp).connect(out);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = p.vibrato ?? 5.5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * (p.vibratoDepth ?? 0.008), t + Math.min(dur, 0.35));
    vibrato.connect(depth);
    const end = t + dur + (p.release ?? 0.12) + 0.03;
    const waves = p.detune ? [-p.detune, p.detune] : [0];
    for (const cents of waves) {
      const osc = ctx.createOscillator();
      if (p.wave === 'pulse') osc.setPeriodicWave(getPulseWave(ctx, p.duty ?? 0.3));
      else osc.type = p.wave || 'sawtooth';
      osc.detune.value = cents;
      osc.frequency.setValueAtTime(ev.from ? midiToHz(ev.from) : f, t);
      if (ev.from) osc.frequency.exponentialRampToValueAtTime(f, t + (p.glide ?? 0.05));
      depth.connect(osc.frequency);
      osc.connect(head);
      osc.start(t);
      osc.stop(end);
    }
    vibrato.start(t);
    vibrato.stop(end);
  },

  /** An oud-like pluck: a bright snap that darkens fast, with the pick's click and a slightly sharp start. */
  pluck(ctx, out, t, ev, p, vel) {
    const f = midiToHz(ev.midi);
    const decay = p.decay ?? 0.55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(Math.min(10000, f * (p.bright ?? 9)), t);
    filter.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.14);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.26 * vel, t + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    filter.connect(amp).connect(out);
    for (const [wave, mix] of [['sawtooth', 0.6], ['triangle', 1]]) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(f * 1.006, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      const g = ctx.createGain();
      g.gain.value = mix;
      osc.connect(g).connect(filter);
      osc.start(t);
      osc.stop(t + decay + 0.02);
    }
    playNoise(ctx, out, t, { filter: 'bandpass', freq: 2600, q: 2, attack: 0.0005, decay: 0.01, gain: 0.07 * vel });
  },

  /** A breathy reed flute: a soft tone with breath noise, sliding into notes, vibrato blooming late. */
  ney(ctx, out, t, ev, p, vel) {
    const f = midiToHz(ev.midi);
    const dur = Math.max(0.1, ev.dur || 0.5);
    const amp = ctx.createGain();
    const level = 0.17 * vel;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(level, t + 0.09);
    amp.gain.setValueAtTime(level * 0.9, t + dur);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    amp.connect(out);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 4.8;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.6));
    vibrato.connect(depth);
    const end = t + dur + 0.3;
    for (const [wave, mix] of [['sine', 1], ['triangle', 0.35]]) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(ev.from ? midiToHz(ev.from) : f * 0.985, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + (ev.from ? 0.12 : 0.06));
      depth.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = mix;
      osc.connect(g).connect(amp);
      osc.start(t);
      osc.stop(end);
    }
    vibrato.start(t);
    vibrato.stop(end);
    playNoise(ctx, amp, t, { color: 'pink', filter: 'bandpass', freq: f * 2, q: 3, attack: 0.08, hold: dur * 0.6, decay: 0.3, gain: 0.35 });
  },

  bell(ctx, out, t, ev, p, vel) {
    const f = midiToHz(ev.midi);
    playTone(ctx, out, t, { freq: f * 2.76, attack: 0.001, decay: 0.2, gain: 0.05 * vel });
    playTone(ctx, out, t, { freq: f, attack: 0.002, decay: p.decay ?? 0.9, gain: 0.16 * vel });
  },

  /** A bright synth blip for arpeggios. */
  blip(ctx, out, t, ev, p, vel) {
    const f = midiToHz(ev.midi);
    playTone(ctx, out, t, { wave: getPulseWave(ctx, p.duty ?? 0.35), freq: f, attack: 0.002, decay: p.decay ?? 0.16, gain: 0.14 * vel, filter: { type: 'lowpass', freq: Math.min(11000, f * 7), freqEnd: f * 1.5, q: 2 } });
  },

  /** A rising swell of noise that builds into a drop. */
  riser(ctx, out, t, ev, p, vel) {
    const dur = ev.dur || 2;
    playNoise(ctx, out, t, { color: 'white', filter: 'bandpass', freq: 400, freqEnd: 7000, sweep: dur, q: 1.6, attack: dur * 0.95, decay: 0.08, gain: 0.16 * vel });
  },
};
