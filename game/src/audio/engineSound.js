// The car under the player's hands: a layered engine note that follows rpm, throttle, gear and the
// model's character (a supercar's high wail, a sports car's rasp, a classic's burbling V8, a truck's
// diesel rumble, a buggy's buzzing two-stroke), tyre screech from wheel slip and a softer hiss on sand,
// rolling roar and wind at speed, the horn while it is held, and the faint, Doppler-bent engines of the
// two or three nearest cars going by.
import { getPulseWave, makeDrive, startNoiseLoop } from './synthPrimitives.js';
import { playSoundRecipe, startHornVoice } from './soundEffects.js';

/**
 * Follow the player's vehicle: build its engine rig on entering, play the start-up and shut-down,
 * and feed the rig the car's rpm, throttle, gear, speed and slip every frame.
 * @param {ReturnType<import('./audioEngine.js').createAudioEngine>} engine
 * @param {Object} game
 */
export function createPlayerCarSound(engine, game) {
  let rig = null;
  let rigVehicle = null;
  let horn = null;
  let lastThrottle = 0;
  let exitedFrom = null;
  const spot = { gain: 1, pan: 0, cutoff: 20000, distance: 0 };
  const state = { rpm: 0, throttle: 0, speed: 0, gear: 1, slip: 0, surface: 'road', health: 1, time: 0, running: true, airborne: false };

  /** The player got in: door shuts, the starter cranks, the engine catches. */
  function vehicleEntered(vehicle) {
    if (!engine.isLive() || !vehicle || rigVehicle === vehicle) return;
    const t = engine.ctx.currentTime;
    const className = vehicle.spec?.className;
    exitedFrom = null;
    playAt('doorClose', t, vehicle, null);
    if (!vehicle.wrecked) playAt('engineStart', t + 0.12, vehicle, { className });
    attach(vehicle, t + (isHeavy(className) ? 0.85 : 0.65));
  }

  /** The player got out: the engine dies away and the door opens. */
  function vehicleExited(vehicle) {
    if (!engine.isLive() || !vehicle || exitedFrom === vehicle) return;
    const t = engine.ctx.currentTime;
    if (!vehicle.wrecked && rigVehicle === vehicle) playAt('engineStop', t, vehicle, { className: vehicle.spec?.className });
    playAt('doorOpen', t + 0.05, vehicle, null);
    detach(t);
    exitedFrom = vehicle;
  }

  function playAt(id, t, vehicle, params) {
    const voice = engine.startVoice('effects', { x: vehicle.pos?.x, y: 1, z: vehicle.pos?.z, volume: 1 });
    if (voice) voice.endTime = playSoundRecipe(engine.ctx, voice.input, id, t, params);
  }

  function attach(vehicle, startTime) {
    detach(engine.ctx.currentTime);
    rigVehicle = vehicle;
    rig = createCarSoundRig(engine.ctx, engine.buses.engine, vehicle.spec?.className || 'sedan');
    rig.start(startTime);
  }

  function detach(t) {
    if (rig) {
      const finished = rig;
      finished.stop(t);
      setTimeout(() => finished.dispose(), 1200);
    }
    if (horn) horn.stop(t);
    rig = null;
    horn = null;
    rigVehicle = null;
  }

  /** Call once a frame. */
  function update() {
    if (!engine.isLive()) return;
    let vehicle = game.player?.vehicle || null;
    // While the exit animation plays the player still holds the vehicle: keep it silent.
    if (exitedFrom && vehicle === exitedFrom) vehicle = null;
    else if (vehicle !== exitedFrom) exitedFrom = null;
    const t = engine.ctx.currentTime;
    if (vehicle !== rigVehicle) {
      if (!vehicle) detach(t);
      else vehicleEntered(vehicle);
    }
    if (!rig || !vehicle) return;
    const controls = vehicle.controls || {};
    state.rpm = finite(vehicle.rpm, 0);
    state.throttle = vehicle.wrecked ? 0 : finite(controls.throttle, 0);
    state.speed = Math.abs(finite(vehicle.speed, 0));
    state.gear = finite(vehicle.gear, 1);
    state.slip = finite(vehicle.slip, 0);
    state.surface = vehicle.pos && game.terrain?.surfaceAt ? game.terrain.surfaceAt(vehicle.pos.x, vehicle.pos.z) : 'road';
    state.health = vehicle.spec?.health ? Math.max(0, finite(vehicle.health, 1) / vehicle.spec.health) : 1;
    state.running = !vehicle.wrecked;
    state.airborne = vehicle.grounded === false;
    state.time = t;
    if (vehicle.pos) engine.spatialize(vehicle.pos.x, 1, vehicle.pos.z, 260, spot);
    rig.apply(state, t, Math.max(0.3, spot.gain), spot.pan * 0.5);
    // Lifting off at high revs in something with a sporting exhaust pops and crackles.
    if (rig.profile.crackle && lastThrottle > 0.7 && state.throttle < 0.2 && state.rpm > 0.55 && Math.random() < 0.6) {
      playAt('backfire', t + 0.05, vehicle, { intensity: 0.5 + Math.random() * 0.4 });
    }
    lastThrottle = state.throttle;
    const hornHeld = !!controls.horn && !vehicle.wrecked;
    if (hornHeld && !horn) horn = startHornVoice(engine.ctx, engine.buses.effects, vehicle.spec?.className, t);
    else if (!hornHeld && horn) {
      horn.stop(t);
      horn = null;
    }
  }

  return { update, vehicleEntered, vehicleExited, get vehicle() { return rigVehicle; } };
}

/**
 * The faint engines of the nearest moving cars, each panned to where it is and bent in pitch as it
 * approaches and passes (Doppler).
 */
export function createTrafficEngines(engine, game, slotCount = 3) {
  const slots = [];
  const nearest = new Array(slotCount).fill(null);
  const nearestDistance = new Array(slotCount).fill(Infinity);
  const spot = { gain: 1, pan: 0, cutoff: 20000, distance: 0 };
  const range = 70;

  function update() {
    if (!engine.isLive()) return;
    const list = game.vehicles?.list;
    const camera = game.camera;
    nearest.fill(null);
    nearestDistance.fill(Infinity);
    if (list && camera) {
      const e = camera.matrixWorld.elements;
      const own = game.player?.vehicle;
      for (let i = 0; i < list.length; i += 1) {
        const v = list[i];
        if (!v || v === own || v.wrecked || !v.pos || v.parked) continue;
        if (Math.abs(finite(v.speed, 0)) < 1 && finite(v.controls?.throttle, 0) < 0.05) continue;
        const dx = v.pos.x - e[12];
        const dz = v.pos.z - e[14];
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > range) continue;
        insertNearest(v, d);
      }
    }
    const t = engine.ctx.currentTime;
    for (let s = 0; s < slotCount; s += 1) {
      if (!slots[s]) slots[s] = { voice: null, vehicle: null };
      const slot = slots[s];
      if (slot.vehicle && nearest.indexOf(slot.vehicle) === -1) slot.vehicle = null;
    }
    // Keep each car on the voice it already has so nothing jumps; give newcomers the free voices.
    for (let n = 0; n < slotCount; n += 1) {
      const v = nearest[n];
      if (!v) continue;
      let held = false;
      let free = null;
      for (let s = 0; s < slotCount; s += 1) {
        if (slots[s].vehicle === v) held = true;
        else if (!slots[s].vehicle && !free) free = slots[s];
      }
      if (!held && free) free.vehicle = v;
    }
    for (let s = 0; s < slotCount; s += 1) {
      const slot = slots[s];
      const v = slot.vehicle;
      if (!v) {
        if (slot.voice) slot.voice.set(40, 0, 0, 400, t);
        continue;
      }
      if (!slot.voice) slot.voice = createPassingEngineVoice(engine.ctx, engine.buses.engine);
      const profile = engineProfileFor(v.spec?.className);
      const top = v.spec?.topSpeed || 45;
      const rpm = typeof v.rpm === 'number' ? v.rpm : 0.15 + 0.7 * ((Math.abs(finite(v.speed, 0)) / top * 4) % 1);
      const revs = profile.idle + rpm * (profile.redline - profile.idle);
      const fire = (revs / 60) * firingPerRev(profile);
      engine.spatialize(v.pos.x, 1, v.pos.z, range * 1.2, spot);
      const doppler = dopplerFactor(engine.listener, v);
      const throttle = finite(v.controls?.throttle, 0.3);
      slot.voice.set(fire * doppler, 0.16 * spot.gain * (0.5 + 0.5 * throttle) * profile.level, spot.pan, Math.min(spot.cutoff, profile.cutIdle * 2.2), t);
    }
  }

  function insertNearest(v, d) {
    for (let i = 0; i < slotCount; i += 1) {
      if (d < nearestDistance[i]) {
        for (let j = slotCount - 1; j > i; j -= 1) {
          nearest[j] = nearest[j - 1];
          nearestDistance[j] = nearestDistance[j - 1];
        }
        nearest[i] = v;
        nearestDistance[i] = d;
        return;
      }
    }
  }

  return { update };
}

/** The character of each engine, by vehicle class. Frequencies in Hz, revs in rpm. */
export const ENGINE_PROFILES = {
  compact: { idle: 850, redline: 6800, cylinders: 4, saw: 0.32, pulse: 0.5, duty: 0.22, sub: 0.22, intake: 0.16, drive: 1.6, cutIdle: 420, cutOpen: 2600, q: 2.2, detune: 9, wobble: 0.12, burble: 0.05, level: 0.7 },
  sedan: { idle: 750, redline: 6200, cylinders: 6, saw: 0.42, pulse: 0.35, duty: 0.3, sub: 0.32, intake: 0.13, drive: 1.4, cutIdle: 380, cutOpen: 2400, q: 1.8, detune: 7, wobble: 0.1, burble: 0.08, level: 0.72 },
  sports: { idle: 950, redline: 7800, cylinders: 6, saw: 0.5, pulse: 0.5, duty: 0.14, sub: 0.28, intake: 0.2, drive: 3.4, cutIdle: 520, cutOpen: 4800, q: 3.0, detune: 11, wobble: 0.1, burble: 0.12, level: 0.82, crackle: true },
  super: { idle: 1100, redline: 9200, cylinders: 10, saw: 0.55, pulse: 0.32, duty: 0.35, sub: 0.15, intake: 0.18, drive: 2.4, cutIdle: 700, cutOpen: 7200, q: 2.4, detune: 6, wobble: 0.06, burble: 0.05, level: 0.8, wail: 0.28, crackle: true },
  classic: { idle: 650, redline: 5600, cylinders: 8, saw: 0.46, pulse: 0.42, duty: 0.4, sub: 0.5, intake: 0.12, drive: 2.0, cutIdle: 320, cutOpen: 2200, q: 2.0, detune: 14, wobble: 0.2, burble: 0.62, level: 0.9, crackle: true },
  suv: { idle: 700, redline: 5800, cylinders: 6, saw: 0.4, pulse: 0.4, duty: 0.28, sub: 0.45, intake: 0.12, drive: 1.8, cutIdle: 340, cutOpen: 2100, q: 1.8, detune: 9, wobble: 0.1, burble: 0.18, level: 0.8 },
  pickup: { idle: 680, redline: 5200, cylinders: 8, saw: 0.42, pulse: 0.42, duty: 0.32, sub: 0.5, intake: 0.12, drive: 2.0, cutIdle: 320, cutOpen: 2000, q: 1.9, detune: 12, wobble: 0.14, burble: 0.38, level: 0.85 },
  van: { idle: 760, redline: 5000, cylinders: 4, saw: 0.36, pulse: 0.45, duty: 0.25, sub: 0.3, intake: 0.1, drive: 1.5, cutIdle: 360, cutOpen: 1900, q: 1.6, detune: 8, wobble: 0.12, burble: 0.06, level: 0.75 },
  truck: { idle: 600, redline: 2600, cylinders: 6, saw: 0.38, pulse: 0.6, duty: 0.12, sub: 0.6, intake: 0.1, drive: 2.2, cutIdle: 240, cutOpen: 1150, q: 1.6, detune: 12, wobble: 0.15, burble: 0.25, level: 0.95, clatter: 0.3 },
  bus: { idle: 580, redline: 2400, cylinders: 6, saw: 0.36, pulse: 0.6, duty: 0.12, sub: 0.6, intake: 0.08, drive: 2.0, cutIdle: 220, cutOpen: 1000, q: 1.5, detune: 12, wobble: 0.14, burble: 0.22, level: 0.95, clatter: 0.26 },
  armored: { idle: 560, redline: 2800, cylinders: 8, saw: 0.4, pulse: 0.6, duty: 0.14, sub: 0.7, intake: 0.1, drive: 2.6, cutIdle: 220, cutOpen: 1200, q: 1.8, detune: 14, wobble: 0.16, burble: 0.35, level: 1.0, clatter: 0.22 },
  buggy: { idle: 1500, redline: 9500, cylinders: 2, twoStroke: true, saw: 0.3, pulse: 0.65, duty: 0.08, sub: 0.1, intake: 0.28, drive: 4.5, cutIdle: 900, cutOpen: 5200, q: 3.5, detune: 18, wobble: 0.25, burble: 0.1, level: 0.68 },
  police: { idle: 750, redline: 6500, cylinders: 8, saw: 0.5, pulse: 0.45, duty: 0.3, sub: 0.45, intake: 0.2, drive: 2.8, cutIdle: 380, cutOpen: 3600, q: 2.6, detune: 10, wobble: 0.12, burble: 0.35, level: 0.9 },
};
ENGINE_PROFILES.taxi = ENGINE_PROFILES.sedan;
ENGINE_PROFILES.policeSuv = ENGINE_PROFILES.police;

/** The engine profile for a vehicle class, a sedan's when the class is unknown. */
export function engineProfileFor(className) {
  return ENGINE_PROFILES[className] || ENGINE_PROFILES.sedan;
}

/**
 * Every sound a driven car makes, as one rig on any audio context: engine layers, tyres, rolling roar
 * and wind. apply(state, when, gain, pan) moves each layer toward the car's state:
 * {rpm 0..1, throttle 0..1, speed m/s, gear, slip 0..1, surface, health 0..1, running}.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} destination
 * @param {string} className
 */
export function createCarSoundRig(ctx, destination, className) {
  const p = engineProfileFor(className);
  const nodes = [];
  const sources = [];
  const oscillators = [];
  const node = (n) => {
    nodes.push(n);
    return n;
  };
  const source = (n) => {
    sources.push(n);
    if (n instanceof OscillatorNode) oscillators.push(n);
    return n;
  };

  const fader = node(ctx.createGain());
  fader.gain.value = 0;
  const panner = ctx.createStereoPanner ? node(ctx.createStereoPanner()) : null;
  if (panner) fader.connect(panner).connect(destination);
  else fader.connect(destination);

  // The engine: detuned saws and a pulse through drive and a load-following low-pass, a clean sub
  // underneath, intake noise on top, all through an amplitude stage the burble and wobble shake.
  const engineLevel = node(ctx.createGain());
  engineLevel.gain.value = 0;
  const shake = node(ctx.createGain());
  shake.gain.value = 1;
  const filter = node(ctx.createBiquadFilter());
  filter.type = 'lowpass';
  filter.frequency.value = p.cutIdle;
  filter.Q.value = p.q;
  const drive = node(makeDrive(ctx, p.drive));
  const tone = node(ctx.createGain());
  tone.gain.value = 0.5;
  tone.connect(drive).connect(filter).connect(shake);
  shake.connect(engineLevel).connect(fader);

  const sawA = source(ctx.createOscillator());
  sawA.type = 'sawtooth';
  const sawB = source(ctx.createOscillator());
  sawB.type = 'sawtooth';
  sawB.detune.value = p.detune;
  const pulse = source(ctx.createOscillator());
  pulse.setPeriodicWave(getPulseWave(ctx, p.duty));
  const sub = source(ctx.createOscillator());
  sub.type = 'sine';
  connectWithGain(ctx, sawA, tone, p.saw, node);
  connectWithGain(ctx, sawB, tone, p.saw * 0.8, node);
  connectWithGain(ctx, pulse, tone, p.pulse, node);
  connectWithGain(ctx, sub, shake, p.sub, node);
  const engineOscillators = [sawA, sawB, pulse];
  let wail = null;
  if (p.wail) {
    wail = source(ctx.createOscillator());
    wail.type = 'sawtooth';
    const wailFilter = node(ctx.createBiquadFilter());
    wailFilter.type = 'bandpass';
    wailFilter.frequency.value = 2400;
    wailFilter.Q.value = 1.2;
    wail.connect(wailFilter);
    connectWithGain(ctx, wailFilter, shake, p.wail, node);
  }

  const white = source(startNoiseLoop(ctx, 'white'));
  const pink = source(startNoiseLoop(ctx, 'pink'));
  const brown = source(startNoiseLoop(ctx, 'brown'));
  const intakeFilter = node(ctx.createBiquadFilter());
  intakeFilter.type = 'bandpass';
  intakeFilter.Q.value = 1.4;
  const intake = node(ctx.createGain());
  intake.gain.value = 0;
  white.connect(intakeFilter).connect(intake).connect(engineLevel);

  // Burble (the lope of a big engine at idle) and wobble (an idle that hunts) shake the amplitude.
  const burble = source(ctx.createOscillator());
  burble.type = 'triangle';
  const burbleDepth = node(ctx.createGain());
  burbleDepth.gain.value = 0;
  burble.connect(burbleDepth).connect(shake.gain);
  const wobble = source(ctx.createOscillator());
  wobble.frequency.value = 2.3 + Math.random() * 0.8;
  const wobbleCents = node(ctx.createGain());
  wobbleCents.gain.value = 0;
  wobble.connect(wobbleCents);
  for (const osc of engineOscillators) wobbleCents.connect(osc.detune);

  // A diesel's clatter: knocking noise gated at the firing rate.
  let clatterGate = null;
  let clatter = null;
  if (p.clatter) {
    clatterGate = source(ctx.createOscillator());
    clatterGate.setPeriodicWave(getPulseWave(ctx, 0.2));
    const clatterFilter = node(ctx.createBiquadFilter());
    clatterFilter.type = 'bandpass';
    clatterFilter.frequency.value = 2600;
    clatterFilter.Q.value = 1.2;
    clatter = node(ctx.createGain());
    clatter.gain.value = 0;
    const gate = node(ctx.createGain());
    gate.gain.value = 0;
    clatterGate.connect(gate.gain);
    white.connect(clatterFilter).connect(gate).connect(clatter).connect(engineLevel);
  }

  // Tyres: two narrow bands of noise and a wavering tone for the screech; brown roar for rolling; a
  // grainy hiss on sand; wind rising with the square of speed.
  const screech = node(ctx.createGain());
  screech.gain.value = 0;
  screech.connect(fader);
  const bandA = node(ctx.createBiquadFilter());
  bandA.type = 'bandpass';
  bandA.Q.value = 7;
  const bandB = node(ctx.createBiquadFilter());
  bandB.type = 'bandpass';
  bandB.Q.value = 11;
  white.connect(bandA).connect(screech);
  connectWithGain(ctx, white.connect(bandB), screech, 0.7, node);
  const squeal = source(ctx.createOscillator());
  squeal.type = 'triangle';
  connectWithGain(ctx, squeal, screech, 0.05, node);
  const rollFilter = node(ctx.createBiquadFilter());
  rollFilter.type = 'lowpass';
  const roll = node(ctx.createGain());
  roll.gain.value = 0;
  brown.connect(rollFilter).connect(roll).connect(fader);
  const sandFilter = node(ctx.createBiquadFilter());
  sandFilter.type = 'bandpass';
  sandFilter.frequency.value = 1700;
  sandFilter.Q.value = 0.6;
  const sand = node(ctx.createGain());
  sand.gain.value = 0;
  pink.connect(sandFilter).connect(sand).connect(fader);
  const windFilter = node(ctx.createBiquadFilter());
  windFilter.type = 'bandpass';
  windFilter.Q.value = 0.7;
  const wind = node(ctx.createGain());
  wind.gain.value = 0;
  pink.connect(windFilter).connect(wind).connect(fader);

  const born = ctx.currentTime;
  for (let i = 0; i < oscillators.length; i += 1) oscillators[i].start(born);

  let lastGear = null;
  let shiftTime = -10;
  let misfireUntil = -10;
  let started = false;

  /** Move every layer toward the car's state; called once a frame (or on a schedule offline). */
  function apply(s, when, gain = 1, pan = 0) {
    const rpm = clamp01(s.rpm);
    const throttle = clamp01(s.throttle);
    const speed = Math.abs(s.speed || 0);
    const running = s.running !== false;
    const revs = p.idle + rpm * (p.redline - p.idle);
    const fire = (revs / 60) * firingPerRev(p);
    const load = throttle * (0.35 + 0.65 * rpm);
    if (lastGear !== null && s.gear !== lastGear && s.gear > lastGear && throttle > 0.3) shiftTime = when;
    lastGear = s.gear;
    const sinceShift = when - shiftTime;
    const shiftDip = sinceShift >= 0 && sinceShift < 0.3 ? 1 - 0.55 * Math.exp(-sinceShift / 0.08) : 1;
    let level = p.level * (0.3 + 0.3 * rpm + 0.4 * throttle) * shiftDip;
    if (rpm > 0.97 && throttle > 0.7 && Math.floor(when * 16) % 2 === 0) level *= 0.5;
    if (s.health !== undefined && s.health < 0.3 && when > misfireUntil && Math.random() < (0.3 - s.health) * 0.15) misfireUntil = when + 0.06;
    if (when < misfireUntil) level *= 0.25;
    if (!running) level = 0;
    const tc = 0.025;
    for (let i = 0; i < engineOscillators.length; i += 1) engineOscillators[i].frequency.setTargetAtTime(fire, when, tc);
    sub.frequency.setTargetAtTime(fire * 0.5, when, tc);
    if (wail) wail.frequency.setTargetAtTime(fire * 2, when, tc);
    if (clatterGate) {
      clatterGate.frequency.setTargetAtTime(fire, when, tc);
      clatter.gain.setTargetAtTime(p.clatter * (0.4 + 0.6 * throttle), when, 0.05);
    }
    const cutoff = (p.cutIdle + (p.cutOpen - p.cutIdle) * (0.25 * rpm + 0.75 * load)) * (0.6 + 0.4 * shiftDip);
    filter.frequency.setTargetAtTime(cutoff, when, 0.04);
    engineLevel.gain.setTargetAtTime(level, when, 0.03);
    intakeFilter.frequency.setTargetAtTime(900 + 2200 * rpm, when, 0.05);
    intake.gain.setTargetAtTime(running ? p.intake * throttle * (0.3 + rpm) : 0, when, 0.05);
    burble.frequency.setTargetAtTime(Math.max(2, revs / 120), when, 0.05);
    const lope = p.burble * (Math.pow(1 - rpm, 1.5) * (1 - 0.6 * throttle) + 0.3 * (1 - throttle) * rpm);
    burbleDepth.gain.setTargetAtTime(running ? lope : 0, when, 0.06);
    wobbleCents.gain.setTargetAtTime(p.wobble * 40 * (1 - rpm) * (1 - rpm), when, 0.1);

    const onSand = s.surface === 'sand' || s.surface === 'beach';
    const airborne = !!s.airborne;
    const slide = smooth(0.12, 0.55, s.slip || 0) * clamp01((speed - 2) / 6);
    const screechFreq = 900 + Math.min(speed, 45) * 16 + (Math.random() - 0.5) * 60;
    bandA.frequency.setTargetAtTime(screechFreq, when, 0.03);
    bandB.frequency.setTargetAtTime(screechFreq * 1.7, when, 0.03);
    squeal.frequency.setTargetAtTime(screechFreq * 0.97, when, 0.02);
    screech.gain.setTargetAtTime(onSand || airborne ? 0 : slide * 0.3 * (0.85 + Math.random() * 0.3), when, 0.03);
    rollFilter.frequency.setTargetAtTime(180 + speed * 12, when, 0.1);
    roll.gain.setTargetAtTime(airborne ? 0 : Math.pow(clamp01(speed / 45), 1.3) * (onSand ? 0.08 : 0.24), when, 0.08);
    sand.gain.setTargetAtTime(onSand && !airborne ? clamp01(speed / 30) * 0.16 + slide * 0.22 : 0, when, 0.08);
    windFilter.frequency.setTargetAtTime(380 + speed * 22, when, 0.2);
    wind.gain.setTargetAtTime(Math.pow(clamp01((speed - 8) / 52), 2) * 0.32, when, 0.15);

    if (started) fader.gain.setTargetAtTime(clamp01(gain), when, 0.05);
    if (panner) panner.pan.setTargetAtTime(pan, when, 0.05);
  }

  /** Fade the rig in at `when` (the engine has just caught). */
  function start(when) {
    const t = Math.max(ctx.currentTime, when);
    fader.gain.setValueAtTime(0, t);
    fader.gain.linearRampToValueAtTime(1, t + 0.3);
    started = true;
  }

  /** Fade out from `when`; every source stops shortly after. */
  function stop(when) {
    started = false;
    fader.gain.cancelScheduledValues(when);
    fader.gain.setTargetAtTime(0, when, 0.09);
    for (let i = 0; i < sources.length; i += 1) {
      try {
        sources[i].stop(when + 0.6);
      } catch (error) {
        /* already stopped */
      }
    }
  }

  /** Disconnect everything once the rig has fallen silent. */
  function dispose() {
    for (let i = 0; i < nodes.length; i += 1) nodes[i].disconnect();
    for (let i = 0; i < sources.length; i += 1) sources[i].disconnect();
  }

  return { apply, start, stop, dispose, profile: p };
}

/**
 * One faint engine for a passing car: a saw and a pulse through a low-pass, panned.
 * set(freq, gain, pan, cutoff, when) glides it toward the car's note.
 */
export function createPassingEngineVoice(ctx, destination) {
  const level = ctx.createGain();
  level.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.2;
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  filter.connect(level);
  if (panner) level.connect(panner).connect(destination);
  else level.connect(destination);
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  const pulse = ctx.createOscillator();
  pulse.setPeriodicWave(getPulseWave(ctx, 0.3));
  const pulseGain = ctx.createGain();
  pulseGain.gain.value = 0.6;
  saw.connect(filter);
  pulse.connect(pulseGain).connect(filter);
  const t0 = ctx.currentTime;
  saw.start(t0);
  pulse.start(t0);
  return {
    set(freq, gain, pan, cutoff, when) {
      saw.frequency.setTargetAtTime(Math.max(20, freq), when, 0.05);
      pulse.frequency.setTargetAtTime(Math.max(10, freq * 0.5), when, 0.05);
      filter.frequency.setTargetAtTime(Math.max(150, cutoff), when, 0.08);
      level.gain.setTargetAtTime(gain, when, 0.08);
      if (panner) panner.pan.setTargetAtTime(pan, when, 0.08);
    },
  };
}

/** Pitch factor for a moving source heard by a moving listener (speed of sound 343 m/s). */
export function dopplerFactor(listener, vehicle) {
  if (!listener || !vehicle.pos) return 1;
  const dx = listener.x - vehicle.pos.x;
  const dz = listener.z - vehicle.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  const vx = vehicle.vel ? vehicle.vel.x : 0;
  const vz = vehicle.vel ? vehicle.vel.z : 0;
  const sourceToward = vx * ux + vz * uz;
  const listenerToward = -(listener.vx * ux + listener.vz * uz);
  const factor = (343 + listenerToward) / Math.max(150, 343 - sourceToward);
  return Math.max(0.7, Math.min(1.4, factor));
}

function firingPerRev(profile) {
  return profile.twoStroke ? profile.cylinders : profile.cylinders / 2;
}

function connectWithGain(ctx, from, to, amount, register) {
  const g = register(ctx.createGain());
  g.gain.value = amount;
  from.connect(g).connect(to);
  return g;
}

function isHeavy(className) {
  return className === 'truck' || className === 'bus' || className === 'armored';
}

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v || 0;
}

function smooth(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
