// Where Port Sarab's moving traffic comes from and where it goes: cars appear on lanes out of the
// camera's sight (or far off), mostly ahead of where the player is heading, as many as the district,
// the hour and the mission allow, in the district's own mix of models and paint, each with a driver
// and sometimes a passenger. They are taken away again only out of sight, or very far off.
import { trafficDensityAtHour } from './trafficRules.js';

/** Seconds between two looks at the population. */
const SPAWN_TICK = 0.22;
/** Inside this distance a new car must be out of the camera's view. */
const IN_VIEW_SPAWN_DISTANCE = 150;
/** Room (metres) a new car needs around it on the road. */
const SPAWN_CLEARANCE = 14;
/** A car standing still this long out of sight is quietly taken away. */
const STUCK_REMOVE_AFTER = 20;
/** When the streets are filled all at once, cars may be placed this close to the player. */
const NEAREST_FILL_DISTANCE = 22;

/**
 * Build the spawner of moving traffic.
 * @param {Object} game
 * @param {Object} traffic   the traffic system (drivers, grid, isVisible, adopt, remove, holds)
 * @param {Object} driverAI  trafficDriverAI
 */
export function createTrafficSpawner(game, traffic, driverAI) {
  const rng = game.rng.fork('traffic-spawner');
  const mixes = new Map();
  const nearby = new Array(32);
  let timer = 0;

  /**
   * Every few frames: retire cars that left, then top the population up toward its target. With
   * `fillNow` the whole population is placed at once, in view or not (a new game, a teleport).
   */
  function update(dt, fillNow) {
    timer -= dt;
    if (timer > 0 && !fillNow) return;
    timer = SPAWN_TICK;
    const pop = game.config.population;
    const focus = traffic.focus;
    const target = targetCount(focus.x, focus.z, pop);
    traffic.stats.target = target;
    retireCars(focus, pop, target);
    let made = 0;
    let tries = 0;
    while (traffic.drivers.length < target && (fillNow ? tries < target * 2 : made < 2)) {
      tries += 1;
      if (spawnOneCar(focus, pop, fillNow)) {
        made += 1;
        // Placing many at once: each new car must see the ones placed just before it.
        if (fillNow) traffic.grid.rebuild(focus.x, focus.z);
      } else if (!fillNow) break;
    }
  }

  /**
   * How many moving cars there should be: the full number scaled by the district's density around
   * the player, by the hour and by the multiplier missions set (traffic.density).
   */
  function targetCount(x, z, pop) {
    const city = game.city;
    let density = 0;
    let samples = 0;
    for (let i = 0; i < 5; i += 1) {
      const angle = i * 1.2566;
      const r = i === 0 ? 0 : 130;
      const district = city.districtAt(x + Math.sin(angle) * r, z + Math.cos(angle) * r);
      density += district ? district.density : 0;
      samples += 1;
    }
    density /= samples;
    const share = density * trafficDensityAtHour(game.time.hour) * traffic.density;
    return Math.max(0, Math.min(pop.trafficVehicles, Math.round(pop.trafficVehicles * share)));
  }

  /**
   * Take away cars that drove off (out of sight beyond the despawn radius, or anywhere very far),
   * cars stuck for a long time out of sight, abandoned wrecks out of sight, and, when the street
   * should be quieter, the odd car that nobody is looking at.
   */
  function retireCars(focus, pop, target) {
    const list = traffic.drivers;
    let surplus = list.length - target;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const state = list[i];
      const vehicle = state.vehicle;
      const dx = vehicle.pos.x - focus.x;
      const dz = vehicle.pos.z - focus.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const seen = traffic.isVisible(vehicle.pos.x, vehicle.pos.z, 5);
      let remove = distance > pop.despawnRadius * 1.6 || (distance > pop.despawnRadius && !seen);
      if (!remove && !seen && distance > 25) {
        const receding = vehicle.vel.x * dx + vehicle.vel.z * dz > 0;
        // Queueing at a light (or just pulling away from it) is not being stuck, up to a long wait.
        const atLights = state.lane.to.signal && state.phase === 0 && state.distToLine < 60 && state.stillTime < 45;
        if ((state.stillTime > STUCK_REMOVE_AFTER && !atLights) || state.lost) {
          remove = true;
          traffic.stats.stuckRemoved += 1;
          traffic.noteIncident(describeStuck(state));
        } else if (receding && distance > pop.spawnRadius * 0.8 && state.mode !== 'flee') {
          remove = true;
        } else if (state.mode === 'abandoned' && distance > 60) {
          remove = true;
        } else if (surplus > 1 && distance > pop.minSpawnDistance) {
          remove = true;
        }
      }
      if (remove) {
        traffic.removeCar(state);
        surplus -= 1;
      }
    }
  }

  /**
   * Try a few spots on lanes around the player for one new car; false when none of them would do.
   * Half the tries look ahead, where the player is heading, far enough off to appear unseen; the
   * rest look all round, nearer in, out of the camera's view. Cars that will drive toward the
   * player are preferred: a car spawned driving away is soon out of reach and wasted.
   */
  function spawnOneCar(focus, pop, anywhere) {
    const roads = game.roads;
    const heading = travelHeading();
    const quick = game.player && game.player.speed > 6;
    const nearest = anywhere ? NEAREST_FILL_DISTANCE : pop.minSpawnDistance;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ahead = rng.chance(quick ? 0.7 : 0.5);
      let angle;
      let radius;
      if (anywhere) {
        angle = rng.range(-Math.PI, Math.PI);
        radius = nearest + (pop.spawnRadius * 0.85 - nearest) * Math.pow(rng.next(), 1.4);
      } else if (ahead) {
        angle = heading + rng.range(-0.75, 0.75);
        radius = rng.range(IN_VIEW_SPAWN_DISTANCE, pop.spawnRadius);
      } else {
        angle = rng.range(-Math.PI, Math.PI);
        radius = pop.minSpawnDistance + (pop.spawnRadius - pop.minSpawnDistance) * Math.pow(rng.next(), 1.7);
      }
      const hit = roads.nearestLane(focus.x + Math.sin(angle) * radius, focus.z + Math.cos(angle) * radius, 45);
      if (!hit) continue;
      const lane = hit.lane;
      if (lane.length < 40) continue;
      const s = Math.max(7, Math.min(lane.length - 30, hit.t * lane.length));
      const x = lane.x0 + lane.dirX * s;
      const z = lane.z0 + lane.dirZ * s;
      const dx = x - focus.x;
      const dz = z - focus.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < nearest || distance > pop.spawnRadius) continue;
      const approaching = -(lane.dirX * dx + lane.dirZ * dz) / distance > 0.2;
      if (!approaching && !anywhere && !rng.chance(0.4)) continue;
      if (!anywhere && distance < IN_VIEW_SPAWN_DISTANCE && traffic.isVisible(x, z, 6)) continue;
      if (traffic.isHeld(x, z)) continue;
      if (game.terrain && game.terrain.isWater && game.terrain.isWater(x, z)) continue;
      if (!roadIsClear(x, z)) continue;
      const district = game.city.districtAt(x, z);
      const spec = pickModel(district ? district.traffic : 'downtown', lane);
      if (!spec) continue;
      if (spawnCar(spec, lane, s, district)) return true;
    }
    return false;
  }

  /** Put one car with its driver (and perhaps a passenger) on a lane, already rolling. */
  function spawnCar(spec, lane, s, district) {
    const x = lane.x0 + lane.dirX * s;
    const z = lane.z0 + lane.dirZ * s;
    const color = spec.colors && spec.colors.length ? spec.colors[rng.int(0, spec.colors.length - 1)] : undefined;
    const vehicle = game.vehicles.spawn(spec.id, { x, z, heading: lane.heading, color, faction: 'civilian' });
    if (!vehicle) return false;
    vehicle.faction = 'civilian';
    vehicle.tags.traffic = true;
    const state = driverAI.createDriverState(vehicle, rng);
    vehicle.ai = state;
    driverAI.placeOnLane(state, lane, s);
    // Already rolling, but slow enough to stop at the next light should it be red, and for
    // whatever is already on the road ahead.
    const toLine = lane.length - s - vehicle.dynamics.profile.halfLength - 8;
    const corner = lane.to.signal ? 0 : state.path ? state.path.safeSpeed : 0;
    const canStop = Math.sqrt(corner * corner + 2 * state.comfortDecel * Math.max(0, toLine));
    driverAI.lookAround(state);
    const room = state.obstacleGap - state.minGap - 4;
    const canFollow = Math.max(0, state.obstacleSpeed) + Math.sqrt(2 * state.comfortDecel * Math.max(0, room));
    const speed = Math.min(lane.speed * state.temperament * 0.85, canStop, canFollow);
    vehicle.vel.set(lane.dirX * speed, 0, lane.dirZ * speed);
    vehicle.speed = speed;
    vehicle.controls.headlights = traffic.night;
    seatOccupants(state, spec, district, x, z, lane.heading);
    traffic.adoptCar(state);
    traffic.stats.spawned += 1;
    return true;
  }

  /** A driver who looks like the district (cabbies, bus and truck drivers look like working people). */
  function seatOccupants(state, spec, district, x, z, heading) {
    const characters = game.characters;
    if (!characters || !characters.spawn || !characters.enterVehicle) return;
    const vehicle = state.vehicle;
    const working = spec.className === 'taxi' || spec.className === 'bus' || spec.className === 'truck' || spec.className === 'van';
    const driver = characters.spawn({
      kind: 'civilian', faction: 'civilian', x, z, heading,
      archetype: working ? (rng.chance(0.5) ? 'worker' : 'local') : pickArchetype(district),
    });
    if (!driver) return;
    driver.ai = { system: 'traffic', role: 'driver', car: state };
    characters.enterVehicle(driver, vehicle, 0, { instant: true });
    if (vehicle.driver !== driver && game.vehicles.setDriver) game.vehicles.setDriver(vehicle, driver);
    state.driver = driver;
    const seats = spec.seats || 2;
    const passengerChance = spec.className === 'taxi' ? 0.55 : spec.className === 'bus' ? 0.8 : 0.2;
    if (seats > 1 && rng.chance(passengerChance)) {
      const passenger = characters.spawn({ kind: 'civilian', faction: 'civilian', x, z, heading, archetype: pickArchetype(district) });
      if (passenger) {
        passenger.ai = { system: 'traffic', role: 'passenger', car: state };
        characters.enterVehicle(passenger, vehicle, 1, { instant: true });
        state.passenger = passenger;
      }
    }
  }

  /** A model from the district's traffic mix; buses only on boulevards, nothing long on a short lane. */
  function pickModel(districtKey, lane) {
    const mix = mixFor(districtKey);
    if (mix.specs.length === 0) return null;
    let total = 0;
    for (let i = 0; i < mix.specs.length; i += 1) total += modelWeight(mix, i, lane);
    if (total <= 0) return null;
    let roll = rng.next() * total;
    for (let i = 0; i < mix.specs.length; i += 1) {
      roll -= modelWeight(mix, i, lane);
      if (roll <= 0) return mix.specs[i];
    }
    return mix.specs[mix.specs.length - 1];
  }

  function modelWeight(mix, i, lane) {
    const spec = mix.specs[i];
    if (spec.className === 'bus' && lane.kind !== 'boulevard') return 0;
    if (spec.length > 9 && lane.length < 60) return 0;
    return mix.weights[i];
  }

  /** The civilian models seen in a district kind and how often (from each model's traffic weights). */
  function mixFor(key) {
    let mix = mixes.get(key);
    if (mix) return mix;
    mix = { specs: [], weights: [] };
    const all = game.catalog && game.catalog.vehicles ? game.catalog.vehicles : [];
    for (let i = 0; i < all.length; i += 1) {
      const weight = all[i].traffic ? all[i].traffic[key] || 0 : 0;
      if (weight > 0) {
        mix.specs.push(all[i]);
        mix.weights.push(weight);
      }
    }
    mixes.set(key, mix);
    return mix;
  }

  function pickArchetype(district) {
    const people = district && district.people;
    if (!people) return 'civilian';
    let total = 0;
    for (const key in people) total += people[key];
    let roll = rng.next() * total;
    for (const key in people) {
      roll -= people[key];
      if (roll <= 0) return key;
    }
    return 'civilian';
  }

  /**
   * Nothing on the road within the clearance of a spawn point: people from the grid, vehicles from
   * the live list (so two cars spawned in the same moment never land on each other).
   */
  function roadIsClear(x, z) {
    const limit = SPAWN_CLEARANCE * SPAWN_CLEARANCE;
    const count = traffic.grid.query(x, z, SPAWN_CLEARANCE, nearby);
    for (let i = 0; i < count; i += 1) {
      const thing = nearby[i];
      if (thing.dynamics !== undefined || thing.vehicle) continue;
      const dx = thing.pos.x - x;
      const dz = thing.pos.z - z;
      if (dx * dx + dz * dz < limit) return false;
    }
    const vehicles = game.vehicles.list;
    for (let i = 0; i < vehicles.length; i += 1) {
      const dx = vehicles[i].pos.x - x;
      const dz = vehicles[i].pos.z - z;
      if (dx * dx + dz * dz < limit) return false;
    }
    return true;
  }

  /** The way the player is heading: the car's travel when driving fast, else where the camera looks. */
  function travelHeading() {
    const vehicle = game.player && game.player.vehicle;
    if (vehicle && Math.abs(vehicle.speed) > 3) return Math.atan2(vehicle.vel.x, vehicle.vel.z);
    if (game.cameraRig && typeof game.cameraRig.yaw === 'number') return game.cameraRig.yaw;
    const camera = game.camera;
    camera.getWorldDirection(lookDirection);
    return Math.atan2(lookDirection.x, lookDirection.z);
  }

  const lookDirection = new game.THREE.Vector3();

  return { update, targetCount, mixFor };
}

/** A one-line account of why a car stood still so long (kept in traffic.incidents for debugging). */
function describeStuck(state) {
  const node = state.lane.to;
  let text = `stuck #${state.vehicle.id} ${state.path ? state.path.turn : 'end'} at node ${node.id}${node.signal ? ' (lights)' : ''}`
    + ` s ${state.s.toFixed(0)}/${state.lane.length.toFixed(0)} ph ${state.phase} gap ${state.obstacleGap.toFixed(1)} stop ${state.stopGap.toFixed(1)}`;
  const other = state.waitingFor && state.waitingFor.ai;
  if (other && other.role === 'driver') {
    text += ` waits #${state.waitingFor.id} ${other.path ? other.path.turn : '-'} ph ${other.phase} line ${other.distToLine.toFixed(1)}`
      + ` v ${state.waitingFor.speed.toFixed(1)} commit ${other.committed} stop ${other.stopGap.toFixed(1)} gap ${other.obstacleGap.toFixed(1)}`
      + ` waits ${other.waitingFor ? other.waitingFor.id : '-'}`;
  } else if (state.obstacle) {
    text += ` behind ${state.obstacle.spec ? state.obstacle.spec.id : 'person'} #${state.obstacle.id}`;
  }
  return state.lost ? `${text} lost` : text;
}
