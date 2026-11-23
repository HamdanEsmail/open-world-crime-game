// How every vehicle in Port Sarab drives: one small time step of steering, tyres, engine, brakes
// and handbrake on whatever the wheels stand on, from city asphalt to the Amber Dunes. Four real
// tyres on a bicycle-style chassis: grip that peaks and then lets go (so a slide can be caught), a
// traction circle that drive, braking and cornering share, and weight that moves between the wheels
// as the car brakes, accelerates and leans. Below walking pace it blends into a kinematic model, so
// a parked car never jitters.
import {
  tyreForceShare, steeringLockAtSpeed, brakeOrReverse, handbrakeRearGrip, BURST_GRIP, BURST_TOP_SPEED, BURST_DRAG, BURST_PULL,
} from './drivingRules.js';
import { engineDriveForce, engineBrakingForce, updateGearbox } from './vehicleDrivetrain.js';
import {
  sampleWheelGround, computeSuspensionLoads, stepBodyAttitude, updateWaterImmersion, writeWheelSuspension,
} from './vehicleSuspension.js';

/**
 * Advance one vehicle by `dt` seconds (about 1/120).
 * @param {import('../core/gameContext.js').Vehicle} vehicle
 * @param {number} dt
 * @param {{terrain:Object|null, gravity:number, seaLevel:number}} world
 */
export function stepVehicleDynamics(vehicle, dt, world) {
  const dyn = vehicle.dynamics;
  const profile = dyn.profile;
  const controls = vehicle.controls;
  const gravity = world.gravity;
  const mass = profile.mass;
  const quarterMass = mass * 0.25;
  const vel = vehicle.vel;
  const pos = vehicle.pos;
  if (dyn.spinFreedom > 0) dyn.spinFreedom -= dt;
  readTuningAndTyres(vehicle, dyn);

  let sinH = Math.sin(vehicle.heading);
  let cosH = Math.cos(vehicle.heading);
  // The chassis turns about its centre of mass, a little ahead of the axle midpoint on a nose-heavy car.
  let cgX = pos.x + sinH * profile.cgOffset;
  let cgZ = pos.z + cosH * profile.cgOffset;

  const blocked = sampleWheelGround(vehicle, profile, dyn, world.terrain, cgX, cgZ, sinH, cosH, dt);
  if (blocked !== 0) stopAtGroundStep(vehicle, profile, dyn, blocked, sinH, cosH);
  cgX = pos.x + sinH * profile.cgOffset;
  cgZ = pos.z + cosH * profile.cgOffset;
  const touching = computeSuspensionLoads(vehicle, profile, dyn);
  const submerged = updateWaterImmersion(vehicle, profile, dyn, world.seaLevel, dyn.inWater, gravity);

  let forward = vel.x * sinH + vel.z * cosH;
  let lateral = vel.x * cosH - vel.z * sinH;
  let yawRate = vehicle.yawRate;

  // What the driver asks for. A wreck or a parked car slides on locked wheels.
  const locked = vehicle.wrecked || vehicle.parked;
  let throttle = locked ? 0 : clamp01(controls.throttle);
  let brake = locked ? 0 : clamp01(controls.brake);
  const handbrake = !locked && !!controls.handbrake;
  const reverse = !!controls.reverse;
  if (reverse && throttle > 0 && brakeOrReverse(forward) === 'brake') {
    // Reverse only engages once the car has nearly stopped; until then the pedal brakes.
    if (throttle > brake) brake = throttle;
    throttle = 0;
  }

  steerFrontWheels(vehicle, profile, dyn, controls, locked, handbrake, forward, lateral, touching, dt);

  updateGearbox(vehicle, profile, dyn, forward, throttle, reverse, dyn.wheelspin, touching === 0, dt);
  let drive = engineDriveForce(profile, dyn, vehicle.gear, forward, throttle);
  if (submerged > 0) drive *= (1 - submerged) * (1 - submerged);
  const engineBrake = throttle > 0.02 ? 0 : engineBrakingForce(profile, vehicle, dyn);
  const brakeTotal = brake * mass * profile.braking;
  // Power through a bend keeps the driven tyres just inside their grip; floor it (in first or second
  // for a rear-driver) and they are allowed past it. Once the tail is well out the wheelspin is
  // feathered back, as a rally driver would with the pedal, so a floored drift holds its angle.
  let tractionLimit = 0.97;
  if (throttle > 0.85 && (profile.drive !== 'rwd' || (vehicle.gear >= 1 && vehicle.gear <= 2))) {
    const driftAngle = Math.abs(Math.atan2(lateral, Math.max(Math.abs(forward), 1)));
    tractionLimit = lerp(profile.powerSlideLimit, 0.97, smoothstep(0.15, 0.45, driftAngle));
  }

  // The four tyres.
  let tyreForward = 0;
  let tyreLeft = 0;
  let torque = 0;
  let skidMost = 0;
  let wheelspin = 0;
  const steerTan = Math.tan(dyn.steerAngle);
  for (let i = 0; i < 4; i += 1) {
    const front = i < 2;
    const pf = front ? profile.cgToFront : -profile.cgToRear;
    const pl = (i & 1) === 0 ? profile.halfTrack : -profile.halfTrack;
    const wheel = vehicle.wheels[i];
    // Ackermann: the inside front wheel turns a little tighter than the outside one.
    let angle = 0;
    if (front && steerTan !== 0) angle = Math.atan(steerTan / (1 - (pl * steerTan) / profile.wheelbase));
    wheel.steerAngle = angle;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const contactForward = forward - yawRate * pl;
    const contactLeft = lateral + yawRate * pf;
    const along = contactForward * cosA + contactLeft * sinA;
    const across = -contactForward * sinA + contactLeft * cosA;
    const driveShare = front ? profile.driveFront * 0.5 : profile.driveRear * 0.5;
    const wheelLocked = locked || (handbrake && !front);

    let load = dyn.load[i];
    if (load > profile.staticLoad[i] * 2.6) load = profile.staticLoad[i] * 2.6;
    if (load <= 0) {
      // In the air: a driven wheel under throttle spins up, the others coast.
      const free = wheelLocked ? 0 : along / profile.wheelRadius + (driveShare > 0 ? throttle * 40 : 0);
      dyn.wheelRate[i] += (free - dyn.wheelRate[i]) * (1 - Math.exp(-3 * dt));
      wheel.skid = 0;
      wheel.spin = (wheel.spin + dyn.wheelRate[i] * dt) % TAU;
      continue;
    }
    const loadRatio = load / profile.staticLoad[i];
    let sensitivity = 1 - profile.loadSensitivity * (loadRatio - 1);
    if (sensitivity < 0.75) sensitivity = 0.75;
    else if (sensitivity > 1.12) sensitivity = 1.12;
    const grip = profile.grip * dyn.gripScale * (front ? 1 : profile.rearGrip) * dyn.surfaceGrip[i] * sensitivity * load;

    let longForce;
    let latForce;
    let skid;
    let rate;
    if (wheelLocked) {
      // A locked tyre slides: friction straight against the way its contact patch is moving.
      const slide = Math.sqrt(along * along + across * across);
      let k = handbrakeRearGrip(grip) / (slide > 1 ? slide : 1);
      const kMax = quarterMass / dt;
      if (k > kMax) k = kMax;
      longForce = -along * k;
      latForce = -across * k;
      skid = smoothstep(1, 4, slide);
      rate = 0;
    } else {
      const stiffness = (front ? profile.tyreStiffnessFront : profile.tyreStiffnessRear) * dyn.surfaceStiffness[i];
      const slipAngle = Math.atan2(across, Math.max(Math.abs(along), SLIP_SPEED_FLOOR));
      latForce = -grip * tyreForceShare(slipAngle, stiffness);
      let driveForce = drive * driveShare;
      if (driveForce !== 0) {
        const budget = grip * tractionLimit;
        const cornering = Math.abs(latForce);
        let room = budget > cornering ? Math.sqrt(budget * budget - cornering * cornering) : 0;
        if (room < grip * 0.15) room = grip * 0.15;
        if (driveForce > room) driveForce = room;
        else if (driveForce < -room) driveForce = -room;
      }
      // Brakes (with ABS: they never lock), rolling resistance, engine braking and soft sand all
      // resist the rolling; none of them can push a stopped wheel backwards.
      let brakeForce = brakeTotal * (front ? profile.brakeFront : 1 - profile.brakeFront) * 0.5;
      if (brakeForce > grip * 0.92) brakeForce = grip * 0.92;
      let resist = brakeForce + profile.rollingResistance * load + engineBrake * driveShare
        + (dyn.sandDrag[i] + (dyn.tyresBurst ? BURST_DRAG : 0)) * quarterMass;
      const stopLimit = (quarterMass * Math.abs(along)) / dt;
      if (resist > stopLimit) resist = stopLimit;
      longForce = driveForce - (along > 0 ? resist : along < 0 ? -resist : 0);
      // The traction circle: drive, braking and cornering share one budget of grip.
      const demand = Math.sqrt(longForce * longForce + latForce * latForce);
      let over = 0;
      if (demand > grip && demand > 0) {
        over = demand / grip - 1;
        const scale = (grip * (1 - SLIDE_GRIP_DROP * smoothstep(0, 0.7, over))) / demand;
        longForce *= scale;
        latForce *= scale;
      }
      const sliding = smoothstep(1.3, 3.2, Math.abs(slipAngle) / profile.peakSlip)
        * smoothstep(2, 6, Math.abs(along) + Math.abs(across));
      skid = Math.max(smoothstep(0.05, 0.6, over), sliding);
      rate = along / profile.wheelRadius;
      if (driveShare > 0 && grip > 0) {
        // Driven wheels asking for more than the road gives spin up: smoke, revs, a sideways tail.
        const excess = Math.abs(driveForce) / grip - 0.9;
        if (excess > 0) {
          const spin = excess > 1 ? 1 : excess;
          if (spin > wheelspin) wheelspin = spin;
          rate += (Math.sign(driveForce) * spin * 16) / profile.wheelRadius;
          if (spin > skid) skid = spin;
        }
      }
    }
    dyn.wheelRate[i] = rate;
    wheel.skid = skid;
    wheel.spin = (wheel.spin + rate * dt) % TAU;
    if (skid > skidMost) skidMost = skid;

    const bodyForward = longForce * cosA - latForce * sinA;
    const bodyLeft = longForce * sinA + latForce * cosA;
    tyreForward += bodyForward;
    tyreLeft += bodyLeft;
    torque += pf * bodyLeft - pl * bodyForward;
  }
  dyn.wheelspin = wheelspin;

  // Air, slopes and water.
  const speed = Math.sqrt(forward * forward + lateral * lateral);
  let forceForward = tyreForward - profile.dragCoefficient * speed * forward;
  let forceLeft = tyreLeft - profile.dragCoefficient * speed * lateral;
  if (touching > 0) {
    forceForward += mass * gravity * Math.sin(dyn.groundPitch);
    forceLeft -= mass * gravity * Math.sin(dyn.groundRoll);
  }

  // Integrate the chassis in world space.
  const pathBefore = Math.atan2(vel.x, vel.z);
  vel.x += ((forceForward * sinH + forceLeft * cosH) / mass) * dt;
  vel.z += ((forceForward * cosH - forceLeft * sinH) / mass) * dt;
  yawRate += (torque / profile.yawInertia) * dt;
  if (touching === 0) yawRate *= Math.exp(-0.4 * dt);
  vehicle.heading += yawRate * dt;
  if (vehicle.heading > Math.PI) vehicle.heading -= TAU;
  else if (vehicle.heading < -Math.PI) vehicle.heading += TAU;
  sinH = Math.sin(vehicle.heading);
  cosH = Math.cos(vehicle.heading);
  forward = vel.x * sinH + vel.z * cosH;
  lateral = vel.x * cosH - vel.z * sinH;

  if (touching >= 2) {
    if (forward > 2.5) {
      // The drift stabiliser: past a soft angle, the body's rotation is drawn toward the rate at
      // which the car's path is turning, so the drift angle stops growing at the hard limit. A
      // keyboard driver can hold a slide all the way round a bend and never spins helplessly.
      const beta = Math.atan2(lateral, forward);
      const pathRate = wrapAngle(Math.atan2(vel.x, vel.z) - pathBefore) / dt;
      const growth = pathRate - yawRate;
      const soft = handbrake ? 0.9 : lerp(0.3, 0.2, smoothstep(15, 40, forward));
      const hard = handbrake ? 1.5 : lerp(0.75, 0.5, smoothstep(12, 40, forward));
      const absBeta = Math.abs(beta);
      // A car spun by a hit (a PIT, a T-bone) is left to spin for a moment.
      const assist = dyn.spinFreedom > 0 ? 0 : 1;
      if (absBeta > soft && growth * beta > 0) yawRate += growth * assist * smoothstep(soft, hard, absBeta) * Math.min(1, SPIN_GUARD * dt);
      // A touch of yaw damping at motorway speed keeps the car arrow-straight.
      yawRate *= Math.exp(-0.5 * smoothstep(25, 70, forward) * dt);
    }
    // At a crawl the wheels roll where they point (kinematic steering), reached no faster than the tyres allow.
    const crawl = locked ? 0 : 1 - smoothstep(KINEMATIC_LOW, KINEMATIC_HIGH, Math.abs(forward));
    if (crawl > 0) {
      const kinematicYaw = (forward * Math.tan(dyn.steerAngle)) / profile.wheelbase;
      const kinematicLeft = kinematicYaw * profile.cgToRear;
      const reach = profile.grip * gravity * dt * crawl * (handbrake ? 0.3 : 1.5);
      lateral = approach(lateral, kinematicLeft, reach);
      yawRate = approach(yawRate, kinematicYaw, (reach * 2) / profile.wheelbase);
    }
    // Standing still: no throttle and barely moving means parked, not creeping or jittering.
    if (throttle <= 0.01 && forward * forward + lateral * lateral < HOLD_SPEED * HOLD_SPEED && Math.abs(yawRate) < 0.3 && submerged <= 0) {
      forward = 0;
      lateral = 0;
      yawRate = 0;
    }
  }
  if (submerged > 0) {
    const drag = Math.exp(-(0.6 + 2.6 * submerged) * dt);
    forward *= drag;
    lateral *= drag;
    yawRate *= Math.exp(-2 * submerged * dt);
  }
  vel.x = forward * sinH + lateral * cosH;
  vel.z = forward * cosH - lateral * sinH;
  vehicle.yawRate = yawRate;
  vehicle.speed = forward;

  cgX += vel.x * dt;
  cgZ += vel.z * dt;
  pos.x = cgX - sinH * profile.cgOffset;
  pos.z = cgZ - cosH * profile.cgOffset;

  stepBodyAttitude(vehicle, profile, dyn, tyreForward / mass, tyreLeft / mass, dt, gravity);
  writeWheelSuspension(vehicle, profile, dyn);
  vehicle.slip += (skidMost - vehicle.slip) * (1 - Math.exp(-12 * dt));

  if (!isFiniteVehicle(vehicle)) recoverFromBadState(vehicle, dyn);
  dyn.prevX = pos.x;
  dyn.prevZ = pos.z;
}

/**
 * Turn the steering wheel toward the driver's input at a speed-sensitive rate, shrink the lock as
 * speed rises (full key is the tyres' limit, never far past it), and let the front wheels turn
 * themselves toward a slide so a keyboard driver can hold a drift.
 */
function steerFrontWheels(vehicle, profile, dyn, controls, locked, handbrake, forward, lateral, touching, dt) {
  const target = locked ? dyn.steer : clamp(controls.steer || 0, -1, 1);
  const speedAbs = Math.abs(forward);
  const slowdown = 1 - 0.55 * smoothstep(4, 40, speedAbs);
  const returning = Math.abs(target) < Math.abs(dyn.steer) || target * dyn.steer < 0;
  const rate = (returning ? profile.steerReturnRate : profile.steerRate) * slowdown;
  dyn.steer = approach(dyn.steer, target, rate * dt);
  const lock = steeringLockAtSpeed(speedAbs, profile.wheelbase, profile.grip * dyn.gripScale, profile.peakSlip, profile.maxSteer);
  let angle = -dyn.steer * lock;
  // A burst tyre drags the car toward its side.
  if (dyn.tyresBurst) angle += ((vehicle.id & 1) === 0 ? BURST_PULL : -BURST_PULL) * smoothstep(2, 10, speedAbs);
  if (forward > 1.5 && touching > 0 && !locked) {
    const beta = Math.atan2(lateral, forward);
    // With the tail already out, steering further into the bend has less bite: a keyboard driver
    // can hold a drift but not wind the car round into a spin.
    if (angle * beta < 0) angle *= 1 - (handbrake ? 0.2 : 0.65) * smoothstep(0.1, 0.45, Math.abs(beta));
    const help = profile.counterSteer * smoothstep(1.5, 6, forward) * (handbrake ? 0.3 : 1);
    angle += clamp(beta, -0.7, 0.7) * help;
  }
  dyn.steerAngle = clamp(angle, -profile.maxSteer, profile.maxSteer);
}

/**
 * Garage upgrades (vehicle.tune = {power, grip, topSpeed}, each a multiplier, 1 when absent) and
 * tyres burst on a police spike strip (vehicle.tags.tyresBurst): grip, top speed, drag and pull.
 */
function readTuningAndTyres(vehicle, dyn) {
  const tune = vehicle.tune;
  const burst = !!(vehicle.tags && vehicle.tags.tyresBurst === true);
  dyn.tyresBurst = burst;
  dyn.powerScale = tune && tune.power > 0 ? tune.power : 1;
  dyn.speedScale = (tune && tune.topSpeed > 0 ? tune.topSpeed : 1) * (burst ? BURST_TOP_SPEED : 1);
  dyn.gripScale = (tune && tune.grip > 0 ? tune.grip : 1) * (burst ? BURST_GRIP : 1);
}

/**
 * A wheel met a sheer face of ground (the side of a ramp, a quay wall): the car stops against it
 * like against a wall instead of climbing it.
 */
function stopAtGroundStep(vehicle, profile, dyn, blocked, sinH, cosH) {
  let nx = 0;
  let nz = 0;
  for (let i = 0; i < 4; i += 1) {
    if ((blocked & (1 << i)) === 0) continue;
    const pf = i < 2 ? profile.cgToFront : -profile.cgToRear;
    const pl = (i & 1) === 0 ? profile.halfTrack : -profile.halfTrack;
    nx -= sinH * pf + cosH * pl;
    nz -= cosH * pf - sinH * pl;
  }
  const length = Math.sqrt(nx * nx + nz * nz);
  if (length < 1e-6) return;
  nx /= length;
  nz /= length;
  const vel = vehicle.vel;
  const into = vel.x * nx + vel.z * nz;
  if (into < 0) {
    vel.x -= into * 1.15 * nx;
    vel.z -= into * 1.15 * nz;
    if (-into > dyn.pendingTerrainImpact) dyn.pendingTerrainImpact = -into;
  }
  vehicle.pos.x = dyn.prevX;
  vehicle.pos.z = dyn.prevZ;
}

function isFiniteVehicle(vehicle) {
  const p = vehicle.pos;
  const v = vehicle.vel;
  return Number.isFinite(p.x + p.y + p.z + v.x + v.y + v.z + vehicle.heading + vehicle.yawRate + vehicle.pitch + vehicle.roll);
}

/** Never let a numerical accident spread: put the car back where it last was, at rest. */
function recoverFromBadState(vehicle, dyn) {
  if (!dyn.warnedBadState) {
    console.warn('vehicle physics recovered from an invalid state', vehicle.id);
    dyn.warnedBadState = true;
  }
  vehicle.pos.set(Number.isFinite(dyn.prevX) ? dyn.prevX : 0, Number.isFinite(dyn.groundY[0]) ? dyn.groundY[0] : 0,
    Number.isFinite(dyn.prevZ) ? dyn.prevZ : 0);
  vehicle.vel.set(0, 0, 0);
  if (!Number.isFinite(vehicle.heading)) vehicle.heading = 0;
  vehicle.yawRate = 0;
  vehicle.pitch = 0;
  vehicle.roll = 0;
  vehicle.speed = 0;
  dyn.pitchRate = 0;
  dyn.rollRate = 0;
  dyn.groundReady = false;
}

function wrapAngle(angle) {
  return angle > Math.PI ? angle - TAU : angle < -Math.PI ? angle + TAU : angle;
}

function approach(value, target, step) {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const TAU = Math.PI * 2;
/** Slip angles are measured against at least this speed, so a crawling tyre never over-reacts. */
const SLIP_SPEED_FLOOR = 3.5;
/** Share of its grip a tyre loses once it is pushed beyond the traction circle and slides. */
const SLIDE_GRIP_DROP = 0.2;
/** Forward speeds (m/s) over which the chassis hands over from the kinematic to the tyre model. */
const KINEMATIC_LOW = 1.2;
const KINEMATIC_HIGH = 3.5;
/** Below this speed, with no throttle, a car simply stands still. */
const HOLD_SPEED = 0.35;
/** How quickly (per second) the drift stabiliser matches the body's rotation to its path. */
const SPIN_GUARD = 25;
