// The springs, dampers, anti-roll bars and bump stops under each corner of a vehicle, and what they
// do to the body: ride height over kerbs, dunes and ramps, brake dive, squat and body roll, flight
// off a ramp lip and the slam of the landing, and a car that floats for a moment before the gulf
// takes it. Pitch and roll are spring-limited and self-righting: no car ends up on its roof.

/** How high the city's sidewalks stand above the road (a kerb the wheels climb). */
export const KERB_LIFT = 0.12;
/** A rise in the ground this sudden under one wheel is a wall, not a slope. */
const STEP_LIMIT = 0.55;
/** In the air the nose drops gently toward this pitch (radians, + is nose down). */
const AIR_NOSE_DOWN = 0.1;
/** Scale on the pitching moment of braking and accelerating (1 is true to life). */
const PITCH_TRANSFER = 1.0;
const PITCH_LIMIT = 0.42;
const ROLL_LIMIT = 0.26;
const PITCH_HARD = 0.7;
const ROLL_HARD = 0.5;

/**
 * Sample the ground under the four wheels: height (with the kerb on sidewalks) and how fast it is
 * rising under each wheel. Returns a bit mask of wheels that met a sheer step (a wall of ground).
 */
export function sampleWheelGround(vehicle, profile, dyn, terrain, cgX, cgZ, sinH, cosH, dt) {
  const kerb = terrain && typeof terrain.kerbHeight === 'number' ? terrain.kerbHeight : KERB_LIFT;
  let blocked = 0;
  for (let i = 0; i < 4; i += 1) {
    const pf = i < 2 ? profile.cgToFront : -profile.cgToRear;
    const pl = (i & 1) === 0 ? profile.halfTrack : -profile.halfTrack;
    const wx = cgX + sinH * pf + cosH * pl;
    const wz = cgZ + cosH * pf - sinH * pl;
    let ground = terrain ? terrain.heightAt(wx, wz) : 0;
    if (!(ground > -1000 && ground < 1000)) ground = 0;
    if (dyn.surface[i] === 'sidewalk') ground += kerb;
    if (dyn.groundReady) {
      const rise = ground - dyn.groundY[i];
      const corner = vehicle.pos.y - pf * Math.sin(vehicle.pitch) + pl * Math.sin(vehicle.roll);
      if (rise > STEP_LIMIT && ground - corner > STEP_LIMIT) {
        // Keep the old height: the car will be put back where it was, short of the step.
        blocked |= 1 << i;
        dyn.groundVel[i] = 0;
        continue;
      }
      let rate = rise / dt;
      if (rate > 30) rate = 30;
      else if (rate < -30) rate = -30;
      dyn.groundVel[i] = rate;
    } else {
      dyn.groundVel[i] = 0;
    }
    dyn.groundY[i] = ground;
  }
  dyn.groundReady = true;
  // The slope of the ground itself (gravity pulls the car down a dune face).
  const front = (dyn.groundY[0] + dyn.groundY[1]) * 0.5;
  const rear = (dyn.groundY[2] + dyn.groundY[3]) * 0.5;
  const left = (dyn.groundY[0] + dyn.groundY[2]) * 0.5;
  const right = (dyn.groundY[1] + dyn.groundY[3]) * 0.5;
  dyn.groundPitch = Math.atan2(rear - front, profile.wheelbase);
  dyn.groundRoll = Math.atan2(left - right, profile.track);
  return blocked;
}

/**
 * Spring, damper and anti-roll forces at each wheel from the body's attitude over the ground.
 * Writes dyn.load (newtons), dyn.travel (compression from static ride, metres) and dyn.contact;
 * returns how many wheels touch the ground.
 */
export function computeSuspensionLoads(vehicle, profile, dyn) {
  const sinP = Math.sin(vehicle.pitch);
  const cosP = Math.cos(vehicle.pitch);
  const sinR = Math.sin(vehicle.roll);
  const cosR = Math.cos(vehicle.roll);
  const vy = vehicle.vel.y;
  for (let i = 0; i < 4; i += 1) {
    const pf = i < 2 ? profile.cgToFront : -profile.cgToRear;
    const pl = (i & 1) === 0 ? profile.halfTrack : -profile.halfTrack;
    const corner = vehicle.pos.y - pf * sinP + pl * sinR;
    const cornerVel = vy - pf * cosP * dyn.pitchRate + pl * cosR * dyn.rollRate;
    dyn.travel[i] = dyn.groundY[i] - corner;
    dyn.travelVel[i] = dyn.groundVel[i] - cornerVel;
  }
  const frontBar = profile.frontBar * (dyn.travel[0] - dyn.travel[1]);
  const rearBar = profile.rearBar * (dyn.travel[2] - dyn.travel[3]);
  let touching = 0;
  for (let i = 0; i < 4; i += 1) {
    const x = dyn.travel[i];
    if (x <= -profile.sag) {
      dyn.load[i] = 0;
      dyn.contact[i] = false;
      continue;
    }
    let force = profile.staticLoad[i] + profile.springRate[i] * x + profile.damperRate[i] * dyn.travelVel[i];
    if (i === 0) force += frontBar;
    else if (i === 1) force -= frontBar;
    else if (i === 2) force += rearBar;
    else force -= rearBar;
    if (x > profile.bumpTravel) force += profile.springRate[i] * 5 * (x - profile.bumpTravel);
    dyn.load[i] = force > 0 ? force : 0;
    dyn.contact[i] = true;
    touching += 1;
  }
  return touching;
}

/**
 * Move the body up and down and tilt it: springs against gravity, dive and squat from braking and
 * accelerating, lean from cornering; free flight with a gentle nose-down when nothing touches;
 * hard bump stops so the body never sinks into the ground; a landing slam recorded for the event.
 * @param {number} accelForward  body-frame acceleration this step (m/s^2, + forward)
 * @param {number} accelLeft     body-frame acceleration this step (m/s^2, + to the left)
 */
export function stepBodyAttitude(vehicle, profile, dyn, accelForward, accelLeft, dt, gravity) {
  const mass = profile.mass;
  let lift = -mass * gravity;
  let pitchTorque = -mass * accelForward * profile.cgHeight * PITCH_TRANSFER;
  let rollTorque = mass * accelLeft * profile.cgHeight;
  let touching = 0;
  for (let i = 0; i < 4; i += 1) {
    const load = dyn.load[i];
    if (dyn.contact[i]) touching += 1;
    if (load <= 0) continue;
    const pf = i < 2 ? profile.cgToFront : -profile.cgToRear;
    const pl = (i & 1) === 0 ? profile.halfTrack : -profile.halfTrack;
    lift += load;
    pitchTorque -= load * pf;
    rollTorque += load * pl;
  }
  const vel = vehicle.vel;
  vel.y += (lift / mass) * dt;
  if (dyn.buoyancy > 0) {
    vel.y += dyn.buoyancy * dt;
    vel.y *= Math.exp(-2.6 * dyn.submerged * dt);
  }
  if (touching > 0) {
    dyn.pitchRate += (pitchTorque / profile.pitchInertia) * dt;
    dyn.rollRate += (rollTorque / profile.rollInertia) * dt;
  } else {
    // Flight: keep the spin it left the lip with, ease the nose down, level the wings.
    dyn.pitchRate += (-(vehicle.pitch - AIR_NOSE_DOWN) * 2.4 - dyn.pitchRate * 1.1) * dt;
    dyn.rollRate += (-vehicle.roll * 3.2 - dyn.rollRate * 1.6) * dt;
  }
  // Attitude limits: progressively stiffer beyond what a car can lean, and never past the hard stop.
  const pitchOver = Math.abs(vehicle.pitch) - PITCH_LIMIT;
  if (pitchOver > 0) dyn.pitchRate -= Math.sign(vehicle.pitch) * pitchOver * 90 * dt + dyn.pitchRate * 6 * dt;
  const rollOver = Math.abs(vehicle.roll) - ROLL_LIMIT;
  if (rollOver > 0) dyn.rollRate -= Math.sign(vehicle.roll) * rollOver * 120 * dt + dyn.rollRate * 8 * dt;

  vehicle.pos.y += vel.y * dt;
  vehicle.pitch += dyn.pitchRate * dt;
  vehicle.roll += dyn.rollRate * dt;
  if (vehicle.pitch > PITCH_HARD || vehicle.pitch < -PITCH_HARD) {
    vehicle.pitch = Math.sign(vehicle.pitch) * PITCH_HARD;
    dyn.pitchRate = 0;
  }
  if (vehicle.roll > ROLL_HARD || vehicle.roll < -ROLL_HARD) {
    vehicle.roll = Math.sign(vehicle.roll) * ROLL_HARD;
    dyn.rollRate = 0;
  }

  enforceBumpStops(vehicle, profile, dyn);

  // Flight time and the landing.
  const grounded = touching > 0;
  if (!grounded) {
    dyn.airTime += dt;
    dyn.airVelY = vel.y;
  } else {
    if (dyn.airTime > 0.22 && dyn.airVelY < -1.5) dyn.pendingLanding = -dyn.airVelY;
    dyn.airTime = 0;
  }
  vehicle.grounded = grounded;
}

/**
 * The bump stops as a hard limit: wherever a corner has sunk further onto its wheel than the
 * suspension allows, lift the body (height, pitch and roll together, by the corner's lever) and
 * cancel the corner's downward speed relative to the ground. This is what launches a car up a
 * ramp face and what slams it on landing.
 */
function enforceBumpStops(vehicle, profile, dyn) {
  const invMass = profile.invMass;
  const invPitch = 1 / profile.pitchInertia;
  const invRoll = 1 / profile.rollInertia;
  const limit = profile.maxCompression;
  for (let pass = 0; pass < 2; pass += 1) {
    const sinP = Math.sin(vehicle.pitch);
    const cosP = Math.cos(vehicle.pitch);
    const sinR = Math.sin(vehicle.roll);
    const cosR = Math.cos(vehicle.roll);
    let moved = false;
    for (let i = 0; i < 4; i += 1) {
      const pf = i < 2 ? profile.cgToFront : -profile.cgToRear;
      const pl = (i & 1) === 0 ? profile.halfTrack : -profile.halfTrack;
      const corner = vehicle.pos.y - pf * sinP + pl * sinR;
      const sunk = dyn.groundY[i] - corner - limit;
      const jp = -pf * cosP;
      const jr = pl * cosR;
      const invEffective = invMass + jp * jp * invPitch + jr * jr * invRoll;
      if (sunk > 0) {
        const push = sunk / invEffective;
        vehicle.pos.y += push * invMass;
        vehicle.pitch += push * jp * invPitch;
        vehicle.roll += push * jr * invRoll;
        moved = true;
      }
      if (sunk > -0.02) {
        const cornerVel = vehicle.vel.y + jp * dyn.pitchRate + jr * dyn.rollRate;
        const shortfall = dyn.groundVel[i] - cornerVel;
        if (shortfall > 0) {
          const impulse = shortfall / invEffective;
          vehicle.vel.y += impulse * invMass;
          dyn.pitchRate += impulse * jp * invPitch;
          dyn.rollRate += impulse * jr * invRoll;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * Water: how deep the vehicle sits in the gulf and the lift that slows its sinking. Sets
 * dyn.submerged (0..1) and dyn.buoyancy (m/s^2 upward); returns the submerged share.
 */
export function updateWaterImmersion(vehicle, profile, dyn, seaLevel, inWater, gravity) {
  if (!inWater) {
    dyn.submerged = 0;
    dyn.buoyancy = 0;
    return 0;
  }
  const depth = seaLevel - vehicle.pos.y;
  const share = depth <= 0 ? 0 : depth >= profile.height * 0.9 ? 1 : depth / (profile.height * 0.9);
  dyn.submerged = share;
  // A car floats for a breath, then the water pours in and it goes down.
  const floatiness = dyn.waterTime < 1.2 ? 0.95 : 0.7;
  dyn.buoyancy = gravity * floatiness * share;
  return share;
}

/** Copy the suspension state to the wheels the renderer reads. */
export function writeWheelSuspension(vehicle, profile, dyn) {
  const wheels = vehicle.wheels;
  for (let i = 0; i < 4; i += 1) {
    let travel = dyn.travel[i];
    if (travel < -profile.sag) travel = -profile.sag;
    else if (travel > profile.maxCompression) travel = profile.maxCompression;
    wheels[i].compression = travel;
    wheels[i].grounded = dyn.contact[i];
  }
}
