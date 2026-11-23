// The people and cars a job script directs: a getaway car that takes the right-hand lanes to a
// point, a Jackal lieutenant who flees the player through the streets, pickups that chase and ram
// him while the gunmen inside shoot from the windows, guards who walk to their posts and then fight.
// Built on the vehicles' autopilot and the gunfight AI; obeys nothing but physics (and the traffic
// lights, when a script asks it to).

/**
 * Build the actors of one job run.
 * @param {Object} game
 * @param {{owner:string}} run
 * @returns {{driveTo:Function, fleeFrom:Function, pursue:Function, stopDriving:Function, walkTo:Function,
 *   hostile:Function, calm:Function, update:Function, release:Function, releaseAll:Function, recordOf:Function}}
 */
export function createJobActors(game, run) {
  /** One record per directed entity; entity.ai points at it while the job directs it. */
  const records = [];
  let nodeIndex = null;

  /**
   * Drive `vehicle` along the roads to (x, z). Returns its arrival state {arrived, failed}, which the
   * job context turns into a promise. options: speed (m/s, default 18), stop (default true),
   * aggression 0..1, careful (brake for what is ahead), obeySignals (stop at red lights).
   */
  function driveTo(vehicle, x, z, options = {}) {
    const record = take(vehicle, 'vehicle');
    if (!record) return failedArrival();
    record.mode = 'route';
    record.goalX = x;
    record.goalZ = z;
    record.speed = options.speed || 18;
    record.stop = options.stop !== false;
    record.aggression = options.aggression === undefined ? 0.45 : options.aggression;
    record.careful = options.careful === undefined ? record.aggression < 0.65 : !!options.careful;
    record.obeySignals = !!options.obeySignals;
    planRoute(record, x, z);
    return record.arrival;
  }

  /** Keep `vehicle` driving away from the player along the roads, re-planning as he closes in. */
  function fleeFrom(vehicle, options = {}) {
    const record = take(vehicle, 'vehicle');
    if (!record) return;
    record.mode = 'flee';
    record.speed = options.speed || topSpeedOf(vehicle) * 0.86;
    record.aggression = options.aggression === undefined ? 0.85 : options.aggression;
    record.careful = false;
    record.obeySignals = false;
    record.replanIn = 0;
  }

  /** Chase the player and ram him (a PIT on his rear quarter); armed passengers shoot from the windows. */
  function pursue(vehicle, options = {}) {
    const record = take(vehicle, 'vehicle');
    if (!record) return;
    record.mode = 'pursue';
    record.aggression = options.aggression === undefined ? 0.8 : options.aggression;
    record.speed = options.speed || topSpeedOf(vehicle) * 0.97;
    record.accuracy = options.accuracy === undefined ? 0.32 : options.accuracy;
    record.careful = false;
    record.replanIn = 0;
    record.sightIn = 0;
    record.seen = false;
  }

  /** Brake to a halt and hold there. */
  function stopDriving(vehicle) {
    const record = take(vehicle, 'vehicle');
    if (record) record.mode = 'stop';
  }

  /** Walk (or run: pace 'walk' | 'run' | 'sprint') to (x, z); returns the arrival state. */
  function walkTo(person, x, z, options = {}) {
    const record = take(person, 'person');
    if (!record) return failedArrival();
    record.mode = 'walk';
    record.goalX = x;
    record.goalZ = z;
    record.pace = options.pace || 'walk';
    const distance = Math.hypot(x - person.pos.x, z - person.pos.z);
    record.deadline = distance / (PACE_SPEED[record.pace] || 2) * 2 + 6;
    if (person.vehicle) game.characters?.exitVehicle?.(person, {});
    return record.arrival;
  }

  /** Turn a person on the player: the gunfight AI when it is there, a plain brawler otherwise. */
  function hostile(person, options = {}) {
    const record = take(person, 'person');
    if (!record) return;
    person.tags.hostile = true;
    record.accuracy = options.accuracy === undefined ? 0.45 : options.accuracy;
    record.style = options.style || 'cover';
    const fights = game.weapons && game.weapons.ai;
    const target = game.player && game.player.character;
    if (fights && typeof fights.engage === 'function' && target) {
      fights.engage(person, target, { accuracy: record.accuracy, style: record.style, leash: options.leash, bravery: options.bravery });
      record.mode = 'engaged';
    } else {
      record.mode = 'brawl';
    }
  }

  /** Stand a person down: guns lowered, standing still. */
  function calm(person) {
    if (!person) return;
    game.weapons?.ai?.disengage?.(person);
    person.tags.hostile = false;
    const record = take(person, 'person');
    if (record) record.mode = 'idle';
    clearIntent(person);
  }

  /** Steer every directed car and person for this frame. */
  function update(dt) {
    for (let i = records.length - 1; i >= 0; i -= 1) {
      const record = records[i];
      if (record.type === 'vehicle') updateVehicle(record, dt);
      else updatePerson(record, dt);
    }
  }

  function updateVehicle(record, dt) {
    const vehicle = record.entity;
    if (vehicle.wrecked || vehicle.sunk || vehicle.despawned) {
      endRecord(record, false);
      return;
    }
    if (vehicle.isPlayer && !record.forPlayer) {
      endRecord(record, false);
      return;
    }
    if (record.hadDriver && !record.forPlayer && (!vehicle.driver || vehicle.driver.alive === false)) {
      if (!record.arrival.arrived) record.arrival.failed = true;
      record.mode = 'stop';
    }
    const autopilot = game.vehicles && game.vehicles.autopilot;
    if (!autopilot || !vehicle.dynamics) return;
    if (record.mode === 'route' || record.mode === 'wander') followRoute(record, autopilot, dt);
    else if (record.mode === 'flee') flee(record, autopilot, dt);
    else if (record.mode === 'pursue') chase(record, autopilot, dt);
    else if (record.mode === 'stop') autopilot.stopVehicle(vehicle, true);
  }

  /** Follow the planned waypoints; slow for what is ahead and for red lights; stop at the end. */
  function followRoute(record, autopilot, dt) {
    const vehicle = record.entity;
    const route = record.route;
    if (!route || route.length === 0) {
      autopilot.stopVehicle(vehicle, true);
      record.arrival.arrived = true;
      return;
    }
    const speedNow = Math.abs(vehicle.speed);
    let target = route[record.index];
    let d = Math.hypot(target.x - vehicle.pos.x, target.z - vehicle.pos.z);
    const lookAhead = Math.max(7, speedNow * 0.55);
    while (record.index < route.length - 1 && d < lookAhead) {
      record.index += 1;
      target = route[record.index];
      d = Math.hypot(target.x - vehicle.pos.x, target.z - vehicle.pos.z);
    }
    if (record.mode === 'wander' && record.index >= route.length - 2) extendWander(record);
    let speed = record.speed;
    if (record.careful) speed = Math.min(speed, clearRoadSpeed(vehicle, autopilot, speedNow));
    if (record.obeySignals) speed = Math.min(speed, signalSpeed(record, vehicle));
    const last = record.index >= route.length - 1 && record.mode === 'route';
    if (last) {
      autopilot.driveToward(vehicle, target.x, target.z, speed, { stopAtTarget: record.stop, arriveRadius: 4, aggression: record.aggression });
      const arrived = record.stop ? d < 6.5 && speedNow < 1.2 : d < 10;
      if (arrived && !record.arrival.arrived) {
        record.arrival.arrived = true;
        if (record.stop) record.mode = 'stop';
        else startWander(record);
      }
    } else if (speed < 0.6) {
      autopilot.stopVehicle(vehicle, false);
    } else {
      autopilot.driveToward(vehicle, target.x, target.z, speed, { aggression: record.aggression, allowReverse: true });
    }
    // Wedged somewhere for a long while: plan again from here.
    if (record.mode === 'route') {
      if (d < record.bestDistance - 2) {
        record.bestDistance = d;
        record.stuckFor = 0;
      } else if (speed > 1) {
        record.stuckFor += dt;
        if (record.stuckFor > 9) planRoute(record, record.goalX, record.goalZ);
      }
    }
  }

  /** Run from the player: a destination well away from him, re-planned every few seconds. */
  function flee(record, autopilot, dt) {
    const vehicle = record.entity;
    record.replanIn -= dt;
    if (record.replanIn <= 0 || !record.route || record.index >= record.route.length - 2) {
      const player = game.player;
      const from = player && player.character ? player.pos : null;
      let ax = from ? vehicle.pos.x - from.x : Math.sin(vehicle.heading);
      let az = from ? vehicle.pos.z - from.z : Math.cos(vehicle.heading);
      const length = Math.hypot(ax, az) || 1;
      ax /= length;
      az /= length;
      const swing = (Math.random() - 0.5) * 0.9;
      const cs = Math.cos(swing);
      const sn = Math.sin(swing);
      const gx = clampWorldX(vehicle.pos.x + (ax * cs - az * sn) * 280);
      const gz = clampWorldZ(vehicle.pos.z + (az * cs + ax * sn) * 280);
      planRoute(record, gx, gz);
      record.replanIn = 7;
    }
    const route = record.route;
    let target = route[record.index];
    let d = Math.hypot(target.x - vehicle.pos.x, target.z - vehicle.pos.z);
    const lookAhead = Math.max(8, Math.abs(vehicle.speed) * 0.6);
    while (record.index < route.length - 1 && d < lookAhead) {
      record.index += 1;
      target = route[record.index];
      d = Math.hypot(target.x - vehicle.pos.x, target.z - vehicle.pos.z);
    }
    autopilot.driveToward(vehicle, target.x, target.z, record.speed, { aggression: record.aggression, allowReverse: true });
  }

  /** Hunt the player: ram when close and in sight, otherwise take the roads to where he is. */
  function chase(record, autopilot, dt) {
    const vehicle = record.entity;
    const player = game.player;
    if (!player || !player.character || player.state === 'down') {
      autopilot.stopVehicle(vehicle, false);
      return;
    }
    const pos = player.pos;
    const d = Math.hypot(pos.x - vehicle.pos.x, pos.z - vehicle.pos.z);
    record.sightIn -= dt;
    if (record.sightIn <= 0) {
      record.sightIn = 0.3;
      record.seen = d < 60 && seesPlayer(vehicle);
    }
    const target = player.vehicle;
    if (target && record.seen && d < 50) {
      autopilot.chaseVehicle(vehicle, target, { ram: true, aggression: record.aggression, topSpeed: record.speed });
    } else if (!target && d < 14) {
      autopilot.stopVehicle(vehicle, false);
    } else {
      record.replanIn -= dt;
      if (record.replanIn <= 0 || !record.route) {
        planRoute(record, pos.x, pos.z);
        record.replanIn = 2;
      }
      const route = record.route;
      let point = route[record.index];
      let pd = Math.hypot(point.x - vehicle.pos.x, point.z - vehicle.pos.z);
      while (record.index < route.length - 1 && pd < Math.max(8, Math.abs(vehicle.speed) * 0.6)) {
        record.index += 1;
        point = route[record.index];
        pd = Math.hypot(point.x - vehicle.pos.x, point.z - vehicle.pos.z);
      }
      autopilot.driveToward(vehicle, point.x, point.z, record.speed, { aggression: record.aggression, allowReverse: true });
    }
    shootFromWindows(record, vehicle, d, dt);
  }

  /** Armed passengers (and an armed driver once stopped) open fire on the player in range. */
  function shootFromWindows(record, vehicle, distance, dt) {
    const weapons = game.weapons;
    if (!weapons || typeof weapons.aiAttack !== 'function' || distance > 55) return;
    const target = game.player.character;
    const passengers = vehicle.passengers || [];
    for (let i = 0; i < passengers.length; i += 1) {
      const gunman = passengers[i];
      if (gunman && gunman.alive !== false && gunman.weaponIndex >= 0) weapons.aiAttack(gunman, target, dt, { accuracy: record.accuracy });
    }
    const driver = vehicle.driver;
    if (driver && driver.alive !== false && driver.weaponIndex >= 0 && Math.abs(vehicle.speed) < 2 && distance < 30) {
      weapons.aiAttack(driver, target, dt, { accuracy: record.accuracy });
    }
  }

  function updatePerson(record, dt) {
    const person = record.entity;
    if (person.alive === false || person.despawned) {
      endRecord(record, false);
      return;
    }
    if (record.mode === 'walk') walk(record, person, dt);
    else if (record.mode === 'brawl') brawl(record, person, dt);
  }

  function walk(record, person, dt) {
    if (person.vehicle) return;
    const intent = person.intent;
    const dx = record.goalX - person.pos.x;
    const dz = record.goalZ - person.pos.z;
    const d = Math.hypot(dx, dz);
    record.deadline -= dt;
    if (d < 0.9 || record.deadline <= 0) {
      clearIntent(person);
      record.mode = 'idle';
      record.arrival.arrived = true;
      return;
    }
    intent.moveX = dx / d;
    intent.moveZ = dz / d;
    intent.pace = d < 2.5 && record.pace !== 'walk' ? 'walk' : record.pace;
    intent.faceYaw = null;
    intent.gesture = null;
  }

  /** The fallback fighter when there is no gunfight AI: shoot if armed, otherwise close in and punch. */
  function brawl(record, person, dt) {
    const target = game.player && game.player.character;
    const intent = person.intent;
    if (!target || target.alive === false) {
      clearIntent(person);
      return;
    }
    const dx = target.pos.x - person.pos.x;
    const dz = target.pos.z - person.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const armed = person.weaponIndex >= 0 && game.weapons && typeof game.weapons.aiAttack === 'function';
    if (armed && d < 45) {
      game.weapons.aiAttack(person, target, dt, { accuracy: record.accuracy });
      if (record.style === 'rush' && d > 9) {
        intent.moveX = dx / d;
        intent.moveZ = dz / d;
        intent.pace = 'run';
      }
      return;
    }
    intent.faceYaw = Math.atan2(dx, dz);
    if (d > 1.4) {
      intent.moveX = dx / d;
      intent.moveZ = dz / d;
      intent.pace = d > 6 ? 'run' : 'walk';
      intent.fire = false;
    } else {
      intent.moveX = 0;
      intent.moveZ = 0;
      intent.fire = !intent.fire;
    }
  }

  /** Let go of one entity: it keeps its place in the world but nobody steers it any more. */
  function release(entity) {
    const index = records.findIndex((record) => record.entity === entity);
    if (index !== -1) endRecord(records[index], true);
  }

  /** Let go of everything (the job is over). */
  function releaseAll() {
    for (let i = records.length - 1; i >= 0; i -= 1) endRecord(records[i], true);
  }

  /** The record directing an entity, or null. */
  function recordOf(entity) {
    return records.find((record) => record.entity === entity) || null;
  }

  /** Take charge of an entity (or renew the charge), superseding any earlier order's arrival. */
  function take(entity, type) {
    if (!entity || entity.alive === false || entity.wrecked) return null;
    let record = recordOf(entity);
    if (!record) {
      record = { entity, type, mission: true, owner: run.owner, mode: 'idle', route: null, index: 0, arrival: { arrived: false, failed: false } };
      records.push(record);
    } else if (!record.arrival.arrived && !record.arrival.failed) {
      record.arrival.failed = true;
      record.arrival.superseded = true;
    }
    record.arrival = { arrived: false, failed: false };
    record.bestDistance = Infinity;
    record.stuckFor = 0;
    if (type === 'vehicle') {
      record.forPlayer = !!entity.isPlayer;
      record.hadDriver = !!entity.driver;
      entity.parked = false;
      entity.tags.mission = true;
      game.vehicles?.autopilot?.reset?.(entity);
      game.vehicles?.wake?.(entity);
    }
    entity.ai = record;
    return record;
  }

  function endRecord(record, released) {
    const index = records.indexOf(record);
    if (index !== -1) records.splice(index, 1);
    if (!record.arrival.arrived) record.arrival.failed = true;
    const entity = record.entity;
    if (entity.ai === record) entity.ai = null;
    if (!released) return;
    if (record.type === 'vehicle') {
      const c = entity.controls;
      if (c && !entity.isPlayer) {
        c.throttle = 0;
        c.steer = 0;
        c.brake = 0.6;
        c.handbrake = Math.abs(entity.speed) < 1;
      }
    } else {
      if (record.mode === 'engaged') game.weapons?.ai?.disengage?.(entity);
      clearIntent(entity);
    }
  }

  /**
   * Turn the GPS route between the vehicle and (x, z) into waypoints along the right-hand lane: each
   * road segment shifted into its lane, corners where the lanes cross, the target itself last.
   */
  function planRoute(record, x, z) {
    const vehicle = record.entity;
    const route = laneRoute(vehicle.pos.x, vehicle.pos.z, x, z);
    record.route = route;
    record.index = 0;
    record.bestDistance = Infinity;
    record.stuckFor = 0;
    const fx = Math.sin(vehicle.heading);
    const fz = Math.cos(vehicle.heading);
    while (record.index < route.length - 1) {
      const p = route[record.index];
      const dx = p.x - vehicle.pos.x;
      const dz = p.z - vehicle.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 9 || (d < 25 && dx * fx + dz * fz < -2)) record.index += 1;
      else break;
    }
  }

  function laneRoute(fromX, fromZ, toX, toZ) {
    const roads = game.roads;
    if (!roads || typeof roads.findRoute !== 'function') return [{ x: toX, z: toZ, node: null }];
    const raw = roads.findRoute(fromX, fromZ, toX, toZ);
    const segments = [];
    for (let i = 0; i < raw.length - 2; i += 1) {
      const a = raw[i];
      const b = raw[i + 1];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.5) continue;
      const dx = (b.x - a.x) / length;
      const dz = (b.z - a.z) / length;
      const offset = laneOffset(roads, a, b, dx, dz);
      segments.push({ ax: a.x - dz * offset, az: a.z + dx * offset, bx: b.x - dz * offset, bz: b.z + dx * offset, dx, dz, node: nodeAt(b.x, b.z) });
    }
    const out = [];
    for (let i = 0; i < segments.length; i += 1) {
      const s = segments[i];
      const n = segments[i + 1];
      if (i === 0) out.push({ x: s.ax, z: s.az, node: null });
      if (!n) {
        out.push({ x: s.bx, z: s.bz, node: s.node });
        continue;
      }
      const dot = s.dx * n.dx + s.dz * n.dz;
      if (dot > 0.96) {
        out.push({ x: (s.bx + n.ax) / 2, z: (s.bz + n.az) / 2, node: s.node });
      } else if (dot < -0.9) {
        out.push({ x: s.bx, z: s.bz, node: s.node }, { x: n.ax, z: n.az, node: null });
      } else {
        const cross = s.dx * n.dz - s.dz * n.dx;
        const t = ((n.ax - s.bx) * n.dz - (n.az - s.bz) * n.dx) / cross;
        if (Math.abs(t) < 25) out.push({ x: s.bx + s.dx * t, z: s.bz + s.dz * t, node: s.node });
        else out.push({ x: (s.bx + n.ax) / 2, z: (s.bz + n.az) / 2, node: s.node });
      }
    }
    out.push({ x: toX, z: toZ, node: null });
    return out;
  }

  /** How far right of a road's centre line its lane for this direction runs. */
  function laneOffset(roads, a, b, dx, dz) {
    const hit = roads.nearestLane((a.x + b.x) / 2, (a.z + b.z) / 2, 20, (lane) => lane.dirX * dx + lane.dirZ * dz > 0.85);
    if (!hit) return 2;
    const lane = hit.lane;
    return (lane.x0 - a.x) * -dz + (lane.z0 - a.z) * dx;
  }

  /** After arriving with stop: false, keep driving along whatever lane is ahead. */
  function startWander(record) {
    record.mode = 'wander';
    const vehicle = record.entity;
    const fx = Math.sin(vehicle.heading);
    const fz = Math.cos(vehicle.heading);
    const hit = game.roads?.nearestLane?.(vehicle.pos.x, vehicle.pos.z, 40, (lane) => lane.dirX * fx + lane.dirZ * fz > 0.5);
    if (!hit) {
      record.mode = 'stop';
      return;
    }
    record.wanderLane = hit.lane;
    record.route = [{ x: hit.lane.x1, z: hit.lane.z1, node: hit.lane.to }];
    record.index = 0;
    extendWander(record);
  }

  function extendWander(record) {
    let lane = record.wanderLane;
    if (!lane || !lane.next || lane.next.length === 0) return;
    let pick = 0;
    for (let i = 0; i < lane.next.length; i += 1) if (lane.turns[i] === 'straight') pick = i;
    if (lane.turns[pick] !== 'straight') pick = Math.floor(Math.random() * lane.next.length);
    lane = lane.next[pick];
    record.wanderLane = lane;
    record.route.push({ x: lane.x0, z: lane.z0, node: null }, { x: lane.x1, z: lane.z1, node: lane.to });
    if (record.route.length > 12) {
      record.route.splice(0, 4);
      record.index = Math.max(0, record.index - 4);
    }
  }

  /** The speed that keeps a careful driver off the bumper of whatever is ahead. */
  function clearRoadSpeed(vehicle, autopilot, speedNow) {
    const ahead = autopilot.obstacleAhead(vehicle, 8 + speedNow * 1.4);
    if (ahead.distance === Infinity) return Infinity;
    const room = Math.max(0, ahead.distance - 3.5);
    const theirs = ahead.vehicle ? Math.max(0, ahead.vehicle.speed) : 0;
    return Math.max(0, Math.min(theirs + room * 0.35, Math.sqrt(2 * 5 * room)));
  }

  /** Below a red or yellow light: the speed that stops at the line. */
  function signalSpeed(record, vehicle) {
    const point = record.route[record.index];
    const node = point && point.node;
    if (!node || !node.signal || !game.roads.signalPhase) return Infinity;
    const d = Math.hypot(node.x - vehicle.pos.x, node.z - vehicle.pos.z);
    if (d > 45 || d < node.trim) return Infinity;
    const eastWest = Math.abs(Math.sin(vehicle.heading)) > Math.abs(Math.cos(vehicle.heading));
    const phase = game.roads.signalPhase(node);
    if ((eastWest ? phase.ew : phase.ns) === 'green') return Infinity;
    const room = d - node.trim - 2;
    if (room < 1.5) return Math.abs(vehicle.speed) > 6 ? Infinity : 0;
    return Math.sqrt(2 * 4.5 * room);
  }

  function seesPlayer(vehicle) {
    const colliders = game.colliders;
    const player = game.player;
    if (!colliders || typeof colliders.lineOfSight !== 'function') return true;
    EYE_A.x = vehicle.pos.x;
    EYE_A.y = vehicle.pos.y + 1.3;
    EYE_A.z = vehicle.pos.z;
    EYE_B.x = player.pos.x;
    EYE_B.y = player.pos.y + 1.1;
    EYE_B.z = player.pos.z;
    return colliders.lineOfSight(EYE_A, EYE_B);
  }

  function nodeAt(x, z) {
    if (!nodeIndex) {
      nodeIndex = new Map();
      for (const node of game.roads.nodes || []) nodeIndex.set(`${node.x},${node.z}`, node);
    }
    return nodeIndex.get(`${x},${z}`) || null;
  }

  function topSpeedOf(vehicle) {
    const profile = vehicle.dynamics && vehicle.dynamics.profile;
    return (profile && profile.topSpeed) || (vehicle.spec && vehicle.spec.topSpeed) || 30;
  }

  function clampWorldX(x) {
    const world = game.config.world;
    return Math.max(world.minX + 60, Math.min(world.maxX - 60, x));
  }

  function clampWorldZ(z) {
    const world = game.config.world;
    return Math.max(-760, Math.min(world.maxZ - 60, z));
  }

  return { driveTo, fleeFrom, pursue, stopDriving, walkTo, hostile, calm, update, release, releaseAll, recordOf };
}

/** Clear what a person wants to do: stand still, hands empty. */
function clearIntent(person) {
  const intent = person && person.intent;
  if (!intent) return;
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.fire = false;
  intent.aim = false;
  intent.jump = false;
}

function failedArrival() {
  return { arrived: false, failed: true };
}

const PACE_SPEED = { walk: 1.8, run: 4.2, sprint: 6.6 };
const EYE_A = { x: 0, y: 0, z: 0 };
const EYE_B = { x: 0, y: 0, z: 0 };
