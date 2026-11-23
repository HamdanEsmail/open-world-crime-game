// The traffic of Port Sarab: every civilian car that drives its streets and every car parked along
// them. It keeps the right number of cars around the player for the district and the hour, drives
// each one with its own driver, reacts to trouble, and owns the parked cars. Becomes game.traffic.
import * as THREE from 'three';
import { createTrafficObstacleGrid } from './trafficObstacleGrid.js';
import { createTrafficJunctions } from './trafficJunctions.js';
import { createTrafficDriverAI } from './trafficDriverAI.js';
import { createTrafficSpawner } from './trafficSpawner.js';
import { createTrafficReactions } from './trafficReactions.js';
import { createParkedCars } from './parkedCars.js';

/** Seconds a car must stand still to count as stopped for long. */
const LONG_STOP = 10;
/** Drivers look around once every this many frames, each on its own frame. */
const THINK_EVERY = 4;
/** A jump of the player this far (metres, in one frame) fills the streets around the new spot at once. */
const JUMP_DISTANCE = 120;

/**
 * Build game.traffic.
 * @param {Object} game
 */
export function createTrafficSystem(game) {
  /** Driver states of the moving cars (vehicle.ai of each). */
  const drivers = [];
  /** Records of the parked cars (vehicle.ai of each). */
  const parked = [];
  /** Every vehicle the traffic owns, moving or parked. */
  const vehicles = [];
  /** People running from trouble (former drivers and passengers). */
  const fleeing = [];
  const owned = new Set();
  const holds = [];
  const crashTimes = new Float64Array(64);
  const wallTimes = new Float64Array(64);
  let crashCursor = 0;
  let wallCursor = 0;
  let enabled = true;
  let fillNow = true;
  const frustum = new THREE.Frustum();
  const viewMatrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere();

  const traffic = {
    vehicles,
    drivers,
    parked,
    fleeing,
    /** Multiplier on how many cars are about (missions set it: 0 empties the streets, 1.5 is busy). */
    density: 1,
    night: false,
    /** Where the population is centred: the player. */
    focus: { x: 0, z: 0 },
    grid: null,
    stats: {
      moving: 0, parked: 0, target: 0, meanSpeed: 0, stoppedLong: 0, abandoned: 0, fleeing: 0,
      collisionsLastMinute: 0, wallHitsLastMinute: 0, redLightsRun: 0, panicRedRuns: 0,
      spawned: 0, removed: 0, stuckRemoved: 0, parkedSpawned: 0, updateMs: 0, peakMs: 0, drivingMs: 0, spawnMs: 0, parkingMs: 0,
    },
    /** The last few notable things that happened (a red light run, a stuck car taken away), newest last. */
    incidents: [],
    update,
    setEnabled,
    clearArea,
    spawnParked,
    populateNow,
    isVisible,
    isHeld,
    owns,
    driverOf,
    release,
    removeCar,
    removeParked,
    adoptCar,
    adoptParked,
    noteCrash,
    noteIncident,
    get enabled() {
      return enabled;
    },
  };
  traffic.grid = createTrafficObstacleGrid(game);
  const junctions = createTrafficJunctions(game, traffic);
  const driverAI = createTrafficDriverAI(game, traffic, junctions);
  const spawner = createTrafficSpawner(game, traffic, driverAI);
  const reactions = createTrafficReactions(game, traffic, driverAI);
  const parkedCars = createParkedCars(game, traffic);
  traffic.junctions = junctions;
  traffic.driverAI = driverAI;
  traffic.reactions = reactions;
  traffic.parkedCars = parkedCars;
  traffic.spawner = spawner;

  /**
   * One frame of traffic: file who is where, let go of cars that left the traffic's hands, top up
   * the population, drive every car (each driver thinks every fourth frame), react, park.
   */
  function update(dt) {
    if (!enabled || !(dt > 0) || !game.roads || !game.vehicles || !game.city) return;
    const started = performance.now();
    const lastX = traffic.focus.x;
    const lastZ = traffic.focus.z;
    readFocus();
    // The player appeared somewhere new (a new game, a respawn, a teleport behind a fade): fill the
    // streets at once instead of waiting for cars to arrive from out of sight.
    if (Math.abs(traffic.focus.x - lastX) + Math.abs(traffic.focus.z - lastZ) > JUMP_DISTANCE) fillNow = true;
    const hour = game.time.hour;
    traffic.night = game.sky && typeof game.sky.night === 'number' ? game.sky.night > 0.5 : hour >= 18.5 || hour < 6;
    refreshView();
    traffic.grid.rebuild(traffic.focus.x, traffic.focus.z);
    sweepLostCars();
    const spawning = performance.now();
    spawner.update(dt, fillNow);
    const driving = performance.now();
    traffic.stats.spawnMs += (driving - spawning - traffic.stats.spawnMs) * 0.05;
    const frame = game.time.frame;
    for (let i = 0; i < drivers.length; i += 1) {
      driverAI.driveTrafficCar(drivers[i], dt, (frame + i) % THINK_EVERY === 0);
    }
    reactions.update(dt);
    const driven = performance.now();
    parkedCars.update(dt, fillNow);
    traffic.stats.parkingMs += (performance.now() - driven - traffic.stats.parkingMs) * 0.05;
    fillNow = false;
    measure(performance.now() - started, driven - driving);
  }

  /**
   * Fill the streets around the player on the next frame, in view or not (call it behind a fade,
   * after a teleport, or when staging a scene). Also happens by itself when the player jumps far.
   */
  function populateNow() {
    fillNow = true;
  }

  /**
   * Turn the traffic on or off. Off takes every traffic car, parked car and running person away at
   * once and spawns nothing until it is turned on again.
   */
  function setEnabled(on) {
    const was = enabled;
    enabled = !!on;
    if (enabled) {
      if (!was) fillNow = true;
      return;
    }
    for (let i = drivers.length - 1; i >= 0; i -= 1) removeCar(drivers[i]);
    for (let i = parked.length - 1; i >= 0; i -= 1) if (!parked[i].persistent) removeParked(parked[i]);
    for (let i = fleeing.length - 1; i >= 0; i -= 1) despawnPerson(fleeing[i].character);
    fleeing.length = 0;
  }

  /**
   * Take every traffic car, parked car and running person within `radius` of (x, z) away now (a
   * mission setting a scene), and keep new ones out of that circle for `holdSeconds`.
   */
  function clearArea(x, z, radius, holdSeconds = 6) {
    const r2 = radius * radius;
    for (let i = drivers.length - 1; i >= 0; i -= 1) {
      if (distanceSq(drivers[i].vehicle.pos, x, z) < r2) removeCar(drivers[i]);
    }
    for (let i = parked.length - 1; i >= 0; i -= 1) {
      if (!parked[i].persistent && distanceSq(parked[i].vehicle.pos, x, z) < r2) removeParked(parked[i]);
    }
    for (let i = fleeing.length - 1; i >= 0; i -= 1) {
      if (distanceSq(fleeing[i].character.pos, x, z) < r2) {
        despawnPerson(fleeing[i].character);
        removeAt(fleeing, i);
      }
    }
    if (holdSeconds > 0) {
      if (holds.length >= 8) holds.shift();
      holds.push({ x, z, radius, until: game.time.elapsed + holdSeconds });
    }
  }

  /**
   * Park a car at a given place (missions, set pieces). options: { color, locked, faction,
   * persistent (never tidied away), tags }. Returns the vehicle.
   */
  function spawnParked(specId, x, z, heading, options) {
    return parkedCars.spawnParked(specId, x, z, heading, options);
  }

  /** Could the camera see a ball of `radius` at (x, z) (inside its view and within the haze)? */
  function isVisible(x, z, radius) {
    const sight = game.weather && typeof game.weather.visibility === 'number' ? game.weather.visibility : Infinity;
    const camera = game.camera.position;
    const dx = x - camera.x;
    const dz = z - camera.z;
    if (dx * dx + dz * dz > (sight + radius) * (sight + radius)) return false;
    sphere.center.set(x, 1.2, z);
    sphere.radius = radius;
    return frustum.intersectsSphere(sphere);
  }

  /** Is (x, z) inside a circle a mission asked to keep clear? */
  function isHeld(x, z) {
    const now = game.time.elapsed;
    for (let i = 0; i < holds.length; i += 1) {
      const hold = holds[i];
      if (hold.until > now && distanceSq(hold, x, z) < hold.radius * hold.radius) return true;
    }
    return false;
  }

  function owns(vehicle) {
    return owned.has(vehicle);
  }

  /** The driver state of a moving traffic car, or null. */
  function driverOf(vehicle) {
    if (!vehicle || !owned.has(vehicle)) return null;
    const ai = vehicle.ai;
    return ai && ai.system === 'traffic' && ai.role === 'driver' ? ai : null;
  }

  /** Let go of a vehicle without removing it (the player took it, or another system did). */
  function release(vehicle) {
    if (!owned.has(vehicle)) return;
    const ai = vehicle.ai;
    if (ai && ai.system === 'traffic') {
      if (ai.spot) ai.spot.vehicle = null;
      vehicle.ai = null;
    }
    vehicle.controls.horn = false;
    forget(vehicle);
  }

  /** Take a moving traffic car away with the people still in it. */
  function removeCar(state) {
    const vehicle = state.vehicle;
    despawnPerson(state.driver);
    despawnPerson(state.passenger);
    state.driver = null;
    state.passenger = null;
    forget(vehicle);
    if (!vehicle.despawned) game.vehicles.despawn(vehicle);
    traffic.stats.removed += 1;
  }

  /** Take a parked car away and free its bay. */
  function removeParked(record) {
    if (record.spot) record.spot.vehicle = null;
    forget(record.vehicle);
    if (!record.vehicle.despawned) game.vehicles.despawn(record.vehicle);
  }

  function adoptCar(state) {
    drivers.push(state);
    vehicles.push(state.vehicle);
    owned.add(state.vehicle);
  }

  function adoptParked(record) {
    parked.push(record);
    vehicles.push(record.vehicle);
    owned.add(record.vehicle);
  }

  /**
   * Remember a crash for the statistics: traffic car `a` into traffic car `b`, or into the world when
   * `b` is null. One lasting scrape counts once.
   */
  function noteCrash(a, b, speed) {
    const now = game.time.elapsed;
    if (now - a.lastCrashAt < 2 && (!b || now - b.lastCrashAt < 2)) return;
    a.lastCrashAt = now;
    if (b) {
      b.lastCrashAt = now;
      crashTimes[crashCursor] = now;
      crashCursor = (crashCursor + 1) % crashTimes.length;
      noteIncident(`crash ${describeCrasher(a)} into ${describeCrasher(b)} at ${speed.toFixed(1)} m/s`);
    } else {
      wallTimes[wallCursor] = now;
      wallCursor = (wallCursor + 1) % wallTimes.length;
      noteIncident(`wall ${describeCrasher(a)} at ${speed.toFixed(1)} m/s`);
    }
  }

  /** Keep a short note of something unusual (for debugging the traffic); only the last eight are kept. */
  function noteIncident(text) {
    const incidents = traffic.incidents;
    if (incidents.length >= 8) incidents.shift();
    incidents.push(`${game.time.elapsed.toFixed(1)}s ${text}`);
  }

  /** Forget cars someone else removed, and let go of cars the player or another system has taken. */
  function sweepLostCars() {
    const playerCar = game.player ? game.player.vehicle : null;
    for (let i = drivers.length - 1; i >= 0; i -= 1) {
      const state = drivers[i];
      const vehicle = state.vehicle;
      if (vehicle.despawned) {
        despawnPerson(state.driver);
        despawnPerson(state.passenger);
        forget(vehicle);
      } else if (vehicle.isPlayer || vehicle === playerCar || vehicle.ai !== state) {
        release(vehicle);
      }
    }
    for (let i = parked.length - 1; i >= 0; i -= 1) {
      const record = parked[i];
      if (record.vehicle.despawned) {
        if (record.spot) record.spot.vehicle = null;
        forget(record.vehicle);
      } else if (record.vehicle === playerCar || record.vehicle.ai !== record) {
        release(record.vehicle);
      }
    }
  }

  function forget(vehicle) {
    owned.delete(vehicle);
    let index = vehicles.indexOf(vehicle);
    if (index !== -1) removeAt(vehicles, index);
    for (index = drivers.length - 1; index >= 0; index -= 1) if (drivers[index].vehicle === vehicle) removeAt(drivers, index);
    for (index = parked.length - 1; index >= 0; index -= 1) if (parked[index].vehicle === vehicle) removeAt(parked, index);
  }

  /** Despawn a person who still belongs to the traffic (seated, or an angry driver beside the car). */
  function despawnPerson(person) {
    if (!person || !game.characters || !game.characters.despawn) return;
    const ai = person.ai;
    if (ai && ai.system === 'traffic') game.characters.despawn(person);
  }

  function readFocus() {
    const player = game.player;
    const focus = traffic.focus;
    if (player && (player.character || player.vehicle) && player.pos) {
      focus.x = player.pos.x;
      focus.z = player.pos.z;
    } else {
      focus.x = game.camera.position.x;
      focus.z = game.camera.position.z;
    }
  }

  function refreshView() {
    const camera = game.camera;
    camera.updateMatrixWorld();
    viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewMatrix);
  }

  /** The numbers the debug readout shows, and the traffic's own cost per frame (all of it, and the drivers' thinking alone). */
  function measure(ms, drivingMs) {
    const stats = traffic.stats;
    const now = game.time.elapsed;
    let speedSum = 0;
    let stopped = 0;
    let abandoned = 0;
    for (let i = 0; i < drivers.length; i += 1) {
      const state = drivers[i];
      speedSum += Math.abs(state.vehicle.speed);
      if (state.mode === 'abandoned' || state.mode === 'confront') abandoned += 1;
      else if (state.stillTime > LONG_STOP) stopped += 1;
    }
    stats.moving = drivers.length;
    stats.parked = parked.length;
    stats.meanSpeed = drivers.length ? speedSum / drivers.length : 0;
    stats.stoppedLong = stopped;
    stats.abandoned = abandoned;
    stats.fleeing = fleeing.length;
    stats.collisionsLastMinute = countSince(crashTimes, now - 60);
    stats.wallHitsLastMinute = countSince(wallTimes, now - 60);
    stats.updateMs += (ms - stats.updateMs) * 0.05;
    stats.peakMs = Math.max(ms, stats.peakMs * 0.995);
    stats.drivingMs += (drivingMs - stats.drivingMs) * 0.05;
  }

  return traffic;
}

function describeCrasher(state) {
  const turn = state.path ? state.path.turn : 'end';
  return `#${state.vehicle.id} (${state.mode} ${state.phase === 1 ? 'crossing' : 'lane'} ${turn} node ${state.lane.to.id} v ${state.vehicle.speed.toFixed(1)} off ${state.offset.toFixed(1)})`;
}

function countSince(times, since) {
  let count = 0;
  for (let i = 0; i < times.length; i += 1) if (times[i] > since && times[i] !== 0) count += 1;
  return count;
}

function distanceSq(pos, x, z) {
  const dx = pos.x - x;
  const dz = pos.z - z;
  return dx * dx + dz * dz;
}

function removeAt(list, index) {
  for (let i = index; i < list.length - 1; i += 1) list[i] = list[i + 1];
  list.length -= 1;
}
