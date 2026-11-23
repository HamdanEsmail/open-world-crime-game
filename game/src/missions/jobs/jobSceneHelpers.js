// Staging shared by the middle jobs of the story (Market Day, Dock Shift, Paper Trail, Sand Tax):
// camera shots framed on the real city, kerb and open-ground spots read from the road network and
// the collision world, the Dune Jackals' rides and crews, chatter that talks over play without ever
// holding it up, and the little set dressing a job brings along (a desert camp, yard floodlights).

/**
 * A cutscene shot of `focus` (a point or an entity) seen from `distance` metres away along the
 * compass direction `yaw` (0 = from the south), `height` metres up, optionally drifting closer.
 * @returns {{position:Object, lookAt:Object, seconds:number, moveTo?:Object, fov?:number, speaker?:string, text?:string}}
 */
export function framedShot(m, focus, options = {}) {
  const { distance = 30, height = 12, yaw = 0, lookHeight = 1.4, seconds = 4, drift = 0, rise = 0, fov, speaker, text, track = false } = options;
  const at = groundPointOf(m, focus);
  const position = { x: at.x + Math.sin(yaw) * distance, y: at.y + height, z: at.z + Math.cos(yaw) * distance };
  lift(m, position);
  const shot = { position, lookAt: track && focus.pos ? focus : { x: at.x, y: at.y + lookHeight, z: at.z }, seconds };
  if (drift || rise) {
    const toward = distance > 0 ? drift / distance : 0;
    shot.moveTo = { x: position.x + (at.x - position.x) * toward, y: position.y + rise, z: position.z + (at.z - position.z) * toward };
    lift(m, shot.moveTo);
  }
  if (fov) shot.fov = fov;
  if (speaker) shot.speaker = speaker;
  if (text) shot.text = text;
  return shot;
}

/**
 * A point on the nearest driving lane to (x, z), moved `ahead` metres along it, with the lane's
 * heading: where to put a car so it stands in traffic facing the right way.
 * @returns {{x:number, z:number, heading:number, lane:Object|null}}
 */
export function laneSpot(m, x, z, { ahead = 0, maxDistance = 160, filter = null, facing = null } = {}) {
  const roads = m.game.roads;
  let accept = filter;
  if (facing !== null) {
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    accept = (lane) => lane.dirX * fx + lane.dirZ * fz > 0.7 && (!filter || filter(lane));
  }
  const hit = roads && roads.nearestLane ? roads.nearestLane(x, z, maxDistance, accept) : null;
  if (!hit) return { x, z, heading: 0, lane: null };
  const lane = hit.lane;
  const t = clampNumber(hit.t + ahead / Math.max(1, lane.length), 0.04, 0.96);
  return { x: lane.x0 + (lane.x1 - lane.x0) * t, z: lane.z0 + (lane.z1 - lane.z0) * t, heading: lane.heading, lane };
}

/**
 * Like laneSpot, but on the outer lane and slid over to the kerb: where a car is parked. With
 * `facing` (a heading) only lanes running that way are considered; `shift` (0..1) is how far
 * toward the kerb (0 keeps the lane's centre line, where an AI driver can pull up cleanly).
 * @returns {{x:number, z:number, heading:number, lane:Object|null}}
 */
export function kerbSpot(m, x, z, { ahead = 0, maxDistance = 160, facing = null, shift = 1 } = {}) {
  const outer = (lane) => lane.index === lane.edge.lanesEachWay - 1;
  const spot = laneSpot(m, x, z, { ahead, maxDistance, filter: outer, facing });
  if (!spot.lane) return spot;
  const edge = spot.lane.edge;
  const laneWidth = m.game.roads.laneWidth || 3.5;
  const fromCentre = edge.median / 2 + laneWidth * (spot.lane.index + 0.5);
  const toKerb = Math.max(0, edge.half - 1.4 - fromCentre) * shift;
  // The right-hand side of travel is (-dirZ, dirX).
  spot.x += -spot.lane.dirZ * toKerb;
  spot.z += spot.lane.dirX * toKerb;
  return spot;
}

/**
 * A lane near (fromX, fromZ) whose traffic runs toward (toX, toZ): where a chasing car appears.
 * @returns {{x:number, z:number, heading:number, lane:Object|null}}
 */
export function laneToward(m, fromX, fromZ, toX, toZ, { maxDistance = 140 } = {}) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  const spot = laneSpot(m, fromX, fromZ, { maxDistance, filter: (lane) => lane.dirX * ux + lane.dirZ * uz > 0.25 });
  if (!spot.lane) spot.heading = Math.atan2(ux, uz);
  return spot;
}

/**
 * The nearest point to (x, z) where a box of the given half sizes and heading touches nothing static
 * (no wall, container or building): a free spot for a parked vehicle or a standing person.
 * @returns {{x:number, z:number, heading:number}}
 */
export function clearSpot(m, x, z, { halfWidth = 1.2, halfLength = 2.6, heading = 0, search = 30, step = 1.5 } = {}) {
  const colliders = m.game.colliders;
  const terrain = m.game.terrain;
  if (!colliders || !colliders.boxContacts) return { x, z, heading };
  for (let ring = 0; ring * step <= search; ring += 1) {
    const radius = ring * step;
    const samples = ring === 0 ? 1 : Math.max(8, Math.round((Math.PI * 2 * radius) / step));
    for (let s = 0; s < samples; s += 1) {
      const angle = (s / samples) * Math.PI * 2 + ring * 0.37;
      const px = x + Math.sin(angle) * radius;
      const pz = z + Math.cos(angle) * radius;
      if (terrain && terrain.isWater && terrain.isWater(px, pz)) continue;
      if (colliders.boxContacts(px, pz, halfWidth + 0.4, halfLength + 0.4, heading, 0.15, 2.4, SCRATCH).length === 0) {
        return { x: px, z: pz, heading };
      }
    }
  }
  return { x, z, heading };
}

/**
 * `count` free standing spots spread around (x, z) at about `radius` metres, each facing the
 * centre: where a group of guards or brawlers is placed.
 * @returns {{x:number, z:number, heading:number}[]}
 */
export function standingSpots(m, x, z, count, { radius = 10, start = 0, arc = Math.PI * 2, jitter = 0.25 } = {}) {
  const spots = [];
  for (let i = 0; i < count; i += 1) {
    const angle = start + (arc * (i + 0.5)) / count + (Math.random() - 0.5) * jitter;
    const r = radius * (0.8 + Math.random() * 0.4);
    const spot = clearSpot(m, x + Math.sin(angle) * r, z + Math.cos(angle) * r, { halfWidth: 0.5, halfLength: 0.5, search: 12, step: 1 });
    spot.heading = Math.atan2(x - spot.x, z - spot.z);
    spots.push(spot);
  }
  return spots;
}

/** Where a north-south avenue and an east-west street cross, found by their names on the plan. */
export function streetCrossing(m, avenueName, streetName, fallback) {
  const city = m.game.city;
  const avenue = city && city.avenues ? city.avenues.find((road) => road.name === avenueName) : null;
  const street = city && city.streets ? city.streets.find((road) => road.name === streetName) : null;
  return { x: avenue ? avenue.x : fallback.x, z: street ? street.z : fallback.z };
}

/** The open lots of one use ('containerYard', 'marketSquare' ...), nearest first to (x, z). */
export function lotsOfUse(m, use, x, z) {
  const lots = (m.game.city && m.game.city.openLots) || [];
  return lots
    .filter((lot) => lot.use === use)
    .map((lot) => ({ lot, distance: Math.hypot((lot.x0 + lot.x1) / 2 - x, (lot.z0 + lot.z1) / 2 - z) }))
    .sort((a, b) => a.distance - b.distance)
    .map((entry) => entry.lot);
}

/** The centre of an open lot. */
export function lotCentre(lot) {
  return { x: (lot.x0 + lot.x1) / 2, z: (lot.z0 + lot.z1) / 2 };
}

/** A place by id, or a fixed fallback point when the plan lacks it. */
export function placeOr(m, id, fallback) {
  const place = m.place(id);
  return place || { x: fallback.x, z: fallback.z, heading: fallback.heading || 0, curbX: fallback.x, curbZ: fallback.z };
}

/** A landmark by id, or a fixed fallback point when the plan lacks it. */
export function landmarkOr(m, id, fallback) {
  return m.landmark(id) || { x: fallback.x, z: fallback.z, w: fallback.w || 0, d: fallback.d || 0, radius: fallback.radius || 0 };
}

/** Distance on the ground between two points or entities. */
export function apart(a, b) {
  if (!a || !b) return Infinity;
  const pa = a.pos || a;
  const pb = b.pos || b;
  return Math.hypot(pa.x - pb.x, pa.z - pb.z);
}

/** Where the player is now (in a vehicle or on foot). */
export function playerAt(m) {
  return m.game.player ? m.game.player.pos : { x: 0, y: 0, z: 0 };
}

/** The vehicle the player is driving, or null on foot. */
export function playerVehicle(m) {
  return m.game.player ? m.game.player.vehicle : null;
}

/** True when a person is out of the fight: dead, gone or never spawned. */
export function isDown(person) {
  return !person || person.despawned === true || person.alive === false || person.state === 'dead' || person.health <= 0;
}

/** How many of a group are out of the fight. */
export function downCount(people) {
  let count = 0;
  for (const person of people) if (isDown(person)) count += 1;
  return count;
}

/** True when a vehicle is out of the chase: wrecked, sunk or gone. */
export function isWrecked(vehicle) {
  return !vehicle || vehicle.wrecked === true || vehicle.despawned === true || vehicle.sunk === true;
}

/** Share of a vehicle's health left, 0..1. */
export function healthShare(vehicle) {
  if (!vehicle) return 0;
  const full = vehicle.maxHealth || (vehicle.spec && vehicle.spec.health) || 1000;
  return clampNumber(vehicle.health / full, 0, 1);
}

/**
 * Let a promise run on its own: dialogue fired over the action. When the job ends the line is
 * simply dropped instead of surfacing as an unhandled rejection.
 */
export function aside(promise) {
  if (promise && typeof promise.catch === 'function') promise.catch(() => {});
  return promise;
}

/** Run `action` after `seconds` of play without holding up the script (dropped if the job ends first). */
export function later(m, seconds, action) {
  return aside((async () => {
    await m.seconds(seconds);
    action();
  })());
}

/** Lines spoken over play, never awaited: [[speaker, text], ...]. */
export function chatter(m, lines) {
  return aside(m.say(lines));
}

/** A phone call that plays while the player keeps driving or fighting. */
export function ring(m, caller, lines) {
  return aside(m.phone(caller, lines));
}

/**
 * Reactive one-liners: say(key, lines) speaks one of the lines (or one exchange) not used yet,
 * unless something was barked less than `gap` seconds ago or other lines are still waiting to be
 * shown (a quip that arrives late is worse than none). `force` skips both checks; `once` keys
 * fire a single time.
 */
export function createBarks(m, { gap = 5 } = {}) {
  let lastAt = -Infinity;
  const used = new Set();
  const fired = new Set();
  return {
    say(key, options, { once = false, force = false } = {}) {
      const now = m.game.time ? m.game.time.elapsed : 0;
      if (once && fired.has(key)) return false;
      const lines = m.game.story && m.game.story.dialogue;
      if (!force && (now - lastAt < gap || (lines && lines.busy))) return false;
      const fresh = options.filter((option) => !used.has(option));
      const pool = fresh.length > 0 ? fresh : options;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      used.add(pick);
      fired.add(key);
      lastAt = now;
      chatter(m, Array.isArray(pick[0]) ? pick : [pick]);
      return true;
    },
    hasSaid(key) {
      return fired.has(key);
    },
  };
}

/** Event subscriptions that a job drops together when it ends: on(name, handler), clear(). */
export function createListeners(m) {
  const stops = [];
  return {
    on(name, handler) {
      const stop = m.game.events.on(name, handler);
      stops.push(stop);
      return stop;
    },
    clear() {
      while (stops.length > 0) stops.pop()();
    },
  };
}

/**
 * Enemy blips on a group of people, dropped as each one goes down: refresh(), add(person), clear().
 */
export function markFoes(m, people, { label = 'Jackal', color = 0xe4572e } = {}) {
  const tracked = [];
  const marks = {
    add(person) {
      tracked.push({ person, marker: m.marker(person, { label, color, kind: 'enemy', route: false, radius: 1.2, beacon: false }) });
    },
    refresh() {
      for (const entry of tracked) {
        if (entry.marker && isDown(entry.person)) {
          m.clearMarker(entry.marker);
          entry.marker = null;
        }
      }
    },
    clear() {
      for (const entry of tracked) if (entry.marker) m.clearMarker(entry.marker);
      tracked.length = 0;
    },
  };
  for (const person of people) marks.add(person);
  return marks;
}

/**
 * Wait until `needed` of `people` are down, ticking a HUD counter (base + down), dropping their
 * blips and calling onDown(down) each time another one falls.
 */
export function untilDown(m, people, needed, { counter = null, base = 0, marks = null, onDown = null } = {}) {
  let seen = downCount(people);
  return m.until(() => {
    const down = downCount(people);
    if (down !== seen) {
      seen = down;
      if (counter) counter.set(base + down);
      if (marks) marks.refresh();
      if (onDown) onDown(down);
    }
    return down >= needed;
  });
}

/** Dusty red, black and rust: the paint of every Dune Jackal vehicle. */
export const JACKAL_PAINT = [0x8e2b1f, 0x1d1a1a, 0xa8482c];

/**
 * A Dune Jackal vehicle with its crew aboard: a driver with a pistol and, when `crew` is 2, a
 * gunner who leans out and shoots once it gives chase.
 * @returns {{vehicle:Object, driver:Object, gunner:Object|null, people:Object[]}}
 */
export function spawnJackalRide(m, specId, spot, { crew = 2, weapon = 'smg', color, health } = {}) {
  const paint = color !== undefined ? color : JACKAL_PAINT[Math.floor(Math.random() * JACKAL_PAINT.length)];
  const options = { x: spot.x, z: spot.z, heading: spot.heading || 0, color: paint, faction: 'gang' };
  if (health) options.health = health;
  const vehicle = m.spawnVehicle(specId, options);
  const people = [];
  const seats = vehicle && vehicle.spec ? vehicle.spec.seats : 2;
  for (let seat = 0; seat < Math.min(crew, seats); seat += 1) {
    const person = m.spawnPerson({
      archetype: 'gang', kind: 'gang', faction: 'gang', x: spot.x, z: spot.z, heading: spot.heading || 0,
      name: 'Dune Jackal', weapon: seat === 0 ? 'pistol' : weapon, ammo: 240,
    });
    m.seat(vehicle, person, seat);
    people.push(person);
  }
  return { vehicle, driver: people[0] || null, gunner: people[1] || null, people };
}

/**
 * Pitch the Dune Jackals' camp around a clearing: three tents in an arc (Sayf's in the middle),
 * stacked crates and a cooking fire. Solid to people and cars. Returns the tents and remove().
 */
export function pitchJackalCamp(m, centre, { radius = 24, facing = 0 } = {}) {
  const game = m.game;
  const THREE = game.THREE;
  const terrain = game.terrain;
  const ground = (x, z) => (terrain && terrain.heightAt ? terrain.heightAt(x, z) : 0);
  const group = new THREE.Group();
  group.name = 'jackal-camp';
  const materials = [
    new THREE.MeshLambertMaterial({ color: 0x8e2b1f }),
    new THREE.MeshLambertMaterial({ color: 0xd9c39a }),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2b }),
    new THREE.MeshLambertMaterial({ color: 0x2a2320 }),
  ];
  const [redCloth, sandCloth, wood, char] = materials;
  const tentGeometry = new THREE.ConeGeometry(1, 1, 4, 1, false, Math.PI / 4);
  const poleGeometry = new THREE.CylinderGeometry(0.06, 0.06, 1, 5);
  const crateGeometry = new THREE.BoxGeometry(1.3, 1, 1.3);
  const logGeometry = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 5);
  const geometries = [tentGeometry, poleGeometry, crateGeometry, logGeometry];
  const colliders = [];
  const glows = [];
  const tents = [];

  for (let i = 0; i < 3; i += 1) {
    const angle = facing + Math.PI + (i - 1) * 0.62;
    const x = centre.x + Math.sin(angle) * radius;
    const z = centre.z + Math.cos(angle) * radius;
    const size = i === 1 ? 4.6 : 3.2;
    const y = ground(x, z);
    const tent = new THREE.Mesh(tentGeometry, i === 1 ? redCloth : sandCloth);
    tent.scale.set(size, size * 0.85, size);
    tent.position.set(x, y + size * 0.425, z);
    tent.rotation.y = angle;
    tent.castShadow = true;
    tent.receiveShadow = true;
    group.add(tent);
    const pole = new THREE.Mesh(poleGeometry, wood);
    pole.scale.set(1, size * 0.5, 1);
    pole.position.set(x, y + size * 0.85 + size * 0.2, z);
    group.add(pole);
    if (game.colliders && game.colliders.addPost) colliders.push(game.colliders.addPost({ x, z, radius: size * 0.72, y0: y - 1, y1: y + size, kind: 'prop' }));
    const toCentre = Math.atan2(centre.x - x, centre.z - z);
    tents.push({ x, z, size, heading: toCentre, door: { x: x + Math.sin(toCentre) * (size * 0.75 + 1.6), z: z + Math.cos(toCentre) * (size * 0.75 + 1.6) } });
  }

  const crates = new THREE.InstancedMesh(crateGeometry, wood, 7);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const spot = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 7; i += 1) {
    const stackBase = i < 4 ? i : i - 4;
    const angle = facing + Math.PI * 0.5 + (stackBase - 1.5) * 0.12;
    const r = radius * 0.72;
    const x = centre.x + Math.sin(angle) * r;
    const z = centre.z + Math.cos(angle) * r;
    const tier = i < 4 ? 0 : 1;
    spot.set(x, ground(x, z) + 0.5 + tier, z);
    rotation.setFromAxisAngle(yAxis, angle + i * 0.3);
    matrix.compose(spot, rotation, scale);
    crates.setMatrixAt(i, matrix);
    if (tier === 0 && game.colliders && game.colliders.addPost) colliders.push(game.colliders.addPost({ x, z, radius: 0.85, y0: spot.y - 1.5, y1: spot.y + 1.5, kind: 'prop' }));
  }
  crates.instanceMatrix.needsUpdate = true;
  crates.castShadow = true;
  crates.frustumCulled = false;
  group.add(crates);

  const fireY = ground(centre.x, centre.z);
  for (let i = 0; i < 3; i += 1) {
    const log = new THREE.Mesh(logGeometry, char);
    log.position.set(centre.x, fireY + 0.15, centre.z);
    log.rotation.set(Math.PI / 2, (i * Math.PI) / 3, 0, 'YXZ');
    group.add(log);
  }
  const glowSystem = game.effects && game.effects.glows;
  if (glowSystem && glowSystem.add) glows.push(glowSystem.add({ x: centre.x, y: fireY + 0.9, z: centre.z, color: 0xff8a2a, size: 4.5, flicker: 0.8 }));

  game.scene.add(group);
  return {
    tents,
    sayfTent: tents[1],
    remove() {
      game.scene.remove(group);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      crates.dispose();
      for (const collider of colliders) if (collider) game.colliders.remove(collider);
      for (const glow of glows) if (glow && glowSystem.remove) glowSystem.remove(glow);
    },
  };
}

/** Warm floodlight glows on poles at the given points (a yard at night). Returns remove(). */
export function hangFloodlights(m, points, { color = 0xffd59a, size = 7, height = 9 } = {}) {
  const glowSystem = m.game.effects && m.game.effects.glows;
  const glows = [];
  if (glowSystem && glowSystem.add) {
    for (const point of points) glows.push(glowSystem.add({ x: point.x, y: height, z: point.z, color, size, flicker: 0.05 }));
  }
  return {
    remove() {
      for (const glow of glows) if (glow && glowSystem.remove) glowSystem.remove(glow);
    },
  };
}

/** Clamp a number between two bounds. */
export function clampNumber(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** A point `metres` ahead of an entity along its heading (negative: behind it). */
export function aheadOf(entity, metres) {
  const heading = entity.heading || 0;
  return { x: entity.pos.x + Math.sin(heading) * metres, z: entity.pos.z + Math.cos(heading) * metres };
}

function groundPointOf(m, focus) {
  const p = focus && focus.pos ? focus.pos : focus;
  const terrain = m.game.terrain;
  const y = p.y !== undefined ? p.y : terrain && terrain.heightAt ? terrain.heightAt(p.x, p.z) : 0;
  return { x: p.x, y, z: p.z };
}

function lift(m, point) {
  const terrain = m.game.terrain;
  if (!terrain || !terrain.heightAt) return;
  const floor = terrain.heightAt(point.x, point.z) + 1.8;
  if (point.y < floor) point.y = floor;
}

const SCRATCH = [];
