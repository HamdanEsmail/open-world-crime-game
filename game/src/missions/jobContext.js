// The job context `m`: everything a job script is written against, assembled from the run's parts
// (its spawns, its directed actors, its waits, its job card and voice). It also sets the city's
// mood for the job (time, khamsin, traffic, wanted level), watches the ways a job can fail, moves the
// Cover meter, and ends the run: every wait rejected, everything the job made cleared in one place.
import { JobEnded, createJobWaits, isGone, isDown, endedPromise } from './jobWaits.js';
import { createJobActors } from './jobActors.js';
import { createJobCard } from './jobCard.js';
import { createJobSpawns } from './jobSpawns.js';

let runSerial = 0;

/**
 * Begin one run of a job and build its `m`.
 * @param {Object} game
 * @param {Object} job  a job module's `job` export
 * @param {{resumeFrom?:string|null, giver?:Function, fail:Function, scriptError:Function,
 *   adoptCast?:Function, keepCast?:Function, leftover?:Function}} hooks  what the mission runner lends the run
 * @returns {Object} run: { m, view, owner, checkpoint, afterCalls, ended, outcome, update(dt), end(outcome, reason) }
 */
export function createJobRun(game, job, hooks) {
  runSerial += 1;
  const run = {
    job,
    owner: `job:${job.id}:${runSerial}`,
    ended: false,
    outcome: null,
    endReason: '',
    resumeFrom: hooks.resumeFrom || null,
    checkpoint: hooks.resumeFrom || null,
    view: { id: job.id, title: job.title, giver: job.giver, kicker: `JOB ${job.order || ''}`.trim(), objectives: [], timer: null, counter: null, tail: null },
    vehicles: [],
    people: [],
    kept: new Set(),
    markers: [],
    undo: [],
    failChecks: [],
    timers: [],
    unsubscribe: [],
    afterCalls: [],
    nag: null,
    faded: false,
    lockedWanted: null,
    touched: new Set(),
    update,
    end,
    m: null,
  };
  const ops = { live, fail: failSoftly, scriptError };
  const tools = {
    pointOf, mark, unmark, fail: failSoftly, scriptError, vehicleName,
    counter: (label, value, of) => card.showCounter(label, value, of),
    clearCounter: (display) => card.clearCounter(display),
    nag: (text) => card.nag(text),
  };
  const waits = createJobWaits(game, run, tools);
  const actors = createJobActors(game, run);
  const card = createJobCard(game, run, waits, ops);
  const spawns = createJobSpawns(game, run, hooks, actors, ops);
  const warnedPlaces = new Set();

  const m = {
    game,
    job,
    get resumeFrom() { return run.resumeFrom; },
    /** The cast member who gave the job, standing at the contact (null when nobody is there). */
    get giver() {
      const giver = typeof hooks.giver === 'function' ? hooks.giver() : hooks.giver;
      return giver && !giver.despawned && giver.alive !== false ? giver : null;
    },
    get player() { return game.player; },
    // The world
    place,
    landmark,
    spawnVehicle: spawns.spawnVehicle,
    spawnPerson: spawns.spawnPerson,
    spawnCast: spawns.spawnCast,
    spawnEnemies: spawns.spawnEnemies,
    seat: spawns.seat,
    driveTo: (vehicle, x, z, options) => waits.settleOn(live() && actors.driveTo(vehicle, x, z, options)),
    fleeFrom: (vehicle, options) => live() && actors.fleeFrom(vehicle, options),
    pursue: (vehicle, options) => live() && actors.pursue(vehicle, options),
    stopDriving: (vehicle) => live() && actors.stopDriving(vehicle),
    walkTo: (person, x, z, options) => waits.settleOn(live() && actors.walkTo(person, x, z, options)),
    hostile: (person, options) => live() && actors.hostile(person, options),
    calm: (person) => live() && actors.calm(person),
    keep: spawns.keep,
    remove: spawns.remove,
    marker: (target, options = {}) => live() && mark(target, { ...options, beacon: options.beacon !== false }),
    clearMarker: (marker) => unmark(marker),
    setTime,
    setWeather,
    setTraffic: (density) => setDensity(game.traffic, density),
    setPedestrians: (density) => setDensity(game.pedestrians, density),
    clearArea,
    wanted: {
      set: (level) => live() && game.wanted?.set?.(level),
      lock: lockWanted,
      clear() {
        live();
        run.lockedWanted = null;
        game.wanted?.clear?.();
      },
      get level() { return game.wanted ? game.wanted.level || 0 : 0; },
    },
    police: { suspend: (seconds) => live() && game.police?.suspend?.(seconds) },
    teleportPlayer: (x, z, heading) => live() && game.player?.teleport?.(x, z, heading),
    playerInto: (vehicle) => live() && vehicle && game.player?.putInVehicle?.(vehicle),
    // Telling the player
    objective: card.objective,
    subtitle: card.subtitle,
    say: card.say,
    notify: (text, kind = 'info') => game.events.emit('notify', { text, kind }),
    timer: card.timer,
    counter: card.counter,
    cutscene: card.cutscene,
    phone: card.phone,
    fadeOut: (seconds = 0.6) => card.fade(true, seconds),
    fadeIn: (seconds = 0.6) => card.fade(false, seconds),
    // Waiting
    reach: (target, radius, options) => waits.reach(target, radius, options),
    inVehicle: (vehicle, options) => waits.inVehicle(vehicle, options),
    onFoot: () => waits.onFoot(),
    dead: (people, options) => waits.dead(people, options),
    destroyed: (vehicle) => waits.destroyed(vehicle),
    stopped: (vehicle, options) => waits.stopped(vehicle, options),
    lostWanted: () => waits.lostWanted(),
    seconds: (n) => waits.seconds(n),
    until: (fn) => waits.until(fn),
    checkpoints: (points, options) => waits.checkpoints(points, options),
    tail: (vehicle, options) => waits.tail(vehicle, options),
    choice: (options) => waits.choice(options),
    any,
    // Failing
    failIf,
    failIfDestroyed: (vehicle, reason) => failIf(() => isGone(vehicle), reason || `The ${vehicleName(vehicle)} is wrecked.`),
    failIfDead: (person, reason) => failIf(() => isDown(person), reason || `${(person && person.name) || 'They'} didn't make it.`),
    failIfLeft,
    fail(reason) {
      failSoftly(reason);
      throw new JobEnded(reason);
    },
    checkpoint(name) {
      live();
      run.checkpoint = name;
    },
    // Story and rewards
    trust: (n, why) => live() && game.story?.addTrust?.(n, why),
    badge: (n, why) => live() && game.story?.addBadge?.(n, why),
    flag(name, value) {
      const story = game.story;
      if (!story) return undefined;
      if (arguments.length < 2) return story.flag ? story.flag(name) : story.flags[name];
      live();
      return story.flag ? story.flag(name, value) : (story.flags[name] = value);
    },
    give: (weaponId, ammo) => live() && spawns.arm(game.player && game.player.character, weaponId, ammo),
    pay: (amount, reason) => live() && game.economy?.addMoney?.(amount, reason || job.title),
    stat: (name, n = 1) => game.economy?.stats?.add?.(name, n),
    unlockSafehouse,
    grantVehicle,
    // Helpers beyond the core list
    on,
    callAfter(castId, lines, delay = 6) {
      run.afterCalls.push({ castId, lines, delay });
    },
    distanceTo(target) {
      const point = pointOf(target);
      const player = game.player;
      return point && player && player.character ? Math.hypot(player.pos.x - point.x, player.pos.z - point.z) : Infinity;
    },
    vehicleName,
  };
  run.m = m;

  /** Throw JobEnded into a script that keeps going after its job ended; true otherwise. */
  function live() {
    if (run.ended) throw new JobEnded(run.endReason);
    return true;
  }

  // ---- The world -------------------------------------------------------------------------------

  function place(id) {
    const found = game.city && game.city.place ? game.city.place(id) : null;
    if (!found && !warnedPlaces.has(id)) {
      warnedPlaces.add(id);
      console.warn(`job ${job.id}: no place called "${id}"`);
    }
    return found;
  }

  function landmark(id) {
    const list = (game.city && game.city.landmarks) || [];
    return list.find((item) => item.id === id) || list.find((item) => item.kind === id) || null;
  }

  function setTime(hour) {
    live();
    if (game.sky && typeof game.sky.setHour === 'function') game.sky.setHour(hour);
    else game.time.hour = hour;
  }

  /** Raise or settle the khamsin (0..1) over `rampSeconds`; put back as it was when the job ends. */
  function setWeather(sandstorm, rampSeconds = 20) {
    live();
    const weather = game.weather;
    if (!weather) return;
    if (!run.touched.has(weather)) {
      run.touched.add(weather);
      const before = weather.sandstorm || 0;
      run.undo.push(() => {
        if (before <= 0.01) weather.clear?.(8);
        else weather.start?.(before, 8);
      });
    }
    if (sandstorm > 0) weather.start?.(sandstorm, rampSeconds);
    else weather.clear?.(rampSeconds);
  }

  /** Thin out or crowd the streets for the job; put back as it was when the job ends. */
  function setDensity(system, density) {
    live();
    if (!system) return;
    if (!run.touched.has(system)) {
      run.touched.add(system);
      const before = typeof system.density === 'number' ? system.density : 1;
      run.undo.push(() => applyDensity(system, before));
    }
    applyDensity(system, density);
  }

  function clearArea(x, z, radius) {
    live();
    game.traffic?.clearArea?.(x, z, radius);
    game.pedestrians?.clearArea?.(x, z, radius);
  }

  /** Hold the wanted level at `level` (null lets go); released when the job ends. */
  function lockWanted(level) {
    live();
    run.lockedWanted = level === null || level === undefined ? null : level;
    if (game.wanted && typeof game.wanted.lock === 'function') game.wanted.lock(run.lockedWanted);
    else if (game.wanted && run.lockedWanted !== null) game.wanted.set?.(run.lockedWanted);
    if (run.lockedWanted !== null && !run.touched.has('wantedLock')) {
      run.touched.add('wantedLock');
      run.undo.push(() => {
        run.lockedWanted = null;
        if (game.wanted && game.wanted.locked !== false) game.wanted.lock?.(null);
      });
    }
  }

  /** Resolve with the index of the first promise to settle; the other waits are cancelled. */
  function any(promises) {
    if (run.ended) return endedPromise(run.endReason);
    const list = promises || [];
    const race = new Promise((resolve, reject) => {
      let settled = false;
      list.forEach((promise, index) => {
        if (!promise) return;
        Promise.resolve(promise).then(() => {
          if (settled) return;
          settled = true;
          cancelOthers(index);
          resolve(index);
        }, (error) => {
          if (settled) return;
          settled = true;
          cancelOthers(index);
          reject(error);
        });
      });
    });
    function cancelOthers(winner) {
      list.forEach((promise, index) => {
        if (index !== winner) waits.cancel(promise);
      });
    }
    return waits.track(race);
  }

  // ---- Failing ---------------------------------------------------------------------------------

  /** Check `fn()` every frame (outside cutscenes); the job fails with `reason` when it is true. */
  function failIf(fn, reason) {
    live();
    const check = { fn, reason: reason || 'The job fell apart.', stopped: false };
    run.failChecks.push(check);
    return { stop() { check.stopped = true; } };
  }

  /** Fail when the player strays more than `metres` from `vehicle` (warned at six tenths of it). */
  function failIfLeft(vehicle, metres = 120, reason) {
    const name = vehicleName(vehicle);
    let warned = false;
    return failIf(() => {
      const player = game.player;
      if (!vehicle || !player || !player.character || player.vehicle === vehicle) {
        warned = false;
        return false;
      }
      const d = Math.hypot(player.pos.x - vehicle.pos.x, player.pos.z - vehicle.pos.z);
      if (d > metres * 0.6 && !warned) {
        warned = true;
        game.events.emit('notify', { text: `Get back to the ${name}.`, kind: 'bad' });
      } else if (d < metres * 0.5) {
        warned = false;
      }
      return d > metres;
    }, reason || `You left the ${name} behind.`);
  }

  function failSoftly(reason) {
    if (!run.ended) hooks.fail(run, reason || 'The job fell apart.');
  }

  function scriptError(error) {
    if (!run.ended) hooks.scriptError(run, error);
  }

  function checkFailConditions() {
    for (let i = 0; i < run.failChecks.length; i += 1) {
      const check = run.failChecks[i];
      if (check.stopped) continue;
      let failed = false;
      try {
        failed = check.fn();
      } catch (error) {
        scriptError(error);
        return;
      }
      if (failed) {
        failSoftly(check.reason);
        return;
      }
    }
  }

  // ---- Story and rewards -----------------------------------------------------------------------

  function unlockSafehouse(placeId) {
    live();
    if (game.safehouses && typeof game.safehouses.unlock === 'function') {
      game.safehouses.unlock(placeId);
      return;
    }
    const spot = place(placeId);
    if (spot) spot.owned = true;
    game.story?.flag?.(`safehouse:${placeId}`, true);
    game.events.emit('safehouse:unlocked', { place: spot, id: placeId });
    game.events.emit('notify', { text: `New safehouse: ${spot ? spot.name : placeId}`, kind: 'good' });
  }

  /** Park an owned vehicle at a place (the garages keep it from now on). */
  function grantVehicle(specId, placeId) {
    live();
    if (game.safehouses && typeof game.safehouses.grantVehicle === 'function') return game.safehouses.grantVehicle(specId, placeId);
    const spot = place(placeId);
    const story = game.story;
    if (story && story.flags) {
      const owned = story.flags.grantedVehicles || [];
      owned.push({ spec: specId, place: placeId });
      story.flags.grantedVehicles = owned;
    }
    game.events.emit('vehicle:granted', { specId, placeId });
    if (!spot || !game.vehicles) return null;
    const vehicle = game.vehicles.spawn(specId, { x: spot.curbX, z: spot.curbZ, heading: spot.heading + Math.PI / 2, parked: true });
    if (vehicle) vehicle.tags.owned = true;
    return vehicle;
  }

  /** Hear a game event for the rest of the job (unsubscribed when it ends). */
  function on(name, handler) {
    const off = game.events.on(name, (payload) => {
      if (run.ended) return;
      try {
        handler(payload);
      } catch (error) {
        scriptError(error);
      }
    });
    run.unsubscribe.push(off);
    return off;
  }

  // ---- The frame and the end -------------------------------------------------------------------

  /** Advance the run: actors, waits, timers and fail checks (the last two pause in cutscenes). */
  function update(dt) {
    if (run.ended) return;
    actors.update(dt);
    waits.update(dt);
    if (run.ended) return;
    const inCutscene = Boolean(game.cutscenes && game.cutscenes.playing);
    if (!inCutscene) {
      card.updateTimers(dt);
      if (run.ended) return;
      checkFailConditions();
      if (run.ended) return;
    }
    for (let i = 0; i < run.vehicles.length; i += 1) {
      const vehicle = run.vehicles[i];
      if (vehicle.tags.invulnerable && !vehicle.wrecked && vehicle.health < vehicle.maxHealth) vehicle.health = vehicle.maxHealth;
    }
    const wanted = game.wanted;
    if (run.lockedWanted !== null && wanted && typeof wanted.lock !== 'function' && wanted.level !== run.lockedWanted) wanted.set?.(run.lockedWanted);
  }

  /**
   * End the run: every pending wait throws JobEnded into the script, and whatever the job made is
   * cleared away. outcome 'completed' | 'failed' | 'aborted'.
   */
  function end(outcome, reason) {
    if (run.ended) return;
    run.ended = true;
    run.outcome = outcome;
    run.endReason = reason || outcome;
    waits.endAll(new JobEnded(run.endReason));
    actors.releaseAll();
    for (const off of run.unsubscribe) off();
    run.unsubscribe.length = 0;
    const director = game.cutscenes;
    if (director && director.playing && director.owner === run.owner) director.stop?.();
    if (run.faded) director?.fadeIn?.(0.8);
    if (outcome !== 'completed') {
      game.story?.dialogue?.clear?.(run.owner);
      game.phone?.cancel?.(run.owner);
    }
    card.nag(null);
    for (const marker of run.markers) game.markers?.remove(marker);
    run.markers.length = 0;
    game.markers?.removeByOwner?.(run.owner);
    for (let i = run.undo.length - 1; i >= 0; i -= 1) {
      try {
        run.undo[i]();
      } catch (error) {
        console.warn('job clean-up step failed', error);
      }
    }
    spawns.clearAway(outcome, reason);
    run.view.timer = null;
    run.view.counter = null;
    run.view.tail = null;
  }

  // ---- Markers ---------------------------------------------------------------------------------

  /** {x, z} of a place id, a landmark id, an entity or a point. */
  function pointOf(target) {
    if (!target) return null;
    if (typeof target === 'string') return place(target) || landmark(target);
    if (target.pos) return target.pos;
    return target;
  }

  /** Add a marker the run owns: a beacon, a blip and (route: true) the GPS line. */
  function mark(target, options = {}) {
    if (!game.markers || !target) return null;
    const entity = target.pos ? target : null;
    const point = entity ? null : pointOf(target);
    if (!entity && !point) return null;
    const fields = {
      kind: options.kind || 'objective',
      label: options.label || (entity && entity.spec ? entity.spec.name : job.title),
      color: options.color === undefined ? 0xffd24a : options.color,
      radius: options.radius || 3,
      beacon: options.beacon !== false,
      route: options.route !== false,
      edge: options.edge !== false,
      owner: run.owner,
    };
    if (entity) fields.entity = entity;
    else fields.pos = { x: point.x, y: game.terrain ? game.terrain.heightAt(point.x, point.z) : 0, z: point.z };
    const marker = game.markers.add(fields);
    run.markers.push(marker);
    return marker;
  }

  function unmark(marker) {
    if (!marker) return;
    game.markers?.remove(marker);
    const index = run.markers.indexOf(marker);
    if (index !== -1) run.markers.splice(index, 1);
  }

  return run;
}

/** The model name of a vehicle, for "Get back in the ..." */
export function vehicleName(vehicle) {
  return (vehicle && vehicle.spec && vehicle.spec.name) || 'car';
}

function applyDensity(system, density) {
  if (typeof system.setDensity === 'function') system.setDensity(density);
  else system.density = density;
}
