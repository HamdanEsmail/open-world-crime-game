// One driving brain for every AI at the wheel in Port Sarab (traffic, police, the crew, mission
// cars): steer toward a point at a chosen speed, ease off for sharp turns and for a stop, back out
// when stuck against something, and chase another vehicle, either leading it or lining up a PIT on
// its rear quarter. It only writes vehicle.controls; the handling does the rest.

/**
 * Build game.vehicles.autopilot.
 * @param {Object} game
 * @param {{list:Object[]}} vehicles  the vehicle manager
 */
export function createVehicleAutopilot(game, vehicles) {
  const ahead = { vehicle: null, character: null, distance: Infinity };
  const chaseOptions = { aggression: 0.8, allowReverse: true, holdPace: false };

  /**
   * Write vehicle.controls to drive toward (targetX, targetZ) at about `desiredSpeed` m/s.
   * Slows for sharp turns (the tightest circle through the target, at the tyres' grip), brakes to a
   * stop at the target when asked, reverses toward a close target behind, turns around for a far one,
   * and backs out with the wheel the other way when stuck.
   * @param {Object} vehicle
   * @param {number} targetX
   * @param {number} targetZ
   * @param {number} desiredSpeed  m/s
   * @param {{stopAtTarget?:boolean, arriveRadius?:number, allowReverse?:boolean, aggression?:number, holdPace?:boolean}} [options]
   *        aggression 0 (careful) .. 1 (reckless: later braking, harder cornering, handbrake turns);
   *        holdPace keeps the speed through the turn (no slowing for the corner), as when ramming
   * @returns {number} the distance to the target
   */
  function driveToward(vehicle, targetX, targetZ, desiredSpeed, options) {
    const c = vehicle.controls;
    const dx = targetX - vehicle.pos.x;
    const dz = targetZ - vehicle.pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (!vehicle.dynamics || vehicle.wrecked) {
      release(c);
      return distance;
    }
    const pilot = memoryOf(vehicle);
    const now = game.time ? game.time.elapsed : 0;
    const dt = game.time && game.time.dt > 0 ? game.time.dt : 1 / 60;
    const stopAtTarget = !!(options && options.stopAtTarget);
    const arriveRadius = options && options.arriveRadius !== undefined ? options.arriveRadius : 3;
    const allowReverse = !(options && options.allowReverse === false);
    const aggression = options && options.aggression !== undefined ? clamp(options.aggression, 0, 1) : 0.4;
    const profile = vehicle.dynamics.profile;
    const speed = vehicle.speed;
    let angle = wrapAngle(Math.atan2(dx, dz) - vehicle.heading);
    // After backing out of a jam, swing out to one side for a moment to find a way round it.
    if (pilot.detourUntil > now) angle = wrapAngle(angle + pilot.detourSide * 1.1);
    const absAngle = Math.abs(angle);

    // Backing out of a jam or a tight spot.
    if (pilot.reverseUntil > now) {
      c.reverse = true;
      c.throttle = 0.75;
      c.brake = 0;
      c.handbrake = false;
      c.steer = pilot.reverseSteer;
      return distance;
    }

    if (stopAtTarget && distance < arriveRadius) {
      stopVehicle(vehicle, true);
      return distance;
    }

    // A close target behind: reverse toward it rather than circle round.
    if (allowReverse && absAngle > 2.2 && distance < 16 && speed < 3) {
      const behindAngle = wrapAngle(angle - Math.PI);
      c.reverse = true;
      c.steer = clamp(behindAngle * STEER_GAIN, -1, 1);
      const wanted = stopAtTarget ? Math.min(6, Math.sqrt(Math.max(0, distance - arriveRadius) * 4)) : 6;
      const error = wanted + speed;
      c.throttle = error > 0 ? clamp(0.3 + error * 0.2, 0, 0.8) : 0;
      c.brake = error < -1 ? clamp(-error * 0.3, 0, 1) : 0;
      c.handbrake = false;
      return distance;
    }

    c.reverse = false;
    let steer = clamp(-angle * STEER_GAIN, -1, 1);
    // The fastest speed that still makes the turn: the circle through the car and the target,
    // tangent to its heading, at the tyres' grip (a reckless driver leans on the grip harder).
    let target = desiredSpeed;
    const holdPace = !!(options && options.holdPace);
    if (absAngle > 0.04 && !holdPace) {
      const radius = distance / (2 * Math.sin(Math.min(absAngle, 1.5)));
      const corner = Math.sqrt(profile.grip * 9.81 * (0.7 + 0.3 * aggression) * radius);
      if (corner < target) target = Math.max(corner, 5);
    }
    if (absAngle > 1.7 && distance > 16 && !holdPace) target = Math.min(target, 6 + 6 * aggression);
    if (stopAtTarget) {
      const room = Math.max(0, distance - arriveRadius * 0.5);
      const stopping = Math.sqrt(2 * profile.braking * (0.45 + 0.25 * aggression) * room);
      if (stopping < target) target = stopping;
    }
    const error = target - speed;
    if (error > 0.3) {
      c.throttle = clamp(0.3 + error * (0.18 + 0.12 * aggression), 0, 1);
      c.brake = 0;
    } else if (error < -1.2) {
      c.throttle = 0;
      c.brake = clamp(-error * (0.15 + 0.1 * aggression), 0.15, 1);
    } else {
      c.throttle = speed < target ? 0.25 : 0.08;
      c.brake = 0;
    }
    // A reckless driver throws the car round a hairpin on the handbrake.
    c.handbrake = aggression > 0.6 && absAngle > 1.1 && speed > 9 && speed < 32;
    if (c.handbrake) c.throttle = Math.min(c.throttle, 0.4);
    c.steer = steer;

    // Stuck: pushing on the throttle and going nowhere. Back out with the wheel turned the other way.
    if (c.throttle > 0.4 && Math.abs(speed) < 0.7) pilot.stuckTime += dt;
    else pilot.stuckTime = Math.max(0, pilot.stuckTime - dt * 2);
    if (allowReverse && pilot.stuckTime > STUCK_AFTER) {
      pilot.stuckTime = 0;
      pilot.reverseUntil = now + BACK_OUT_TIME;
      pilot.detourSide = -pilot.detourSide;
      pilot.detourUntil = now + BACK_OUT_TIME + DETOUR_TIME;
      // Reverse with the wheel turned so the nose swings toward the side of the detour.
      pilot.reverseSteer = pilot.detourSide > 0 ? 1 : -1;
    }
    return distance;
  }

  /**
   * Bring the vehicle to a halt: brake (hard or gently), wheel straight, handbrake once stopped.
   * @returns {number} the current speed
   */
  function stopVehicle(vehicle, hard) {
    const c = vehicle.controls;
    const speed = vehicle.speed || 0;
    c.throttle = 0;
    c.reverse = false;
    c.brake = Math.abs(speed) < 0.3 ? 0 : hard ? 1 : clamp(0.25 + Math.abs(speed) * 0.05, 0, 0.8);
    c.handbrake = Math.abs(speed) < 0.5;
    c.steer = 0;
    return speed;
  }

  /**
   * Pursue another vehicle: aim where it is going to be, close in at full speed and match its pace
   * when near; with `ram`, line up on its rear quarter and push through for a PIT spin.
   * @param {{ram?:boolean, aggression?:number, topSpeed?:number}} [options]
   * @returns {number} the distance to the target vehicle
   */
  function chaseVehicle(vehicle, target, options) {
    if (!target) {
      stopVehicle(vehicle, false);
      return Infinity;
    }
    const ram = !!(options && options.ram);
    const aggression = options && options.aggression !== undefined ? options.aggression : 0.8;
    const profile = vehicle.dynamics.profile;
    const top = options && options.topSpeed ? options.topSpeed : profile.topSpeed * 0.97;
    const dx = target.pos.x - vehicle.pos.x;
    const dz = target.pos.z - vehicle.pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const lead = Math.min(1.6, distance / Math.max(8, Math.abs(vehicle.speed)));
    let aimX = target.pos.x + target.vel.x * lead;
    let aimZ = target.pos.z + target.vel.z * lead;
    let pace = distance > 28 ? top : Math.max(target.speed + 1.5, 8);
    let striking = false;
    if (ram && distance < 30) {
      // A PIT in two moves: draw alongside so the chaser's nose sits beside the target's rear
      // quarter, then turn in across it. Work in the target's frame (forward f, left l).
      const fs = Math.sin(target.heading);
      const fc = Math.cos(target.heading);
      const rx = vehicle.pos.x - target.pos.x;
      const rz = vehicle.pos.z - target.pos.z;
      const along = rx * fs + rz * fc;
      const across = rx * fc - rz * fs;
      const pilot = memoryOf(vehicle);
      if (Math.abs(across) > 0.8) pilot.ramSide = across > 0 ? 1 : -1;
      else if (!pilot.ramSide) pilot.ramSide = 1;
      const side = pilot.ramSide;
      const tp = target.dynamics.profile;
      const now = game.time ? game.time.elapsed : 0;
      // The slot: the chaser's nose level with the target's rear axle, a car's gap out to the side.
      const slotAlong = -(tp.halfLength * 0.6 + profile.halfLength * 0.85);
      const slotAcross = side * (tp.halfWidth + profile.halfWidth + 0.9);
      const lookAhead = Math.max(4, Math.abs(target.speed) * 0.45);
      const touching = Math.abs(across) < tp.halfWidth + profile.halfWidth + 0.3 && along > -(tp.halfLength + profile.halfLength);
      if (pilot.strikeUntil > now && touching) {
        // Contact made: peel off and line up again rather than lean on the target.
        pilot.strikeUntil = -1;
        pilot.ramRecover = now + 1.2;
      }
      if (pilot.strikeUntil <= now && pilot.ramRecover <= now
        && Math.abs(along - slotAlong) < 1.3 && Math.abs(across - slotAcross) < 1.0) {
        pilot.strikeUntil = now + 0.8;
      }
      striking = pilot.strikeUntil > now;
      const recovering = pilot.ramRecover > now;
      // Strike: turn in through the target's rear corner. Otherwise hold the slot (wider while recovering).
      const holdAcross = recovering ? slotAcross + side * 1.2 : slotAcross;
      const aimAlong = striking ? -tp.halfLength * 0.9 + lookAhead * 0.3 : slotAlong + lookAhead;
      const aimAcross = striking ? -side * tp.halfWidth * 0.5 : holdAcross;
      aimX = target.pos.x + fs * aimAlong + fc * aimAcross;
      aimZ = target.pos.z + fc * aimAlong - fs * aimAcross;
      pace = Math.max(6, target.speed + clamp((slotAlong - along) * 0.9, -6, 9) + (striking ? 2 : 0));
    }
    chaseOptions.aggression = aggression;
    chaseOptions.holdPace = striking;
    driveToward(vehicle, aimX, aimZ, Math.min(pace, top), chaseOptions);
    return distance;
  }

  /**
   * The nearest vehicle or person on foot in a corridor ahead of `vehicle` (its width plus a margin,
   * `lookAhead` metres long). Returns a shared {vehicle, character, distance} (distance Infinity when clear).
   */
  function obstacleAhead(vehicle, lookAhead) {
    ahead.vehicle = null;
    ahead.character = null;
    ahead.distance = Infinity;
    const profile = vehicle.dynamics.profile;
    const s = Math.sin(vehicle.heading);
    const c = Math.cos(vehicle.heading);
    const reach = lookAhead + profile.halfLength;
    const list = vehicles.list;
    for (let i = 0; i < list.length; i += 1) {
      const other = list[i];
      if (other === vehicle) continue;
      const dx = other.pos.x - vehicle.pos.x;
      const dz = other.pos.z - vehicle.pos.z;
      const along = dx * s + dz * c;
      if (along <= 0 || along > reach + other.dynamics.profile.halfLength) continue;
      const across = Math.abs(dx * c - dz * s);
      if (across > profile.halfWidth + other.dynamics.profile.halfWidth + 0.5) continue;
      const gap = along - profile.halfLength - other.dynamics.profile.halfLength * 0.5;
      if (gap < ahead.distance) {
        ahead.distance = gap < 0 ? 0 : gap;
        ahead.vehicle = other;
      }
    }
    const people = game.characters && game.characters.list;
    if (people) {
      for (let i = 0; i < people.length; i += 1) {
        const person = people[i];
        if (!person || person.vehicle || person.alive === false) continue;
        const dx = person.pos.x - vehicle.pos.x;
        const dz = person.pos.z - vehicle.pos.z;
        const along = dx * s + dz * c;
        if (along <= 0 || along > reach) continue;
        if (Math.abs(dx * c - dz * s) > profile.halfWidth + 0.8) continue;
        const gap = along - profile.halfLength;
        if (gap < ahead.distance) {
          ahead.distance = gap < 0 ? 0 : gap;
          ahead.vehicle = null;
          ahead.character = person;
        }
      }
    }
    return ahead;
  }

  /** True while the vehicle's driver is pushing and getting nowhere (or backing out of it). */
  function isStuck(vehicle) {
    const pilot = vehicle.dynamics && vehicle.dynamics.pilot;
    if (!pilot) return false;
    const now = game.time ? game.time.elapsed : 0;
    return pilot.stuckTime > STUCK_AFTER * 0.6 || pilot.reverseUntil > now;
  }

  /** Forget any manoeuvre in progress (a new driver, a new job). */
  function reset(vehicle) {
    const pilot = vehicle.dynamics && vehicle.dynamics.pilot;
    if (!pilot) return;
    pilot.stuckTime = 0;
    pilot.reverseUntil = -1;
  }

  return { driveToward, stopVehicle, chaseVehicle, obstacleAhead, isStuck, reset };
}

function memoryOf(vehicle) {
  let pilot = vehicle.dynamics.pilot;
  if (!pilot) {
    pilot = { stuckTime: 0, reverseUntil: -1, reverseSteer: 0, detourUntil: -1, detourSide: 1, ramSide: 0, strikeUntil: -1, ramRecover: -1 };
    vehicle.dynamics.pilot = pilot;
  }
  return pilot;
}

function release(c) {
  c.throttle = 0;
  c.brake = 0;
  c.steer = 0;
  c.handbrake = false;
  c.reverse = false;
}

function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Steering per radian of heading error (then clamped to full lock). */
const STEER_GAIN = 2.4;
/** Seconds of full throttle without moving before the driver decides it is stuck. */
const STUCK_AFTER = 1.1;
/** Seconds spent reversing out once stuck. */
const BACK_OUT_TIME = 1.3;
/** Seconds spent swinging out to one side after backing out, to find a way round. */
const DETOUR_TIME = 2.2;
