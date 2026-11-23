// PSPD roadblocks. From three stars, while the suspect drives, every 20 to 35 seconds the police
// close the road he is heading down, 250 to 400 m ahead and out of his sight: two cruisers nose to
// nose across the lanes leaving one gap a skilled driver can thread, striped barriers lining it,
// officers firing from behind the cars and, from four stars, a spike strip across the gap. Behind
// him (or when the heat dies) each roadblock is cleared away where he cannot see it.
// Becomes game.roadblocks.
import { createRoadblockSitePlanner } from './roadblockSitePlanner.js';
import { createRoadblockBarriers } from './roadblockBarriers.js';
import { createSpikeStrips } from './spikeStrips.js';

const MIN_STARS = 3;
const SPIKES_FROM_STARS = 4;
const INTERVAL = [20, 35];
const RETRY_SECONDS = 2.5;
const MAX_ALIVE = 2;
const LIFETIME = 90;
const PASSED_DISTANCE = 250;
const FORGOTTEN_DISTANCE = 650;
const GAP = 3.8;
const NOSE_ANGLE = 0.3;
const LANE_WIDTH = 3.5;
const OFFICER_RANGE = 75;
const ATTACK_OPTIONS = { accuracy: 0.3 };

/**
 * Create the roadblock system.
 * @returns {{list: Object[], update: Function, clearAll: Function, placeAt: Function, requestNow: Function,
 *   setEnabled: Function, spikeStrips: Object, barriers: Object}}
 */
export function createRoadblocks(game) {
  const planner = createRoadblockSitePlanner(game);
  const barriers = createRoadblockBarriers(game);
  const spikeStrips = createSpikeStrips(game);
  const system = {
    /** Live roadblocks: {id, x, z, heading, street, district, spikes, cars, officers, barriers, strip, distance, along, breached}. */
    list: [],
    enabled: true,
    planning: false,
    spikeStrips,
    barriers,
    planner,
    updateMs: 0,
    update,
    clearAll,
    placeAt,
    requestNow,
    setEnabled,
  };
  let timer = randomInterval();
  let wasChasing = false;
  let nextId = 1;
  const keepAway = [];

  game.events.on('vehicle:despawned', (e) => forgetEntity(e && e.vehicle, 'cars'));
  game.events.on('character:despawned', (e) => forgetEntity(e && e.character, 'officers'));

  /** Plan the next roadblock while the chase is on; tend the ones standing. */
  function update(dt) {
    if (!(dt > 0)) return;
    const started = performance.now();
    const level = wantedLevel();
    const player = game.player;
    const vehicle = player ? player.vehicle : null;
    const chasing = system.enabled && level >= MIN_STARS && !!vehicle && player.state !== 'down';
    if (chasing && !wasChasing) timer = randomInterval() * 0.6;
    wasChasing = chasing;
    if (chasing && system.list.length < MAX_ALIVE) planAhead(dt, vehicle, level);
    else if (system.planning) {
      planner.cancel();
      system.planning = false;
    }
    for (let i = system.list.length - 1; i >= 0; i -= 1) tend(system.list[i], dt, level);
    barriers.update(dt);
    spikeStrips.update(dt);
    system.updateMs = performance.now() - started;
  }

  /** Count down; then search the road ahead a few candidate spots per frame. */
  function planAhead(dt, vehicle, level) {
    if (!system.planning) {
      timer -= dt;
      if (timer > 0) return;
      keepAway.length = 0;
      for (const roadblock of system.list) keepAway.push(roadblock);
      let dirX = vehicle.vel.x;
      let dirZ = vehicle.vel.z;
      if (Math.hypot(dirX, dirZ) < 3) {
        dirX = Math.sin(vehicle.heading);
        dirZ = Math.cos(vehicle.heading);
      }
      system.planning = planner.begin(vehicle.pos.x, vehicle.pos.z, dirX, dirZ, keepAway);
      if (!system.planning) timer = RETRY_SECONDS;
      return;
    }
    const result = planner.step(3);
    if (result === 'pending') return;
    system.planning = false;
    if (result === 'found') {
      build(planner.site, level >= SPIKES_FROM_STARS, null, level);
      timer = randomInterval();
    } else {
      timer = RETRY_SECONDS;
    }
  }

  /**
   * Set up a roadblock across the carriageway of `site.lane` at the site. The across axis runs to the
   * right of travel; s measures it from the road's centre line.
   */
  function build(site, spikes, gapSide, level) {
    const lane = site.lane;
    const edge = lane.edge;
    const dX = lane.dirX;
    const dZ = lane.dirZ;
    const rX = -dZ;
    const rZ = dX;
    const offset = edge.median / 2 + LANE_WIDTH * (lane.index + 0.5);
    const centreX = site.x - rX * offset;
    const centreZ = site.z - rZ * offset;
    const point = (s, along, out) => {
      out.x = centreX + rX * s + dX * along;
      out.z = centreZ + rZ * s + dZ * along;
      return out;
    };
    // A divided road is closed on our side; an undivided one from kerb to kerb.
    const s0 = edge.median > 0 ? edge.median / 2 + 0.3 : -edge.half + 0.3;
    const s1 = edge.half - 0.3;
    const gapRight = gapSide ? gapSide === 'right' : Math.random() < 0.5;
    const toward = gapRight ? -1 : 1;
    const gapEdge = gapRight ? s1 - GAP : s0 + GAP;
    const farEdge = gapRight ? s0 : s1;

    const roadblock = {
      id: nextId,
      x: 0, z: 0, dirX: dX, dirZ: dZ, rightX: rX, rightZ: rZ, centreX, centreZ,
      heading: Math.atan2(dX, dZ), facing: Math.atan2(-dX, -dZ),
      spanMid: (s0 + s1) / 2, spanHalf: (s1 - s0) / 2 + 1,
      street: '', district: '', spikes: !!spikes, gapSide: gapRight ? 'right' : 'left',
      cars: [], officers: [], barriers: [], strip: null, marker: null,
      age: 0, distance: Infinity, along: -Infinity, lastAlong: null, breached: false, retiring: false, retireTime: 0,
    };
    nextId += 1;
    const spot = { x: 0, z: 0 };

    // Two cruisers nose to nose, tilted toward the oncoming driver; the near one's tail marks the gap.
    const nearSpec = specOf('pspd_interceptor');
    const farId = level >= SPIKES_FROM_STARS && Math.random() < 0.5 ? 'pspd_enforcer' : 'pspd_interceptor';
    const farSpec = specOf(farId);
    const cos = Math.cos(NOSE_ANGLE);
    const sin = Math.sin(NOSE_ANGLE);
    const reach = (spec) => (spec.length + 0.15) * cos + (spec.width / 2) * sin + 0.1;
    const meet = gapEdge + toward * reach(nearSpec);
    point(meet, 0, spot);
    roadblock.x = spot.x;
    roadblock.z = spot.z;
    parkCruiser(roadblock, 'pspd_interceptor', nearSpec, spot, toward, cos, sin, rX, rZ, dX, dZ);
    parkCruiser(roadblock, farId, farSpec, spot, -toward, cos, sin, rX, rZ, dX, dZ);

    // Barriers: fill any room left between the far car and the far edge, and line the gap.
    const farEnd = meet + toward * reach(farSpec);
    const room = (farEdge - farEnd) * toward;
    if (room > 1.1) {
      const count = Math.max(1, Math.floor(room / 1.95));
      for (let k = 0; k < count; k += 1) {
        const s = farEnd + toward * (room * (k + 0.5)) / count;
        point(s, 0.6, spot);
        addBarrier(roadblock, spot.x, spot.z, roadblock.heading);
      }
    }
    const gapOuter = gapRight ? s1 + 0.7 : s0 - 0.7;
    for (const along of [-4.5, 0.5]) {
      point(gapOuter, along, spot);
      addBarrier(roadblock, spot.x, spot.z, roadblock.heading + Math.PI / 2);
    }
    point(gapEdge + toward * 0.9, -6.5, spot);
    addBarrier(roadblock, spot.x, spot.z, roadblock.heading - toward * 0.35);

    // From four stars a stinger across the gap, a few metres in front of the cars.
    if (spikes) {
      point(gapEdge - toward * (GAP / 2), -5.5, spot);
      roadblock.strip = spikeStrips.lay(spot.x, spot.z, rX, rZ, GAP + 1.4);
    }

    // Officers behind the cars, guns toward the oncoming driver.
    const officerCount = level >= SPIKES_FROM_STARS ? 3 : 2;
    const posts = [meet + toward * 1.3, meet - toward * 1.8, meet + toward * 3.6];
    for (let k = 0; k < officerCount; k += 1) {
      point(posts[k], 3.4 + (k % 2) * 0.8, spot);
      addOfficer(roadblock, spot.x, spot.z);
    }

    const city = game.city;
    roadblock.street = city && city.streetNameAt ? city.streetNameAt(roadblock.x, roadblock.z) : '';
    const district = city && city.districtAt ? city.districtAt(roadblock.x, roadblock.z) : null;
    roadblock.district = district ? district.name : '';
    if (game.markers) {
      roadblock.marker = game.markers.add({
        kind: 'police', pos: { x: roadblock.x, y: 0, z: roadblock.z }, label: 'Roadblock', icon: 'roadblock', color: 0x2f6bff, owner: 'roadblocks',
      });
    }
    system.list.push(roadblock);
    game.events.emit('roadblock:placed', {
      roadblock, x: roadblock.x, z: roadblock.z, street: roadblock.street, district: roadblock.district, spikes: roadblock.spikes,
    });
    return roadblock;
  }

  /** Park one cruiser with its nose at `nose`, pointing across the road (sign) and tilted toward the driver. */
  function parkCruiser(roadblock, specId, spec, nose, sign, cos, sin, rX, rZ, dX, dZ) {
    if (!game.vehicles || !spec) return;
    const fX = rX * sign * cos - dX * sin;
    const fZ = rZ * sign * cos - dZ * sin;
    const back = spec.length / 2 + 0.15;
    const vehicle = game.vehicles.spawn(specId, {
      x: nose.x - fX * back, z: nose.z - fZ * back, heading: Math.atan2(fX, fZ), faction: 'police', parked: true,
    });
    if (!vehicle) return;
    vehicle.controls.siren = true;
    vehicle.controls.handbrake = true;
    vehicle.controls.headlights = true;
    vehicle.tags.roadblock = true;
    vehicle.tags.roadblockId = roadblock.id;
    vehicle.ai = { owner: 'roadblock', roadblock };
    roadblock.cars.push(vehicle);
  }

  function addBarrier(roadblock, x, z, heading) {
    const barrier = barriers.place(x, z, heading);
    if (barrier) roadblock.barriers.push(barrier);
  }

  function addOfficer(roadblock, x, z) {
    const characters = game.characters;
    if (!characters || !characters.spawn) return;
    const officer = characters.spawn({ kind: 'officer', faction: 'police', archetype: 'officer', x, z, heading: roadblock.facing });
    if (!officer) return;
    officer.ai = { owner: 'roadblock', roadblock };
    officer.tags.roadblock = true;
    game.weapons?.give?.(officer, 'pistol', 999);
    roadblock.officers.push(officer);
  }

  /** Each frame: has he come through, do the officers shoot, is it time to clear it away? */
  function tend(roadblock, dt, level) {
    roadblock.age += dt;
    const player = game.player;
    const body = player ? player.vehicle || player.character : null;
    if (body && body.pos) {
      const dx = body.pos.x - roadblock.x;
      const dz = body.pos.z - roadblock.z;
      const along = dx * roadblock.dirX + dz * roadblock.dirZ;
      const across = (body.pos.x - roadblock.centreX) * roadblock.rightX + (body.pos.z - roadblock.centreZ) * roadblock.rightZ;
      roadblock.distance = Math.hypot(dx, dz);
      roadblock.along = along;
      if (!roadblock.breached && roadblock.lastAlong !== null && roadblock.lastAlong < -0.5 && along >= -0.5
        && Math.abs(across - roadblock.spanMid) < roadblock.spanHalf + 3) {
        roadblock.breached = true;
        game.events.emit('roadblock:breached', { roadblock, spiked: !!(player.vehicle && player.vehicle.tags.tyresBurst) });
      }
      roadblock.lastAlong = along;
      const engage = !roadblock.retiring && level >= 1 && along < 15 && roadblock.distance < OFFICER_RANGE;
      for (const officer of roadblock.officers) {
        if (officer.alive === false || !officer.ai || officer.ai.owner !== 'roadblock') continue;
        if (engage && player.character && game.weapons && game.weapons.aiAttack) game.weapons.aiAttack(officer, player.character, dt, ATTACK_OPTIONS);
        else standGuard(officer, roadblock);
      }
      if (!roadblock.retiring && ((along > 0 && roadblock.distance > PASSED_DISTANCE) || roadblock.age > LIFETIME
        || level === 0 || roadblock.distance > FORGOTTEN_DISTANCE)) roadblock.retiring = true;
    }
    if (!roadblock.retiring) return;
    roadblock.retireTime += dt;
    if (roadblock.retireTime > 25 || roadblock.distance > 450 || !planner.inView(roadblock.x, 1.5, roadblock.z, 16)) dismantle(roadblock);
  }

  function standGuard(officer, roadblock) {
    const intent = officer.intent;
    if (!intent) return;
    intent.moveX = 0;
    intent.moveZ = 0;
    intent.fire = false;
    intent.aim = false;
    intent.faceYaw = roadblock.facing;
  }

  /** Take a roadblock away: cars (unless the player took one), officers, barriers, strip and marker. */
  function dismantle(roadblock) {
    const index = system.list.indexOf(roadblock);
    if (index !== -1) system.list.splice(index, 1);
    const playerVehicle = game.player ? game.player.vehicle : null;
    for (const vehicle of roadblock.cars) {
      if (vehicle === playerVehicle || vehicle.isPlayer) {
        vehicle.tags.roadblock = false;
        if (vehicle.ai && vehicle.ai.owner === 'roadblock') vehicle.ai = null;
      } else if (!vehicle.despawned && game.vehicles) {
        game.vehicles.despawn(vehicle);
      }
    }
    for (const officer of roadblock.officers) {
      if (officer.ai && officer.ai.owner === 'roadblock' && game.characters && game.characters.despawn) game.characters.despawn(officer);
    }
    for (const barrier of roadblock.barriers) barriers.remove(barrier);
    if (roadblock.strip) spikeStrips.remove(roadblock.strip);
    if (roadblock.marker && game.markers) game.markers.remove(roadblock.marker);
    roadblock.cars.length = 0;
    roadblock.officers.length = 0;
    roadblock.barriers.length = 0;
    roadblock.strip = null;
    roadblock.marker = null;
    game.events.emit('roadblock:removed', { roadblock });
  }

  /** Remove every roadblock at once (a new game, a mission that wants clear roads). */
  function clearAll() {
    while (system.list.length) dismantle(system.list[system.list.length - 1]);
    if (system.planning) planner.cancel();
    system.planning = false;
  }

  /**
   * Set up a roadblock right now on the lane nearest (x, z) that runs along `heading`, without the
   * sight check: for missions and staged scenes. options: {spikes?, gapSide?: 'left'|'right', stars?}.
   */
  function placeAt(x, z, heading, options) {
    const o = options || {};
    const site = planner.siteAt(x, z, heading);
    if (!site) return null;
    const level = typeof o.stars === 'number' ? o.stars : Math.max(MIN_STARS, wantedLevel());
    return build(site, o.spikes !== undefined ? !!o.spikes : level >= SPIKES_FROM_STARS, o.gapSide || null, level);
  }

  /** Plan the next roadblock now instead of waiting for the timer. */
  function requestNow() {
    timer = 0;
  }

  function setEnabled(on) {
    system.enabled = !!on;
    if (!system.enabled && system.planning) {
      planner.cancel();
      system.planning = false;
    }
  }

  function forgetEntity(entity, field) {
    if (!entity) return;
    for (const roadblock of system.list) {
      const at = roadblock[field].indexOf(entity);
      if (at !== -1) roadblock[field].splice(at, 1);
    }
  }

  function specOf(id) {
    const catalog = game.catalog;
    const spec = catalog && typeof catalog.vehicleById === 'function' ? catalog.vehicleById(id) : null;
    return spec || { length: 4.85, width: 1.9 };
  }

  function wantedLevel() {
    const wanted = game.wanted;
    return wanted && typeof wanted.level === 'number' ? wanted.level : 0;
  }

  return system;
}

function randomInterval() {
  return INTERVAL[0] + Math.random() * (INTERVAL[1] - INTERVAL[0]);
}
