// The voices of Port Sarab's crowds: a frightened scream when people bolt from gunfire or a wreck, and a
// short angry shout. Each is a buzzing voice through the resonances of a vowel, varied in pitch, vowel
// and length so a fleeing crowd never sounds like one person.
import { playNoise, makeDrive } from './synthPrimitives.js';

/** Recipes by sound id, each (ctx, destination, when, params) -> end time. */
export const CROWD_RECIPES = { scream, shout };

/** A frightened cry: the voice leaps upward, trembles, and sags as the breath runs out. */
function scream(ctx, out, t, p) {
  const voice = pickVoice(SCREAM_VOICES, p.variant);
  const f0 = voice.f0 * (p.pitch ?? 1) * rand(0.92, 1.08);
  return cry(ctx, out, t, voice, f0, rand(0.45, 0.85), {
    from: 0.72, rise: rand(1.3, 1.6), riseTime: rand(0.08, 0.13), sag: 0.84, tremor: rand(6, 9), level: 0.032 * (p.intensity ?? 1), breath: 0.018, drive: 2,
  });
}

/** An angry bark: a breathy onset, a short rise and a hard fall. */
function shout(ctx, out, t, p) {
  const voice = pickVoice(SHOUT_VOICES, p.variant);
  const f0 = voice.f0 * (p.pitch ?? 1) * rand(0.92, 1.08);
  const level = 0.055 * (p.intensity ?? 1);
  playNoise(ctx, out, t, { color: 'pink', filter: 'bandpass', freq: 1500, q: 1, attack: 0.01, decay: 0.05, gain: level * 0.7 });
  return cry(ctx, out, t + 0.03, voice, f0, rand(0.2, 0.34), {
    from: 0.9, rise: 1.22, riseTime: 0.05, sag: 0.68, tremor: 0, level, breath: 0.03, drive: 3.5,
  });
}

/**
 * One voiced cry: two slightly detuned saws following a pitch contour, roughened by drive, shaped by
 * three vowel resonances, with breath noise and an envelope that holds and then falls away.
 */
function cry(ctx, out, t, voice, f0, length, o) {
  const end = t + length;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(o.level, t + 0.035);
  amp.gain.setValueAtTime(o.level * 0.9, t + length * 0.65);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  amp.connect(out);
  const drive = makeDrive(ctx, o.drive);
  const mix = ctx.createGain();
  mix.gain.value = 0.5;
  mix.connect(drive);
  for (const [frequency, strength] of voice.formants) {
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = frequency;
    formant.Q.value = frequency / 220;
    const g = ctx.createGain();
    g.gain.value = strength * 3;
    drive.connect(formant).connect(g).connect(amp);
  }
  let tremor = null;
  let tremorDepth = null;
  if (o.tremor > 0) {
    tremor = ctx.createOscillator();
    tremor.frequency.value = o.tremor;
    tremorDepth = ctx.createGain();
    tremorDepth.gain.value = f0 * 0.035;
    tremor.connect(tremorDepth);
    tremor.start(t);
    tremor.stop(end + 0.02);
  }
  for (const cents of [0, 17]) {
    const source = ctx.createOscillator();
    source.type = 'sawtooth';
    source.detune.value = cents;
    source.frequency.setValueAtTime(f0 * o.from, t);
    source.frequency.exponentialRampToValueAtTime(f0 * o.rise, t + o.riseTime);
    source.frequency.exponentialRampToValueAtTime(f0 * o.rise * o.sag, end);
    if (tremorDepth) tremorDepth.connect(source.frequency);
    source.connect(mix);
    source.start(t);
    source.stop(end + 0.02);
  }
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 3000, q: 1.2, attack: 0.03, hold: length * 0.5, decay: length * 0.4, gain: o.breath });
  return end + 0.03;
}

/** The vowels a frightened crowd cries in: a voice's pitch and its three resonances (Hz, strength). */
const SCREAM_VOICES = [
  { f0: 520, formants: [[950, 1], [1500, 0.7], [2900, 0.35]] },
  { f0: 430, formants: [[420, 0.8], [2300, 0.9], [3100, 0.4]] },
  { f0: 330, formants: [[800, 1], [1250, 0.6], [2600, 0.3]] },
];

/** The vowels of an angry shout: "hah", "hey", "oi". */
const SHOUT_VOICES = [
  { f0: 165, formants: [[700, 1], [1150, 0.6], [2500, 0.3]] },
  { f0: 140, formants: [[550, 1], [1800, 0.6], [2600, 0.3]] },
  { f0: 195, formants: [[600, 1], [950, 0.7], [2400, 0.25]] },
];

function pickVoice(voices, variant) {
  return typeof variant === 'number' ? voices[Math.abs(Math.floor(variant)) % voices.length] : voices[Math.floor(Math.random() * voices.length)];
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}
