// The sounds of the game's own voice rather than the street's: the "mission passed" brass-and-strings
// flourish, the falling phrase of a failed job, the tense sting of a new wanted star and its relieved
// fall, Captain Dahan's ringtone, cash, pickups, reloads, menus, the map, the save chime and the radio's
// tuning static. All of it is composed here; none of it quotes an existing tune.
import { playTone, playNoise, midiToHz } from './synthPrimitives.js';

/** Recipes by sound id, each (ctx, destination, when, params) -> end time. */
export const INTERFACE_RECIPES = {
  missionPassed,
  missionFailed,
  missionStart,
  wantedUp,
  wantedClear,
  arrested,
  death,
  phoneRing,
  phonePickup,
  pickup,
  cash,
  reload,
  emptyClick,
  menuMove,
  menuSelect,
  menuBack,
  mapOpen,
  radioStatic,
  cameraShutter,
  save,
  notify,
};

/** Three seconds of triumph in B-flat: a brass pickup, a struck chord, a climbing answer and a held top note. */
function missionPassed(ctx, out, t) {
  brass(ctx, out, t, 65, 0.08, 0.1);
  brass(ctx, out, t + 0.09, 67, 0.08, 0.1);
  brass(ctx, out, t + 0.18, 69, 0.08, 0.11);
  const hit = t + 0.27;
  for (const m of [58, 62, 65, 70]) brass(ctx, out, hit, m, 0.34, 0.07);
  timpani(ctx, out, hit, 46, 0.5);
  strings(ctx, out, hit, [58, 62, 65, 70, 74], 1.5, 0.045);
  brass(ctx, out, hit, 74, 0.3, 0.12);
  brass(ctx, out, t + 0.62, 72, 0.11, 0.1);
  brass(ctx, out, t + 0.76, 74, 0.11, 0.1);
  brass(ctx, out, t + 0.9, 77, 0.48, 0.12);
  for (const m of [63, 67, 70]) brass(ctx, out, t + 0.9, m, 0.44, 0.06);
  timpani(ctx, out, t + 0.9, 51, 0.35);
  brass(ctx, out, t + 1.45, 79, 0.17, 0.11);
  brass(ctx, out, t + 1.65, 77, 0.17, 0.11);
  const final = t + 1.85;
  for (const m of [58, 65, 70, 74]) brass(ctx, out, final, m, 0.95, 0.065);
  brass(ctx, out, final, 82, 1.0, 0.12);
  strings(ctx, out, final, [58, 65, 70, 74, 77], 1.05, 0.05);
  for (let i = 0; i < 5; i += 1) timpani(ctx, out, final + i * 0.05, 46, 0.18 + i * 0.05);
  playNoise(ctx, out, final - 0.5, { color: 'white', filter: 'highpass', freq: 6000, attack: 0.5, decay: 1.2, gain: 0.07 });
  [82, 86, 89, 94].forEach((m, i) => bell(ctx, out, final + 0.05 + i * 0.07, m, 0.05, 0.7));
  return t + 3.05;
}

/** A falling minor phrase over a low, dark chord: the job is lost. */
function missionFailed(ctx, out, t) {
  strings(ctx, out, t, [38, 50, 57, 62, 65], 2.1, 0.04);
  const notes = [69, 65, 64, 62];
  notes.forEach((m, i) => mutedBrass(ctx, out, t + i * 0.38, m, i === 3 ? 1.0 : 0.34, 0.12));
  timpani(ctx, out, t + 1.14, 38, 0.6);
  playTone(ctx, out, t + 1.14, { type: 'sawtooth', freq: midiToHz(38), freqEnd: midiToHz(33), sweep: 1.2, attack: 0.05, decay: 1.2, gain: 0.08, filter: { type: 'lowpass', freq: 400 } });
  return t + 2.6;
}

/** A low hit, a rising whoosh and an opening fifth: the job is on. */
function missionStart(ctx, out, t) {
  playTone(ctx, out, t, { freq: 70, freqEnd: 34, attack: 0.003, decay: 0.6, gain: 0.4 });
  playNoise(ctx, out, t, { color: 'pink', filter: 'bandpass', freq: 380, freqEnd: 3200, sweep: 0.55, q: 1.2, attack: 0.4, decay: 0.2, gain: 0.12 });
  brass(ctx, out, t + 0.05, 62, 0.2, 0.09);
  brass(ctx, out, t + 0.3, 69, 0.2, 0.1);
  brass(ctx, out, t + 0.55, 74, 0.6, 0.11);
  strings(ctx, out, t + 0.3, [62, 67, 69, 74], 0.9, 0.04);
  return t + 1.75;
}

/** A tense rising sting: a tritone cluster climbing under a tremolo, cut off by a stab. Higher per star. */
function wantedUp(ctx, out, t, p) {
  const level = Math.max(1, Math.min(5, p.level || 1));
  const base = 196 * Math.pow(2, (level - 1) * 2 / 12);
  playTone(ctx, out, t, { freq: 62, freqEnd: 38, attack: 0.003, decay: 0.35, gain: 0.32 });
  const tremolo = ctx.createOscillator();
  tremolo.frequency.value = 13;
  const depth = ctx.createGain();
  depth.gain.value = 0.5;
  const shaker = ctx.createGain();
  shaker.gain.value = 0.5;
  tremolo.connect(depth).connect(shaker.gain);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(500, t);
  filter.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(0.1, t + 0.4);
  amp.gain.setValueAtTime(0.1, t + 0.5);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
  filter.connect(shaker).connect(amp).connect(out);
  for (const ratio of [1, 1.414, 2.02]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * ratio, t);
    osc.frequency.exponentialRampToValueAtTime(base * ratio * 1.335, t + 0.52);
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + 0.6);
  }
  tremolo.start(t);
  tremolo.stop(t + 0.6);
  const stab = t + 0.54;
  const top = 12 * Math.log2((base * 1.335) / 440) + 69;
  for (const m of [top, top + 1, top + 6]) brass(ctx, out, stab, m, 0.12, 0.07);
  playNoise(ctx, out, stab, { filter: 'highpass', freq: 5000, attack: 0.002, decay: 0.3, gain: 0.06 });
  return stab + 0.45;
}

/** A relieved fall: soft bells stepping down a major chord over a warm swell. */
function wantedClear(ctx, out, t) {
  [79, 76, 72, 67].forEach((m, i) => bell(ctx, out, t + i * 0.13, m, 0.07, 0.9));
  strings(ctx, out, t + 0.1, [48, 60, 64, 67, 72], 1.2, 0.035);
  playNoise(ctx, out, t, { color: 'pink', filter: 'bandpass', freq: 2200, freqEnd: 380, sweep: 0.9, q: 1, attack: 0.15, decay: 0.8, gain: 0.06 });
  return t + 1.9;
}

/** Two heavy low notes a semitone apart, then the ratchet of the cuffs. */
function arrested(ctx, out, t) {
  mutedBrass(ctx, out, t, 38, 0.3, 0.16);
  mutedBrass(ctx, out, t + 0.42, 39, 0.65, 0.18);
  timpani(ctx, out, t + 0.42, 39, 0.55);
  for (let i = 0; i < 7; i += 1) {
    playNoise(ctx, out, t + 0.75 + i * 0.032, { filter: 'bandpass', freq: 3600, q: 4, attack: 0.0004, decay: 0.01, gain: 0.16 });
  }
  playNoise(ctx, out, t + 1.0, { filter: 'bandpass', freq: 2400, q: 5, attack: 0.0005, decay: 0.03, gain: 0.2 });
  strings(ctx, out, t + 0.42, [27, 39, 46, 51], 1.3, 0.04);
  return t + 2.3;
}

/** A slowing heartbeat, a falling drone and the ring in the ears. */
function death(ctx, out, t) {
  const beats = [0, 0.24, 0.95, 1.2, 2.1];
  beats.forEach((d, i) => playTone(ctx, out, t + d, { freq: 58, freqEnd: 40, attack: 0.004, decay: 0.16, gain: 0.5 - i * 0.07 }));
  playTone(ctx, out, t, { type: 'sawtooth', freq: 110, freqEnd: 52, sweep: 2.3, attack: 0.2, hold: 0.5, decay: 1.8, gain: 0.07, filter: { type: 'lowpass', freq: 600, freqEnd: 180 } });
  strings(ctx, out, t + 0.1, [33, 45, 48, 52], 1.9, 0.035);
  playTone(ctx, out, t + 0.05, { freq: 4150, attack: 0.3, decay: 2.0, gain: 0.025 });
  return t + 2.7;
}

/** Captain Dahan calling: the phone buzzes against the leg and plays its little marimba figure twice. */
function phoneRing(ctx, out, t) {
  const figure = [79, 84, 79, 86, 84, 91];
  for (let round = 0; round < 2; round += 1) {
    const start = t + round * 0.82;
    playTone(ctx, out, start, { type: 'square', freq: 150, attack: 0.01, hold: 0.42, decay: 0.05, gain: 0.04, filter: { type: 'lowpass', freq: 380 } });
    figure.forEach((m, i) => marimba(ctx, out, start + i * 0.085, m, 0.09));
  }
  return t + 1.75;
}

function phonePickup(ctx, out, t) {
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 2200, q: 3, attack: 0.0005, decay: 0.012, gain: 0.2 });
  playTone(ctx, out, t + 0.03, { freq: 880, attack: 0.003, decay: 0.06, gain: 0.1 });
  return playTone(ctx, out, t + 0.1, { freq: 1320, attack: 0.003, decay: 0.09, gain: 0.1 });
}

function pickup(ctx, out, t) {
  [72, 76, 79, 84].forEach((m, i) => bell(ctx, out, t + i * 0.045, m + 12, 0.06, 0.35));
  return playNoise(ctx, out, t + 0.12, { filter: 'highpass', freq: 7000, attack: 0.01, decay: 0.25, gain: 0.04 });
}

/** The till: a bright bell, the drawer thumping out and a spill of coins. */
function cash(ctx, out, t) {
  bell(ctx, out, t, 96, 0.08, 0.55);
  bell(ctx, out, t + 0.002, 103, 0.035, 0.4);
  playNoise(ctx, out, t + 0.06, { color: 'pink', filter: 'bandpass', freq: 900, q: 1, attack: 0.003, decay: 0.06, gain: 0.2 });
  playTone(ctx, out, t + 0.06, { freq: 140, freqEnd: 80, attack: 0.002, decay: 0.06, gain: 0.18 });
  let end = t + 0.6;
  for (let i = 0; i < 7; i += 1) {
    end = Math.max(end, playTone(ctx, out, t + 0.1 + Math.random() * 0.3, { freq: 3200 + Math.random() * 3200, attack: 0.001, decay: 0.05 + Math.random() * 0.08, gain: 0.025 + Math.random() * 0.03 }));
  }
  return end;
}

/** Magazine out, magazine in, slide racked. */
function reload(ctx, out, t) {
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 2600, q: 4, attack: 0.0005, decay: 0.016, gain: 0.25 });
  playNoise(ctx, out, t + 0.08, { filter: 'bandpass', freq: 1500, q: 1.5, attack: 0.03, decay: 0.05, gain: 0.08 });
  playNoise(ctx, out, t + 0.36, { filter: 'bandpass', freq: 1800, q: 2, attack: 0.0006, decay: 0.022, gain: 0.3 });
  playTone(ctx, out, t + 0.36, { freq: 420, freqEnd: 200, attack: 0.001, decay: 0.035, gain: 0.12 });
  playNoise(ctx, out, t + 0.54, { filter: 'bandpass', freq: 1200, q: 1.2, attack: 0.02, decay: 0.05, gain: 0.08 });
  playNoise(ctx, out, t + 0.6, { filter: 'bandpass', freq: 3200, q: 4, attack: 0.0005, decay: 0.014, gain: 0.26 });
  return playNoise(ctx, out, t + 0.67, { filter: 'bandpass', freq: 2700, q: 4, attack: 0.0005, decay: 0.02, gain: 0.3 });
}

function emptyClick(ctx, out, t) {
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 3500, q: 5, attack: 0.0004, decay: 0.014, gain: 0.6 });
  playNoise(ctx, out, t + 0.03, { filter: 'bandpass', freq: 2400, q: 4, attack: 0.0004, decay: 0.012, gain: 0.35 });
  return playTone(ctx, out, t, { freq: 1800, attack: 0.0005, decay: 0.016, gain: 0.14 });
}

function menuMove(ctx, out, t) {
  playNoise(ctx, out, t, { filter: 'highpass', freq: 5000, attack: 0.0005, decay: 0.01, gain: 0.05 });
  return playTone(ctx, out, t, { type: 'triangle', freq: 1600, attack: 0.001, decay: 0.035, gain: 0.14 });
}

function menuSelect(ctx, out, t) {
  playTone(ctx, out, t, { type: 'triangle', freq: 880, attack: 0.002, decay: 0.12, gain: 0.16 });
  return playTone(ctx, out, t + 0.06, { type: 'triangle', freq: 1318, attack: 0.002, decay: 0.18, gain: 0.16 });
}

function menuBack(ctx, out, t) {
  playTone(ctx, out, t, { type: 'triangle', freq: 988, attack: 0.002, decay: 0.08, gain: 0.14 });
  return playTone(ctx, out, t + 0.05, { type: 'triangle', freq: 659, attack: 0.002, decay: 0.12, gain: 0.14, filter: { type: 'lowpass', freq: 2500 } });
}

function mapOpen(ctx, out, t) {
  playNoise(ctx, out, t, { color: 'pink', filter: 'bandpass', freq: 600, freqEnd: 2600, sweep: 0.25, q: 0.9, attack: 0.08, decay: 0.2, gain: 0.14 });
  bell(ctx, out, t + 0.12, 86, 0.05, 0.4);
  return bell(ctx, out, t + 0.19, 91, 0.045, 0.5);
}

/** Between stations: hiss swept across the band, a heterodyne whistle and a few crackles. */
function radioStatic(ctx, out, t) {
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 3200, freqEnd: 900, sweep: 0.32, q: 0.6, attack: 0.01, hold: 0.22, decay: 0.1, gain: 0.2 });
  playTone(ctx, out, t + 0.03, { type: 'sine', freq: 2400, freqEnd: 700, sweep: 0.3, attack: 0.01, hold: 0.2, decay: 0.08, gain: 0.035 });
  let end = t + 0.4;
  for (let i = 0; i < 5; i += 1) {
    end = Math.max(end, playNoise(ctx, out, t + Math.random() * 0.32, { filter: 'highpass', freq: 2000, attack: 0.0005, decay: 0.006, gain: 0.12 }));
  }
  return end;
}

function cameraShutter(ctx, out, t) {
  playNoise(ctx, out, t, { filter: 'highpass', freq: 3000, attack: 0.0004, decay: 0.009, gain: 0.3 });
  playTone(ctx, out, t + 0.01, { type: 'square', freq: 300, attack: 0.003, hold: 0.05, decay: 0.02, gain: 0.03, filter: { type: 'lowpass', freq: 800 } });
  return playNoise(ctx, out, t + 0.075, { filter: 'bandpass', freq: 1800, q: 2, attack: 0.0005, decay: 0.016, gain: 0.26 });
}

function save(ctx, out, t) {
  [84, 88, 91].forEach((m, i) => bell(ctx, out, t + i * 0.09, m, 0.07, 0.6));
  return bell(ctx, out, t + 0.3, 96, 0.05, 0.8);
}

function notify(ctx, out, t, p) {
  const kind = p.variant || 'info';
  if (kind === 'bad') {
    playTone(ctx, out, t, { type: 'triangle', freq: 440, attack: 0.003, decay: 0.1, gain: 0.12 });
    return playTone(ctx, out, t + 0.08, { type: 'triangle', freq: 330, attack: 0.003, decay: 0.16, gain: 0.12 });
  }
  if (kind === 'good') {
    bell(ctx, out, t, 84, 0.06, 0.3);
    return bell(ctx, out, t + 0.07, 91, 0.06, 0.4);
  }
  playTone(ctx, out, t, { type: 'sine', freq: 880, attack: 0.003, decay: 0.08, gain: 0.1 });
  return playTone(ctx, out, t + 0.06, { type: 'sine', freq: 1175, attack: 0.003, decay: 0.12, gain: 0.1 });
}

/** A brass note: two detuned saws through a filter that opens on the attack, with a late vibrato. */
function brass(ctx, out, t, midi, length, gain) {
  const f = midiToHz(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(f * 1.5, t);
  filter.frequency.exponentialRampToValueAtTime(Math.min(9000, f * 7), t + 0.05);
  filter.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 4), t + 0.2);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.03);
  amp.gain.setValueAtTime(gain * 0.85, t + Math.max(0.05, length));
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.14);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.4;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.setValueAtTime(0, t);
  vibratoDepth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.4, length + 0.1));
  vibrato.connect(vibratoDepth);
  for (const cents of [-5, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    osc.detune.value = cents;
    vibratoDepth.connect(osc.frequency);
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + length + 0.16);
  }
  vibrato.start(t);
  vibrato.stop(t + length + 0.16);
  filter.connect(amp).connect(out);
  return t + length + 0.16;
}

/** A darker, closed brass note for the sombre stings. */
function mutedBrass(ctx, out, t, midi, length, gain) {
  const f = midiToHz(midi);
  return playTone(ctx, out, t, { type: 'sawtooth', freq: f, attack: 0.04, hold: length, decay: 0.25, gain, filter: { type: 'lowpass', freq: Math.min(2400, f * 4), freqEnd: f * 2, q: 1 } });
}

/** A string section chord: three detuned saws per note, swelling in and fading slowly. */
function strings(ctx, out, t, notes, length, gain) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2600;
  filter.Q.value = 0.5;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.22);
  amp.gain.setValueAtTime(gain, t + length);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.55);
  filter.connect(amp).connect(out);
  for (const midi of notes) {
    for (const cents of [-9, 0, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = cents;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + length + 0.6);
    }
  }
  return t + length + 0.6;
}

function timpani(ctx, out, t, midi, gain) {
  const f = midiToHz(midi);
  playTone(ctx, out, t, { freq: f * 1.1, freqEnd: f, sweep: 0.08, attack: 0.002, decay: 0.7, gain });
  return playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 380, attack: 0.002, decay: 0.12, gain: gain * 0.5 });
}

/** A bright struck bell: a sine with two inharmonic partials that fade first. */
function bell(ctx, out, t, midi, gain, decay) {
  const f = midiToHz(midi);
  playTone(ctx, out, t, { freq: f * 2.76, attack: 0.001, decay: decay * 0.25, gain: gain * 0.35 });
  playTone(ctx, out, t, { freq: f * 5.4, attack: 0.001, decay: decay * 0.1, gain: gain * 0.15 });
  return playTone(ctx, out, t, { freq: f, attack: 0.002, decay, gain });
}

/** A marimba bar: a round fundamental with a quick wooden fourth partial. */
function marimba(ctx, out, t, midi, gain) {
  const f = midiToHz(midi);
  playTone(ctx, out, t, { freq: f * 4, attack: 0.001, decay: 0.03, gain: gain * 0.4 });
  return playTone(ctx, out, t, { freq: f, attack: 0.002, decay: 0.28, gain });
}
