// Behind the wheel of a PSPD car in a chase through Port Sarab: answering the call along the roads,
// then running the suspect down: aiming where his car will be, holding a formation (one on the
// bumper, one on each flank, the rest cutting ahead), PIT manoeuvres on the rear quarter, ramming
// from three stars, boxing in a stopped car, following his tyre tracks round corners, and backing
// out of a jam. It writes vehicle.controls through game.vehicles.autopilot and by hand.
import * as THREE from 'three';
import { createPoliceRoadDriving } from './policeRoadDriving.js';

/** The suspect's recent path: one crumb every TRAIL_STEP seconds, TRAIL_SIZE of them (12 s). */
const TRAIL_SIZE = 48;
const TRAIL_STEP = 0.25;
/** Seconds without real progress before a driver backs out and tries another way. */
const STUCK_RECOVER_AFTER = 3;
const RECOVER_SECONDS = 1.5;
/** Beyond this distance a unit out of the player's view gets a gentle push to keep the chase tense. */
const RUBBER_BAND_DISTANCE = 90;
const RUBBER_BAND_ACCEL = 3.2;

/**
 * Build the pursuit driver shared by every police car.
 * @param {Object} game
 */
export function createPursuitDriver(game) {
  const roads = createPoliceRoadDriving(game);
  const trail = { x: new Float32Array(TRAIL_SIZE), z: new Float32Array(TRAIL_SIZE), seq: 0, timer: 0 };
  const slot = { x: 0, z: 0, aimX: 0, aimZ: 0, speed: 0, stop: false, arrive: 3 };
  const aim = { x: 0, z: 0, limit: Infinity };
  const driveOptions = { aggression: 0.7, allowReverse: true, stopAtTarget: false, arriveRadius: 3 };
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const rayEnd = new THREE.Vector3();
  const searchRng = game.rng.fork('police-search');

  /** Once a frame before any unit drives: a new route budget and the suspect's tyre tracks. */
  function beginFrame(ctx, dt) {
    roads.beginFrame();
    recordTrail(ctx, dt);
  }

  /**
   * Drive one police car for this frame according to its state: 'responding' along the roads,
   * 'chasing' the suspect, 'searching' the area he vanished in, 'leaving' when called off,
   * 'recovering' from a jam, or holding still ('deployed', 'holding').
   */
  function driveUnit(unit, dt, ctx) {
    const vehicle = unit.vehicle;
    if (!vehicle || vehicle.wrecked || !vehicle.dynamics) return;
    const c = vehicle.controls;
    c.siren = unit.mode === 'response';
    c.headlights = ctx.night > 0.35;
    unit.drive.wantsMove = true;
    if (unit.state === 'responding') driveResponding(unit, dt, ctx);
    else if (unit.state === 'chasing') driveChasing(unit, dt, ctx);
    else if (unit.state === 'searching') driveSearching(unit, dt, ctx);
    else if (unit.state === 'leaving') driveLeaving(unit, dt, ctx);
    else if (unit.state === 'recovering') driveRecovering(unit, ctx);
    else {
      holdStill(unit);
      unit.drive.wantsMove = false;
    }
    watchProgress(unit, dt, ctx);
  }

  /** Answer the call: plot a route to the suspect (or where he was last seen) and drive it hard. */
  function driveResponding(unit, dt, ctx) {
    const vehicle = unit.vehicle;
    const drive = unit.drive;
    const p = vehicle.pos;
    drive.routeAge += dt;
    const driftSq = (drive.routeTargetX - ctx.targetX) ** 2 + (drive.routeTargetZ - ctx.targetZ) ** 2;
    if (drive.routeCount === 0 || driftSq > 35 * 35 || drive.routeAge > (ctx.pursuit ? 3.5 : 9)) {
      roads.planRoute(drive, p.x, p.z, ctx.targetX, ctx.targetZ);
    }
    const speed = Math.abs(vehicle.speed);
    const remaining = roads.followRoute(drive, p.x, p.z, 10 + speed * 0.55, aim);
    const top = vehicle.dynamics.profile.topSpeed;
    let pace = Math.min(top * (ctx.level >= 3 ? 0.98 : 0.9), aim.limit, alignedPace(vehicle, drive));
    if (!ctx.pursuit && remaining < 40) pace = Math.min(pace, 9 + remaining * 0.4);
    steerAndDrive(unit, aim.x, aim.z, pace, false, 3, ctx, dt);
    rubberBand(unit, ctx, dt);
    if (ctx.pursuit && unit.distance < 95 && (unit.sees || unit.distance < 35)) {
      unit.state = 'chasing';
      drive.losTimer = 0;
    } else if (!ctx.pursuit && remaining < 22) {
      unit.state = 'searching';
      drive.waypoint = false;
    }
  }

  /**
   * Run the suspect down: take this unit's place in the formation when the road to it is clear,
   * otherwise go straight for him, otherwise follow his tracks round the corner, otherwise the roads.
   */
  function driveChasing(unit, dt, ctx) {
    const vehicle = unit.vehicle;
    const drive = unit.drive;
    const p = vehicle.pos;
    const top = vehicle.dynamics.profile.topSpeed;
    computeSlot(unit, ctx);
    drive.losTimer -= dt;
    if (drive.losTimer <= 0) {
      drive.losTimer = 0.28 + (unit.id % 4) * 0.03;
      drive.direct = roadClear(vehicle, slot.aimX, slot.aimZ);
      drive.directToPlayer = drive.direct || roadClear(vehicle, ctx.px, ctx.pz);
      drive.crumb = drive.directToPlayer ? -1 : newestVisibleCrumb(vehicle);
    }
    let tx;
    let tz;
    let pace;
    let stop = false;
    let arrive = 3;
    if (drive.direct) {
      tx = slot.aimX;
      tz = slot.aimZ;
      pace = slot.speed;
      stop = slot.stop;
      arrive = slot.arrive;
    } else if (drive.directToPlayer) {
      tx = ctx.px + ctx.pvx * 0.5;
      tz = ctx.pz + ctx.pvz * 0.5;
      pace = Math.max(slot.speed, ctx.pspeed + 3);
      if (ctx.onFoot || ctx.pspeed < 3) {
        stop = true;
        arrive = 9;
        pace = Math.min(pace, 12);
      }
    } else if (drive.crumb >= 0 && drive.crumb < trail.seq && trail.seq - drive.crumb < TRAIL_SIZE) {
      let index = drive.crumb % TRAIL_SIZE;
      if ((trail.x[index] - p.x) ** 2 + (trail.z[index] - p.z) ** 2 < 81 && drive.crumb < trail.seq - 1) {
        drive.crumb += 1;
        index = drive.crumb % TRAIL_SIZE;
      }
      tx = trail.x[index];
      tz = trail.z[index];
      // Slow for the bend his tracks take at that crumb.
      const after = drive.crumb + 2 < trail.seq ? (drive.crumb + 2) % TRAIL_SIZE : (trail.seq - 1) % TRAIL_SIZE;
      const turn = after === index ? 0 : roads.turnAngle(p.x, p.z, tx, tz, trail.x[after], trail.z[after]);
      pace = Math.min(top, roads.cornerApproachSpeed(turn, Math.hypot(tx - p.x, tz - p.z)));
    } else {
      drive.routeAge += dt;
      const driftSq = (drive.routeTargetX - ctx.px) ** 2 + (drive.routeTargetZ - ctx.pz) ** 2;
      if (drive.routeCount === 0 || driftSq > 30 * 30 || drive.routeAge > 3) roads.planRoute(drive, p.x, p.z, ctx.px, ctx.pz);
      roads.followRoute(drive, p.x, p.z, 10 + Math.abs(vehicle.speed) * 0.55, aim);
      tx = aim.x;
      tz = aim.z;
      pace = Math.min(top * 0.95, aim.limit, alignedPace(vehicle, drive));
    }
    steerAndDrive(unit, tx, tz, pace, stop, arrive, ctx, dt);
    applyManoeuvres(unit, ctx);
    rubberBand(unit, ctx, dt);
    // Lost him: back to the roads, toward where he was last seen.
    if (!ctx.pursuit || (!unit.sees && ctx.now - unit.lastSeen > 6 && unit.distance > 80)) {
      unit.state = 'responding';
      roads.dropRoute(drive);
    }
  }

  /** Comb the streets round where the suspect vanished, one waypoint after another, lights on. */
  function driveSearching(unit, dt, ctx) {
    const vehicle = unit.vehicle;
    const drive = unit.drive;
    const p = vehicle.pos;
    drive.waypointAge += dt;
    if (!drive.waypoint || drive.waypointAge > 30) pickWaypointNear(drive, ctx.searchX, ctx.searchZ, 0, Math.max(40, ctx.searchRadius));
    if (drive.routeCount === 0) roads.planRoute(drive, p.x, p.z, drive.waypointX, drive.waypointZ);
    const remaining = roads.followRoute(drive, p.x, p.z, 10 + Math.abs(vehicle.speed) * 0.5, aim);
    if (remaining < 14) drive.waypoint = false;
    steerAndDrive(unit, aim.x, aim.z, Math.min(vehicle.dynamics.profile.topSpeed * 0.5, aim.limit, alignedPace(vehicle, drive)), false, 3, ctx, dt);
    if (ctx.pursuit) {
      unit.state = 'responding';
      roads.dropRoute(drive);
    }
  }

  /** Called off: lights out, drive away from the player at a normal pace until out of sight. */
  function driveLeaving(unit, dt, ctx) {
    const vehicle = unit.vehicle;
    const drive = unit.drive;
    const p = vehicle.pos;
    vehicle.controls.siren = false;
    drive.waypointAge += dt;
    if (!drive.waypoint || drive.waypointAge > 40) {
      let ax = p.x - ctx.px;
      let az = p.z - ctx.pz;
      const length = Math.sqrt(ax * ax + az * az) || 1;
      ax /= length;
      az /= length;
      pickWaypointNear(drive, p.x + ax * 260, p.z + az * 260, 0, 140);
    }
    if (drive.routeCount === 0) roads.planRoute(drive, p.x, p.z, drive.waypointX, drive.waypointZ);
    const remaining = roads.followRoute(drive, p.x, p.z, 9 + Math.abs(vehicle.speed) * 0.5, aim);
    if (remaining < 15) drive.waypoint = false;
    steerAndDrive(unit, aim.x, aim.z, Math.min(15, aim.limit, alignedPace(vehicle, drive)), false, 3, ctx, dt);
  }

  /** Back out of a jam with the wheel turned, then take up the job again on a fresh route. */
  function driveRecovering(unit, ctx) {
    const c = unit.vehicle.controls;
    const drive = unit.drive;
    c.reverse = true;
    c.throttle = 0.8;
    c.brake = 0;
    c.handbrake = false;
    c.steer = drive.recoverSteer;
    if (ctx.now > drive.recoverUntil) {
      unit.state = drive.resumeState;
      drive.losTimer = 0;
      roads.dropRoute(drive);
    }
  }

  /** Stop where it stands, hard, and keep the handbrake on. */
  function holdStill(unit) {
    const vehicle = unit.vehicle;
    if (!vehicle) return;
    const autopilot = game.vehicles && game.vehicles.autopilot;
    if (autopilot) autopilot.stopVehicle(vehicle, true);
    else {
      vehicle.controls.throttle = 0;
      vehicle.controls.brake = 1;
    }
  }

  /**
   * Where this unit wants to be relative to the suspect, by its role: on the bumper (lining up a PIT
   * or ramming from three stars), alongside on a flank, ahead to cut him off, trailing, one of the
   * four sides of a box round a stopped car, or pulled up short of a man on foot. Fills `slot`.
   */
  function computeSlot(unit, ctx) {
    const vehicle = unit.vehicle;
    const p = vehicle.pos;
    const top = vehicle.dynamics.profile.topSpeed;
    const fx = ctx.fx;
    const fz = ctx.fz;
    const rx = ctx.rx;
    const rz = ctx.rz;
    const S = ctx.pspeed;
    const L = ctx.pHalfLength;
    const dx = p.x - ctx.px;
    const dz = p.z - ctx.pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    const lon = dx * fx + dz * fz;
    const lat = dx * rx + dz * rz;
    slot.stop = false;
    slot.arrive = 3;
    let sx;
    let sz;
    let ramming = false;
    const role = unit.role;

    if (ctx.onFoot) {
      // Pull up short of a man on foot, on the side the car comes from.
      const k = d > 0.1 ? 10 / d : 0;
      sx = ctx.px + dx * k;
      sz = ctx.pz + dz * k;
      slot.x = sx;
      slot.z = sz;
      slot.aimX = sx;
      slot.aimZ = sz;
      slot.stop = true;
      slot.arrive = 2.5;
      slot.speed = d > 45 ? top * 0.85 : Math.max(6, d * 0.5);
      return;
    }
    if (role === 'boxRear' || role === 'boxFront' || role === 'boxLeft' || role === 'boxRight') {
      const along = role === 'boxRear' ? -(L + 3.4) : role === 'boxFront' ? L + 3.6 : 0;
      const across = role === 'boxRight' ? 3.4 : role === 'boxLeft' ? -3.4 : 0;
      sx = ctx.px + fx * along + rx * across;
      sz = ctx.pz + fz * along + rz * across;
      const ds = Math.hypot(p.x - sx, p.z - sz);
      slot.x = sx;
      slot.z = sz;
      slot.aimX = sx;
      slot.aimZ = sz;
      slot.stop = true;
      slot.arrive = 1.5;
      slot.speed = Math.max(3, Math.min(14, ds * 0.7));
      return;
    }
    if (role === 'lead') {
      if (ctx.ram && S > 9 && lon < 0 && lon > -(L * 2 + 12) && Math.abs(lat) < 5) {
        // Line up beside his rear quarter for the PIT.
        const side = lat >= 0 ? 1 : -1;
        sx = ctx.px - fx * (L * 0.7 + 1.6) + rx * side * 2.5;
        sz = ctx.pz - fz * (L * 0.7 + 1.6) + rz * side * 2.5;
      } else if (ctx.ram && (S < 9 || d < 12)) {
        sx = ctx.px + ctx.pvx * 0.35;
        sz = ctx.pz + ctx.pvz * 0.35;
        ramming = true;
      } else {
        sx = ctx.px - fx * (L + 6);
        sz = ctx.pz - fz * (L + 6);
      }
    } else if (role === 'flankLeft' || role === 'flankRight') {
      const side = role === 'flankRight' ? 1 : -1;
      const gap = ctx.now < unit.drive.swipeUntil ? 1.4 : 4.2;
      sx = ctx.px + rx * side * gap - fx * 0.5;
      sz = ctx.pz + rz * side * gap - fz * 0.5;
    } else if (role === 'cutoff') {
      if (lon > 6 && d < 60) {
        // In front of him: turn into his path and stop across it.
        sx = ctx.px + fx * 12;
        sz = ctx.pz + fz * 12;
        slot.stop = true;
        slot.arrive = 3;
      } else {
        const ahead = Math.max(25, Math.min(80, S * 3));
        sx = ctx.px + fx * ahead;
        sz = ctx.pz + fz * ahead;
      }
    } else if (role === 'trail') {
      const side = unit.id % 2 === 0 ? 3 : -3;
      sx = ctx.px - fx * (L + 13) + rx * side;
      sz = ctx.pz - fz * (L + 13) + rz * side;
    } else {
      sx = ctx.px;
      sz = ctx.pz;
    }
    slot.x = sx;
    slot.z = sz;
    const ds = Math.hypot(p.x - sx, p.z - sz);
    if (slot.stop) {
      slot.aimX = sx;
      slot.aimZ = sz;
      slot.speed = Math.max(4, Math.min(top, ds * 0.6));
    } else if (ds > 35 && role !== 'cutoff') {
      // Far off: aim where he is going to be and drive flat out.
      const lead = Math.min(1.6, d / Math.max(12, Math.abs(vehicle.speed) + 4));
      slot.aimX = ctx.px + ctx.pvx * lead;
      slot.aimZ = ctx.pz + ctx.pvz * lead;
      slot.speed = top;
    } else if (ramming) {
      slot.aimX = sx;
      slot.aimZ = sz;
      slot.speed = Math.min(top, S + 7);
    } else {
      // Station keeping: match his pace, closing or dropping back on the slot, steering for a
      // point ahead of it so the car runs parallel to his.
      const error = (p.x - sx) * fx + (p.z - sz) * fz;
      slot.speed = Math.max(0, Math.min(top, S - error * 0.7 + 1));
      const carrot = Math.max(5, S * 0.45);
      slot.aimX = sx + fx * carrot;
      slot.aimZ = sz + fz * carrot;
    }
  }

  /**
   * Hand the target to the autopilot, kept apart from the other police cars, swinging out past a
   * slow civilian car, braking for people on foot (below four stars) and away from walls.
   */
  function steerAndDrive(unit, tx, tz, pace, stop, arrive, ctx, dt) {
    const vehicle = unit.vehicle;
    const autopilot = game.vehicles && game.vehicles.autopilot;
    if (!autopilot) return;
    const drive = unit.drive;
    const c = vehicle.controls;
    const p = vehicle.pos;
    // Keep apart from other police cars so they never stack up in one junction.
    const units = ctx.units;
    for (let i = 0; i < units.length; i += 1) {
      const other = units[i];
      if (other === unit || !other.vehicle) continue;
      const ox = p.x - other.vehicle.pos.x;
      const oz = p.z - other.vehicle.pos.z;
      const dSq = ox * ox + oz * oz;
      if (dSq > 81 || dSq < 1e-4) continue;
      const d = Math.sqrt(dSq);
      const push = (9 - d) * 0.6;
      tx += (ox / d) * push;
      tz += (oz / d) * push;
    }
    drive.obstacleTimer -= dt;
    if (drive.obstacleTimer <= 0) {
      drive.obstacleTimer = 0.15;
      checkObstacles(unit, ctx);
    }
    if (drive.dodgeUntil > ctx.now) {
      tx += -Math.cos(vehicle.heading) * drive.dodge;
      tz += Math.sin(vehicle.heading) * drive.dodge;
    }
    // Hard on the grip in the thick of a chase (handbrake turns from three stars), tidier on the roads.
    driveOptions.aggression = unit.state !== 'chasing' ? 0.55 : ctx.level >= 3 ? 0.85 : 0.6;
    driveOptions.stopAtTarget = stop;
    driveOptions.arriveRadius = arrive;
    autopilot.driveToward(vehicle, tx, tz, pace, driveOptions);
    // Brake firmly when over the pace (the corner ahead counts on it), not just a touch.
    const over = vehicle.speed - pace;
    if (over > 1 && !c.reverse) {
      c.throttle = 0;
      c.brake = Math.max(c.brake, Math.min(1, 0.3 + over * 0.12));
    }
    if (drive.obstacleBrake > 0) {
      c.throttle = Math.min(c.throttle, 0.1);
      c.brake = Math.max(c.brake, drive.obstacleBrake);
    }
    drive.feelerTimer -= dt;
    if (drive.feelerTimer <= 0) {
      drive.feelerTimer = 0.1;
      drive.feelerSteer = feelForWalls(vehicle, unit.distance < 12 ? 0.6 : 1);
    }
    if (drive.feelerSteer !== 0 && !c.reverse) c.steer = Math.max(-1, Math.min(1, c.steer + drive.feelerSteer));
    drive.wantsMove = !(stop && (p.x - tx) * (p.x - tx) + (p.z - tz) * (p.z - tz) < (arrive + 1.5) * (arrive + 1.5));
  }

  /** Below four stars: brake for people in the road and swing out past slower civilian cars. */
  function checkObstacles(unit, ctx) {
    const drive = unit.drive;
    const vehicle = unit.vehicle;
    drive.obstacleBrake = 0;
    const speed = Math.abs(vehicle.speed);
    if (ctx.level >= 4 || speed < 2) return;
    const autopilot = game.vehicles.autopilot;
    const ahead = autopilot.obstacleAhead(vehicle, 6 + speed * 0.8);
    if (ahead.character) {
      const person = ahead.character;
      if (person !== ctx.playerCharacter && person.kind !== 'officer' && ahead.distance < speed * 0.6 + 3) {
        drive.obstacleBrake = ctx.level <= 2 ? 1 : 0.5;
      }
    } else if (ahead.vehicle && ctx.level <= 3) {
      const other = ahead.vehicle;
      if (other === ctx.playerVehicle || other.faction === 'police') return;
      if (ahead.distance < 5 + speed * 0.35 && speed > Math.abs(other.speed) + 2) {
        const s = Math.sin(vehicle.heading);
        const c = Math.cos(vehicle.heading);
        const right = (other.pos.x - vehicle.pos.x) * -c + (other.pos.z - vehicle.pos.z) * s;
        drive.dodge = right > 0 ? -3.4 : 3.4;
        drive.dodgeUntil = ctx.now + 0.7;
      }
    }
  }

  /**
   * Two feelers off the front bumper: a building, wall or container close ahead on one side turns
   * the wheel the other way. Returns the steering to add.
   */
  function feelForWalls(vehicle, strength) {
    const colliders = game.colliders;
    const speed = Math.abs(vehicle.speed);
    if (!colliders || speed < 3) return 0;
    const profile = vehicle.dynamics.profile;
    const reach = Math.min(28, 4 + speed * 0.5);
    const h = vehicle.heading;
    rayOrigin.set(vehicle.pos.x + Math.sin(h) * profile.halfLength, vehicle.pos.y + 0.7, vehicle.pos.z + Math.cos(h) * profile.halfLength);
    const left = probe(colliders, h + 0.33, reach);
    const right = probe(colliders, h - 0.33, reach);
    let steer = 0;
    if (left < reach) steer += (1 - left / reach) * 1.1;
    if (right < reach) steer -= (1 - right / reach) * 1.1;
    return Math.max(-0.9, Math.min(0.9, steer * strength));
  }

  function probe(colliders, angle, reach) {
    rayDirection.set(Math.sin(angle), 0, Math.cos(angle));
    const hit = colliders.raycast(rayOrigin, rayDirection, reach);
    if (!hit || !hit.collider || hit.collider.type === 'post') return reach;
    return hit.distance;
  }

  /** From three stars: the PIT from the bumper and side-swipes from the flanks. */
  function applyManoeuvres(unit, ctx) {
    const vehicle = unit.vehicle;
    const drive = unit.drive;
    const c = vehicle.controls;
    const now = ctx.now;
    if (drive.pitUntil > now) {
      c.steer = drive.pitSteer;
      c.throttle = 1;
      c.brake = 0;
      c.handbrake = false;
      c.reverse = false;
      return;
    }
    if (drive.swipeUntil > now) {
      c.steer = Math.max(-1, Math.min(1, c.steer + drive.swipeSteer));
      c.throttle = Math.max(c.throttle, 0.8);
      c.brake = 0;
      return;
    }
    const target = ctx.playerVehicle;
    if (!ctx.ram || !target || ctx.onFoot) return;
    const S = ctx.pspeed;
    if (S < 8) return;
    const dx = vehicle.pos.x - ctx.px;
    const dz = vehicle.pos.z - ctx.pz;
    const lon = dx * ctx.fx + dz * ctx.fz;
    const lat = dx * ctx.rx + dz * ctx.rz;
    const aligned = Math.abs(game.math.angleDelta(vehicle.heading, target.heading)) < 0.4;
    if (!aligned || Math.abs(vehicle.speed - S) > 5.5) return;
    const L = ctx.pHalfLength;
    if (unit.role === 'lead' && S > 10 && now > drive.pitCooldown) {
      const reach = L + vehicle.dynamics.profile.halfLength;
      if (lon < -L * 0.2 && lon > -reach * 1.05 && Math.abs(lat) > 1.3 && Math.abs(lat) < 3.4) {
        drive.pitUntil = now + 0.55;
        drive.pitSteer = lat > 0 ? -0.9 : 0.9;
        drive.pitCooldown = now + 4;
        game.events.emit('police:pit', { unit, vehicle: target });
      }
    } else if ((unit.role === 'flankLeft' || unit.role === 'flankRight') && now > drive.swipeCooldown) {
      if (Math.abs(lon) < L + 1.5 && Math.abs(lat) > 1.8 && Math.abs(lat) < 4.8) {
        drive.swipeUntil = now + 0.5;
        drive.swipeSteer = lat > 0 ? -0.5 : 0.5;
        drive.swipeCooldown = now + 3 + Math.random() * 2;
      }
    }
  }

  /** A gentle push for a car far behind and out of the player's view, so a chase never goes slack. */
  function rubberBand(unit, ctx, dt) {
    if (unit.distance < RUBBER_BAND_DISTANCE || unit.visibleToPlayer) return;
    const vehicle = unit.vehicle;
    const c = vehicle.controls;
    if (!vehicle.grounded || c.reverse || c.throttle < 0.6 || Math.abs(c.steer) > 0.35) return;
    const top = vehicle.dynamics.profile.topSpeed;
    if (vehicle.speed < 8 || vehicle.speed > top * 1.15) return;
    const push = vehicle.spec.mass * RUBBER_BAND_ACCEL * dt;
    game.vehicles.applyImpulse?.(vehicle, Math.sin(vehicle.heading) * push, Math.cos(vehicle.heading) * push);
  }

  /** Track real progress; a car pushing and going nowhere backs out (and is marked as stuck). */
  function watchProgress(unit, dt, ctx) {
    const vehicle = unit.vehicle;
    const drive = unit.drive;
    drive.progressTimer += dt;
    if (drive.progressTimer >= 1) {
      const moved = Math.hypot(vehicle.pos.x - drive.progressX, vehicle.pos.z - drive.progressZ);
      drive.progressX = vehicle.pos.x;
      drive.progressZ = vehicle.pos.z;
      const busy = unit.state === 'deployed' || unit.state === 'holding';
      if (drive.wantsMove && !busy && moved < 1.5) unit.stuckTime += drive.progressTimer;
      else unit.stuckTime = 0;
      drive.progressTimer = 0;
      unit.flipped = Math.abs(vehicle.roll) > 1.2 || Math.abs(vehicle.pitch) > 1.2;
    }
    if (unit.stuckTime >= STUCK_RECOVER_AFTER && unit.state !== 'recovering' && unit.state !== 'deployed' && !unit.flipped) {
      startRecovery(unit, ctx);
    }
  }

  function startRecovery(unit, ctx) {
    const drive = unit.drive;
    const vehicle = unit.vehicle;
    drive.resumeState = unit.state === 'chasing' || unit.state === 'searching' || unit.state === 'leaving' ? unit.state : 'responding';
    unit.state = 'recovering';
    drive.recoverUntil = ctx.now + RECOVER_SECONDS;
    drive.recoverSteer = vehicle.controls.steer >= 0 ? -1 : 1;
    game.vehicles.autopilot?.reset?.(vehicle);
  }

  /** A random lane point within the ring around (x, z), as the next waypoint; drops the old route. */
  function pickWaypointNear(drive, x, z, minDistance, maxDistance) {
    const hit = game.roads && game.roads.randomLaneNear ? game.roads.randomLaneNear(x, z, minDistance, maxDistance, searchRng) : null;
    drive.waypointX = hit ? hit.x : x;
    drive.waypointZ = hit ? hit.z : z;
    drive.waypoint = true;
    drive.waypointAge = 0;
    roads.dropRoute(drive);
    drive.routeTargetX = drive.waypointX;
    drive.routeTargetZ = drive.waypointZ;
  }

  /**
   * Until the car has come round onto the road it is following, it may not run fast: a car still
   * pointing across a junction would otherwise accelerate out of the turn and run wide.
   */
  function alignedPace(vehicle, drive) {
    const i = drive.routeIndex;
    if (drive.routeCount < 2 || i >= drive.routeCount - 1) return Infinity;
    const dx = drive.routeX[i + 1] - drive.routeX[i];
    const dz = drive.routeZ[i + 1] - drive.routeZ[i];
    if (dx * dx + dz * dz < 1) return Infinity;
    const off = Math.abs(game.math.angleDelta(vehicle.heading, Math.atan2(dx, dz)));
    return off < 0.45 ? Infinity : off < 1.2 ? 14 - (off - 0.45) * 8 : 8;
  }

  /** Nothing static stands on the straight road from the car to (x, z). */
  function roadClear(vehicle, x, z) {
    const colliders = game.colliders;
    if (!colliders) return true;
    rayOrigin.set(vehicle.pos.x, vehicle.pos.y + 0.8, vehicle.pos.z);
    rayEnd.set(x, (game.terrain ? game.terrain.heightAt(x, z) : 0) + 0.8, z);
    return colliders.lineOfSight(rayOrigin, rayEnd);
  }

  /** The newest of the suspect's crumbs the car can drive straight to (at most six looked at). */
  function newestVisibleCrumb(vehicle) {
    let looked = 0;
    for (let s = trail.seq - 1; s >= 0 && trail.seq - s < TRAIL_SIZE && looked < 6; s -= 2) {
      looked += 1;
      const index = s % TRAIL_SIZE;
      if (roadClear(vehicle, trail.x[index], trail.z[index])) return s;
    }
    return -1;
  }

  /** Drop a crumb where the suspect is every quarter second (a jump of 60 m starts a fresh trail). */
  function recordTrail(ctx, dt) {
    if (!ctx.hasPlayer) return;
    trail.timer -= dt;
    if (trail.timer > 0) return;
    trail.timer = TRAIL_STEP;
    if (trail.seq > 0) {
      const last = (trail.seq - 1) % TRAIL_SIZE;
      const dSq = (trail.x[last] - ctx.px) ** 2 + (trail.z[last] - ctx.pz) ** 2;
      if (dSq < 9) return;
      if (dSq > 3600) trail.seq = 0;
    }
    const index = trail.seq % TRAIL_SIZE;
    trail.x[index] = ctx.px;
    trail.z[index] = ctx.pz;
    trail.seq += 1;
  }

  return { roads, trail, beginFrame, driveUnit, holdStill, startRecovery };
}
