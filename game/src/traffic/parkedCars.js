// The cars parked along Port Sarab's kerbs and in its car parks: bays laid out once from the city
// plan (kerbside spots, car parks, the used-car lots, the PSPD yard with its patrol cars, truck yards
// with vans and lorries, hotel forecourts with the expensive metal), filled near the player out of
// sight with the district's own models, engines off, and kept while the player is around.
import { parkedCarChanceForLot } from './trafficRules.js';

/** Seconds between two looks at the parked population. */
const PARKED_TICK = 0.45;
/** Seconds between two sweeps for cars the player stole and left. */
const ADOPT_TICK = 2;
/** A car the player left stands untouched at least this long. */
const PLAYER_CAR_GRACE = 60;
/** Inside this distance a new parked car must be out of the camera's view. */
const IN_VIEW_SPAWN_DISTANCE = 150;
/** Parked cars may appear this close, but only behind the camera. */
const NEAREST_HIDDEN_SPAWN = 32;
const SPOT_CELL = 100;
/** The size of a bay [width, depth] in each kind of car park the traffic fills. */
const BAY_SIZES = {
  parking: [3, 5.6],
  carLot: [3, 5.6],
  policeYard: [3.2, 5.8],
  truckYard: [3.8, 9],
  hotelForecourt: [3.2, 5.8],
};

/**
 * Build the parked cars.
 * @param {Object} game
 * @param {Object} traffic  the traffic system (parked, grid, isVisible, isHeld, owns, removeParked)
 */
export function createParkedCars(game, traffic) {
  const rng = game.rng.fork('parked-cars');
  const spots = [];
  const cells = new Map();
  const nearby = new Array(16);
  let tick = 0;
  let adoptTick = 0;
  layOutSpots();

  /**
   * Retire parked cars left far behind, adopt cars the player abandoned, fill free bays near the
   * player. With `fillNow` every free bay may be filled at once, in view or not (a new game, a teleport).
   */
  function update(dt, fillNow) {
    tick -= dt;
    adoptTick -= dt;
    if (adoptTick <= 0) {
      adoptTick = ADOPT_TICK;
      adoptAbandonedCars();
    }
    if (tick > 0 && !fillNow) return;
    tick = PARKED_TICK;
    const pop = game.config.population;
    const focus = traffic.focus;
    retireParkedCars(focus, pop);
    const target = Math.round(pop.parkedVehicles * Math.min(1, 0.4 + 0.6 * traffic.density));
    let made = 0;
    while (traffic.parked.length < target && (fillNow || made < 2)) {
      if (!fillOneBay(focus, pop, fillNow)) break;
      made += 1;
    }
  }

  /**
   * Park a car of `specId` at (x, z) facing `heading`, engine off, owned by the traffic like any
   * other parked car. options: { color, locked, faction, persistent (never tidied away), tags }.
   * @returns {Object|null} the vehicle
   */
  function spawnParked(specId, x, z, heading, options) {
    const o = options || {};
    const vehicle = game.vehicles.spawn(specId, {
      x, z, heading, parked: true, locked: !!o.locked,
      color: typeof o.color === 'number' ? o.color : undefined,
      faction: o.faction,
    });
    if (!vehicle) return null;
    if (o.tags) for (const key in o.tags) vehicle.tags[key] = o.tags[key];
    adopt(vehicle, null, !!o.persistent);
    return vehicle;
  }

  /** Take a vehicle into the parked population (its bay, if any, is marked taken). */
  function adopt(vehicle, spot, persistent) {
    const record = { system: 'traffic', role: 'parked', vehicle, spot, persistent };
    vehicle.ai = record;
    vehicle.tags.parkedCar = true;
    const c = vehicle.controls;
    c.throttle = 0;
    c.brake = 0;
    c.steer = 0;
    c.handbrake = true;
    c.headlights = false;
    if (spot) spot.vehicle = vehicle;
    traffic.adoptParked(record);
    return record;
  }

  /** Parked cars beyond the despawn radius and out of sight (or very far) go; taken ones are let go. */
  function retireParkedCars(focus, pop) {
    const list = traffic.parked;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const record = list[i];
      const vehicle = record.vehicle;
      if (vehicle.driver || vehicle.isPlayer) {
        traffic.release(vehicle);
        continue;
      }
      if (record.persistent) continue;
      const dx = vehicle.pos.x - focus.x;
      const dz = vehicle.pos.z - focus.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance > pop.despawnRadius * 1.6 || (distance > pop.despawnRadius && !traffic.isVisible(vehicle.pos.x, vehicle.pos.z, 5))) {
        traffic.removeParked(record);
      }
    }
  }

  /**
   * Park one car in a free bay near the player: the nearer bays first (with a little chance), never
   * in plain view nearby, never where something already stands.
   */
  function fillOneBay(focus, pop, anywhere) {
    const reach = pop.spawnRadius;
    const nearest = anywhere ? 6 : NEAREST_HIDDEN_SPAWN;
    // How full each car park already is, so the cars spread over kerbs and lots instead of packing one.
    const list = traffic.parked;
    for (let i = 0; i < list.length; i += 1) if (list[i].spot && list[i].spot.lot) list[i].spot.lot.taken = 0;
    for (let i = 0; i < list.length; i += 1) if (list[i].spot && list[i].spot.lot) list[i].spot.lot.taken += 1;
    const cx0 = Math.floor((focus.x - reach) / SPOT_CELL);
    const cx1 = Math.floor((focus.x + reach) / SPOT_CELL);
    const cz0 = Math.floor((focus.z - reach) / SPOT_CELL);
    const cz1 = Math.floor((focus.z + reach) / SPOT_CELL);
    let best = null;
    let bestScore = Infinity;
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cz = cz0; cz <= cz1; cz += 1) {
        const bays = cells.get(cellKey(cx, cz));
        if (!bays) continue;
        for (let i = 0; i < bays.length; i += 1) {
          const spot = bays[i];
          if (spot.vehicle || spot.unusable) continue;
          const dx = spot.x - focus.x;
          const dz = spot.z - focus.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          if (distance < nearest || distance > reach) continue;
          const crowding = spot.lot ? 1 + spot.lot.taken * 0.3 : 1;
          const score = distance * (0.6 + rng.next() * 0.8) * crowding;
          if (score >= bestScore) continue;
          if (!anywhere && distance < IN_VIEW_SPAWN_DISTANCE && traffic.isVisible(spot.x, spot.z, 4)) continue;
          if (traffic.isHeld(spot.x, spot.z) || !bayIsFree(spot, anywhere)) continue;
          best = spot;
          bestScore = score;
        }
      }
    }
    if (!best) return false;
    const spec = pickParkedModel(best);
    if (!spec) {
      best.unusable = true;
      return false;
    }
    const police = spec.className === 'police' || spec.className === 'policeSuv';
    const vehicle = game.vehicles.spawn(spec.id, {
      x: best.x + rng.range(-0.12, 0.12),
      z: best.z + rng.range(-0.12, 0.12),
      heading: best.heading + rng.range(-0.035, 0.035),
      parked: true,
      locked: rng.chance(0.2),
      color: spec.colors && spec.colors.length ? spec.colors[rng.int(0, spec.colors.length - 1)] : undefined,
      faction: police ? 'police' : 'civilian',
    });
    if (!vehicle) return false;
    adopt(vehicle, best, false);
    traffic.stats.parkedSpawned += 1;
    return true;
  }

  /** A civilian car the player stole and left more than a minute ago joins the parked cars (and goes with them). */
  function adoptAbandonedCars() {
    const vehicles = game.vehicles ? game.vehicles.list : null;
    if (!vehicles) return;
    const now = game.time.elapsed;
    const playerCar = game.player ? game.player.vehicle : null;
    for (let i = 0; i < vehicles.length; i += 1) {
      const vehicle = vehicles[i];
      const tags = vehicle.tags;
      if (!tags || typeof tags.lastPlayerUse !== 'number' || traffic.owns(vehicle)) continue;
      if (vehicle === playerCar || vehicle.driver || vehicle.isPlayer || tags.mission || tags.owned) continue;
      if (vehicle.faction !== 'civilian' || now - tags.lastPlayerUse < PLAYER_CAR_GRACE) continue;
      adopt(vehicle, null, false);
    }
  }

  /** The model for a bay: the district's mix at the kerb, patrol cars in the PSPD yard, and so on. */
  function pickParkedModel(spot) {
    const all = game.catalog && game.catalog.vehicles ? game.catalog.vehicles : [];
    let total = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      let roll = pass === 1 ? rng.next() * total : 0;
      for (let i = 0; i < all.length; i += 1) {
        const weight = bayWeight(all[i], spot);
        if (weight <= 0) continue;
        if (pass === 0) total += weight;
        else {
          roll -= weight;
          if (roll <= 0) return all[i];
        }
      }
      if (total <= 0) return null;
    }
    return null;
  }

  function bayWeight(spec, spot) {
    const kind = spec.className;
    const civilian = seenInTraffic(spec);
    if (spot.use === 'policeYard') return kind === 'police' ? 3 : kind === 'policeSuv' ? 1.5 : 0;
    if (!civilian || kind === 'bus') return 0;
    if (spot.use === 'truckYard') return kind === 'truck' ? 3 : kind === 'van' ? 3 : kind === 'pickup' ? 1.5 : 0;
    if (spot.use === 'hotelForecourt') return spec.value >= 60000 ? 2 + spec.value / 200000 : 0;
    if (spot.use === 'carLot') return kind === 'truck' ? 0 : 1;
    if (kind === 'truck' && spot.district !== 'docks') return 0;
    const district = game.city.districtById ? game.city.districtById[spot.district] : null;
    return spec.traffic[district ? district.traffic : 'downtown'] || 0;
  }

  /** Nothing already standing in the bay (when filling many at once, checked against every vehicle). */
  function bayIsFree(spot, thorough) {
    const count = traffic.grid.query(spot.x, spot.z, 3.5, nearby);
    for (let i = 0; i < count; i += 1) {
      const thing = nearby[i];
      const dx = thing.pos.x - spot.x;
      const dz = thing.pos.z - spot.z;
      const room = thing.dynamics !== undefined ? 3.6 : 1.2;
      if (dx * dx + dz * dz < room * room) return false;
    }
    if (!thorough) return true;
    const vehicles = game.vehicles.list;
    for (let i = 0; i < vehicles.length; i += 1) {
      const dx = vehicles[i].pos.x - spot.x;
      const dz = vehicles[i].pos.z - spot.z;
      if (dx * dx + dz * dz < 3.6 * 3.6) return false;
    }
    return true;
  }

  /** Every bay: the plan's kerbside spots, then rows of bays in each car park, yard and forecourt. */
  function layOutSpots() {
    const city = game.city;
    if (!city) return;
    for (const spot of city.parkingSpots || []) {
      addSpot({ x: spot.x, z: spot.z, heading: spot.heading, district: spot.district, use: 'kerb', vehicle: null, lot: null });
    }
    for (const lot of city.openLots || []) {
      const chance = parkedCarChanceForLot(lot.use);
      if (chance > 0) layOutLot(lot, BAY_SIZES[lot.use] || BAY_SIZES.parking, chance);
    }
  }

  /**
   * Rows of bays across a lot, parallel to the street it opens onto: pairs of rows back to back with
   * a driving aisle between the pairs; the first row faces the street.
   */
  function layOutLot(lot, bay, chance) {
    const alongX = lot.front === 'n' || lot.front === 's';
    const width = alongX ? lot.x1 - lot.x0 : lot.z1 - lot.z0;
    const depth = alongX ? lot.z1 - lot.z0 : lot.x1 - lot.x0;
    const bayWidth = bay[0];
    const bayDepth = bay[1];
    const aisle = 6.5;
    const margin = 2.5;
    // Heading that faces the street side, and the depth axis pointing from the street inward.
    const towardFront = lot.front === 's' ? 0 : lot.front === 'n' ? Math.PI : lot.front === 'e' ? Math.PI / 2 : -Math.PI / 2;
    const group = { taken: 0 };
    let row = 0;
    let at = margin + aisle * 0.5;
    while (at + bayDepth + margin <= depth && row < 8) {
      const facing = row % 2 === 0 ? towardFront : towardFront + Math.PI;
      const centreDepth = at + bayDepth * 0.5;
      for (let along = margin + bayWidth * 0.5; along + bayWidth * 0.5 + margin <= width; along += bayWidth) {
        if (!rng.chance(chance)) continue;
        const inward = depthToWorld(lot, centreDepth);
        const x = alongX ? lot.x0 + along : inward;
        const z = alongX ? inward : lot.z0 + along;
        addSpot({ x, z, heading: wrap(facing), district: lot.district, use: lot.use, vehicle: null, lot: group });
      }
      at += bayDepth;
      row += 1;
      if (row % 2 === 0) at += aisle;
    }
  }

  function addSpot(spot) {
    spots.push(spot);
    const key = cellKey(Math.floor(spot.x / SPOT_CELL), Math.floor(spot.z / SPOT_CELL));
    let list = cells.get(key);
    if (!list) {
      list = [];
      cells.set(key, list);
    }
    list.push(spot);
  }

  return { update, spawnParked, spots };
}

/** The world coordinate `depth` metres in from a lot's street side. */
function depthToWorld(lot, depth) {
  if (lot.front === 's') return lot.z1 - depth;
  if (lot.front === 'n') return lot.z0 + depth;
  if (lot.front === 'e') return lot.x1 - depth;
  return lot.x0 + depth;
}

function cellKey(cx, cz) {
  return (cx + 1024) * 4096 + (cz + 1024);
}

/** A civilian model: one that turns up in some district's traffic. */
function seenInTraffic(spec) {
  if (!spec.traffic) return false;
  for (const key in spec.traffic) if (spec.traffic[key] > 0) return true;
  return false;
}

function wrap(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
