// Port Sarab's driving rules: grip by surface, engine pull, steering lock, brakes, handbrake,
// crash and landing damage, the gulf, spike strips. The vehicle physics runs on these.

/** Tyre grip on a surface (offroad 0..1): sand bogs a supercar, not a buggy. */
export function tyreGripOnSurface(surface, offroad) {
  if (surface === 'sand' || surface === 'beach') return 0.7 + 0.28 * offroad + (surface === 'beach' ? 0.05 : 0);
  return surface === 'sidewalk' ? 0.93 : surface === 'water' ? 0.45 : 1;
}

/** Drag of soft ground (m/s^2) at a speed. */
export function surfaceDrag(surface, offroad, speed) {
  if (surface === 'sand' || surface === 'beach') return (1 - offroad) * (1.5 + 0.16 * speed);
  return surface === 'water' ? 1.5 : 0;
}

/** Tyre grip share at a slip angle: rises, peaks, falls to ~76% sliding. */
export function tyreForceShare(slipAngle, stiffness) {
  return Math.sin(TYRE_SHAPE * Math.atan(stiffness * slipAngle));
}

/** Engine pull (N): full at rest, none at top speed, shaped by gear (0..1). */
export function engineForceAtSpeed(mass, acceleration, topSpeed, speed, gearShare) {
  const r = speed / topSpeed;
  if (r >= 1) return 0;
  return mass * acceleration * (1 - r * r) * (0.85 + 0.45 * gearShare - 0.3 * gearShare * gearShare);
}

/** Front-wheel lock (rad): full at a crawl, shrinking with speed to the tyres' limit. */
export function steeringLockAtSpeed(speed, wheelbase, grip, peakSlip, maxSteer) {
  const lock = Math.atan((wheelbase * grip * 10.791) / Math.max(1, speed * speed)) + peakSlip * 1.15;
  return lock < maxSteer ? lock : maxSteer;
}

/** The back pedal brakes while rolling forward, reverses once nearly stopped. */
export function brakeOrReverse(forwardSpeed) {
  return forwardSpeed > 1.5 ? 'brake' : 'reverse';
}

/** A locked wheel (handbrake, wreck, parked) slides on this much grip. */
export function handbrakeRearGrip(grip) {
  return grip * 0.72;
}

/** A wheel is off the ground once its spring has run out of sag. */
export function airborneWhenWheelsLeaveGround(travel, sag) {
  return travel <= -sag;
}

/** Crash damage: the jolt (impulse / mass) a bumper cannot soak up. */
export function crashDamageFromImpulse(impulse, mass, maxHealth) {
  const jolt = impulse / mass;
  return jolt > 4.5 ? maxHealth * 0.024 * (jolt - 4.5) : 0;
}

/** Landing damage: stunt ramps are free, a drop off a quay is not. */
export function landingDamage(impact, maxHealth) {
  return impact > 13 ? (impact - 13) * 0.025 * maxHealth : 0;
}

/** Engine power at a health share: full down to 35%, then it coughs and smokes. */
export function enginePowerAtHealth(share) {
  return share >= SMOKING_SHARE ? 1 : 0.45 + 0.55 * (share / SMOKING_SHARE);
}

/** A lamp post or sign gives way to a fast or heavy car. */
export function propGivesWay(closingSpeed, mass) {
  return closingSpeed > 4 || (mass > 4000 && closingSpeed > 1.5) || closingSpeed * mass > 9000;
}

/** Hit above 3 m/s, a person is knocked down and hurt; slower, nudged aside. */
export function personHitDamage(speed) {
  return speed > 3 ? (speed - 2.5) * 7 : 0;
}

/** The gulf takes a car half under for 1.5 s, any car after 5 s. */
export function sinksInWater(submerged, secondsInWater) {
  return (submerged > 0.55 && secondsInWater > 1.5) || secondsInWater > 5;
}

export const TYRE_SHAPE = 1.45;
export const SMOKING_SHARE = 0.35;
/** Spike strips: grip and top-speed shares, drag (m/s^2), pull (rad). */
export const BURST_GRIP = 0.55;
export const BURST_TOP_SPEED = 0.45;
export const BURST_DRAG = 0.4;
export const BURST_PULL = 0.035;
