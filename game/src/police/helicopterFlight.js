// How Shaheen-1 flies: it picks a station on a ring 50 to 70 m round the suspect (flanking ahead of a
// fast car, circling a slow one or the last known position), moves that station round to clear air
// when towers stand in the ring, and chases it with a helicopter's inertia, nosing down to speed up
// and banking into turns. Where towers stand between it and the station at its height it follows
// the suspect's own trail round the corner; wherever roofs are still in the way it slows and climbs
// first, and it never slides into a tower's airspace below the roof.
import * as THREE from 'three';
import { createHelicopterClearanceMap } from './helicopterClearanceMap.js';
import { helicopterAltitudeOverRoof, helicopterFlankShare, doorGunnerFiresAtStars } from './policeHeavyResponseRules.js';

const MAX_SPEED = 88;
const MAX_ACCEL = 10;
const MAX_CLIMB = 14;
const MAX_SINK = 9;
const VERTICAL_ACCEL = 9;
const MAX_ALTITUDE = 420;
/** Never closer than this above a roof it is moving over, whatever the plan says. */
const HARD_CLEARANCE = 10;
const MIN_GROUND_CLEARANCE = 26;
const STATION_RADIUS = 55;
const STATION_HEIGHT = 48;
const MAX_STATION_HEIGHT = 125;
/** Rings tried (metres added to the station radius) when towers block the preferred one. */
const RING_EXTRAS = [0, -12, 25, 50];
/** Points of the suspect's trail kept, one every TRAIL_SPACING metres. */
const TRAIL_LENGTH = 48;
const TRAIL_SPACING = 10;

/**
 * Create the flight model for a helicopter. `suspect` = {pos, vel, ok} is kept current by the owner.
 * @returns {{goal: THREE.Vector3, roofline: Object, fly: Function, computeGoal: Function, beginChase: Function,
 *   setExitDirection: Function, settleStation: Function, clearAltitudeAt: Function}}
 */
export function createHelicopterFlight(game, heli, suspect) {
  const { clamp, damp, dampAngle, angleDelta, smoothstep, approach, wrapAngle } = game.math;
  const roofline = createHelicopterClearanceMap(game);
  const goal = new THREE.Vector3();
  const goalVel = new THREE.Vector3();
  const exitDir = new THREE.Vector3(1, 0, 0);
  const waypoint = new THREE.Vector3();
  const trailX = new Float32Array(TRAIL_LENGTH);
  const trailZ = new Float32Array(TRAIL_LENGTH);
  const trailSerials = new Float64Array(TRAIL_LENGTH);
  let clock = 0;
  let goalSpeedCap = MAX_SPEED;
  let orbitAngle = 0;
  let flankSign = 1;
  let flankBlend = 1;
  let flankTimer = 20;
  let avoidOffset = 0;
  let avoidOffsetTarget = 0;
  let avoidRadius = 0;
  let avoidRadiusTarget = 0;
  let avoidTimer = 0;
  let trailSerial = 0;
  let trailCount = 0;
  let trailHead = 0;
  let routeTimer = 0;
  let followingTrail = false;
  let waypointSerial = 0;
  let directClearCount = 0;
  let scanRequired = 0;
  let scanCap = MAX_SPEED;

  /**
   * Chase the station point with inertia for one frame: route, look ahead for roofs, accelerate,
   * climb or sink, move, and set the attitude.
   */
  function fly(dt) {
    computeGoal(dt);
    recordTrail();
    routeTimer -= dt;
    if (routeTimer <= 0) {
      routeTimer = 0.25;
      chooseRoute();
    }
    const pos = heli.position;
    const vel = heli.velocity;
    const trail = followingTrail;
    const targetX = trail ? waypoint.x : goal.x;
    const targetZ = trail ? waypoint.z : goal.z;
    const gain = trail ? 0.9 : 0.55;
    let wantX = (trail ? 0 : goalVel.x) + (targetX - pos.x) * gain;
    let wantZ = (trail ? 0 : goalVel.z) + (targetZ - pos.z) * gain;
    const wantSpeed = Math.hypot(wantX, wantZ);
    const speed = Math.hypot(vel.x, vel.z);

    // Roofs in the way: all along the line to the target, and along its present motion as far as it takes to stop.
    scanRequired = clearAltitudeAt(pos.x, pos.z);
    scanCap = scanRequired > pos.y ? 3 : goalSpeedCap;
    const toTarget = Math.hypot(targetX - pos.x, targetZ - pos.z);
    if (toTarget > 1) scanAhead((targetX - pos.x) / toTarget, (targetZ - pos.z) / toTarget, Math.min(toTarget, 300));
    if (speed > 3) scanAhead(vel.x / speed, vel.z / speed, (speed * speed) / (2 * MAX_ACCEL) + 12);
    const required = scanRequired;
    heli.clearanceNeeded = required;
    if (wantSpeed > scanCap) {
      wantX *= scanCap / wantSpeed;
      wantZ *= scanCap / wantSpeed;
    }
    let ax = (wantX - vel.x) * 1.5;
    let az = (wantZ - vel.z) * 1.5;
    const accel = Math.hypot(ax, az);
    if (accel > MAX_ACCEL) {
      ax *= MAX_ACCEL / accel;
      az *= MAX_ACCEL / accel;
    }
    vel.x += ax * dt;
    vel.z += az * dt;

    // Following the trail between towers it cruises at station height; otherwise at the station's.
    const cruise = trail ? groundAt(pos.x, pos.z) + STATION_HEIGHT : goal.y;
    const targetY = Math.min(MAX_ALTITUDE, Math.max(cruise, required));
    heli.targetAltitude = targetY;
    let wantVy = clamp((targetY - pos.y) * 0.8, -MAX_SINK, MAX_CLIMB);
    if (pos.y < required - 2) wantVy = MAX_CLIMB;
    vel.y = approach(vel.y, wantVy, VERTICAL_ACCEL * dt);
    moveWithSliding(dt);
    const floor = groundAt(pos.x, pos.z) + 6;
    if (pos.y < floor) {
      pos.y = floor;
      if (vel.y < 0) vel.y = 0;
    }
    steerAttitude(ax, az, dt);
  }

  /**
   * Where the helicopter wants to be: circling the suspect (or the last known position while the
   * police search), flanking ahead of a fast car, moved round to clear air when towers block; or,
   * leaving, climbing away from the chase.
   */
  function computeGoal(dt) {
    clock += dt;
    const state = heli.state;
    if (state === 'leaving' || state === 'withdrawing') {
      goal.set(heli.position.x + exitDir.x * 400, 0, heli.position.z + exitDir.z * 400);
      goal.y = Math.max(groundAt(goal.x, goal.z) + 170, heli.position.y);
      const cruise = state === 'withdrawing' ? 32 : 46;
      goalVel.set(exitDir.x * cruise, 0, exitDir.z * cruise);
      goalSpeedCap = state === 'withdrawing' ? 34 : 56;
      return;
    }
    goalSpeedCap = MAX_SPEED;
    const search = isSearching() && !heli.seesPlayer;
    let cx = suspect.pos.x;
    let cz = suspect.pos.z;
    let vx = suspect.vel.x;
    let vz = suspect.vel.z;
    if (search) {
      cx = game.wanted.lastKnown.x;
      cz = game.wanted.lastKnown.z;
      vx = 0;
      vz = 0;
    }
    const fast = helicopterFlankShare(Math.hypot(vx, vz));
    const blind = state === 'onStation' && (heli.lostSightTime || 0) > 3;
    orbitAngle += dt * (search ? 0.16 : blind ? 0.32 : 0.11);
    flankTimer -= dt;
    if (flankTimer <= 0) {
      flankTimer = 18 + Math.random() * 14;
      flankSign = -flankSign;
    }
    flankBlend = damp(flankBlend, flankSign, 0.25, dt);
    const flank = Math.atan2(vx, vz) + flankBlend * (0.85 + 0.2 * Math.sin(clock * 0.13));
    let bearing = orbitAngle + angleDelta(orbitAngle, flank) * fast;
    if (fast > 0.5) orbitAngle = dampAngle(orbitAngle, bearing, 1.5, dt);
    const lead = search ? 0 : 0.6;
    const centerX = cx + vx * lead;
    const centerZ = cz + vz * lead;
    const baseRadius = search ? 46 : STATION_RADIUS + 8 * Math.sin(clock * 0.07);
    avoidTimer -= dt;
    if (avoidTimer <= 0) {
      avoidTimer = 0.4;
      chooseClearBearing(centerX, centerZ, bearing, baseRadius);
    }
    avoidOffset = dampAngle(avoidOffset, avoidOffsetTarget, 2, dt);
    avoidRadius = damp(avoidRadius, avoidRadiusTarget, 1.5, dt);
    bearing += avoidOffset;
    const radius = baseRadius + avoidRadius;
    goal.x = centerX + Math.sin(bearing) * radius;
    goal.z = centerZ + Math.cos(bearing) * radius;
    goal.y = Math.max(groundAt(goal.x, goal.z) + STATION_HEIGHT + 6 * Math.sin(clock * 0.19), clearAltitudeAt(goal.x, goal.z));
    goalVel.set(vx, 0, vz);
  }

  /**
   * Over The Spires the ring round the chase crosses towers: find the nearest bearing (then another
   * ring) where the station is no more than 125 m up; failing that, the lowest one found.
   */
  function chooseClearBearing(cx, cz, bearing, radius) {
    if (stationHeight(cx, cz, bearing, radius) <= MAX_STATION_HEIGHT) {
      avoidOffsetTarget = 0;
      avoidRadiusTarget = 0;
      return;
    }
    if (stationHeight(cx, cz, bearing + avoidOffsetTarget, radius + avoidRadiusTarget) <= MAX_STATION_HEIGHT) return;
    let bestHeight = Infinity;
    let bestOffset = 0;
    let bestExtra = 0;
    for (let ring = 0; ring < RING_EXTRAS.length; ring += 1) {
      const extra = RING_EXTRAS[ring];
      for (let k = 0; k <= 31; k += 1) {
        for (let sign = 1; sign >= -1; sign -= 2) {
          if (k === 0 && sign < 0) continue;
          const offset = k * 0.1 * sign;
          const height = stationHeight(cx, cz, bearing + offset, radius + extra);
          if (height <= MAX_STATION_HEIGHT) {
            avoidOffsetTarget = offset;
            avoidRadiusTarget = extra;
            return;
          }
          if (height < bestHeight) {
            bestHeight = height;
            bestOffset = offset;
            bestExtra = extra;
          }
        }
      }
    }
    avoidOffsetTarget = bestOffset;
    avoidRadiusTarget = bestExtra;
  }

  /** Nose down to speed up, bank into turns, and turn to face the suspect (a door to him for the gunner). */
  function steerAttitude(ax, az, dt) {
    const vel = heli.velocity;
    const s = Math.sin(heli.heading);
    const c = Math.cos(heli.heading);
    const accelForward = ax * s + az * c;
    const accelRight = -ax * c + az * s;
    const speedForward = vel.x * s + vel.z * c;
    const pitchTarget = clamp(Math.atan2(accelForward, 9.81) * 0.85 + speedForward * 0.004, -0.3, 0.4);
    const rollTarget = clamp(Math.atan2(accelRight, 9.81), -0.5, 0.5);
    heli.pitch = damp(heli.pitch, pitchTarget, 3, dt);
    heli.roll = damp(heli.roll, rollTarget, 3, dt);

    const speed = Math.hypot(vel.x, vel.z);
    const travel = speed > 2 ? Math.atan2(vel.x, vel.z) : heli.heading;
    let face = travel;
    const working = heli.state === 'onStation' || (heli.state === 'inbound' && heli.distanceToPlayer < 220);
    if (working) {
      const aim = heli.searchlight.aim;
      let toAim = Math.atan2(aim.x - heli.position.x, aim.z - heli.position.z);
      const gunner = heli.gunner;
      if ((gunner && gunner.firing) || (doorGunnerFiresAtStars(wantedLevel()) && heli.seesPlayer && speed < 24)) {
        // Turn a door to the suspect: the left door faces him at heading (bearing - 90 degrees).
        const left = toAim - Math.PI / 2;
        const right = toAim + Math.PI / 2;
        toAim = Math.abs(angleDelta(heli.heading, left)) < Math.abs(angleDelta(heli.heading, right)) ? left : right;
      }
      face = toAim + angleDelta(toAim, travel) * smoothstep(16, 34, speed);
    }
    heli.yawRate = clamp(angleDelta(heli.heading, face) * 1.5, -0.9, 0.9);
    heli.heading = wrapAngle(heli.heading + heli.yawRate * dt);
  }

  // ---- routing round the towers -----------------------------------------------------------------

  /** Sample the roofs along a direction from the helicopter, raising scanRequired and lowering scanCap. */
  function scanAhead(dirX, dirZ, length) {
    const pos = heli.position;
    const steps = Math.min(48, Math.max(1, Math.ceil(length / 6)));
    for (let i = 1; i <= steps; i += 1) {
      const d = (length * i) / steps;
      const need = clearAltitudeAt(pos.x + dirX * d, pos.z + dirZ * d);
      if (need > scanRequired) scanRequired = need;
      const rise = need - pos.y;
      if (rise > 0) scanCap = Math.min(scanCap, Math.max(4, ((d * MAX_CLIMB) / rise) * 0.7));
    }
  }

  /**
   * Move by the velocity, but never sideways into a tower's airspace below its roof: slide along
   * it on one axis, or hold and let the climb take it over.
   */
  function moveWithSliding(dt) {
    const pos = heli.position;
    const vel = heli.velocity;
    const y = pos.y + vel.y * dt;
    let x = pos.x + vel.x * dt;
    let z = pos.z + vel.z * dt;
    const here = roofline.highestNear(pos.x, pos.z);
    if (intrudes(x, z, y, here)) {
      if (!intrudes(x, pos.z, y, here)) {
        z = pos.z;
        vel.z *= 0.4;
      } else if (!intrudes(pos.x, z, y, here)) {
        x = pos.x;
        vel.x *= 0.4;
      } else {
        x = pos.x;
        z = pos.z;
        vel.x *= 0.3;
        vel.z *= 0.3;
      }
    }
    pos.set(x, y, z);
  }

  /** Would (x, z) at height y put the rotor closer than 10 m above a roof higher than the one below it now? */
  function intrudes(x, z, y, here) {
    const roof = roofline.highestNear(x, z);
    return roof + HARD_CLEARANCE > y && roof > here;
  }

  /** Remember where the suspect has been, a point every 10 m, each with a serial number. */
  function recordTrail() {
    if (!suspect.ok) return;
    const p = suspect.pos;
    if (trailCount > 0) {
      const last = (trailHead - 1 + TRAIL_LENGTH) % TRAIL_LENGTH;
      if (Math.hypot(p.x - trailX[last], p.z - trailZ[last]) < TRAIL_SPACING) return;
    }
    trailX[trailHead] = p.x;
    trailZ[trailHead] = p.z;
    trailSerial += 1;
    trailSerials[trailHead] = trailSerial;
    trailHead = (trailHead + 1) % TRAIL_LENGTH;
    trailCount = Math.min(TRAIL_LENGTH, trailCount + 1);
  }

  /**
   * Straight to the station when the air is clear at this height (twice running, once it has been
   * following the trail); else to the newest point of the suspect's trail it can reach, never going
   * back along it; else straight on, climbing over whatever is in the way.
   */
  function chooseRoute() {
    const pos = heli.position;
    if (heli.state === 'leaving' || heli.state === 'withdrawing') {
      followingTrail = false;
      heli.route = 'direct';
      return;
    }
    if (airIsClear(pos.x, pos.z, goal.x, goal.z, pos.y)) {
      directClearCount += 1;
      if (!followingTrail || directClearCount >= 2) {
        followingTrail = false;
        heli.route = 'direct';
        return;
      }
    } else {
      directClearCount = 0;
    }
    for (let n = 0; n < trailCount; n += 1) {
      const i = (trailHead - 1 - n + TRAIL_LENGTH * 2) % TRAIL_LENGTH;
      if (followingTrail && trailSerials[i] < waypointSerial) break;
      if (!airIsClear(pos.x, pos.z, trailX[i], trailZ[i], pos.y)) continue;
      waypoint.set(trailX[i], 0, trailZ[i]);
      waypointSerial = trailSerials[i];
      followingTrail = true;
      heli.route = 'trail';
      return;
    }
    followingTrail = false;
    heli.route = 'over';
  }

  /** Can the helicopter fly straight from (ax, az) to (bx, bz) at height y, 20 m clear of every roof? */
  function airIsClear(ax, az, bx, bz, y) {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / 5));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      if (helicopterAltitudeOverRoof(roofline.highestNear(ax + (bx - ax) * t, az + (bz - az) * t)) > y + 3) return false;
    }
    return true;
  }

  /** The height that keeps 20 m over the roofs and well clear of the ground at a point. */
  function clearAltitudeAt(x, z) {
    return Math.max(helicopterAltitudeOverRoof(roofline.highestNear(x, z)) + 1.5, groundAt(x, z) + MIN_GROUND_CLEARANCE);
  }

  function stationHeight(cx, cz, bearing, radius) {
    const x = cx + Math.sin(bearing) * radius;
    const z = cz + Math.cos(bearing) * radius;
    return helicopterAltitudeOverRoof(roofline.highestNear(x, z)) - groundAt(x, z);
  }

  // ---- set-up ---------------------------------------------------------------------------------------

  /** A new chase: forget the old trail, start the orbit from where the helicopter is. */
  function beginChase() {
    trailCount = 0;
    followingTrail = false;
    orbitAngle = Math.atan2(heli.position.x - suspect.pos.x, heli.position.z - suspect.pos.z);
    avoidTimer = 0;
  }

  /** Pick the station now, with the tower avoidance already settled (for an instant arrival). */
  function settleStation() {
    avoidTimer = 0;
    computeGoal(0);
    avoidOffset = avoidOffsetTarget;
    avoidRadius = avoidRadiusTarget;
    computeGoal(0);
    return goal;
  }

  /** Leave straight away from the suspect. */
  function setExitDirection() {
    exitDir.set(heli.position.x - suspect.pos.x, 0, heli.position.z - suspect.pos.z);
    if (exitDir.lengthSq() < 1) exitDir.set(Math.sin(heli.heading), 0, Math.cos(heli.heading));
    exitDir.normalize();
  }

  function wantedLevel() {
    const wanted = game.wanted;
    return wanted && typeof wanted.level === 'number' ? wanted.level : 0;
  }

  function isSearching() {
    const wanted = game.wanted;
    return !!(wanted && wanted.state === 'search' && wanted.lastKnown && Number.isFinite(wanted.lastKnown.x));
  }

  function groundAt(x, z) {
    return game.terrain ? game.terrain.heightAt(x, z) : 0;
  }

  return { goal, roofline, fly, computeGoal, beginChase, settleStation, setExitDirection, clearAltitudeAt };
}
