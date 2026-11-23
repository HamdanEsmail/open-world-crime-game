// Shaheen-1, the PSPD patrol helicopter. Scrambled from Headquarters once the wanted level reaches
// three stars, it flies in from out of sight and holds a circling station 50 to 70 m from the chase
// and 40 to 60 m up (higher over towers, or round the outside of The Spires), flanking a fast car
// so the crew can see it. It pins the suspect in its searchlight, keeps a pursuit alive while it
// has eyes on, puts a door gunner to work at five stars, and pulls out trailing smoke if it is
// shot up. Becomes game.policeHelicopter.
import * as THREE from 'three';
import { buildShaheenModel, BODY_CENTER, EXHAUST_POINT } from './helicopterModel.js';
import { buildSearchlightBeam } from './helicopterSearchlight.js';
import { createHelicopterClearanceMap } from './helicopterClearanceMap.js';
import { createHelicopterDoorGunner } from './helicopterDoorGunner.js';

const MIN_STARS = 3;
const DISPATCH_DELAY = [6, 10];
const MAX_HEALTH = 700;
const WITHDRAW_SECONDS = 60;
const HIT_RADIUS = 3.1;

const MAX_SPEED = 88;
const MAX_ACCEL = 10;
const MAX_CLIMB = 14;
const MAX_SINK = 9;
const VERTICAL_ACCEL = 9;
const MAX_ALTITUDE = 420;
const ROOF_CLEARANCE = 20;
/** Never closer than this above a roof it is moving over, whatever the plan says. */
const HARD_CLEARANCE = 10;
const MIN_GROUND_CLEARANCE = 26;
const STATION_RADIUS = 60;
const STATION_HEIGHT = 48;
const MAX_STATION_HEIGHT = 125;
const SPAWN_DISTANCE = 520;
const SPAWN_HEIGHT = 110;
/** Rings tried (metres added to the station radius) when towers block the preferred one. */
const RING_EXTRAS = [0, -12, 25, 50];
/** Points of the suspect's trail kept, one every TRAIL_SPACING metres. */
const TRAIL_LENGTH = 48;
const TRAIL_SPACING = 10;

const AIM_STIFFNESS = 15;
const AIM_DAMPING = 5.2;

/**
 * Create Shaheen-1 (hidden until a chase calls for it).
 * @param {Object} game
 * @returns {Object} game.policeHelicopter
 */
export function createPoliceHelicopter(game) {
  const { clamp, damp, dampAngle, angleDelta, smoothstep, lerp, approach, wrapAngle } = game.math;
  const model = buildShaheenModel();
  const light = buildSearchlightBeam();
  model.root.visible = false;
  light.setVisible(false);
  game.scene.add(model.root);
  game.scene.add(light.group);
  const roofline = createHelicopterClearanceMap(game);

  const heli = {
    callsign: 'Shaheen-1',
    isHelicopter: true,
    /** In the world and visible. */
    active: false,
    /** 'idle' | 'inbound' | 'onStation' | 'leaving' | 'withdrawing' */
    state: 'idle',
    /** Held in place for a staged screenshot. */
    staged: false,
    position: new THREE.Vector3(0, -500, 0),
    velocity: new THREE.Vector3(),
    heading: 0,
    pitch: 0,
    roll: 0,
    yawRate: 0,
    /** 0..1 of flight rpm, for the rotor sound. */
    rotorSpeed: 0,
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    /** On station with a clear line of sight to the player: the wanted level reads this. */
    seesPlayer: false,
    /** Metres above the ground below. */
    altitude: 0,
    distanceToPlayer: Infinity,
    /** Seconds before it may come back after being driven off. */
    cooldown: 0,
    searchlight: { on: false, level: 0, aim: new THREE.Vector3(), end: new THREE.Vector3() },
    marker: null,
    model,
    updateMs: 0,
    update,
    damage,
    hitTest,
    summon,
    dismiss,
    arriveNow,
    stageAt,
    release,
    reset,
  };
  /** Same vector as position, so the minimap and markers can treat it like any other entity. */
  heli.pos = heli.position;
  const gunner = createHelicopterDoorGunner(game, heli);
  heli.gunner = gunner;

  let clock = 0;
  let dispatchTimer = -1;
  let summoned = false;
  let announcedArrival = false;
  let orbitAngle = 0;
  let flankSign = 1;
  let flankBlend = 1;
  let flankTimer = 20;
  let avoidOffset = 0;
  let avoidOffsetTarget = 0;
  let avoidRadius = 0;
  let avoidRadiusTarget = 0;
  let avoidTimer = 0;
  let eyeTimer = 0;
  let lostSightTime = 0;
  let smokeTimer = 0;
  let lightLevel = 0;
  let holdAim = false;
  let playerOk = false;
  const playerPos = new THREE.Vector3();
  const playerVel = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const goalVel = new THREE.Vector3();
  let goalSpeedCap = MAX_SPEED;
  const exitDir = new THREE.Vector3(1, 0, 0);
  const aimVel = new THREE.Vector3();
  const aimTarget = new THREE.Vector3();
  const aimTargetVel = new THREE.Vector3();
  const lens = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const beamEnd = new THREE.Vector3();
  const beamNormal = new THREE.Vector3(0, 1, 0);
  const eye = new THREE.Vector3();
  const sightTarget = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const strength = { beam: 0, pool: 0, halo: 0, glare: 0 };
  const frustum = new THREE.Frustum();
  const projectionScreen = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const statusEvent = { helicopter: heli, reason: '' };
  const sightEvent = { helicopter: heli, seen: false };
  const damageEvent = { helicopter: heli, amount: 0, health: 0, source: null };
  const smokeOptions = { count: 1, scale: 1.3 };
  const sparkOptions = { count: 8 };
  // The suspect's trail: where he drove, so the helicopter can follow him round corners between towers.
  const trailX = new Float32Array(TRAIL_LENGTH);
  const trailZ = new Float32Array(TRAIL_LENGTH);
  const trailSerials = new Float64Array(TRAIL_LENGTH);
  let trailSerial = 0;
  let trailCount = 0;
  let trailHead = 0;
  let routeTimer = 0;
  let followingTrail = false;
  let waypointSerial = 0;
  let directClearCount = 0;
  let scanRequired = 0;
  let scanCap = MAX_SPEED;
  const waypoint = new THREE.Vector3();
  /** Where it is trying to hold station (for debugging views). */
  heli.goal = goal;

  game.events.on('shot:fired', onShotFired);

  /** Run the helicopter for one frame. */
  function update(dt) {
    if (!(dt > 0)) return;
    const started = performance.now();
    if (dt > 0.1) dt = 0.1;
    clock += dt;
    readPlayer();
    const wanted = playerOk && (summoned || wantedLevel() >= MIN_STARS);
    if (heli.cooldown > 0) heli.cooldown = Math.max(0, heli.cooldown - dt);
    runStateMachine(dt, wanted);
    if (heli.active) {
      if (!heli.staged) fly(dt);
      placeModel(dt);
      updateEyes(dt);
      aimSearchlight(dt);
      shineSearchlight(dt);
      gunner.update(dt);
      trailSmoke(dt);
    }
    heli.updateMs = performance.now() - started;
  }

  // ---- when to come and go ----------------------------------------------------------------------

  function runStateMachine(dt, wanted) {
    switch (heli.state) {
      case 'idle':
        if (!wanted || heli.cooldown > 0) {
          dispatchTimer = -1;
          return;
        }
        if (dispatchTimer < 0) dispatchTimer = DISPATCH_DELAY[0] + Math.random() * (DISPATCH_DELAY[1] - DISPATCH_DELAY[0]);
        dispatchTimer -= dt;
        if (dispatchTimer <= 0) launch();
        return;
      case 'inbound':
        if (!wanted) {
          startLeaving('standDown');
          return;
        }
        if (Math.hypot(goal.x - heli.position.x, goal.z - heli.position.z) < 110 && Math.abs(goal.y - heli.position.y) < 45) arrive();
        return;
      case 'onStation':
        if (!wanted && !heli.staged) startLeaving('standDown');
        return;
      case 'leaving':
        if (wanted && heli.cooldown <= 0) {
          heli.state = 'inbound';
          addMarker();
          emitStatus('helicopter:dispatched', 'pursuit');
          return;
        }
        if (outOfView()) hide();
        return;
      case 'withdrawing':
        if (outOfView()) hide();
        return;
      default:
        heli.state = 'idle';
    }
  }

  /** Lift off: appear far away toward PSPD Headquarters, outside the camera's view, and fly in. */
  function launch() {
    dispatchTimer = -1;
    chooseSpawnPoint(heli.position);
    heli.velocity.set(playerPos.x - heli.position.x, 0, playerPos.z - heli.position.z).setLength(45);
    heli.heading = Math.atan2(heli.velocity.x, heli.velocity.z);
    heli.pitch = 0.2;
    heli.roll = 0;
    heli.health = MAX_HEALTH;
    heli.rotorSpeed = 1;
    heli.active = true;
    heli.staged = false;
    heli.state = 'inbound';
    announcedArrival = false;
    lightLevel = 0;
    lostSightTime = 0;
    trailCount = 0;
    followingTrail = false;
    orbitAngle = Math.atan2(heli.position.x - playerPos.x, heli.position.z - playerPos.z);
    heli.searchlight.aim.set(playerPos.x, playerPos.y, playerPos.z);
    aimVel.set(0, 0, 0);
    model.root.visible = true;
    light.setVisible(true);
    addMarker();
    computeGoal(0);
    emitStatus('helicopter:dispatched', 'pursuit');
  }

  function arrive() {
    heli.state = 'onStation';
    if (announcedArrival) return;
    announcedArrival = true;
    emitStatus('helicopter:arrived', 'onStation');
  }

  /** The chase is over: climb away. */
  function startLeaving(reason) {
    heli.state = 'leaving';
    setExitDirection();
    setSees(false);
    removeMarker();
    emitStatus('helicopter:left', reason);
  }

  /** Shot up: break off trailing smoke, and stay away for a minute. */
  function withdraw() {
    heli.state = 'withdrawing';
    heli.cooldown = WITHDRAW_SECONDS;
    setExitDirection();
    setSees(false);
    removeMarker();
    emitStatus('helicopter:left', 'damaged');
  }

  /** Gone beyond the haze: take it out of the world. */
  function hide() {
    heli.active = false;
    heli.state = 'idle';
    heli.staged = false;
    setSees(false);
    model.root.visible = false;
    light.setVisible(false);
    removeMarker();
    heli.velocity.set(0, 0, 0);
    heli.rotorSpeed = 0;
    heli.distanceToPlayer = Infinity;
    lightLevel = 0;
    holdAim = false;
  }

  function chooseSpawnPoint(out) {
    const hq = game.city && game.city.place ? game.city.place('police_hq') : null;
    let bearing;
    if (hq && Math.hypot(hq.x - playerPos.x, hq.z - playerPos.z) > 80) {
      bearing = Math.atan2(hq.x - playerPos.x, hq.z - playerPos.z);
    } else {
      game.camera.getWorldDirection(cameraForward);
      bearing = Math.atan2(cameraForward.x, cameraForward.z) + Math.PI;
    }
    updateFrustum();
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const turn = Math.ceil(attempt / 2) * 0.45 * (attempt % 2 === 1 ? 1 : -1);
      const b = bearing + turn;
      const x = playerPos.x + Math.sin(b) * SPAWN_DISTANCE;
      const z = playerPos.z + Math.cos(b) * SPAWN_DISTANCE;
      const y = Math.max(groundAt(x, z) + SPAWN_HEIGHT, roofline.highestNear(x, z) + ROOF_CLEARANCE);
      out.set(x, y, z);
      sphere.center.copy(out);
      sphere.radius = 16;
      if (!frustum.intersectsSphere(sphere)) return;
    }
  }

  function setExitDirection() {
    exitDir.set(heli.position.x - playerPos.x, 0, heli.position.z - playerPos.z);
    if (exitDir.lengthSq() < 1) exitDir.set(Math.sin(heli.heading), 0, Math.cos(heli.heading));
    exitDir.normalize();
  }

  function outOfView() {
    const d = heli.position.distanceTo(game.camera.position);
    if (d > 950) return true;
    if (d < 380) return false;
    updateFrustum();
    sphere.center.copy(heli.position);
    sphere.radius = 16;
    return !frustum.intersectsSphere(sphere);
  }

  // ---- flying -------------------------------------------------------------------------------------

  /**
   * Chase the station point with inertia. Where towers stand between it and the station at its
   * height it follows the suspect's own trail round the corner instead, and wherever roofs are
   * still in the way ahead it slows and climbs first.
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
    if (!playerOk) return;
    if (trailCount > 0) {
      const last = (trailHead - 1 + TRAIL_LENGTH) % TRAIL_LENGTH;
      if (Math.hypot(playerPos.x - trailX[last], playerPos.z - trailZ[last]) < TRAIL_SPACING) return;
    }
    trailX[trailHead] = playerPos.x;
    trailZ[trailHead] = playerPos.z;
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
      if (roofline.highestNear(ax + (bx - ax) * t, az + (bz - az) * t) + ROOF_CLEARANCE > y + 3) return false;
    }
    return true;
  }

  /** The height that keeps 20 m over the roofs and well clear of the ground at a point. */
  function clearAltitudeAt(x, z) {
    return Math.max(roofline.highestNear(x, z) + ROOF_CLEARANCE + 1.5, groundAt(x, z) + MIN_GROUND_CLEARANCE);
  }

  /**
   * Where the helicopter wants to be: circling the suspect (or the last known position while the
   * police search), flanking ahead of a fast car, and moved round to clear air when towers block.
   */
  function computeGoal(dt) {
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
    let cx = playerPos.x;
    let cz = playerPos.z;
    let vx = playerVel.x;
    let vz = playerVel.z;
    if (search) {
      cx = game.wanted.lastKnown.x;
      cz = game.wanted.lastKnown.z;
      vx = 0;
      vz = 0;
    }
    const speed = Math.hypot(vx, vz);
    const fast = smoothstep(8, 22, speed);
    const blind = state === 'onStation' && lostSightTime > 3;
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
   * Over The Spires the ring round the chase crosses towers: find the nearest bearing (then a wider
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

  function stationHeight(cx, cz, bearing, radius) {
    const x = cx + Math.sin(bearing) * radius;
    const z = cz + Math.cos(bearing) * radius;
    return roofline.highestNear(x, z) + ROOF_CLEARANCE - groundAt(x, z);
  }

  /** Nose down to speed up, bank into turns, and turn to face the suspect (or the way it flies). */
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
      if (gunner.firing || (wantedLevel() >= 5 && heli.seesPlayer && speed < 24)) {
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

  /** Put the model where the flight is, with a hover wobble, and spin it up. */
  function placeModel(dt) {
    const pos = heli.position;
    const speed = Math.hypot(heli.velocity.x, heli.velocity.z);
    const calm = heli.staged ? 0.6 : 1 - smoothstep(10, 30, speed);
    const bob = (0.35 * Math.sin(clock * 1.3) + 0.18 * Math.sin(clock * 2.9 + 1)) * calm;
    model.root.position.set(pos.x, pos.y + bob, pos.z);
    model.root.rotation.set(
      heli.pitch + 0.02 * Math.sin(clock * 1.1) * calm,
      heli.heading,
      heli.roll + 0.025 * Math.sin(clock * 1.7 + 2) * calm,
    );
    model.root.updateMatrixWorld(true);
    heli.rotorSpeed = approach(heli.rotorSpeed, 1, dt * 0.5);
    model.animate(dt, clock, heli.rotorSpeed, nightAmount(), pixelScale());
    heli.altitude = pos.y - groundAt(pos.x, pos.z);
    heli.distanceToPlayer = playerOk ? pos.distanceTo(playerPos) : Infinity;
  }

  // ---- eyes and the searchlight -----------------------------------------------------------------

  /** Four times a second: is the suspect in plain sight from the cabin? */
  function updateEyes(dt) {
    lostSightTime = heli.seesPlayer ? 0 : lostSightTime + dt;
    eyeTimer -= dt;
    if (eyeTimer > 0) return;
    eyeTimer = 0.25;
    let sees = false;
    const onDuty = heli.state === 'onStation' || (heli.state === 'inbound' && heli.distanceToPlayer < 280);
    if (onDuty && playerOk && game.colliders) {
      eye.set(heli.position.x, heli.position.y + 0.5, heli.position.z);
      sightTarget.set(playerPos.x, playerPos.y + 1.1, playerPos.z);
      const distance = eye.distanceTo(sightTarget);
      const range = lerp(280, 190, nightAmount());
      const lit = lightLevel > 0.5 && Math.hypot(beamEnd.x - playerPos.x, beamEnd.z - playerPos.z) < 12;
      if (distance < range || (lit && distance < 420)) sees = game.colliders.lineOfSight(eye, sightTarget);
    }
    setSees(sees);
  }

  function setSees(sees) {
    if (sees === heli.seesPlayer) return;
    heli.seesPlayer = sees;
    if (heli.state !== 'onStation') return;
    sightEvent.seen = sees;
    game.events.emit('helicopter:sighted', sightEvent);
  }

  /** Track the suspect with a sprung lamp (a little lag, a little overshoot); sweep while searching. */
  function aimSearchlight(dt) {
    const aim = heli.searchlight.aim;
    if (holdAim) {
      aim.y = groundAt(aim.x, aim.z);
      return;
    }
    if (isSearching() && !heli.seesPlayer) {
      const last = game.wanted.lastKnown;
      aimTarget.set(last.x + 24 * Math.sin(clock * 0.55), 0, last.z + 18 * Math.sin(clock * 0.83 + 1));
      aimTargetVel.set(13 * Math.cos(clock * 0.55), 0, 15 * Math.cos(clock * 0.83 + 1));
    } else if (playerOk) {
      aimTarget.set(playerPos.x + playerVel.x * 0.1, 0, playerPos.z + playerVel.z * 0.1);
      aimTargetVel.copy(playerVel);
    }
    aimVel.x += ((aimTarget.x - aim.x) * AIM_STIFFNESS + (aimTargetVel.x - aimVel.x) * AIM_DAMPING) * dt;
    aimVel.z += ((aimTarget.z - aim.z) * AIM_STIFFNESS + (aimTargetVel.z - aimVel.z) * AIM_DAMPING) * dt;
    aim.x += aimVel.x * dt;
    aim.z += aimVel.z * dt;
    const lagX = aimTarget.x - aim.x;
    const lagZ = aimTarget.z - aim.z;
    const lag = Math.hypot(lagX, lagZ);
    if (lag > 22) {
      aim.x = aimTarget.x - (lagX / lag) * 22;
      aim.z = aimTarget.z - (lagZ / lag) * 22;
    }
    aim.y = groundAt(aim.x, aim.z);
  }

  /** Point the lamp, find where the light lands (roof, wall or road) and draw beam and pool. */
  function shineSearchlight(dt) {
    const working = heli.state === 'onStation' || (heli.state === 'inbound' && heli.distanceToPlayer < 320);
    lightLevel = approach(lightLevel, working && heli.rotorSpeed > 0.5 ? 1 : 0, dt * 1.5);
    heli.searchlight.on = lightLevel > 0.01;
    heli.searchlight.level = lightLevel;
    const aim = heli.searchlight.aim;
    if (lightLevel > 0.001) {
      lookPoint.copy(aim);
    } else {
      lookPoint.set(heli.position.x + Math.sin(heli.heading) * 12, heli.position.y - 6, heli.position.z + Math.cos(heli.heading) * 12);
    }
    model.searchlight.lookAt(lookPoint);
    model.searchlight.updateMatrixWorld(true);
    if (lightLevel <= 0.001) {
      light.setVisible(false);
      return;
    }
    light.setVisible(true);
    model.lensWorldPosition(lens);
    beamDir.subVectors(aim, lens);
    const distance = beamDir.length();
    beamDir.multiplyScalar(1 / Math.max(0.001, distance));
    const hit = game.colliders ? game.colliders.raycast(lens, beamDir, Math.max(0.5, distance - 0.3)) : null;
    if (hit) {
      beamEnd.copy(hit.point);
      if (hit.collider) beamNormal.copy(hit.normal);
      else groundNormal(beamEnd.x, beamEnd.z);
    } else {
      beamEnd.copy(aim);
      groundNormal(beamEnd.x, beamEnd.z);
    }
    heli.searchlight.end.copy(beamEnd);
    const night = nightAmount();
    const storm = game.weather && typeof game.weather.sandstorm === 'number' ? game.weather.sandstorm : 0;
    strength.beam = lightLevel * lerp(0.075, 0.36, night) * (1 + storm);
    strength.pool = lightLevel * lerp(0.3, 1.25, night) * (1 - 0.4 * storm);
    strength.halo = lightLevel * lerp(0.04, 0.5, night);
    strength.glare = lightLevel * lerp(0.55, 1.0, night);
    light.aim(lens, beamEnd, beamNormal, strength, game.camera.position);
    light.update(clock);
  }

  function groundNormal(x, z) {
    if (game.terrain && game.terrain.normalAt) game.terrain.normalAt(x, z, beamNormal);
    else beamNormal.set(0, 1, 0);
  }

  // ---- damage -------------------------------------------------------------------------------------

  /** Smoke from the engine once it is hurt; a thick black trail while it limps home. */
  function trailSmoke(dt) {
    const leaving = heli.state === 'withdrawing';
    if (!(leaving || heli.health < MAX_HEALTH * 0.5) || !game.effects) return;
    smokeTimer -= dt;
    if (smokeTimer > 0) return;
    smokeTimer = leaving ? 0.09 : 0.35;
    modelToWorld(EXHAUST_POINT, worldPoint);
    const kind = leaving || heli.health < MAX_HEALTH * 0.25 ? 'blackSmoke' : 'smoke';
    game.effects.spawn(kind, worldPoint.x, worldPoint.y, worldPoint.z, smokeOptions);
  }

  /**
   * Hurt the helicopter (bullets from the player, a rocket from a mission). Returns true when it
   * counted. At zero health it pulls out for a minute.
   * @param {number} amount
   * @param {Object} [source]
   */
  function damage(amount, source) {
    if (!heli.active || heli.staged || !(amount > 0)) return false;
    if (heli.state !== 'inbound' && heli.state !== 'onStation') return false;
    heli.health = Math.max(0, heli.health - amount);
    damageEvent.amount = amount;
    damageEvent.health = heli.health;
    damageEvent.source = source || null;
    game.events.emit('helicopter:damaged', damageEvent);
    if (game.effects) {
      modelToWorld(BODY_CENTER, worldPoint);
      game.effects.spawn('sparks', worldPoint.x, worldPoint.y, worldPoint.z, sparkOptions);
    }
    if (heli.health <= 0) withdraw();
    return true;
  }

  /**
   * Distance along a ray (origin, unit direction) to the airframe, or -1 when it misses or is beyond
   * maxDistance. Weapon code may call this to let bullets hit the helicopter.
   */
  function hitTest(ox, oy, oz, dx, dy, dz, maxDistance) {
    if (!heli.active) return -1;
    modelToWorld(BODY_CENTER, worldPoint);
    const cx = worldPoint.x - ox;
    const cy = worldPoint.y - oy;
    const cz = worldPoint.z - oz;
    const along = cx * dx + cy * dy + cz * dz;
    if (along < 0 || along - HIT_RADIUS > maxDistance) return -1;
    const missSq = cx * cx + cy * cy + cz * cz - along * along;
    if (missSq > HIT_RADIUS * HIT_RADIUS) return -1;
    return Math.max(0, along - Math.sqrt(HIT_RADIUS * HIT_RADIUS - missSq));
  }

  /** The player's bullets: a sphere test against the airframe for every shot the player fires. */
  function onShotFired(e) {
    if (!heli.active || !e || e.source === 'helicopter' || e.hit === heli) return;
    const player = game.player;
    if (!player || !e.shooter || e.shooter !== player.character) return;
    const length = Math.hypot(e.dirX || 0, e.dirY || 0, e.dirZ || 0);
    if (!(length > 0)) return;
    const dx = e.dirX / length;
    const dy = e.dirY / length;
    const dz = e.dirZ / length;
    let reach = 260;
    if (Number.isFinite(e.hitX) && Number.isFinite(e.hitY) && Number.isFinite(e.hitZ)) {
      reach = Math.hypot(e.hitX - e.x, e.hitY - e.y, e.hitZ - e.z) + 1.5;
    }
    if (hitTest(e.x, e.y, e.z, dx, dy, dz, reach) < 0) return;
    const catalog = game.catalog;
    const spec = catalog && typeof catalog.weaponById === 'function' ? catalog.weaponById(e.weaponId) : null;
    damage(spec && spec.damage > 0 ? spec.damage : 22, e.shooter);
  }

  // ---- commands for missions and staged scenes ---------------------------------------------------

  /** Call the helicopter in whatever the wanted level (a mission's set piece). */
  function summon() {
    summoned = true;
    if (heli.state === 'idle' && heli.cooldown <= 0) dispatchTimer = 0.5;
  }

  /** Let the wanted level decide again. */
  function dismiss() {
    summoned = false;
  }

  /** Skip the flight in: appear on station over the suspect at once. */
  function arriveNow() {
    readPlayer();
    if (!heli.active) launch();
    avoidTimer = 0;
    computeGoal(0);
    avoidOffset = avoidOffsetTarget;
    avoidRadius = avoidRadiusTarget;
    computeGoal(0);
    heli.position.copy(goal);
    heli.velocity.set(playerVel.x, 0, playerVel.z);
    heli.heading = Math.atan2(playerPos.x - goal.x, playerPos.z - goal.z);
    heli.state = 'onStation';
    lightLevel = 1;
    heli.searchlight.aim.set(playerPos.x, playerPos.y, playerPos.z);
    aimVel.set(0, 0, 0);
    arrive();
  }

  /**
   * Hold the helicopter at a pose for a staged screenshot: { x, y, z, heading?, pitch?, roll?,
   * aimX?, aimZ? }. The searchlight tracks the player unless aimX/aimZ are given. release() lets it fly.
   */
  function stageAt(options) {
    const o = options || {};
    readPlayer();
    if (!heli.active) {
      heli.active = true;
      model.root.visible = true;
      light.setVisible(true);
      addMarker();
    }
    heli.staged = true;
    heli.state = 'onStation';
    announcedArrival = true;
    heli.health = MAX_HEALTH;
    heli.position.set(
      finite(o.x, playerPos.x + 40),
      finite(o.y, playerPos.y + STATION_HEIGHT),
      finite(o.z, playerPos.z + 40),
    );
    heli.velocity.set(0, 0, 0);
    heli.heading = finite(o.heading, Math.atan2(playerPos.x - heli.position.x, playerPos.z - heli.position.z));
    heli.pitch = finite(o.pitch, 0.06);
    heli.roll = finite(o.roll, 0);
    heli.rotorSpeed = 1;
    lightLevel = o.light === false ? 0 : 1;
    holdAim = Number.isFinite(o.aimX) && Number.isFinite(o.aimZ);
    if (holdAim) heli.searchlight.aim.set(o.aimX, 0, o.aimZ);
    else heli.searchlight.aim.set(playerPos.x, playerPos.y, playerPos.z);
    aimVel.set(0, 0, 0);
    return heli;
  }

  function release() {
    heli.staged = false;
    holdAim = false;
  }

  /** Take it out of the world at once (a new game, a loaded save). */
  function reset() {
    hide();
    heli.cooldown = 0;
    summoned = false;
    dispatchTimer = -1;
  }

  // ---- small helpers -----------------------------------------------------------------------------

  function readPlayer() {
    playerOk = false;
    const player = game.player;
    if (!player) return;
    const character = player.character;
    const body = player.vehicle || character;
    if (!body || !body.pos) return;
    playerPos.copy(body.pos);
    if (body.vel) playerVel.copy(body.vel);
    else playerVel.set(0, 0, 0);
    playerOk = player.state !== 'down' && !(character && character.alive === false);
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

  function nightAmount() {
    const night = game.sky && typeof game.sky.night === 'number' ? game.sky.night : 0;
    return night < 0 ? 0 : night > 1 ? 1 : night;
  }

  /** Points per metre at one metre away, for the navigation lights' size on screen. */
  function pixelScale() {
    const camera = game.camera;
    const height = game.renderer && game.renderer.domElement ? game.renderer.domElement.height : 800;
    return height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  function modelToWorld(local, out) {
    out.set(local.x, local.y, local.z);
    return model.root.localToWorld(out);
  }

  function updateFrustum() {
    const camera = game.camera;
    camera.updateMatrixWorld();
    projectionScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projectionScreen);
  }

  function addMarker() {
    if (heli.marker || !game.markers) return;
    heli.marker = game.markers.add({ kind: 'police', entity: heli, label: 'Shaheen-1', flash: true, icon: 'helicopter', color: 0x2f6bff });
  }

  function removeMarker() {
    if (!heli.marker) return;
    if (game.markers) game.markers.remove(heli.marker);
    heli.marker = null;
  }

  function emitStatus(name, reason) {
    statusEvent.reason = reason;
    game.events.emit(name, statusEvent);
  }

  return heli;
}

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
