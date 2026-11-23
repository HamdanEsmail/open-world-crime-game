// The people of Port Sarab: everyone who walks its sidewalks, stands about its markets, plazas and
// beach, waits at the kerb for the lights, and scatters, cowers, gawps or phones the police when the
// player starts trouble. This file owns the crowd and runs each person's mind on a staggered
// schedule; the jobs themselves live in the other files of this folder. Becomes game.pedestrians.
import * as THREE from 'three';
import { createPedestrianSpawner } from './pedestrianSpawner.js';
import { createPedestrianWalking } from './pedestrianWalking.js';
import { createPedestrianActivities } from './pedestrianActivities.js';
import { createPedestrianReactions } from './pedestrianReactions.js';
import { createCrimeWitnesses } from './crimeWitnesses.js';
import { releaseIntent } from './pedestrianSteering.js';

/**
 * Build the pedestrian system. It spawns and removes its own people around the player and steers
 * them only through their intent; it never touches characters it does not own.
 * @param {Object} game
 */
export function createPedestrianSystem(game) {
  const people = [];
  const stats = {
    alive: 0, walking: 0, standing: 0, fleeing: 0, dead: 0, stuck: 0, inRoad: 0, crossing: 0, waiting: 0,
    target: 0, updateMs: 0, peakMs: 0, spawned: 0, removed: 0, calls: 0,
  };
  const ctx = {
    game,
    people,
    stats,
    rng: game.rng.fork('pedestrians'),
    owner: OWNER,
    now: 0,
    dt: 0,
    speeds: { walk: 2.0, run: 4.6, sprint: 7.4 },
    player: { x: 0, z: 0, character: null, vehicle: null, onFoot: true, known: false },
    view: createCrowdView(game),
    grid: createCrowdGrid(),
    system: null,
    walking: null,
    activities: null,
    reactions: null,
    witnesses: null,
    spawner: null,
    setMode,
    resume,
    remove,
  };
  ctx.walking = createPedestrianWalking(ctx);
  ctx.activities = createPedestrianActivities(ctx);
  ctx.reactions = createPedestrianReactions(ctx);
  ctx.witnesses = createCrimeWitnesses(ctx);
  ctx.spawner = createPedestrianSpawner(ctx);

  const modeOwners = {};
  for (const mode of ctx.walking.modes) modeOwners[mode] = ctx.walking;
  for (const mode of ctx.activities.modes) modeOwners[mode] = ctx.activities;
  for (const mode of ctx.reactions.modes) modeOwners[mode] = ctx.reactions;
  for (const mode of ctx.witnesses.modes) modeOwners[mode] = ctx.witnesses;

  let enabled = true;
  let lastPlayerX = 0;
  let lastPlayerZ = 0;
  let nextCensus = 0;

  const system = {
    /** Every person this system owns (Characters; their .ai is the pedestrian mind). */
    list: people,
    /** Multiplier on how many people are about (missions may raise or lower it). */
    density: 1,
    stats,
    get enabled() {
      return enabled;
    },
    update,
    setDensity,
    setEnabled,
    clearArea,
    panicAt,
    refill,
    adopt,
    release,
    nearest,
    isPedestrian,
  };
  ctx.system = system;

  game.events.on('player:respawned', () => refill());
  game.events.on('character:despawned', (event) => {
    const character = event && event.character;
    if (!character || people.indexOf(character) === -1) return;
    // Someone else took one of our people out of the world: forget them quietly.
    const mind = character.ai;
    people.splice(people.indexOf(character), 1);
    if (mind && mind.owner === OWNER) {
      ctx.walking.forget(character, mind);
      ctx.activities.forget(character, mind);
      ctx.witnesses.forget(character, mind);
    }
  });

  /** Think for the people whose turn it is, steer everyone, spawn and recycle. */
  function update(dt) {
    if (!(dt > 0) || !game.characters || !game.roads) return;
    const started = performance.now();
    try {
      ctx.now = game.time.elapsed;
      ctx.dt = dt;
      readPlayer();
      ctx.view.refresh();
      readPaceSpeeds();
      pruneLost();
      ctx.grid.rebuild(people);
      if (enabled) ctx.spawner.update(dt);
      ctx.reactions.updateFrame(dt);
      for (let i = 0; i < people.length; i += 1) {
        const ped = people[i];
        const mind = ped.ai;
        if (ped.alive === false || ped.state === 'dead') {
          if (mind.mode !== 'dead') ctx.reactions.enterDead(ped, mind);
          releaseIntent(ped);
          continue;
        }
        if (ped.vehicle || DOWN_STATES[ped.state]) {
          if (mind.mode !== 'down') ctx.reactions.enterDown(ped, mind);
          releaseIntent(ped);
          continue;
        }
        if (ctx.now >= mind.nextThink) {
          mind.nextThink = ctx.now + THINK_INTERVAL * (0.8 + 0.4 * ctx.rng.next());
          think(ped, mind);
        }
        const owner = modeOwners[mind.mode];
        if (owner) owner.drive(ped, mind, dt);
      }
      ctx.witnesses.update(dt);
      if (ctx.now >= nextCensus) {
        nextCensus = ctx.now + 0.5;
        takeCensus();
      }
    } catch (error) {
      console.warn('pedestrians: update failed', error);
    }
    const ms = performance.now() - started;
    stats.updateMs += (ms - stats.updateMs) * 0.05;
    stats.peakMs = Math.max(stats.peakMs * 0.995, ms);
  }

  /** One look around for one person: senses first, then whatever they are busy with. */
  function think(ped, mind) {
    trackProgress(ped, mind);
    ctx.reactions.perceive(ped, mind);
    const owner = modeOwners[mind.mode];
    if (owner) owner.think(ped, mind);
  }

  /** Switch what a person is doing. */
  function setMode(ped, mode) {
    const mind = ped.ai;
    if (mind.mode === mode) return;
    mind.mode = mode;
    mind.modeSince = ctx.now;
    mind.progressX = ped.pos.x;
    mind.progressZ = ped.pos.z;
    mind.progressSince = ctx.now;
  }

  /** After a fright or an errand: back to the standing life if it is still there, else walk on. */
  function resume(ped) {
    const mind = ped.ai;
    mind.leader = null;
    if (mind.activity && ctx.activities.resume(ped, mind)) return;
    ctx.walking.rejoin(ped, mind);
  }

  /** Take one of our people out of the world. */
  function remove(ped) {
    const index = people.indexOf(ped);
    if (index === -1) return;
    const mind = ped.ai;
    people.splice(index, 1);
    ctx.walking.forget(ped, mind);
    ctx.activities.forget(ped, mind);
    ctx.witnesses.forget(ped, mind);
    if (ped.ai === mind) ped.ai = null;
    try {
      game.characters.despawn(ped);
    } catch (error) {
      console.warn('pedestrians: despawn failed', error);
    }
    ctx.spawner.recycleMind(mind);
    stats.removed += 1;
  }

  /** How crowded the streets are, as a multiplier (1 is normal, 0 empties them as people leave). */
  function setDensity(density) {
    system.density = Math.max(0, Number(density) || 0);
  }

  /** Stop (despawn everyone, spawn nobody) or start the street life again. */
  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) {
      for (let i = people.length - 1; i >= 0; i -= 1) remove(people[i]);
    } else {
      ctx.spawner.requestRefill();
    }
  }

  /**
   * Clear a place for a cutscene: everyone of ours within `radius` is removed at once and nobody
   * spawns there for `seconds`.
   */
  function clearArea(x, z, radius, seconds = 30) {
    for (let i = people.length - 1; i >= 0; i -= 1) {
      const ped = people[i];
      const dx = ped.pos.x - x;
      const dz = ped.pos.z - z;
      if (dx * dx + dz * dz <= radius * radius) remove(ped);
    }
    ctx.spawner.keepClear(x, z, radius, seconds);
  }

  /** A stampede: everyone within `radius` of (x, z) runs from it (missions, a staged panic). */
  function panicAt(x, z, radius, cause = 'panic') {
    ctx.reactions.alarm(cause, x, z, radius, 1, null);
  }

  /** Clear the crowd and fill the streets around the player at once (after a teleport or a respawn). */
  function refill() {
    for (let i = people.length - 1; i >= 0; i -= 1) remove(people[i]);
    ctx.spawner.requestRefill();
  }

  /**
   * Take over a civilian another system has finished with (a dragged-out driver, a freed hostage):
   * they get a pedestrian's life, starting with running from (fromX, fromZ) when given.
   * @param {Object} character
   * @param {{fromX?:number, fromZ?:number, flee?:boolean}} [options]
   */
  function adopt(character, options = {}) {
    if (!character || people.indexOf(character) !== -1) return false;
    ctx.spawner.adopt(character, options);
    return true;
  }

  /** Hand one of our people to another system (a mission's extra); we stop steering them. */
  function release(character) {
    const index = people.indexOf(character);
    if (index === -1) return false;
    const mind = character.ai;
    people.splice(index, 1);
    ctx.walking.forget(character, mind);
    ctx.activities.forget(character, mind);
    ctx.witnesses.forget(character, mind);
    character.ai = null;
    releaseIntent(character);
    return true;
  }

  /** The nearest living pedestrian to (x, z) within maxDistance, or null. */
  function nearest(x, z, maxDistance = 30) {
    let best = null;
    let bestSq = maxDistance * maxDistance;
    for (let i = 0; i < people.length; i += 1) {
      const ped = people[i];
      if (ped.alive === false) continue;
      const dx = ped.pos.x - x;
      const dz = ped.pos.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestSq) {
        bestSq = d2;
        best = ped;
      }
    }
    return best;
  }

  /** True for a person this system owns. */
  function isPedestrian(character) {
    return !!(character && character.ai && character.ai.owner === OWNER);
  }

  function readPlayer() {
    const player = ctx.player;
    const gp = game.player;
    const character = gp && gp.character ? gp.character : null;
    player.character = character;
    player.vehicle = gp && gp.vehicle ? gp.vehicle : null;
    player.onFoot = !player.vehicle;
    if (gp && character) {
      const pos = gp.pos;
      player.x = pos.x;
      player.z = pos.z;
      if (player.known) {
        const jump = Math.hypot(player.x - lastPlayerX, player.z - lastPlayerZ);
        if (jump > 120) refill();
      }
      player.known = true;
    } else {
      player.x = game.camera.position.x;
      player.z = game.camera.position.z;
    }
    lastPlayerX = player.x;
    lastPlayerZ = player.z;
  }

  /** The character system's walk, run and sprint speeds, when it publishes them. */
  function readPaceSpeeds() {
    const source = game.characters.paceSpeeds || game.characters.speeds || null;
    if (!source) return;
    if (source.walk > 0) ctx.speeds.walk = source.walk;
    if (source.run > 0) ctx.speeds.run = source.run;
    if (source.sprint > 0) ctx.speeds.sprint = source.sprint;
  }

  /** Drop anyone another system despawned or took over behind our back. */
  function pruneLost() {
    for (let i = people.length - 1; i >= 0; i -= 1) {
      const ped = people[i];
      if (ped.ai && ped.ai.owner === OWNER && !ped.despawned && !ped.removed) continue;
      const mind = ped.ai && ped.ai.owner === OWNER ? ped.ai : null;
      people.splice(i, 1);
      if (mind) {
        ctx.walking.forget(ped, mind);
        ctx.activities.forget(ped, mind);
        ctx.witnesses.forget(ped, mind);
      }
    }
  }

  /** Has this person got anywhere lately? Ten seconds without progress while meaning to move is stuck. */
  function trackProgress(ped, mind) {
    const dx = ped.pos.x - mind.progressX;
    const dz = ped.pos.z - mind.progressZ;
    if (dx * dx + dz * dz > 1.0 || !MOVING_MODES[mind.mode]) {
      mind.progressX = ped.pos.x;
      mind.progressZ = ped.pos.z;
      mind.progressSince = ctx.now;
      mind.stuck = false;
      return;
    }
    const still = ctx.now - mind.progressSince;
    mind.stuck = still > 10;
    if (still > 4 && mind.unstuckFor !== mind.progressSince) {
      mind.unstuckFor = mind.progressSince;
      ctx.walking.unstick(ped, mind);
    }
  }

  /** Counts for the debug readout: what people are doing, who is stuck, who idles in a lane. */
  function takeCensus() {
    let walking = 0;
    let standing = 0;
    let fleeing = 0;
    let dead = 0;
    let stuck = 0;
    let inRoad = 0;
    let crossing = 0;
    let waiting = 0;
    const terrain = game.terrain;
    for (let i = 0; i < people.length; i += 1) {
      const ped = people[i];
      const mind = ped.ai;
      const group = MODE_GROUP[mind.mode] || 'standing';
      if (group === 'walking') walking += 1;
      else if (group === 'fleeing') fleeing += 1;
      else if (group === 'dead') dead += 1;
      else standing += 1;
      if (mind.mode === 'cross') crossing += 1;
      if (mind.mode === 'wait') waiting += 1;
      if (mind.stuck) stuck += 1;
      if (terrain && !ROAD_ALLOWED[mind.mode] && !followingAcross(mind) && mind.travelThen !== 'walkway' && inTrafficLane(ped)) inRoad += 1;
    }
    stats.alive = people.length - dead;
    stats.walking = walking;
    stats.standing = standing;
    stats.fleeing = fleeing;
    stats.dead = dead;
    stats.stuck = stuck;
    stats.inRoad = inRoad;
    stats.crossing = crossing;
    stats.waiting = waiting;
  }

  /** Standing on a road where cars actually drive (not the empty mouth of a T-junction). */
  function inTrafficLane(ped) {
    if (game.terrain.surfaceAt(ped.pos.x, ped.pos.z) !== 'road') return false;
    return game.roads.nearestLane(ped.pos.x, ped.pos.z, 2.6) !== null;
  }

  function followingAcross(mind) {
    return mind.mode === 'follow' && mind.leader && mind.leader.ai && (mind.leader.ai.mode === 'cross' || mind.leader.ai.mode === 'wait');
  }

  return system;
}

/**
 * What the camera can see, refreshed once a frame: a frustum test and a line-of-sight test from the
 * camera, so people are only spawned and removed where nobody is looking.
 */
function createCrowdView(game) {
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const eye = new THREE.Vector3();
  const head = new THREE.Vector3();
  const view = {
    x: 0,
    y: 0,
    z: 0,
    ready: false,
    refresh() {
      const camera = game.camera;
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(matrix);
      eye.setFromMatrixPosition(camera.matrixWorld);
      view.x = eye.x;
      view.y = eye.y;
      view.z = eye.z;
      view.ready = game.time.frame > 2;
    },
    /** Is a sphere around (x, y, z) inside the camera's view cone? */
    inView(x, y, z, radius) {
      if (!view.ready) return true;
      sphere.center.set(x, y, z);
      sphere.radius = radius;
      return frustum.intersectsSphere(sphere);
    },
    /** Could the camera see a person standing at (x, z) now: in view, near enough, and not behind a building? */
    canSee(x, z, maxDistance) {
      const ground = game.terrain ? game.terrain.heightAt(x, z) : 0;
      if (!view.inView(x, ground + 0.9, z, 1.4)) return false;
      const dx = x - view.x;
      const dz = z - view.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > maxDistance * maxDistance) return false;
      if (d2 < 400 || !game.colliders) return true;
      head.set(x, ground + 1.7, z);
      if (game.colliders.lineOfSight(eye, head)) return true;
      head.y = ground + 0.4;
      return game.colliders.lineOfSight(eye, head);
    },
    distanceTo(x, z) {
      return Math.hypot(x - view.x, z - view.z);
    },
  };
  return view;
}

/**
 * A small spatial hash of our people, rebuilt every frame, for "who is near me" questions
 * (personal space, groups, a crowd reacting to one shot) without scanning everyone.
 */
function createCrowdGrid() {
  const CELL = 6;
  const SIZE = 512;
  const heads = new Int32Array(SIZE);
  let next = new Int32Array(64);
  let items = [];
  const visited = new Int32Array(32);
  const grid = {
    rebuild(list) {
      heads.fill(-1);
      if (next.length < list.length) next = new Int32Array(list.length * 2);
      items = list;
      for (let i = 0; i < list.length; i += 1) {
        const pos = list[i].pos;
        const key = bucket(Math.floor(pos.x / CELL), Math.floor(pos.z / CELL));
        next[i] = heads[key];
        heads[key] = i;
      }
    },
    /** Fill `out` with our people within `radius` of (x, z) (excluding `except`); returns out. */
    query(x, z, radius, out, except) {
      out.length = 0;
      const c0 = Math.floor((x - radius) / CELL);
      const c1 = Math.floor((x + radius) / CELL);
      const r0 = Math.floor((z - radius) / CELL);
      const r1 = Math.floor((z + radius) / CELL);
      const r2 = radius * radius;
      let seen = 0;
      for (let cx = c0; cx <= c1; cx += 1) {
        for (let cz = r0; cz <= r1; cz += 1) {
          const key = bucket(cx, cz);
          let duplicate = false;
          for (let k = 0; k < seen; k += 1) if (visited[k] === key) duplicate = true;
          if (duplicate) continue;
          if (seen < visited.length) visited[seen++] = key;
          for (let i = heads[key]; i !== -1; i = next[i]) {
            const ped = items[i];
            if (!ped || ped === except) continue;
            const dx = ped.pos.x - x;
            const dz = ped.pos.z - z;
            if (dx * dx + dz * dz <= r2) out.push(ped);
          }
        }
      }
      return out;
    },
  };
  function bucket(cx, cz) {
    return ((cx * 73856093) ^ (cz * 19349663)) & (SIZE - 1);
  }
  return grid;
}

const OWNER = 'pedestrians';
/** Seconds between one person's looks around (staggered, so a few people think each frame). */
const THINK_INTERVAL = 0.25;
const DOWN_STATES = { ragdoll: true, getUp: true, enterVehicle: true, exitVehicle: true, driving: true, passenger: true };
const MOVING_MODES = { walk: true, follow: true, travel: true, cross: true, flee: true };
/** Modes in which standing in a traffic lane is expected. */
const ROAD_ALLOWED = { cross: true, flee: true, dodge: true, down: true, dead: true, stumble: true, fight: true, cower: true, handsUp: true };
const MODE_GROUP = {
  walk: 'walking', follow: 'walking', travel: 'walking', cross: 'walking', wait: 'walking',
  activity: 'standing', stare: 'standing', look: 'standing', handsUp: 'standing', shout: 'standing', call: 'standing',
  flee: 'fleeing', cower: 'fleeing', dodge: 'fleeing', fight: 'fleeing', stumble: 'fleeing', down: 'fleeing',
  dead: 'dead',
};
