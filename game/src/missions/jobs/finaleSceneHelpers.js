// Staging for the last act of the story (Dress Rehearsal, Golden Goose, Khamsin Rising, The Vane Job
// and both endings): the Vane Spire's plaza, lobby door and kerb read from the city plan, the Gate
// and Hangar 2, lanes to stand cars on, camera angles, the crew's talk over the action, the stall
// meter of a rammed truck, and Idris Vane's gold, stacked in bars and later split four ways.

/**
 * The Vane Spire as the finale uses it, all read from game.city: the tower's footprint, the lobby
 * doors in its south face, the open plaza around it, and the Gold Street kerb where the crew parks.
 */
export function spireStage(m) {
  const city = m.game.city;
  const mark = m.landmark('vaneSpire') || { x: -63.25, z: -400 };
  const building = mark.building !== undefined && city.buildings ? city.buildings[mark.building] : null;
  const w = building ? building.w : 62;
  const d = building ? building.d : 62;
  const h = building ? building.h : 330;
  const lot = (city.openLots || []).find((open) => open.use === 'spirePlaza') || { x0: mark.x - 84, x1: mark.x + 84, z0: mark.z - 88, z1: mark.z + 88 };
  const doorPlace = m.place('vane_spire_door') || { x: mark.x, z: lot.z1 + 2.5, curbX: mark.x, curbZ: lot.z1 + 7.2, heading: Math.PI };
  const towerSouth = mark.z + d / 2;
  return {
    x: mark.x,
    z: mark.z,
    w,
    d,
    h,
    towerSouth,
    towerWest: mark.x - w / 2,
    towerEast: mark.x + w / 2,
    plaza: { x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z1 },
    /** The lobby doors, on the plaza just in front of the tower's south face. */
    door: { x: mark.x, z: towerSouth + 2.6 },
    /** The sidewalk at the plaza's south edge (the job's contact point) and the kerb beyond it. */
    street: { x: doorPlace.x, z: doorPlace.z },
    curb: { x: doorPlace.curbX, z: doorPlace.curbZ },
    /** Facing the tower from the street. */
    facingTower: doorPlace.heading === undefined ? Math.PI : doorPlace.heading,
  };
}

/** The Port Sarab Gate on the Dune Highway, and the southbound lane through it. */
export function gateStage(m) {
  const gate = m.landmark('cityGate') || { x: 40, z: 900 };
  const lane = lanePoint(m, gate.x, gate.z, 0, { maxDistance: 60 });
  return { x: gate.x, z: gate.z, laneX: lane.x, laneZ: lane.z, heading: lane.heading };
}

/** Hangar 2 at Sarab Airfield: the building and the apron in front of its doors (toward the runway). */
export function hangarStage(m) {
  const hangar = m.landmark('airfieldHangar') || { x: 900, z: 1680, w: 46, d: 36 };
  const w = hangar.w || 46;
  return { x: hangar.x, z: hangar.z, w, d: hangar.d || 36, apron: { x: hangar.x - w / 2 - 11, z: hangar.z }, doorHeading: -Math.PI / 2 };
}

/**
 * The crew's voice over the action: talk() queues lines without ever holding the script up, and
 * react() lets someone quip at something that just happened, but only when nobody is mid-sentence.
 */
export function createCrewVoice(m) {
  let speaking = 0;
  let lastReaction = -1e9;
  const decks = new Map();
  const voice = {
    /** Queue lines ([[speaker, text], ...]) to play over the action. */
    talk(lines) {
      if (!lines || lines.length === 0) return;
      speaking += 1;
      const done = () => {
        speaking = Math.max(0, speaking - 1);
      };
      Promise.resolve(m.say(lines)).then(done, done);
    },
    /** One quip from `pool`, never the same twice until the pool is spent; false when it kept quiet. */
    react(pool, cooldown = 7) {
      const now = m.game.time ? m.game.time.elapsed : 0;
      if (speaking > 0 || now - lastReaction < cooldown || !pool || pool.length === 0) return false;
      let deck = decks.get(pool);
      if (!deck || deck.length === 0) {
        deck = pool.slice().sort(() => Math.random() - 0.5);
        decks.set(pool, deck);
      }
      lastReaction = now;
      voice.talk([deck.pop()]);
      return true;
    },
    /** True while lines fired from here are still playing. */
    get busy() {
      return speaking > 0;
    },
    /** A wait that resolves once everything said through this voice has been heard (or `most` seconds pass). */
    quiet(most = 8) {
      return m.any([m.until(() => speaking === 0), m.seconds(most)]);
    },
  };
  return voice;
}

/**
 * Event listeners and set pieces that belong to one run of a job: everything registered here is
 * dropped by close(), which a job calls in its `finally` so a failed run leaves nothing behind.
 */
export function openJobScope(m) {
  const closers = [];
  let open = true;
  return {
    /** Listen to a game event for as long as the job runs. */
    on(name, handler) {
      const events = m.game.events;
      const wrapped = (payload) => {
        if (!open) return;
        handler(payload);
      };
      events.on(name, wrapped);
      closers.push(() => events.off(name, wrapped));
    },
    /** Run `fn` when the job ends, however it ends (set pieces, overlays). */
    adopt(fn) {
      if (typeof fn === 'function') closers.push(fn);
    },
    /** Every frame while the job runs: fn(dt). Uses the job's own waits, so it ends with the job. */
    every(fn) {
      let alive = true;
      closers.push(() => {
        alive = false;
      });
      background(m.until(() => {
        if (!alive || !open) return true;
        fn(m.game.time ? m.game.time.dt : 1 / 60);
        return false;
      }));
    },
    close() {
      open = false;
      for (const close of closers.splice(0, closers.length)) {
        try {
          close();
        } catch (error) {
          console.warn('finale: clean-up failed', error);
        }
      }
    },
    get open() {
      return open;
    },
  };
}

/**
 * The engine of a vehicle the player must ram or shoot to a stop: hard hits from the player's car
 * and bullets fill a stall meter (a HUD counter counting the engine down from 100); when it is full
 * the driver loses the engine, coasts and brakes, and onStall() runs once.
 * options: label, hits (good rams to stall it), bulletShare (fraction of its health in bullets to
 * stall it), onStall(), onHit(progress, speed)
 */
export function trackStall(m, scope, vehicle, options = {}) {
  const hits = options.hits || 5;
  const bulletShare = options.bulletShare || 0.25;
  const counter = m.counter(options.label || 'ENGINE', 100, 100);
  let progress = 0;
  let stalled = false;
  let lastHit = -1e9;
  const state = {
    get progress() {
      return progress;
    },
    get stalled() {
      return stalled;
    },
    /** Push the meter by hand (0..1). */
    add,
    clear() {
      counter.clear();
    },
  };
  function add(amount, speed = 0) {
    if (stalled || !(amount > 0)) return;
    progress = Math.min(1, progress + amount);
    counter.set(Math.max(0, Math.round((1 - progress) * 100)));
    if (options.onHit) options.onHit(progress, speed);
    if (progress >= 1) {
      stalled = true;
      m.stopDriving(vehicle);
      if (options.onStall) options.onStall();
    }
  }
  scope.on('vehicle:collision', (event) => {
    const mine = m.game.player ? m.game.player.vehicle : null;
    if (!mine || !event || !event.other) return;
    const pair = (event.vehicle === vehicle && event.other === mine) || (event.vehicle === mine && event.other === vehicle);
    if (!pair) return;
    const now = m.game.time.elapsed;
    const speed = event.speed || 0;
    if (speed < 3.5 || now - lastHit < 0.4) return;
    lastHit = now;
    // A glancing nudge counts for little, a full-speed ram for a lot.
    add(Math.min(1.8, 0.35 + speed / 12) / hits, speed);
  });
  scope.on('vehicle:damaged', (event) => {
    if (!event || event.vehicle !== vehicle || event.kind !== 'bullet') return;
    add(event.amount / Math.max(1, vehicle.maxHealth * bulletShare), 0);
  });
  return state;
}

/**
 * A point on the nearest lane running along `heading` (0 = +Z), `ahead` metres further along it,
 * with the lane's own heading; `kerb` slides it to the kerb for a parked car.
 * @returns {{x:number, z:number, heading:number}}
 */
export function lanePoint(m, x, z, heading, { ahead = 0, kerb = false, maxDistance = 120 } = {}) {
  const roads = m.game.roads;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const filter = (lane) => lane.dirX * fx + lane.dirZ * fz > 0.5 && (!kerb || lane.index === lane.edge.lanesEachWay - 1);
  const hit = roads && roads.nearestLane ? roads.nearestLane(x, z, maxDistance, filter) : null;
  if (!hit) return { x, z, heading };
  const lane = hit.lane;
  const along = Math.max(1.5, Math.min(lane.length - 1.5, hit.t * lane.length + ahead));
  let px = lane.x0 + lane.dirX * along;
  let pz = lane.z0 + lane.dirZ * along;
  if (kerb) {
    const edge = lane.edge;
    const fromCentre = edge.median / 2 + (roads.laneWidth || 3.5) * (lane.index + 0.5);
    const shift = Math.max(0, edge.half - 1.4 - fromCentre);
    px += -lane.dirZ * shift;
    pz += lane.dirX * shift;
  }
  return { x: px, z: pz, heading: lane.heading };
}

/**
 * A cutscene shot of `focus` (a point or an entity) from `distance` metres away on the compass
 * bearing `bearing` (0 = from the south, PI/2 = from the east), `height` metres above the ground,
 * optionally pushing in, rising and sliding sideways while it plays.
 */
export function shotOf(m, focus, options = {}) {
  const { bearing = 0, distance = 20, height = 5, look = 1.5, seconds = 4, push = 0, rise = 0, slide = 0, fov, speaker, text, follow = false } = options;
  const at = focus && focus.pos ? focus.pos : focus;
  const ground = groundY(m, at.x, at.z);
  const position = { x: at.x + Math.sin(bearing) * distance, y: 0, z: at.z + Math.cos(bearing) * distance };
  position.y = Math.max(groundY(m, position.x, position.z) + 0.8, ground + height);
  const shot = {
    position,
    lookAt: follow && focus.pos ? focus : { x: at.x, y: (at.y !== undefined && !focus.pos ? at.y : ground) + look, z: at.z },
    seconds,
  };
  if (push || rise || slide) {
    const k = distance > 0 ? push / distance : 0;
    const sideX = Math.cos(bearing);
    const sideZ = -Math.sin(bearing);
    shot.moveTo = {
      x: position.x + (at.x - position.x) * k + sideX * slide,
      y: position.y + rise,
      z: position.z + (at.z - position.z) * k + sideZ * slide,
    };
  }
  if (fov) shot.fov = fov;
  if (speaker) shot.speaker = speaker;
  if (text) shot.text = text;
  return shot;
}

/**
 * A conversation shot over the listener's shoulder onto the speaker's face. Works wherever the two
 * stand, so a scene plays the same however the player walked up. Turns both to face each other.
 */
export function overShoulder(m, speakerEntity, listenerEntity, options = {}) {
  const { seconds = 3.5, speaker, text, side = 1, back = 1.3, height = 1.72, push = 0.25, fov = 48 } = options;
  const s = speakerEntity.pos;
  const l = listenerEntity.pos;
  faceTo(speakerEntity, l);
  faceTo(listenerEntity, s);
  let dx = l.x - s.x;
  let dz = l.z - s.z;
  const length = Math.hypot(dx, dz) || 1;
  dx /= length;
  dz /= length;
  const rx = -dz * side;
  const rz = dx * side;
  const ground = groundY(m, l.x, l.z);
  const position = { x: l.x + dx * back + rx * 0.62, y: ground + height, z: l.z + dz * back + rz * 0.62 };
  const lookAt = { x: s.x, y: groundY(m, s.x, s.z) + 1.55, z: s.z };
  const shot = { position, lookAt, seconds, fov };
  if (push) shot.moveTo = { x: position.x - dx * push, y: position.y, z: position.z - dz * push };
  if (speaker) shot.speaker = speaker;
  if (text) shot.text = text;
  return shot;
}

/** Both people side-on in one frame, the camera off to `side` of the line between them. */
export function twoShot(m, a, b, options = {}) {
  const { seconds = 3.5, speaker, text, side = 1, distance = 5.5, height = 1.6, slide = 0.6, fov = 50 } = options;
  const mid = { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 };
  let dx = b.pos.x - a.pos.x;
  let dz = b.pos.z - a.pos.z;
  const length = Math.hypot(dx, dz) || 1;
  dx /= length;
  dz /= length;
  faceTo(a, b.pos);
  faceTo(b, a.pos);
  const nx = -dz * side;
  const nz = dx * side;
  const reach = distance + length * 0.35;
  const ground = groundY(m, mid.x, mid.z);
  const position = { x: mid.x + nx * reach, y: ground + height, z: mid.z + nz * reach };
  const shot = {
    position,
    lookAt: { x: mid.x, y: ground + 1.35, z: mid.z },
    moveTo: { x: position.x + dx * slide, y: position.y, z: position.z + dz * slide },
    seconds,
    fov,
  };
  if (speaker) shot.speaker = speaker;
  if (text) shot.text = text;
  return shot;
}

/**
 * Stage someone for a scene: out of any seat at once, standing at (x, z) facing `heading`. For the
 * job's own people only (the crew, a hostage), between shots where nobody sees them move.
 */
export function placePerson(m, person, x, z, heading = 0) {
  if (!person || person.alive === false) return;
  if (person.vehicle) m.game.characters?.exitVehicle?.(person, { instant: true });
  person.pos.set(x, groundY(m, x, z), z);
  if (person.vel) person.vel.set(0, 0, 0);
  person.heading = heading;
  if (person.intent) person.intent.faceYaw = heading;
}

/** Turn a standing person toward a point (their intent's faceYaw; the mover keeps it while they idle). */
export function faceTo(person, point) {
  if (!person || !person.intent || !point) return;
  const p = point.pos || point;
  person.intent.faceYaw = Math.atan2(p.x - person.pos.x, p.z - person.pos.z);
}

/** The ground's height at a point (0 in the city, the dunes outside it). */
export function groundY(m, x, z) {
  const terrain = m.game.terrain;
  const y = terrain && terrain.heightAt ? terrain.heightAt(x, z) : 0;
  return Number.isFinite(y) ? Math.max(y, -1) : 0;
}

/** Metres between two points or entities on the ground plane. */
export function distanceBetween(a, b) {
  const pa = a && a.pos ? a.pos : a;
  const pb = b && b.pos ? b.pos : b;
  if (!pa || !pb) return Infinity;
  return Math.hypot(pa.x - pb.x, pa.z - pb.z);
}

/** Distance from the player to a point or entity. */
export function playerDistance(m, target) {
  const player = m.game.player;
  return player && player.character ? distanceBetween(player.pos, target) : Infinity;
}

/** Seconds a fair clock should give for the drive between two points: the GPS length at `pace` m/s plus `slack`. */
export function fairDriveSeconds(m, from, to, pace = 18, slack = 25) {
  const roads = m.game.roads;
  if (!roads || !roads.findRoute) return Math.round(Math.hypot(to.x - from.x, to.z - from.z) / pace + slack);
  const route = roads.findRoute(from.x, from.z, to.x, to.z);
  return Math.round(roads.routeLength(route) / pace + slack);
}

/** Let a promise run on its own: the job ending rejects it quietly instead of as an unhandled error. */
export function background(promise) {
  if (promise && typeof promise.then === 'function') promise.then(undefined, () => {});
  return promise;
}

/** Send a car along the roads to a point without waiting for it. */
export function driveOff(m, vehicle, x, z, options = {}) {
  return background(m.driveTo(vehicle, x, z, options));
}

/** Walk someone somewhere without waiting for them. */
export function strollTo(m, person, x, z, pace = 'walk') {
  return background(m.walkTo(person, x, z, { pace }));
}

/** If the player has stepped out of `vehicle`, ask him back into it and wait until he is. */
export async function backInto(m, vehicle, text) {
  const player = m.game.player;
  if (player && player.vehicle === vehicle) return;
  m.objective(text || 'Get back in');
  await m.inVehicle(vehicle);
}

/**
 * Up to `count` standing spots on open ground around (x, z): clear of buildings, planters, cars and
 * each other, and never on top of the player. Used to post guards and police on the Spire plaza.
 */
export function freeSpotsAround(m, x, z, radius, count, { minGap = 1.8, playerGap = 7 } = {}) {
  const spots = [];
  const colliders = m.game.colliders;
  const vehicles = m.game.vehicles;
  const player = m.game.player && m.game.player.character;
  const found = [];
  for (let attempt = 0; attempt < count * 40 && spots.length < count; attempt += 1) {
    const angle = attempt * 2.39996;
    const r = radius * Math.sqrt(((attempt % 30) + 0.5) / 30);
    const px = x + Math.sin(angle) * r;
    const pz = z + Math.cos(angle) * r;
    found.length = 0;
    if (colliders && colliders.query && colliders.query(px, pz, 0.8, found).length > 0) continue;
    if (vehicles && vehicles.nearest && vehicles.nearest(px, pz, 3)) continue;
    if (player && Math.hypot(player.pos.x - px, player.pos.z - pz) < playerGap) continue;
    if (spots.some((spot) => Math.hypot(spot.x - px, spot.z - pz) < minGap)) continue;
    spots.push({ x: px, z: pz });
  }
  return spots;
}

/** Read the Cover meter: { trust, badge }. */
export function coverValues(m) {
  const story = m.game.story || {};
  return { trust: Number(story.crewTrust ?? 50), badge: Number(story.badge ?? 50) };
}

/** True when someone was killed by the player, on foot or behind the wheel. */
export function killedByPlayer(m, source) {
  if (!source) return false;
  const player = m.game.player;
  if (!player) return false;
  return source === player.character || source === player.vehicle || source.kind === 'player' || source.isPlayer === true
    || (source.driver && source.driver.kind === 'player');
}

/**
 * Keep the khamsin blowing once this job is over (the job's own weather is put back when it ends):
 * at `intensity` 0 the sky clears instead. For the storm that carries from Khamsin Rising into the
 * Vane Job, and the clear sky after the finale.
 */
export function leaveWeatherAfterJob(m, intensity, rampSeconds = 1) {
  const events = m.game.events;
  const jobId = m.job ? m.job.id : null;
  const ours = (event) => !jobId || !event || !event.mission || event.mission.id === jobId;
  const stopCompleted = events.on('mission:completed', (event) => {
    if (!ours(event)) return;
    stopCompleted();
    stopFailed();
    const weather = m.game.weather;
    if (!weather) return;
    if (intensity > 0) weather.start?.(intensity, rampSeconds);
    else weather.clear?.(rampSeconds);
  });
  const stopFailed = events.on('mission:failed', (event) => {
    if (!ours(event)) return;
    stopCompleted();
    stopFailed();
  });
}

/** A hard equipment case on the ground (the cutting gear, Mina's kit): returns dispose(). */
export function buildGearCase(m, x, z, heading = 0, color = 0xe4572e) {
  const THREE = m.game.THREE;
  const group = new THREE.Group();
  const shell = new THREE.MeshLambertMaterial({ color });
  const trim = new THREE.MeshLambertMaterial({ color: 0x22252b });
  const body = new THREE.BoxGeometry(1.3, 0.62, 0.72);
  const band = new THREE.BoxGeometry(1.34, 0.08, 0.76);
  const tank = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 12);
  const caseMesh = new THREE.Mesh(body, shell);
  caseMesh.position.y = 0.31;
  const bandMesh = new THREE.Mesh(band, trim);
  bandMesh.position.y = 0.5;
  const tankMesh = new THREE.Mesh(tank, trim);
  tankMesh.position.set(0.9, 0.55, 0);
  group.add(caseMesh, bandMesh, tankMesh);
  group.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  group.position.set(x, groundY(m, x, z), z);
  group.rotation.y = heading;
  m.game.scene.add(group);
  return () => {
    m.game.scene.remove(group);
    for (const thing of [shell, trim, body, band, tank]) thing.dispose();
  };
}

/**
 * The gold set down somewhere in the world: `shares` stacks of bars side by side on the ground,
 * facing `heading` (four shares at the Dune Hideout, the evidence pile on the plaza). Returns dispose().
 */
export function buildGoldShares(m, x, z, heading = 0, shares = 4) {
  const THREE = m.game.THREE;
  const owned = [];
  const keep = (thing) => {
    owned.push(thing);
    return thing;
  };
  const group = new THREE.Group();
  group.name = 'gold-shares';
  const goldMat = keep(new THREE.MeshStandardMaterial({ color: 0xf2c04a, emissive: 0x6a3c00, emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.32 }));
  const clothMat = keep(new THREE.MeshLambertMaterial({ color: 0x2c2f38 }));
  const piles = [];
  for (let i = 0; i < shares; i += 1) piles.push({ x: (i - (shares - 1) / 2) * 1.9, z: 0, layers: 3 });
  group.add(stackGoldBars(THREE, piles, goldMat, keep, 0.75));
  // A rolled-open duffel under each share.
  for (const pile of piles) {
    const bag = new THREE.Mesh(keep(new THREE.BoxGeometry(1.6, 0.12, 1.1)), clothMat);
    bag.position.set(pile.x, 0.06, pile.z);
    group.add(bag);
  }
  group.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  group.position.set(x, groundY(m, x, z), z);
  group.rotation.y = heading;
  m.game.scene.add(group);
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      m.game.scene.remove(group);
      for (const thing of owned) thing.dispose?.();
    },
  };
}

/**
 * Gold bars on each pallet {x, z, layers}: one instanced mesh, each layer a little smaller than the
 * one below. `keep` collects geometry for disposal; `scale` shrinks the bars for piles on the sand.
 */
export function stackGoldBars(THREE, pallets, material, keep, scale = 1) {
  const barW = 0.42 * scale;
  const barH = 0.13 * scale;
  const barD = 0.2 * scale;
  const perRow = 5;
  const rows = 6;
  let count = 0;
  for (const pallet of pallets) for (let layer = 0; layer < pallet.layers; layer += 1) count += Math.max(1, (perRow - Math.floor(layer / 2)) * (rows - Math.floor(layer / 2)));
  const mesh = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(barW, barH, barD)), material, count);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();
  let index = 0;
  for (const pallet of pallets) {
    for (let layer = 0; layer < pallet.layers; layer += 1) {
      const shrink = Math.floor(layer / 2);
      const across = perRow - shrink;
      const deep = rows - shrink;
      const crosswise = layer % 2 === 1;
      for (let i = 0; i < across; i += 1) {
        for (let j = 0; j < deep; j += 1) {
          const lx = (i - (across - 1) / 2) * (barW + 0.02 * scale);
          const lz = (j - (deep - 1) / 2) * (barD + 0.03 * scale);
          rotation.makeRotationY(crosswise ? 0.04 : -0.03);
          matrix.makeTranslation(pallet.x + lx, 0.16 * scale + barH / 2 + layer * barH, pallet.z + lz).multiply(rotation);
          if (index < count) mesh.setMatrixAt(index, matrix);
          index += 1;
        }
      }
    }
  }
  mesh.count = Math.min(index, count);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}
