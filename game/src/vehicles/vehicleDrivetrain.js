// The engine and gearbox of a Port Sarab vehicle: how hard the driven wheels push at each speed,
// when the box shifts up and down, the engine braking off the throttle, and the rpm and gear that
// the engine sound and the rev counter follow.
import { GRAVITY } from './vehicleHandlingProfile.js';
import { engineForceAtSpeed } from './drivingRules.js';

/**
 * Total force (newtons, + forward) the engine sends to the driven wheels this step. The pull
 * tapers to nothing at the model's top speed and is shaped a little within each gear; it dips
 * while the box changes gear. Negative in reverse gear. Garage tuning and burst tyres arrive as
 * dyn.powerScale and dyn.speedScale (1 on a standard car).
 */
export function engineDriveForce(profile, dyn, gear, forwardSpeed, throttle) {
  if (throttle <= 0 || dyn.enginePower <= 0 || gear === 0) return 0;
  const mass = profile.mass;
  if (gear < 0) {
    const back = forwardSpeed < 0 ? -forwardSpeed : 0;
    const ratio = back / profile.reverseTop;
    const envelope = ratio >= 1 ? 0 : 1 - ratio * ratio;
    return -throttle * dyn.enginePower * dyn.powerScale * mass * profile.reverseAccel * envelope;
  }
  const speed = forwardSpeed > 0 ? forwardSpeed : 0;
  const top = profile.topSpeed * dyn.speedScale;
  const ratio = speed / top;
  const inGear = Math.min(1, speed / (profile.gearTop[gear] * dyn.speedScale));
  const launch = gear === 1 ? profile.launchBoost : 1;
  // The engine also beats drag and rolling resistance right up to top speed, so the figure in the
  // catalogue is the speed the car really reaches on a flat road.
  const losses = profile.dragCoefficient * speed * speed + profile.rollingResistance * mass * GRAVITY;
  const lossShare = clamp01((1.03 - ratio) / 0.03);
  let force = engineForceAtSpeed(mass, profile.acceleration, top, speed, inGear) * launch + losses * lossShare;
  if (dyn.shiftTimer > 0) force *= 0.3;
  return force * throttle * dyn.enginePower * dyn.powerScale;
}

/** Engine braking (newtons, a magnitude) on the driven wheels when the driver lifts off. */
export function engineBrakingForce(profile, vehicle, dyn) {
  if (dyn.enginePower <= 0 || vehicle.gear === 0) return 0;
  return profile.mass * profile.engineBraking * (0.35 + 0.65 * vehicle.rpm);
}

/**
 * Choose the gear and set vehicle.gear and vehicle.rpm for this step.
 * Gear -1 is reverse, 0 neutral (engine off or wrecked), 1.. the forward gears.
 * @param {number} wheelspin 0..1 how far the driven wheels spin beyond road speed
 */
export function updateGearbox(vehicle, profile, dyn, forwardSpeed, throttle, reverse, wheelspin, airborne, dt) {
  if (dyn.shiftTimer > 0) dyn.shiftTimer -= dt;
  if (dyn.enginePower <= 0 || vehicle.parked) {
    vehicle.gear = 0;
    vehicle.rpm = approach(vehicle.rpm, 0, dt * 1.5);
    return;
  }
  let gear = vehicle.gear;
  if (reverse && throttle > 0 && forwardSpeed < 1) gear = -1;
  else if (gear < 0 && (!reverse || forwardSpeed > 1)) gear = 1;
  else if (gear === 0) gear = 1;

  const idle = profile.idleRpm;
  let target;
  if (gear < 0) {
    target = idle + (1 - idle) * Math.min(1, Math.abs(forwardSpeed) / profile.reverseTop);
  } else {
    // Gear speeds stretch with a tuned (or burst-tyred) top speed.
    const speed = (forwardSpeed > 0 ? forwardSpeed : 0) / dyn.speedScale;
    if (gear < profile.gearCount && speed > profile.gearTop[gear] * 0.96 && throttle > 0.05 && dyn.shiftTimer <= 0 && !airborne) {
      gear += 1;
      dyn.shiftTimer = profile.shiftTime;
    }
    while (gear > 1 && speed < profile.gearTop[gear - 1] * 0.8) gear -= 1;
    target = idle + (1 - idle) * Math.min(1, speed / profile.gearTop[gear]);
  }
  // A slipping clutch off the line, spinning tyres and wheels in the air let the engine rev.
  const free = throttle * (0.3 + 0.55 * wheelspin);
  if (idle + free > target) target = idle + free;
  if (airborne && throttle > 0) target = Math.max(target, 0.6 + 0.4 * throttle);
  if (target > 1) target = 1;
  vehicle.gear = gear;
  vehicle.rpm += (target - vehicle.rpm) * (1 - Math.exp(-14 * dt));
}

function approach(value, target, step) {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
