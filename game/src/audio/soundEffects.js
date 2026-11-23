// Every one-shot sound of the streets of Port Sarab as a synthesis recipe: gunshots by weapon class (a
// pistol's crack, an SMG's rattle, a rifle's bark, a shotgun's boom), impacts, ricochets, fists, falls,
// crashes scaled by the hit, glass, explosions, horns by vehicle class, doors, engines, splashes and
// footsteps. Interface sounds and story stings live in interfaceSounds.js; the guide lists every id.
import { playTone, playNoise, makeSweptFilter, setPitchScale } from './synthPrimitives.js';
import { INTERFACE_RECIPES } from './interfaceSounds.js';
import { SOUND_EFFECT_IDS, isDieselClass } from './radioAndSoundGuide.js';

/**
 * Render sound `id` into `destination` at time `when`. Works on any context, live or offline.
 * Unknown ids are ignored quietly (returns `when`).
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} destination
 * @param {string} id
 * @param {number} when
 * @param {{intensity?:number, pitch?:number, variant?:string, surface?:string, className?:string, distance?:number, level?:number}} [params]
 * @returns {number} the time the sound has finished
 */
export function playSoundRecipe(ctx, destination, id, when, params) {
  const recipe = WORLD_RECIPES[id] || INTERFACE_RECIPES[id];
  if (!recipe) return when;
  const p = params || NO_PARAMS;
  setPitchScale(typeof p.pitch === 'number' ? Math.max(0.25, Math.min(4, p.pitch)) : 1);
  try {
    return recipe(ctx, destination, when, p);
  } finally {
    setPitchScale(1);
  }
}

/** Which mix bus a sound belongs to: interface sounds and stings skip the world's muffling. */
export function soundBusFor(id) {
  return INTERFACE_RECIPES[id] ? 'ui' : 'effects';
}

/** The horn of each vehicle class: the notes it sounds, its waveform, and the resonance of its trumpet. */
export const HORN_TIMBRES = {
  compact: { notes: [494, 622], wave: 'square', body: 2400, q: 1.2, gain: 0.11 },
  sedan: { notes: [415, 523], wave: 'square', body: 2000, q: 1.2, gain: 0.12 },
  taxi: { notes: [440, 554], wave: 'square', body: 2100, q: 1.3, gain: 0.12 },
  sports: { notes: [466, 587], wave: 'square', body: 2300, q: 1.0, gain: 0.12 },
  super: { notes: [523, 659, 784], wave: 'sawtooth', body: 2600, q: 0.9, gain: 0.09 },
  classic: { notes: [349, 440], wave: 'sawtooth', body: 1300, q: 2.2, gain: 0.13 },
  suv: { notes: [370, 466], wave: 'square', body: 1800, q: 1.2, gain: 0.12 },
  pickup: { notes: [370, 440], wave: 'square', body: 1700, q: 1.2, gain: 0.12 },
  van: { notes: [392, 494], wave: 'square', body: 1900, q: 1.2, gain: 0.12 },
  truck: { notes: [175, 220, 262], wave: 'sawtooth', body: 1100, q: 1.6, gain: 0.12 },
  bus: { notes: [196, 247, 294], wave: 'sawtooth', body: 1200, q: 1.6, gain: 0.12 },
  armored: { notes: [165, 208, 247], wave: 'sawtooth', body: 1000, q: 1.8, gain: 0.12 },
  buggy: { notes: [740], wave: 'square', body: 2800, q: 1.5, gain: 0.1 },
  police: { notes: [311, 392], wave: 'square', body: 1600, q: 1.5, gain: 0.13 },
  policeSuv: { notes: [294, 370], wave: 'square', body: 1500, q: 1.5, gain: 0.13 },
};

/**
 * Hold a vehicle's horn down from `when` until the returned stop(time) is called.
 * @returns {{stop:(when:number)=>void}}
 */
export function startHornVoice(ctx, destination, className, when) {
  const timbre = HORN_TIMBRES[className] || HORN_TIMBRES.sedan;
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = timbre.body;
  body.Q.value = timbre.q;
  body.gain.value = 9;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 4200;
  const level = timbre.gain * HORN_LEVEL;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(level, when + 0.015);
  body.connect(top).connect(amp).connect(destination);
  const oscillators = [];
  for (let i = 0; i < timbre.notes.length; i += 1) {
    const osc = ctx.createOscillator();
    osc.type = timbre.wave;
    osc.frequency.value = timbre.notes[i];
    osc.detune.value = (i - 0.5) * 6;
    osc.connect(body);
    osc.start(when);
    oscillators.push(osc);
  }
  return {
    stop(at) {
      const t = Math.max(at, when + 0.06);
      amp.gain.cancelScheduledValues(t);
      amp.gain.setValueAtTime(level, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      for (const osc of oscillators) osc.stop(t + 0.07);
    },
  };
}

const NO_PARAMS = {};

/** Gunfire is the loudest thing on the street; horns sit well under it. */
const GUN_LEVEL = 1.8;
const HORN_LEVEL = 0.25;

/** How each gun sounds: a supersonic crack, the body of the blast, a low thump and the street's echo. */
const GUN_PROFILES = {
  pistol: { crack: 0.42, crackFreq: 2600, crackDecay: 0.04, body: 0.34, bodyFreq: 720, bodyDecay: 0.08, thump: 0.36, thumpFreq: 130, thumpDecay: 0.07, tail: 0.1, tailFreq: 1500, tailDecay: 0.35, mech: 0.12 },
  smg: { crack: 0.34, crackFreq: 3100, crackDecay: 0.026, body: 0.28, bodyFreq: 900, bodyDecay: 0.05, thump: 0.26, thumpFreq: 150, thumpDecay: 0.045, tail: 0.07, tailFreq: 1700, tailDecay: 0.22, mech: 0.16 },
  rifle: { crack: 0.48, crackFreq: 2100, crackDecay: 0.05, body: 0.42, bodyFreq: 520, bodyDecay: 0.12, thump: 0.42, thumpFreq: 95, thumpDecay: 0.11, tail: 0.16, tailFreq: 950, tailDecay: 0.95, mech: 0.08 },
  shotgun: { crack: 0.36, crackFreq: 1700, crackDecay: 0.06, body: 0.48, bodyFreq: 380, bodyDecay: 0.2, thump: 0.52, thumpFreq: 72, thumpDecay: 0.2, tail: 0.18, tailFreq: 720, tailDecay: 1.05, mech: 0 },
};

const WORLD_RECIPES = {
  gunPistol: (ctx, out, t, p) => gunshot(ctx, out, t, p, GUN_PROFILES.pistol),
  gunSmg: (ctx, out, t, p) => gunshot(ctx, out, t, p, GUN_PROFILES.smg),
  gunRifle: (ctx, out, t, p) => gunshot(ctx, out, t, p, GUN_PROFILES.rifle),
  gunShotgun: (ctx, out, t, p) => gunshot(ctx, out, t, p, GUN_PROFILES.shotgun),
  bulletImpact,
  ricochet,
  bulletWhiz,
  punch: (ctx, out, t, p) => punch(ctx, out, t, p, 1),
  kick,
  bodyFall,
  bodyHit,
  crash,
  glass,
  explosion,
  tyreBurst,
  metalClank,
  woodCrack,
  landingThud,
  horn,
  doorOpen,
  doorClose,
  engineStart,
  engineStop,
  backfire,
  splash,
  footstep,
  windGust,
};

/** Every id play() understands, flattened from the guide's groups. */
export const SOUND_IDS = Object.freeze(Object.values(SOUND_EFFECT_IDS).flat());

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function gunshot(ctx, out, t, p, g) {
  const v = (p.intensity ?? 1) * GUN_LEVEL;
  const pitch = rand(0.95, 1.05);
  const far = Math.min(1, (p.distance || 0) / 120);
  let end = playNoise(ctx, out, t, { color: 'white', filter: 'highpass', freq: g.crackFreq * pitch, q: 0.7, attack: 0.0006, decay: g.crackDecay, gain: g.crack * v * (1 - far * 0.6) });
  playNoise(ctx, out, t, { color: 'white', filter: 'bandpass', freq: g.bodyFreq * pitch, freqEnd: g.bodyFreq * 0.55, q: 1.1, attack: 0.0008, decay: g.bodyDecay, gain: g.body * v });
  playTone(ctx, out, t, { freq: g.thumpFreq * 2.4 * pitch, freqEnd: g.thumpFreq * 0.5, sweep: g.thumpDecay, attack: 0.001, decay: g.thumpDecay, gain: g.thump * v });
  end = Math.max(end, playNoise(ctx, out, t + 0.01, { color: 'pink', filter: 'lowpass', freq: g.tailFreq, freqEnd: g.tailFreq * 0.35, q: 0.4, attack: 0.012, decay: g.tailDecay, gain: g.tail * v * (1 + far) }));
  if (g.mech > 0) playNoise(ctx, out, t + 0.004, { color: 'white', filter: 'bandpass', freq: 4300, q: 5, attack: 0.0005, decay: 0.014, gain: g.mech * v });
  // Between the towers a shot comes back off the glass: one or two slaps, later and darker with distance.
  if (far > 0.15) {
    const echo = t + 0.07 + far * 0.18 + rand(0, 0.05);
    playNoise(ctx, out, echo, { color: 'pink', filter: 'bandpass', freq: g.bodyFreq * 0.9, q: 0.8, attack: 0.003, decay: g.bodyDecay * 1.6, gain: g.body * v * 0.35 });
    end = Math.max(end, playNoise(ctx, out, echo + rand(0.09, 0.16), { color: 'pink', filter: 'bandpass', freq: g.bodyFreq * 0.7, q: 0.8, attack: 0.004, decay: g.bodyDecay * 2, gain: g.body * v * 0.18 }));
  }
  return end;
}

function bulletImpact(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  const kind = p.variant || p.surface || 'concrete';
  if (kind === 'metal') {
    const base = rand(1900, 2700);
    playNoise(ctx, out, t, { filter: 'highpass', freq: 3000, attack: 0.0005, decay: 0.012, gain: 0.3 * v });
    let end = t;
    const ratios = [1, 1.47, 2.09, 2.76];
    for (let i = 0; i < ratios.length; i += 1) {
      end = Math.max(end, playTone(ctx, out, t, { type: 'sine', freq: base * ratios[i], attack: 0.001, decay: 0.32 - i * 0.06, gain: (0.09 - i * 0.015) * v }));
    }
    return end;
  }
  if (kind === 'flesh') {
    playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 650, attack: 0.002, decay: 0.07, gain: 0.45 * v });
    return playTone(ctx, out, t, { freq: 160, freqEnd: 70, attack: 0.002, decay: 0.06, gain: 0.3 * v });
  }
  if (kind === 'sand' || kind === 'beach') {
    playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 1500, attack: 0.003, decay: 0.09, gain: 0.32 * v });
    return playNoise(ctx, out, t + 0.02, { color: 'white', filter: 'bandpass', freq: 2600, q: 0.8, attack: 0.01, decay: 0.12, gain: 0.06 * v });
  }
  if (kind === 'water') return splash(ctx, out, t, { intensity: 0.25 * v });
  playNoise(ctx, out, t, { filter: 'bandpass', freq: rand(2000, 3000), q: 1, attack: 0.0006, decay: 0.03, gain: 0.42 * v });
  let end = playTone(ctx, out, t, { freq: 240, freqEnd: 90, attack: 0.001, decay: 0.045, gain: 0.24 * v });
  for (let i = 0; i < 4; i += 1) {
    end = Math.max(end, playNoise(ctx, out, t + rand(0.02, 0.18), { filter: 'highpass', freq: 3800, attack: 0.0005, decay: 0.008, gain: rand(0.05, 0.12) * v }));
  }
  return end;
}

function ricochet(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  const start = rand(3200, 4400) * (p.pitch ?? 1);
  playNoise(ctx, out, t, { filter: 'highpass', freq: 3500, attack: 0.0005, decay: 0.01, gain: 0.25 * v });
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(start, t + 0.008);
  osc.frequency.exponentialRampToValueAtTime(start * rand(0.3, 0.42), t + 0.42);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = rand(24, 38);
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = start * 0.03;
  wobble.connect(wobbleDepth).connect(osc.frequency);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t + 0.008);
  amp.gain.linearRampToValueAtTime(0.11 * v, t + 0.03);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  osc.connect(amp).connect(out);
  osc.start(t + 0.008);
  wobble.start(t + 0.008);
  osc.stop(t + 0.47);
  wobble.stop(t + 0.47);
  return t + 0.47;
}

function bulletWhiz(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  return playNoise(ctx, out, t, { color: 'white', filter: 'bandpass', freq: 3600, freqEnd: 1100, sweep: 0.14, q: 4, attack: 0.05, decay: 0.09, gain: 0.32 * v });
}

function punch(ctx, out, t, p, weight) {
  const v = (p.intensity ?? 1) * weight;
  const pitch = (p.tone ?? 1) * rand(0.9, 1.1);
  playTone(ctx, out, t, { freq: 170 * pitch, freqEnd: 52, sweep: 0.09, attack: 0.001, decay: 0.1, gain: 0.5 * v });
  playNoise(ctx, out, t, { color: 'white', filter: 'bandpass', freq: 1800 * pitch, q: 1.1, attack: 0.0008, decay: 0.035, gain: 0.32 * v });
  return playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 520, attack: 0.002, decay: 0.08, gain: 0.32 * v });
}

function kick(ctx, out, t, p) {
  playNoise(ctx, out, t, { color: 'pink', filter: 'bandpass', freq: 800, freqEnd: 2400, q: 1.5, attack: 0.06, decay: 0.04, gain: 0.1 });
  return punch(ctx, out, t + 0.075, p, 1.25);
}

function bodyFall(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  playTone(ctx, out, t, { freq: 100, freqEnd: 42, attack: 0.002, decay: 0.17, gain: 0.5 * v });
  playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 420, attack: 0.003, decay: 0.13, gain: 0.34 * v });
  playNoise(ctx, out, t, { color: 'pink', filter: 'bandpass', freq: 1100, q: 0.8, attack: 0.012, decay: 0.2, gain: 0.1 * v });
  playTone(ctx, out, t + 0.14, { freq: 82, freqEnd: 45, attack: 0.002, decay: 0.09, gain: 0.22 * v });
  return playNoise(ctx, out, t + 0.14, { color: 'pink', filter: 'lowpass', freq: 360, attack: 0.002, decay: 0.07, gain: 0.15 * v });
}

function bodyHit(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  punch(ctx, out, t, { intensity: v, tone: 0.75 }, 1.3);
  playNoise(ctx, out, t, { color: 'brown', filter: 'lowpass', freq: 300, attack: 0.002, decay: 0.2, gain: 0.4 * v });
  return bodyFall(ctx, out, t + 0.32, { intensity: v * 0.8 });
}

function crash(ctx, out, t, p) {
  const k = Math.max(0.05, Math.min(1, p.intensity ?? 0.6));
  let end = playTone(ctx, out, t, { freq: 75, freqEnd: 30, attack: 0.002, decay: 0.22 + 0.25 * k, gain: 0.3 + 0.38 * k });
  playNoise(ctx, out, t, { color: 'brown', filter: 'lowpass', freq: 320, attack: 0.002, decay: 0.2 + 0.2 * k, gain: 0.18 + 0.3 * k });
  end = Math.max(end, playNoise(ctx, out, t + 0.004, { color: 'white', filter: 'bandpass', freq: rand(1100, 1800), freqEnd: 550, q: 0.9, attack: 0.002, decay: 0.12 + 0.35 * k, gain: 0.12 + 0.3 * k }));
  // The panels ring: a few resonant metal modes struck at once.
  const modes = 2 + Math.floor(5 * k);
  for (let i = 0; i < modes; i += 1) {
    end = Math.max(end, playTone(ctx, out, t + rand(0, 0.04), { type: 'triangle', freq: rand(520, 3200), attack: 0.001, decay: rand(0.12, 0.45), gain: rand(0.025, 0.06) * k }));
  }
  const rattles = Math.floor(9 * k);
  for (let i = 0; i < rattles; i += 1) {
    end = Math.max(end, playNoise(ctx, out, t + rand(0.05, 0.55), { filter: 'highpass', freq: rand(2500, 5000), attack: 0.0006, decay: rand(0.006, 0.02), gain: rand(0.03, 0.09) * k }));
  }
  if (k > 0.55) end = Math.max(end, glass(ctx, out, t + 0.02, { intensity: k * 0.6 }));
  return end;
}

function glass(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  let end = playNoise(ctx, out, t, { filter: 'highpass', freq: 3200, attack: 0.0005, decay: 0.035, gain: 0.38 * v });
  end = Math.max(end, playNoise(ctx, out, t, { filter: 'highpass', freq: 5200, attack: 0.004, decay: 0.42, gain: 0.1 * v }));
  const shards = 12 + Math.floor(12 * v);
  for (let i = 0; i < shards; i += 1) {
    const when = t + 0.008 + Math.pow(Math.random(), 1.6) * 0.65;
    end = Math.max(end, playTone(ctx, out, when, { type: i % 3 === 0 ? 'triangle' : 'sine', freq: rand(2400, 7600), attack: 0.0008, decay: rand(0.03, 0.17), gain: rand(0.025, 0.07) * v }));
  }
  return end;
}

function explosion(ctx, out, t, p) {
  const v = Math.max(0.2, Math.min(1.4, p.intensity ?? 1));
  playNoise(ctx, out, t, { color: 'white', filter: 'lowpass', freq: 6500, attack: 0.001, decay: 0.08, gain: 0.45 * v });
  playTone(ctx, out, t, { freq: 72, freqEnd: 24, sweep: 0.7, attack: 0.004, decay: 1.4, gain: 0.7 * v });
  playNoise(ctx, out, t, { color: 'brown', filter: 'lowpass', freq: 1400, freqEnd: 140, sweep: 1.3, attack: 0.004, decay: 1.7, gain: 0.55 * v });
  let end = playNoise(ctx, out, t + 0.05, { color: 'pink', filter: 'lowpass', freq: 520, freqEnd: 110, sweep: 2.6, attack: 0.08, hold: 0.2, decay: 2.6, gain: 0.26 * v });
  for (let i = 0; i < 14; i += 1) {
    end = Math.max(end, playNoise(ctx, out, t + 0.15 + Math.pow(Math.random(), 1.3) * 1.5, { filter: 'bandpass', freq: rand(800, 3200), q: 2, attack: 0.0008, decay: rand(0.015, 0.05), gain: rand(0.04, 0.13) * v }));
  }
  for (let i = 0; i < 6; i += 1) {
    end = Math.max(end, playTone(ctx, out, t + rand(0.6, 2.2), { freq: rand(180, 420), freqEnd: 80, attack: 0.001, decay: 0.05, gain: rand(0.03, 0.07) * v }));
  }
  return end;
}

function tyreBurst(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 950, q: 0.7, attack: 0.0006, decay: 0.07, gain: 0.55 * v });
  playTone(ctx, out, t, { freq: 190, freqEnd: 60, attack: 0.001, decay: 0.08, gain: 0.4 * v });
  let end = playNoise(ctx, out, t + 0.01, { filter: 'highpass', freq: 2400, attack: 0.004, decay: 0.6, gain: 0.14 * v });
  for (let i = 0; i < 6; i += 1) {
    end = Math.max(end, playNoise(ctx, out, t + 0.12 + i * 0.075, { color: 'pink', filter: 'lowpass', freq: 600, attack: 0.002, decay: 0.035, gain: (0.16 - i * 0.022) * v }));
  }
  return end;
}

function metalClank(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  const base = rand(360, 620);
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 2200, q: 1, attack: 0.0005, decay: 0.012, gain: 0.32 * v });
  playTone(ctx, out, t, { freq: 130, freqEnd: 60, attack: 0.001, decay: 0.1, gain: 0.3 * v });
  const ratios = [1, 2.32, 3.73, 5.11];
  let end = t;
  for (let i = 0; i < ratios.length; i += 1) {
    end = Math.max(end, playTone(ctx, out, t, { type: 'sine', freq: base * ratios[i], attack: 0.001, decay: 0.65 - i * 0.12, gain: (0.12 - i * 0.022) * v }));
  }
  return end;
}

function woodCrack(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 1250, q: 2, attack: 0.0006, decay: 0.05, gain: 0.45 * v });
  let end = playTone(ctx, out, t + 0.02, { type: 'sawtooth', freq: 150, freqEnd: 85, attack: 0.02, decay: 0.4, gain: 0.05 * v, filter: { type: 'bandpass', freq: 620, q: 3 } });
  for (let i = 0; i < 8; i += 1) {
    end = Math.max(end, playNoise(ctx, out, t + rand(0.01, 0.3), { filter: 'bandpass', freq: rand(1400, 3200), q: 3, attack: 0.0005, decay: 0.012, gain: rand(0.05, 0.14) * v }));
  }
  playTone(ctx, out, t + 0.55, { freq: 110, freqEnd: 50, attack: 0.002, decay: 0.16, gain: 0.3 * v });
  return Math.max(end, playNoise(ctx, out, t + 0.55, { color: 'pink', filter: 'lowpass', freq: 500, attack: 0.002, decay: 0.15, gain: 0.25 * v }));
}

function landingThud(ctx, out, t, p) {
  const v = Math.max(0.15, Math.min(1, p.intensity ?? 0.6));
  playTone(ctx, out, t, { freq: 62, freqEnd: 30, attack: 0.002, decay: 0.3, gain: 0.5 * v });
  playNoise(ctx, out, t, { color: 'brown', filter: 'lowpass', freq: 260, attack: 0.002, decay: 0.24, gain: 0.36 * v });
  let end = playTone(ctx, out, t + 0.01, { type: 'triangle', freq: 310, attack: 0.002, decay: 0.24, gain: 0.05 * v, filter: { type: 'bandpass', freq: 310, q: 12 } });
  for (let i = 0; i < 4; i += 1) {
    end = Math.max(end, playNoise(ctx, out, t + rand(0.02, 0.2), { filter: 'highpass', freq: 3000, attack: 0.0006, decay: 0.01, gain: rand(0.03, 0.07) * v }));
  }
  return end;
}

function horn(ctx, out, t, p) {
  const voice = startHornVoice(ctx, out, p.className || p.variant || 'sedan', t);
  const length = (p.intensity ?? 1) * 0.32;
  voice.stop(t + length);
  return t + length + 0.12;
}

function doorOpen(ctx, out, t) {
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 2800, q: 3, attack: 0.0005, decay: 0.014, gain: 0.55 });
  playNoise(ctx, out, t + 0.035, { filter: 'bandpass', freq: 2100, q: 3, attack: 0.0005, decay: 0.016, gain: 0.42 });
  playTone(ctx, out, t + 0.035, { freq: 180, freqEnd: 110, attack: 0.001, decay: 0.05, gain: 0.12 });
  return playNoise(ctx, out, t + 0.04, { color: 'pink', filter: 'bandpass', freq: 650, q: 0.9, attack: 0.05, decay: 0.18, gain: 0.16 });
}

function doorClose(ctx, out, t) {
  playTone(ctx, out, t, { freq: 115, freqEnd: 58, attack: 0.001, decay: 0.11, gain: 0.48 });
  playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 720, attack: 0.001, decay: 0.09, gain: 0.36 });
  playNoise(ctx, out, t + 0.008, { filter: 'bandpass', freq: 3100, q: 3, attack: 0.0005, decay: 0.011, gain: 0.22 });
  return playNoise(ctx, out, t + 0.05, { filter: 'highpass', freq: 2800, attack: 0.001, decay: 0.04, gain: 0.05 });
}

function engineStart(ctx, out, t, p) {
  const diesel = isDieselClass(p.className);
  const crank = diesel ? 120 : 170;
  const crankTime = diesel ? 0.75 : 0.55;
  // The starter motor whirrs, pulsing with each compression stroke.
  const starter = ctx.createOscillator();
  starter.type = 'square';
  starter.frequency.setValueAtTime(crank, t);
  starter.frequency.linearRampToValueAtTime(crank * 1.25, t + crankTime);
  const pulse = ctx.createOscillator();
  pulse.frequency.value = diesel ? 7 : 10;
  const pulseDepth = ctx.createGain();
  pulseDepth.gain.value = 0.4;
  const strokes = ctx.createGain();
  strokes.gain.value = 0.6;
  pulse.connect(pulseDepth).connect(strokes.gain);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(0.07, t + 0.04);
  amp.gain.setValueAtTime(0.07, t + crankTime - 0.05);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + crankTime + 0.05);
  starter.connect(makeSweptFilter(ctx, t, { type: 'bandpass', freq: 520, q: 1.4 }, 1)).connect(strokes).connect(amp).connect(out);
  starter.start(t);
  pulse.start(t);
  starter.stop(t + crankTime + 0.08);
  pulse.stop(t + crankTime + 0.08);
  // Then it catches: a rev flare that settles toward idle.
  const fire = t + crankTime - 0.02;
  const low = diesel ? 34 : 48;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(low, fire);
  osc.frequency.linearRampToValueAtTime(low * 2.1, fire + 0.18);
  osc.frequency.exponentialRampToValueAtTime(low * 1.1, fire + 0.75);
  const catchAmp = ctx.createGain();
  shapeCatch(catchAmp.gain, fire);
  osc.connect(makeSweptFilter(ctx, fire, { type: 'lowpass', freq: diesel ? 500 : 900, freqEnd: 300, q: 2 }, 0.9)).connect(catchAmp).connect(out);
  osc.start(fire);
  osc.stop(fire + 1.0);
  playNoise(ctx, out, fire, { color: 'brown', filter: 'lowpass', freq: 300, attack: 0.005, decay: 0.35, gain: 0.3 });
  return fire + 1.0;
}

function shapeCatch(param, t) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(0.2, t + 0.05);
  param.setValueAtTime(0.18, t + 0.25);
  param.exponentialRampToValueAtTime(0.0001, t + 0.95);
}

function engineStop(ctx, out, t, p) {
  const low = isDieselClass(p.className) ? 32 : 46;
  let end = playTone(ctx, out, t, { type: 'sawtooth', freq: low, freqEnd: low * 0.45, sweep: 0.55, attack: 0.01, decay: 0.6, gain: 0.24, filter: { type: 'lowpass', freq: 520, freqEnd: 160, q: 1.5 } });
  playNoise(ctx, out, t + 0.45, { color: 'brown', filter: 'lowpass', freq: 220, attack: 0.004, decay: 0.12, gain: 0.25 });
  for (const delay of [0.95, 1.5, 2.2]) {
    end = Math.max(end, playNoise(ctx, out, t + delay, { filter: 'bandpass', freq: 4200, q: 6, attack: 0.0004, decay: 0.008, gain: 0.05 }));
  }
  return end;
}

function backfire(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 700, q: 0.8, attack: 0.0006, decay: 0.045, gain: 0.5 * v });
  let end = playTone(ctx, out, t, { freq: 130, freqEnd: 50, attack: 0.001, decay: 0.06, gain: 0.38 * v });
  const pops = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < pops; i += 1) {
    end = Math.max(end, playNoise(ctx, out, t + rand(0.05, 0.28), { filter: 'bandpass', freq: rand(1200, 2800), q: 1.5, attack: 0.0005, decay: rand(0.01, 0.025), gain: rand(0.12, 0.25) * v }));
  }
  return end;
}

function splash(ctx, out, t, p) {
  const v = Math.max(0.1, Math.min(1.2, p.intensity ?? 1));
  playTone(ctx, out, t, { freq: 320, freqEnd: 110, attack: 0.002, decay: 0.12, gain: 0.3 * v });
  let end = playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 3200, freqEnd: 450, sweep: 0.7, attack: 0.008, decay: 0.85 * Math.sqrt(v), gain: 0.5 * v });
  const bubbles = 4 + Math.floor(8 * v);
  for (let i = 0; i < bubbles; i += 1) {
    const f = rand(380, 900);
    end = Math.max(end, playTone(ctx, out, t + rand(0.08, 0.9) * v, { freq: f, freqEnd: f * 1.9, attack: 0.002, decay: 0.04, gain: rand(0.02, 0.05) * v }));
  }
  for (let i = 0; i < 8; i += 1) {
    end = Math.max(end, playTone(ctx, out, t + rand(0.2, 1.2) * v, { freq: rand(1500, 3600), attack: 0.001, decay: 0.02, gain: rand(0.015, 0.04) * v }));
  }
  return end;
}

function footstep(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  const surface = p.surface || p.variant || 'road';
  if (surface === 'sand' || surface === 'beach') {
    let end = playNoise(ctx, out, t, { color: 'pink', filter: 'lowpass', freq: 750, attack: 0.006, decay: 0.08, gain: 0.22 * v });
    for (let i = 0; i < 4; i += 1) {
      end = Math.max(end, playNoise(ctx, out, t + i * 0.014 + rand(0, 0.008), { filter: 'bandpass', freq: rand(1800, 2800), q: 0.9, attack: 0.001, decay: 0.014, gain: rand(0.08, 0.14) * v }));
    }
    return end;
  }
  if (surface === 'water') return splash(ctx, out, t, { intensity: 0.12 * v });
  const pitch = rand(0.85, 1.15);
  playNoise(ctx, out, t, { filter: 'bandpass', freq: 1700 * pitch, q: 1.5, attack: 0.0008, decay: 0.032, gain: 0.2 * v });
  playTone(ctx, out, t, { freq: 140 * pitch, freqEnd: 90, attack: 0.001, decay: 0.03, gain: 0.12 * v });
  return playNoise(ctx, out, t + 0.012, { filter: 'highpass', freq: 3200, attack: 0.008, decay: 0.05, gain: 0.035 * v });
}

function windGust(ctx, out, t, p) {
  const v = p.intensity ?? 1;
  playNoise(ctx, out, t, { color: 'pink', filter: 'bandpass', freq: 420, freqEnd: 1100, sweep: 1.2, q: 0.9, attack: 0.8, hold: 0.4, decay: 1.8, gain: 0.3 * v });
  return playNoise(ctx, out, t + 0.3, { color: 'pink', filter: 'bandpass', freq: 1300, freqEnd: 700, sweep: 2.2, q: 9, attack: 0.7, hold: 0.3, decay: 1.4, gain: 0.12 * v });
}
