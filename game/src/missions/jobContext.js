// The job context `m`: everything a job script is written against. It spawns and directs the job's
// cars and people, puts objectives, timers and tallies on the job card, speaks the lines, rolls the
// cutscenes and phone calls, watches the ways a job can fail, and keeps the books, so that whatever
// a job made is cleared away in one place, at whatever moment the job ends.
import { JobEnded, createJobWaits, isGone, isDown, endedPromise } from './jobWaits.js';
import { createJobActors } from './jobActors.js';

let runSerial = 0;

/**
 * Begin one run of a job and build its `m`.
 * @param {Object} game
 * @param {Object} job  a job module's `job` export
 * @param {{resumeFrom?:string|null, giver?:Object|null, fail:Function, scriptError:Function,
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
  const tools = { pointOf, mark, unmark, counter: showCounter, clearCounter, nag, fail: failSoftly, scriptError, vehicleName };
  const waits = createJobWaits(game, run, tools);
  const actors = createJobActors(game, run);
  const warnedPlaces = new Set();

  const m = {
    game,
    job,
    get resumeFrom() { return run.resumeFrom; },
    /** The cast member who gave the job, standing at the contact (null when nobody was there). */
    get giver() {
      const giver = typeof hooks.giver === 'function' ? hooks.giver() : hooks.giver;
      return giver && !giver.despawned && giver.alive !== false ? giver : null;
    },
    get player() { return game.player; },
    // The world
    place,
    landmark,
    spawnVehicle,
    spawnPerson,
    spawnCast,
    spawnEnemies,
    seat,
    driveTo: (vehicle, x, z, options) => waits.settleOn(live() && actors.driveTo(vehicle, x, z, options)),
    fleeFrom: (vehicle, options) => live() && actors.fleeFrom(vehicle, options),
    pursue: (vehicle, options) => live() && actors.pursue(vehicle, options),
    stopDriving: (vehicle) => live() && actors.stopDriving(vehicle),
    walkTo: (person, x, z, options) => waits.settleOn(live() && actors.walkTo(person, x, z, options)),
    hostile: (person, options) => live() && actors.hostile(person, options),
    calm: (person) => live() && actors.calm(person),
    keep,
    remove,
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
    objective,
    subtitle,
    say,
    notify: (text, kind = 'info') => game.events.emit('notify', { text, kind }),
    timer,
    counter: (label, value = 0, of) => {
      live();
      const display = showCounter(label, value, of);
      return { set(v) { display.value = v; }, clear() { clearCounter(display); }, get value() { return display.value; } };
    },
    cutscene,
    phone,
    fadeOut: (seconds = 0.6) => fade(true, seconds),
    fadeIn: (seconds = 0.6) => fade(false, seconds),
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
    give: (weaponId, ammo) => live() && arm(game.player && game.player.character, weaponId, ammo),
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

  /** A vehicle that belongs to the job (traffic and the police clean-up leave it alone). */
  function spawnVehicle(specId, options = {}) {
    live();
    if (!game.vehicles) return null;
    const x = options.x || 0;
    const z = options.z || 0;
    makeRoom(x, z, 5.5);
    const vehicle = game.vehicles.spawn(specId, { x, z, heading: options.heading || 0, color: options.color, faction: options.faction, parked: !!options.parked, locked: !!options.locked });
    if (!vehicle) return null;
    vehicle.tags.mission = true;
    vehicle.tags.job = job.id;
    if (options.health) {
      vehicle.health = options.health;
      vehicle.maxHealth = Math.max(vehicle.maxHealth || 0, options.health);
    }
    if (options.invulnerable) vehicle.tags.invulnerable = true;
    run.vehicles.push(vehicle);
    return vehicle;
  }

  /** A person who belongs to the job, armed when `weapon` is given. */
  function spawnPerson(options = {}) {
    live();
    if (!game.characters) return null;
    const archetype = options.archetype || 'civilian';
    const person = game.characters.spawn({
      kind: options.kind || KIND_FOR_ARCHETYPE[archetype] || 'civilian',
      faction: options.faction,
      archetype,
      x: options.x || 0,
      z: options.z || 0,
      heading: options.heading || 0,
      name: options.name,
      health: options.health,
      armor: options.armor,
      look: options.look,
    });
    if (!person) return null;
    person.tags.mission = true;
    person.ai = { mission: true, owner: run.owner, mode: 'idle' };
    if (options.weapon) arm(person, options.weapon, options.ammo);
    run.people.push(person);
    return person;
  }

  /** A member of the story's cast, with their own look; the one standing at the contact is reused. */
  function spawnCast(castId, x, z, heading = 0) {
    live();
    const adopted = hooks.adoptCast ? hooks.adoptCast(castId) : null;
    if (adopted) {
      if (Math.hypot(adopted.pos.x - x, adopted.pos.z - z) > 0.5) {
        adopted.pos.set(x, game.terrain ? game.terrain.heightAt(x, z) : 0, z);
        adopted.vel.set(0, 0, 0);
      }
      adopted.heading = heading;
      adopted.intent.gesture = null;
      adopted.intent.faceYaw = heading;
      adopted.ai = { mission: true, owner: run.owner, mode: 'idle' };
      run.people.push(adopted);
      return adopted;
    }
    const person = game.story && game.story.spawnCast ? game.story.spawnCast(castId, x, z, heading) : null;
    if (!person) return null;
    person.tags.mission = true;
    person.ai = { mission: true, owner: run.owner, mode: 'idle' };
    run.people.push(person);
    return person;
  }

  /** `count` armed people on free ground around (x, z), already fighting the player. */
  function spawnEnemies(count, options = {}) {
    live();
    const cx = options.x || 0;
    const cz = options.z || 0;
    const spots = freeGroundAround(cx, cz, options.radius || 10, count);
    const player = game.player && game.player.character;
    const list = [];
    for (const spot of spots) {
      const heading = player ? Math.atan2(player.pos.x - spot.x, player.pos.z - spot.z) : 0;
      const person = spawnPerson({
        archetype: options.archetype || 'gang', kind: options.kind, faction: options.faction || 'gang', name: options.name,
        x: spot.x, z: spot.z, heading, weapon: options.weapon === undefined ? 'pistol' : options.weapon, ammo: options.ammo,
        health: options.health, armor: options.armor,
      });
      if (!person) continue;
      actors.hostile(person, { accuracy: options.accuracy === undefined ? 0.45 : options.accuracy, style: options.style || 'cover' });
      list.push(person);
    }
    return list;
  }

  /** Put a person in a seat at once (seat 0 drives). */
  function seat(vehicle, person, seatIndex = 0) {
    live();
    if (!vehicle || !person || !game.characters) return;
    game.characters.enterVehicle(person, vehicle, seatIndex, { instant: true });
    if (seatIndex === 0 && vehicle.driver !== person) game.vehicles?.setDriver?.(vehicle, person);
  }

  function keep(entity) {
    if (entity) run.kept.add(entity);
    return entity;
  }

  function remove(entity) {
    if (!entity) return;
    actors.release(entity);
    if (entity.spec) despawnVehicle(entity);
    else despawnPerson(entity);
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

  // ---- Telling the player ----------------------------------------------------------------------

  /** Set the current objective; a new main objective ticks the previous one done. */
  function objective(text, options = {}) {
    live();
    nag(null);
    const objectives = run.view.objectives;
    const optional = !!options.optional;
    if (!optional) for (const entry of objectives) if (!entry.done && !entry.optional) entry.done = true;
    const entry = { text, done: false, optional };
    objectives.push(entry);
    trimObjectives(objectives);
    game.events.emit('mission:objective', { mission: run.view, text });
    return {
      get text() { return entry.text; },
      done() {
        entry.done = true;
      },
      fail() {
        const index = objectives.indexOf(entry);
        if (index !== -1) objectives.splice(index, 1);
        if (!run.ended) game.events.emit('notify', { text: `Failed: ${entry.text}`, kind: 'bad' });
      },
    };
  }

  /** Show a line of dialogue; lines queue so they never overlap. Resolves once it has been shown. */
  function subtitle(speaker, text, seconds) {
    if (run.ended) return endedPromise(run.endReason);
    const dialogue = game.story && game.story.dialogue;
    if (dialogue) return waits.settleOn(dialogue.add(speaker, text, seconds, run.owner));
    const shown = seconds || 2.2 + 0.045 * String(text || '').length;
    game.events.emit('subtitle', { speaker, text, seconds: shown });
    return waits.seconds(shown);
  }

  /** Several lines in order: [[speaker, text, seconds?], ...]. Resolves after the last. */
  function say(lines) {
    if (run.ended) return endedPromise(run.endReason);
    let last = null;
    for (const line of lines || []) if (line) last = subtitle(line[0], line[1], line[2]);
    return last || waits.seconds(0);
  }

  /** A countdown on the job card; fails the job when it runs out unless onExpire says otherwise. */
  function timer(label, seconds, options = {}) {
    live();
    const clock = {
      display: { label, seconds },
      remaining: seconds,
      onExpire: options.onExpire === undefined ? 'fail' : options.onExpire,
      reason: options.reason || 'Out of time.',
      stopped: false,
      tick: Math.ceil(seconds),
    };
    run.timers.push(clock);
    run.view.timer = clock.display;
    return {
      get remaining() { return Math.max(0, clock.remaining); },
      stop() {
        clock.stopped = true;
        refreshTimerDisplay();
      },
      add(more) {
        clock.remaining += more;
        clock.display.seconds = Math.max(0, clock.remaining);
      },
    };
  }

  /** A cutscene through the director (letterboxed, skippable); resolves when it is over. */
  function cutscene(shots) {
    if (run.ended) return endedPromise(run.endReason);
    const director = game.cutscenes;
    if (!director || typeof director.play !== 'function') {
      let total = 0;
      for (const shot of shots || []) {
        if (shot.text) subtitle(shot.speaker || '', shot.text, shot.seconds);
        total += shot.seconds || 3;
      }
      return waits.seconds(total);
    }
    return waits.track(director.play(shots, { owner: run.owner }));
  }

  /** The phone rings; the lines play once it is answered. Resolves after the call. */
  function phone(castId, lines) {
    if (run.ended) return endedPromise(run.endReason);
    const handset = game.phone;
    if (!handset || typeof handset.ring !== 'function') return say(lines);
    return waits.track(handset.ring(castId, lines, { owner: run.owner }));
  }

  function fade(out, seconds) {
    if (run.ended) return endedPromise(run.endReason);
    run.faded = out;
    const director = game.cutscenes;
    const fader = director && (out ? director.fadeOut : director.fadeIn);
    if (typeof fader !== 'function') return waits.seconds(0);
    return waits.track(fader.call(director, seconds));
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
      updateTimers(dt);
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
    nag(null);
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
    clearAwayEntities(outcome, reason);
    run.view.timer = null;
    run.view.counter = null;
    run.view.tail = null;
  }

  /**
   * People first, then vehicles. Kept things stay; the car the player sits in stays (unless a save is
   * being loaded); cast members near their own contact go back to standing there; on a completed job
   * whatever is near the player fades out of the world later instead of vanishing in front of him.
   */
  function clearAwayEntities(outcome, reason) {
    const player = game.player;
    const loading = reason === 'load';
    const playerVehicle = player ? player.vehicle : null;
    for (const person of run.people) {
      if (!person || person.despawned || (player && person === player.character)) continue;
      if (run.kept.has(person)) {
        person.tags.mission = false;
        person.ai = null;
        continue;
      }
      if (!loading && person.tags.castId && hooks.keepCast && hooks.keepCast(person)) continue;
      if (outcome === 'completed' && hooks.leftover && nearPlayer(person, 70)) {
        hooks.leftover(person);
        continue;
      }
      despawnPerson(person);
    }
    for (const vehicle of run.vehicles) {
      if (!vehicle || vehicle.despawned) continue;
      if (run.kept.has(vehicle) || (vehicle === playerVehicle && !loading)) {
        vehicle.tags.mission = false;
        vehicle.tags.invulnerable = false;
        vehicle.ai = null;
        continue;
      }
      if (outcome === 'completed' && hooks.leftover && nearPlayer(vehicle, 70)) {
        hooks.leftover(vehicle);
        continue;
      }
      despawnVehicle(vehicle);
    }
    run.people.length = 0;
    run.vehicles.length = 0;
  }

  // ---- Small helpers ---------------------------------------------------------------------------

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

  function showCounter(label, value, of) {
    const display = { label, value, of };
    run.view.counter = display;
    return display;
  }

  function clearCounter(display) {
    if (display && run.view.counter === display) run.view.counter = null;
  }

  /** Replace the current objective's text for a while ("Get back in the Sirocco"); null restores it. */
  function nag(text) {
    const objectives = run.view.objectives;
    if (text === null) {
      if (!run.nag) return;
      if (run.nag.temporary) {
        const index = objectives.indexOf(run.nag.entry);
        if (index !== -1) objectives.splice(index, 1);
      } else {
        run.nag.entry.text = run.nag.original;
      }
      run.nag = null;
      return;
    }
    if (!run.nag) {
      let entry = null;
      for (const candidate of objectives) if (!candidate.done && !candidate.optional) entry = candidate;
      if (entry) run.nag = { entry, original: entry.text, temporary: false };
      else {
        entry = { text, done: false, optional: false };
        objectives.push(entry);
        run.nag = { entry, original: text, temporary: true };
      }
    }
    run.nag.entry.text = text;
  }

  function updateTimers(dt) {
    for (let i = 0; i < run.timers.length; i += 1) {
      const clock = run.timers[i];
      if (clock.stopped) continue;
      clock.remaining -= dt;
      clock.display.seconds = Math.max(0, clock.remaining);
      const whole = Math.ceil(clock.remaining);
      if (whole < clock.tick) {
        clock.tick = whole;
        if (whole <= 5 && whole >= 1) game.audio?.play?.('menuMove', { volume: 0.9 });
      }
      if (clock.remaining > 0) continue;
      clock.stopped = true;
      refreshTimerDisplay();
      if (clock.onExpire === 'fail') {
        failSoftly(clock.reason);
        return;
      }
      if (typeof clock.onExpire === 'function') {
        try {
          clock.onExpire();
        } catch (error) {
          scriptError(error);
        }
      }
    }
  }

  function refreshTimerDisplay() {
    run.view.timer = null;
    for (const clock of run.timers) if (!clock.stopped) run.view.timer = clock.display;
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

  /** Clear parked or driverless strangers off the spot a job vehicle is about to appear on. */
  function makeRoom(x, z, radius) {
    game.traffic?.clearArea?.(x, z, radius + 4);
    const vehicles = game.vehicles;
    if (!vehicles) return;
    for (let i = vehicles.list.length - 1; i >= 0; i -= 1) {
      const other = vehicles.list[i];
      if (other.tags.mission || other.tags.owned || other.isPlayer || other.driver) continue;
      if (game.traffic && typeof game.traffic.owns === 'function' && game.traffic.owns(other)) continue;
      if (Math.hypot(other.pos.x - x, other.pos.z - z) < radius) vehicles.despawn(other);
    }
  }

  /** Spots for people around a point: dry, clear of walls, cars and each other, not on top of the player. */
  function freeGroundAround(x, z, radius, count) {
    const spots = [];
    const colliders = game.colliders;
    const terrain = game.terrain;
    const player = game.player && game.player.character;
    for (let attempt = 0; attempt < count * 30 && spots.length < count; attempt += 1) {
      const relaxed = attempt > count * 20;
      const angle = attempt * 2.39996 + Math.random() * 0.6;
      const r = radius * Math.sqrt(Math.min(1, (attempt % 24 + 0.5) / 12)) * (relaxed ? 1.3 : 1);
      const px = x + Math.sin(angle) * r;
      const pz = z + Math.cos(angle) * r;
      if (terrain && terrain.isWater && terrain.isWater(px, pz)) continue;
      if (colliders && colliders.query(px, pz, 0.7, QUERY_OUT).length > 0) continue;
      if (game.vehicles && game.vehicles.nearest(px, pz, 2.8)) continue;
      if (!relaxed && player && Math.hypot(player.pos.x - px, player.pos.z - pz) < 6) continue;
      if (spots.some((spot) => Math.hypot(spot.x - px, spot.z - pz) < 1.6)) continue;
      spots.push({ x: px, z: pz });
    }
    while (spots.length < count) spots.push({ x: x + (spots.length % 3) * 1.8, z: z + Math.floor(spots.length / 3) * 1.8 });
    return spots;
  }

  /** Give a person a weapon and put it in their hands. */
  function arm(person, weaponId, ammo) {
    if (!person || !weaponId) return;
    const rounds = ammo === undefined ? 90 : ammo;
    if (game.weapons && typeof game.weapons.give === 'function') game.weapons.give(person, weaponId, rounds);
    else if (!person.weapons.some((weapon) => weapon.id === weaponId)) person.weapons.push({ id: weaponId, ammo: rounds, clip: Math.min(rounds, 12) });
    const index = person.weapons.findIndex((weapon) => weapon.id === weaponId);
    if (index !== -1 && person.kind !== 'player') person.weaponIndex = index;
  }

  function despawnPerson(person) {
    if (!person || person.despawned) return;
    game.weapons?.ai?.disengage?.(person);
    person.despawned = true;
    game.characters?.despawn?.(person);
  }

  function despawnVehicle(vehicle) {
    if (!vehicle || vehicle.despawned) return;
    const player = game.player;
    if (player && player.vehicle === vehicle) player.teleport(vehicle.pos.x, vehicle.pos.z, vehicle.heading);
    const occupants = (vehicle.passengers || []).slice();
    if (vehicle.driver) occupants.push(vehicle.driver);
    for (const occupant of occupants) if (occupant && !(player && occupant === player.character)) game.characters?.exitVehicle?.(occupant, { instant: true });
    game.vehicles?.despawn?.(vehicle);
  }

  function nearPlayer(entity, metres) {
    const player = game.player;
    if (!player || !player.character) return false;
    return Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) < metres;
  }

  return run;
}

/** The model name of a vehicle, for "Get back in the ..." */
export function vehicleName(vehicle) {
  return (vehicle && vehicle.spec && vehicle.spec.name) || 'car';
}

/** Trim the job card's checklist: keep the newest few ticked steps, every open one. */
function trimObjectives(objectives) {
  while (objectives.length > 6) {
    const index = objectives.findIndex((entry) => entry.done);
    if (index === -1) break;
    objectives.splice(index, 1);
  }
}

function applyDensity(system, density) {
  if (typeof system.setDensity === 'function') system.setDensity(density);
  else system.density = density;
}

const KIND_FOR_ARCHETYPE = { gang: 'gang', officer: 'officer', swat: 'officer', crew: 'crew', player: 'crew' };
const QUERY_OUT = [];
