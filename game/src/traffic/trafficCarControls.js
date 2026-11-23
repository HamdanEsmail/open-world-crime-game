// The hands and feet of a Port Sarab traffic driver. The wheel follows a point on the road ahead
// (pure pursuit), so a car settles onto its lane and rounds a corner without weaving; the pedals
// follow the Intelligent Driver Model, so it glides up to a queue or a red light, keeps a gap that
// grows with speed, and pulls away smoothly when the way clears.

const GRAVITY = 9.81;
/** How fast a driver may press harder on the throttle (m/s^3): no lurching away. */
const PEDAL_RISE = 3.2;
/** How fast a driver may brake harder (m/s^3): quick, but never a twitch. */
const PEDAL_FALL = 16;
/** Braking demand (m/s^2) past which the driver simply stamps on the brake: an emergency. */
const EMERGENCY_BRAKING = 5;

/**
 * Turn the wheel so the car's path bends through (targetX, targetZ). The wheel angle a car needs
 * for that arc is turned into the steering input through the same speed-dependent lock the handling
 * uses, so the car steers as much at 80 km/h as it means to.
 * @returns {number} the angle to the target off the car's nose (radians, + to the left)
 */
export function steerTowardPoint(vehicle, targetX, targetZ) {
  const profile = vehicle.dynamics.profile;
  const dx = targetX - vehicle.pos.x;
  const dz = targetZ - vehicle.pos.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance < 0.5) return 0;
  const alpha = wrapAngle(Math.atan2(dx, dz) - vehicle.heading);
  const wheel = Math.atan((2 * profile.wheelbase * Math.sin(alpha)) / Math.max(distance, 3));
  const speed = Math.abs(vehicle.speed);
  const speedSq = speed * speed > 1 ? speed * speed : 1;
  let lock = Math.atan((profile.wheelbase * profile.grip * GRAVITY * 1.1) / speedSq) + profile.peakSlip * 1.15;
  if (lock > profile.maxSteer) lock = profile.maxSteer;
  vehicle.controls.steer = clamp(-wheel / lock, -1, 1);
  return alpha;
}

/**
 * The Intelligent Driver Model: the acceleration a driver wants given the speed it would like on
 * an open road, the gap to what is ahead (and how fast that is moving), and the distance to a stop
 * line. It brakes at a comfortable rate that firms up only when it must, and stops `minGap` short.
 * Reads state.obstacleGap, obstacleSpeed, stopGap, minGap, headway, comfortAccel, comfortDecel.
 */
export function idmAcceleration(state, speed, desiredSpeed) {
  const a = state.comfortAccel;
  const b = state.comfortDecel;
  const v = speed > 0 ? speed : 0;
  const v0 = desiredSpeed > 0.1 ? desiredSpeed : 0.1;
  let acc;
  if (v <= v0) {
    const ratio = v / v0;
    acc = a * (1 - ratio * ratio * ratio * ratio);
  } else {
    acc = -Math.min(b * 1.6, (v - v0) * 1.1 + 0.4);
  }
  const twoRootAB = 2 * Math.sqrt(a * b);
  let interaction = 0;
  if (state.obstacleGap < 90) {
    const closing = v - state.obstacleSpeed;
    const wanted = state.minGap + Math.max(0, v * state.headway + (v * closing) / twoRootAB);
    const ratio = wanted / Math.max(0.25, state.obstacleGap);
    interaction = ratio * ratio;
  }
  if (state.stopGap < 90) {
    const wanted = 0.5 + Math.max(0, v * 0.6 + (v * v) / twoRootAB);
    const ratio = wanted / Math.max(0.25, state.stopGap + 0.3);
    if (ratio * ratio > interaction) interaction = ratio * ratio;
  }
  return acc - a * interaction;
}

/**
 * Turn a wanted acceleration into throttle and brake. The demand is smoothed (gentle on the way up,
 * quick on the way down); air drag, rolling resistance and engine braking are allowed for, so a light
 * throttle holds a cruise and a lift-off alone slows the car before the brake is touched. A car that
 * has stopped keeps its foot on the brake with the wheel straight, so it can settle.
 * @param {boolean} floorIt  a panicking driver stamps on the throttle
 */
export function applyPedals(vehicle, state, accel, dt, floorIt) {
  const profile = vehicle.dynamics.profile;
  const c = vehicle.controls;
  if (accel < -profile.braking) accel = -profile.braking;
  const previous = state.accel;
  if (accel < -EMERGENCY_BRAKING) state.accel = accel;
  else if (accel > previous) state.accel = Math.min(accel, previous + PEDAL_RISE * (floorIt ? 3 : 1) * dt);
  else state.accel = Math.max(accel, previous - PEDAL_FALL * dt);
  const speed = vehicle.speed > 0 ? vehicle.speed : 0;
  c.reverse = false;
  c.handbrake = false;
  if (speed < 0.35 && state.accel <= 0.08) {
    c.throttle = 0;
    c.brake = 1;
    c.steer = 0;
    return;
  }
  const losses = (profile.dragCoefficient * speed * speed + profile.rollingResistance * profile.mass * GRAVITY) * profile.invMass;
  const need = state.accel + losses;
  if (need > 0.03) {
    const pull = profile.acceleration * (vehicle.gear <= 1 ? profile.launchBoost : 1);
    c.throttle = clamp(need / pull, 0.03, 1);
    if (floorIt) c.throttle = Math.max(c.throttle, 0.9);
    c.brake = 0;
    return;
  }
  c.throttle = 0;
  const engine = vehicle.gear !== 0 ? profile.engineBraking * (0.35 + 0.65 * vehicle.rpm) : 0;
  const extra = -state.accel - losses - engine;
  c.brake = extra > 0.05 ? clamp(extra / profile.braking, 0, 1) : 0;
}

/**
 * Back up for a moment with the wheel held at state.reverseSteer: out of a jam, away from a wall,
 * or to make room to pull round something. Counts state.reverseTime down.
 */
export function backOut(vehicle, state, dt) {
  const c = vehicle.controls;
  state.reverseTime -= dt;
  state.accel = 0;
  c.handbrake = false;
  c.steer = state.reverseSteer;
  if (vehicle.speed > 0.8) {
    c.reverse = false;
    c.throttle = 0;
    c.brake = 1;
    return;
  }
  c.reverse = true;
  c.throttle = vehicle.speed < -3.5 ? 0 : 0.45;
  c.brake = 0;
  if (state.reverseTime <= 0) {
    c.reverse = false;
    c.throttle = 0;
    c.brake = 0.6;
  }
}

/** Foot on the brake, wheel straight; with `handbrake` the car is left standing. */
export function holdStill(vehicle, handbrake) {
  const c = vehicle.controls;
  c.throttle = 0;
  c.brake = 1;
  c.steer = 0;
  c.reverse = false;
  c.handbrake = !!handbrake;
  c.horn = false;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
