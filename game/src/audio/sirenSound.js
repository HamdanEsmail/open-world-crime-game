// Police sirens on the streets of Port Sarab: each of the three nearest PSPD units with its siren on
// gets a voice, swept as a slow wail, a fast yelp or a two-tone hi-lo, placed by distance and bearing
// and bent by Doppler as it passes. Every unit runs its own sweep rate and changes pattern on its own
// clock, so two cars never lock in phase.
import { makeDrive } from './synthPrimitives.js';
import { dopplerFactor } from './engineSound.js';

/** How each siren pattern sweeps: the shape and rate of the sweep, its centre and width in Hz. */
export const SIREN_PATTERNS = {
  wail: { shape: 'triangle', rate: 0.32, centre: 1000, width: 430 },
  yelp: { shape: 'sawtooth', rate: 3.6, centre: 1060, width: 390 },
  hilo: { shape: 'square', rate: 0.95, centre: 820, width: 140 },
};

/** Per voice: a slightly different rate and the cycle of patterns it moves through. */
const VOICE_CHARACTERS = [
  { rateScale: 1.0, cycle: ['wail', 'yelp'], holds: [7.5, 3.5] },
  { rateScale: 1.13, cycle: ['yelp', 'wail'], holds: [4.0, 6.5] },
  { rateScale: 0.91, cycle: ['hilo', 'wail', 'yelp'], holds: [5.0, 6.0, 3.0] },
];

/**
 * Give the three nearest units with their siren on a voice each, every frame.
 * @param {ReturnType<import('./audioEngine.js').createAudioEngine>} engine
 * @param {Object} game
 */
export function createSirenChorus(engine, game) {
  const slots = [];
  const candidates = [null, null, null];
  const candidateDistance = [Infinity, Infinity, Infinity];
  const spot = { gain: 1, pan: 0, cutoff: 20000, distance: 0 };
  const range = 260;

  function update(dt) {
    if (!engine.isLive()) return;
    findNearestSirens();
    const t = engine.ctx.currentTime;
    for (let s = 0; s < 3; s += 1) {
      if (!slots[s]) slots[s] = { voice: null, vehicle: null, silentFor: 0, pattern: 0, patternTime: s * 1.7 };
      const slot = slots[s];
      if (slot.vehicle && candidates.indexOf(slot.vehicle) === -1) slot.vehicle = null;
    }
    for (let n = 0; n < 3; n += 1) {
      const v = candidates[n];
      if (!v) continue;
      let held = false;
      let free = null;
      for (let s = 0; s < 3; s += 1) {
        if (slots[s].vehicle === v) held = true;
        else if (!slots[s].vehicle && !free) free = slots[s];
      }
      if (!held && free) free.vehicle = v;
    }
    for (let s = 0; s < 3; s += 1) {
      const slot = slots[s];
      const v = slot.vehicle;
      if (!v) {
        if (slot.voice) {
          slot.voice.apply(0, 0, 1, t);
          slot.silentFor += dt;
          // A voice nobody needs for a few seconds is torn down to save the processor.
          if (slot.silentFor > 3) {
            slot.voice.stop(t);
            slot.voice = null;
          }
        }
        continue;
      }
      slot.silentFor = 0;
      if (!slot.voice) {
        slot.voice = createSirenVoice(engine.ctx, engine.buses.effects, VOICE_CHARACTERS[s].rateScale);
        slot.voice.setPattern(VOICE_CHARACTERS[s].cycle[slot.pattern], t);
      }
      advancePattern(slot, s, dt, t);
      engine.spatialize(v.pos.x, 1.6, v.pos.z, range, spot);
      const own = v === game.player?.vehicle ? 0.55 : 1;
      slot.voice.apply(0.28 * spot.gain * own, spot.pan, dopplerFactor(engine.listener, v), t, spot.cutoff);
    }
  }

  function advancePattern(slot, index, dt, t) {
    const character = VOICE_CHARACTERS[index];
    slot.patternTime += dt;
    if (slot.patternTime >= character.holds[slot.pattern]) {
      slot.patternTime = 0;
      slot.pattern = (slot.pattern + 1) % character.cycle.length;
      slot.voice.setPattern(character.cycle[slot.pattern], t);
    }
  }

  function findNearestSirens() {
    candidates[0] = candidates[1] = candidates[2] = null;
    candidateDistance[0] = candidateDistance[1] = candidateDistance[2] = Infinity;
    const list = game.vehicles?.list;
    const camera = game.camera;
    if (!list || !camera) return;
    const e = camera.matrixWorld.elements;
    for (let i = 0; i < list.length; i += 1) {
      const v = list[i];
      if (!v || !v.pos || !v.controls || !v.controls.siren || v.wrecked) continue;
      const dx = v.pos.x - e[12];
      const dz = v.pos.z - e[14];
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > range) continue;
      for (let k = 0; k < 3; k += 1) {
        if (d < candidateDistance[k]) {
          for (let j = 2; j > k; j -= 1) {
            candidates[j] = candidates[j - 1];
            candidateDistance[j] = candidateDistance[j - 1];
          }
          candidates[k] = v;
          candidateDistance[k] = d;
          break;
        }
      }
    }
  }

  return { update };
}

/**
 * One siren on any audio context: a saw and a square swept by an LFO, through a horn-speaker
 * resonance and mild drive, then level and pan.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} destination
 * @param {number} rateScale  this unit's own sweep speed, so sirens never phase-lock
 */
export function createSirenVoice(ctx, destination, rateScale = 1) {
  const level = ctx.createGain();
  level.gain.value = 0;
  const distanceFilter = ctx.createBiquadFilter();
  distanceFilter.type = 'lowpass';
  distanceFilter.frequency.value = 6000;
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const horn = ctx.createBiquadFilter();
  horn.type = 'peaking';
  horn.frequency.value = 1450;
  horn.Q.value = 1.1;
  horn.gain.value = 7;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 4300;
  const drive = makeDrive(ctx, 1.8);
  const mix = ctx.createGain();
  mix.gain.value = 0.45;
  mix.connect(drive).connect(horn).connect(top).connect(distanceFilter).connect(level);
  if (panner) level.connect(panner).connect(destination);
  else level.connect(destination);

  const sweep = ctx.createOscillator();
  const sweepDepth = ctx.createGain();
  sweep.connect(sweepDepth);
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  const square = ctx.createOscillator();
  square.type = 'square';
  const squareGain = ctx.createGain();
  squareGain.gain.value = 0.5;
  sweepDepth.connect(saw.frequency);
  sweepDepth.connect(square.frequency);
  saw.connect(mix);
  square.connect(squareGain).connect(mix);
  const t0 = ctx.currentTime;
  sweep.start(t0);
  saw.start(t0);
  square.start(t0);

  return {
    /** Switch to 'wail', 'yelp' or 'hilo' at time `when`. */
    setPattern(name, when) {
      const pattern = SIREN_PATTERNS[name] || SIREN_PATTERNS.wail;
      sweep.type = pattern.shape;
      sweep.frequency.setValueAtTime(pattern.rate * rateScale, when);
      sweepDepth.gain.setTargetAtTime(pattern.width, when, 0.03);
      saw.frequency.setTargetAtTime(pattern.centre, when, 0.03);
      square.frequency.setTargetAtTime(pattern.centre * 1.003, when, 0.03);
    },
    /** Level, pan (-1..1), Doppler pitch factor and distance cutoff, gliding from `when`. */
    apply(gain, pan, doppler, when, cutoff = 6000) {
      const cents = 1200 * Math.log2(Math.max(0.5, Math.min(2, doppler || 1)));
      saw.detune.setTargetAtTime(cents, when, 0.06);
      square.detune.setTargetAtTime(cents, when, 0.06);
      level.gain.setTargetAtTime(Math.max(0, gain), when, 0.06);
      distanceFilter.frequency.setTargetAtTime(Math.max(500, Math.min(8000, cutoff)), when, 0.1);
      if (panner) panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), when, 0.06);
    },
    stop(when) {
      level.gain.setTargetAtTime(0, when, 0.04);
      sweep.stop(when + 0.3);
      saw.stop(when + 0.3);
      square.stop(when + 0.3);
    },
  };
}
