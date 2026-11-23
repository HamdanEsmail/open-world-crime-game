// The waiting half of a job script: every `await m.reach(...)`, `await m.dead(...)` or
// `await m.checkpoints(...)` is one of these cancellable waits, checked once a frame by the job's
// update. When a job fails, is aborted or a save is loaded, every wait still pending is rejected
// with JobEnded, so the script stops exactly where it was and the engine cleans up behind it.

/** Thrown into a job script at whatever it is awaiting when the job ends. Scripts let it propagate. */
export class JobEnded extends Error {
  constructor(reason) {
    super(reason || 'The job ended');
    this.name = 'JobEnded';
    this.jobEnded = true;
  }
}

/** True for the error a job script receives when its job ends (not a bug in the script). */
export function isJobEnded(error) {
  return Boolean(error && error.jobEnded);
}

/**
 * Build the waits of one job run.
 * @param {Object} game
 * @param {{ended:boolean, endReason:string, view:Object}} run  the run's shared state
 * @param {Object} tools  what the waits borrow from the job context: pointOf(target), mark(target, options),
 *   unmark(marker), counter(label, value, of), clearCounter(display), nag(text|null), fail(reason),
 *   scriptError(error), vehicleName(vehicle)
 */
export function createJobWaits(game, run, tools) {
  /** Waits not yet settled, checked every frame. */
  const pending = [];

  const waits = {
    reach,
    inVehicle,
    onFoot,
    dead,
    destroyed,
    stopped,
    lostWanted,
    seconds,
    until,
    checkpoints,
    tail,
    choice,
    settleOn,
    track,
    waitFor,
    cancel,
    update,
    endAll,
    get count() {
      return pending.length;
    },
  };

  /**
   * Wait for the player to arrive at a point, a place id or an entity, with a marker and the GPS on it.
   * options: onFoot, inVehicle (true or a Vehicle), stopped (below 1 m/s), label.
   */
  function reach(target, radius = 6, options = {}) {
    const point = tools.pointOf(target);
    const vehicle = options.inVehicle && options.inVehicle !== true ? options.inVehicle : null;
    const name = vehicle ? tools.vehicleName(vehicle) : '';
    const step = {
      marker: null,
      backMarker: null,
      nagging: false,
      start() {
        step.marker = tools.mark(target, { label: options.label, radius: Math.max(2.5, Math.min(radius, 12)), route: true });
      },
      check() {
        const player = game.player;
        if (!player || !player.character || !point) return WAITING;
        if (vehicle) {
          if (isGone(vehicle)) {
            tools.fail(`The ${name} is wrecked.`);
            return WAITING;
          }
          if (player.vehicle !== vehicle) {
            if (!step.nagging) {
              step.nagging = true;
              tools.nag(`Get back in the ${name}`);
              tools.unmark(step.marker);
              step.marker = null;
              step.backMarker = tools.mark(vehicle, { kind: 'vehicle', color: VEHICLE_BLUE, label: name, radius: 2.6, route: true });
            }
            return WAITING;
          }
          if (step.nagging) {
            step.nagging = false;
            tools.nag(null);
            tools.unmark(step.backMarker);
            step.backMarker = null;
            step.marker = tools.mark(target, { label: options.label, radius: Math.max(2.5, Math.min(radius, 12)), route: true });
          }
        }
        if (options.inVehicle === true && !player.vehicle) return WAITING;
        if (options.onFoot && player.vehicle) return WAITING;
        const pos = player.pos;
        const dx = pos.x - point.x;
        const dz = pos.z - point.z;
        if (dx * dx + dz * dz > radius * radius) return WAITING;
        if (options.stopped && player.vehicle && Math.abs(player.vehicle.speed) >= 1) {
          game.prompts?.offer?.(25, 'S', 'Brake to a stop here');
          return WAITING;
        }
        return true;
      },
      cleanup() {
        if (step.nagging) tools.nag(null);
        tools.unmark(step.marker);
        tools.unmark(step.backMarker);
      },
    };
    return waitFor(step);
  }

  /** Wait until the player is at the wheel of `vehicle` (a marker sits on it until then). */
  function inVehicle(vehicle, options = {}) {
    if (!vehicle) return waitFor({ check: () => true });
    const name = tools.vehicleName(vehicle);
    const step = {
      marker: null,
      start() {
        step.marker = tools.mark(vehicle, { kind: 'vehicle', color: VEHICLE_BLUE, label: options.label || name, radius: 2.6, route: true });
      },
      check() {
        if (isGone(vehicle)) {
          tools.fail(`The ${name} is wrecked.`);
          return WAITING;
        }
        const player = game.player;
        return player && player.vehicle === vehicle ? vehicle : WAITING;
      },
      cleanup() {
        tools.unmark(step.marker);
      },
    };
    return waitFor(step);
  }

  /** Wait until the player is out of any vehicle. */
  function onFoot() {
    return waitFor({ check: () => (game.player && !game.player.vehicle ? true : WAITING) });
  }

  /** Wait until every one of `people` is dead (a red blip on each and a tally on the job card). */
  function dead(people, options = {}) {
    const list = (Array.isArray(people) ? people : [people]).filter(Boolean);
    const step = {
      markers: [],
      display: null,
      start() {
        for (let i = 0; i < list.length; i += 1) {
          step.markers.push(isDown(list[i]) ? null : tools.mark(list[i], { kind: 'enemy', color: ENEMY_RED, beacon: false, route: false, radius: 1 }));
        }
        step.display = tools.counter(options.label || 'TARGETS', 0, list.length);
      },
      check() {
        let down = 0;
        for (let i = 0; i < list.length; i += 1) {
          if (!isDown(list[i])) continue;
          down += 1;
          if (step.markers[i]) {
            tools.unmark(step.markers[i]);
            step.markers[i] = null;
          }
        }
        if (step.display) step.display.value = down;
        return down >= list.length ? true : WAITING;
      },
      cleanup() {
        for (const marker of step.markers) tools.unmark(marker);
        tools.clearCounter(step.display);
      },
    };
    return waitFor(step);
  }

  /** Wait until `vehicle` is wrecked, sunk or gone. */
  function destroyed(vehicle) {
    return waitFor({ check: () => (!vehicle || isGone(vehicle) ? true : WAITING) });
  }

  /** Wait until `vehicle` is wrecked, or slower than 1.5 m/s for `seconds` in a row ("ram it until it stops"). */
  function stopped(vehicle, options = {}) {
    const hold = options.seconds === undefined ? 2 : options.seconds;
    let still = 0;
    return waitFor({
      check(dt) {
        if (!vehicle || isGone(vehicle)) return true;
        still = Math.abs(vehicle.speed) < 1.5 ? still + dt : 0;
        return still >= hold ? true : WAITING;
      },
    });
  }

  /** Wait until the wanted level is back to zero. */
  function lostWanted() {
    return waitFor({ check: () => (!game.wanted || !(game.wanted.level > 0) ? true : WAITING) });
  }

  /** Wait `n` seconds of game time. */
  function seconds(n) {
    let left = n;
    return waitFor({
      check(dt) {
        left -= dt;
        return left <= 0 ? true : WAITING;
      },
    });
  }

  /** Poll `fn()` every frame until it returns something truthy; resolves with that value. */
  function until(fn) {
    return waitFor({
      check() {
        const value = fn();
        return value ? value : WAITING;
      },
    });
  }

  /**
   * The player passes through each point in order: a beacon with the GPS on the next one, a smaller
   * beacon on the one after, and a tally on the job card.
   */
  function checkpoints(points, options = {}) {
    const list = (points || []).filter(Boolean);
    const radius = options.radius || 9;
    const step = {
      index: 0,
      current: null,
      next: null,
      display: null,
      start() {
        step.display = tools.counter(options.label || 'CHECKPOINTS', 0, list.length);
        showMarkers();
      },
      check() {
        const player = game.player;
        if (!player || !player.character || step.index >= list.length) return step.index >= list.length ? true : WAITING;
        const point = list[step.index];
        const pos = player.pos;
        const dx = pos.x - point.x;
        const dz = pos.z - point.z;
        if (dx * dx + dz * dz > radius * radius) return WAITING;
        step.index += 1;
        if (step.display) step.display.value = step.index;
        game.audio?.play?.('pickup', { volume: 0.8 });
        game.events.emit('mission:checkpoint', { index: step.index, of: list.length, x: point.x, z: point.z });
        if (step.index >= list.length) return true;
        showMarkers();
        return WAITING;
      },
      cleanup() {
        tools.unmark(step.current);
        tools.unmark(step.next);
        tools.clearCounter(step.display);
      },
    };
    function showMarkers() {
      tools.unmark(step.current);
      tools.unmark(step.next);
      step.current = null;
      step.next = null;
      const last = step.index === list.length - 1;
      if (list[step.index]) {
        step.current = tools.mark(list[step.index], { label: options.label || (last ? 'Last checkpoint' : 'Checkpoint'), radius, color: last ? FINISH_GOLD : CHECKPOINT_GOLD, route: true });
      }
      if (list[step.index + 1]) {
        step.next = tools.mark(list[step.index + 1], { label: 'Next checkpoint', radius: radius * 0.5, color: NEXT_CREAM, route: false, edge: false });
      }
    }
    return waitFor(step);
  }

  /**
   * Keep between `min` and `max` metres behind `vehicle`. Resolves after `seconds` spent in that band
   * (never, when seconds is not given: race it against the target's arrival with m.any); fails the
   * job when too close ("You spooked them.") or too far ("You lost them.") for longer than `grace`.
   */
  function tail(vehicle, options = {}) {
    const min = options.min === undefined ? 18 : options.min;
    const max = options.max === undefined ? 80 : options.max;
    const grace = options.grace === undefined ? 4 : options.grace;
    const goal = options.seconds;
    const state = { distance: 0, min, max, state: 'good', good: 0 };
    let close = 0;
    let far = 0;
    const step = {
      marker: null,
      start() {
        step.marker = tools.mark(vehicle, { kind: 'objective', label: options.label || tools.vehicleName(vehicle), radius: 2.4, route: true });
        run.view.tail = state;
      },
      check(dt) {
        if (!vehicle || isGone(vehicle)) return false;
        const player = game.player;
        if (!player || !player.character) return WAITING;
        const d = Math.hypot(player.pos.x - vehicle.pos.x, player.pos.z - vehicle.pos.z);
        state.distance = d;
        if (d < min) {
          if (close === 0) game.events.emit('notify', { text: 'Too close. Back off or they will see you.', kind: 'bad' });
          close += dt;
          far = 0;
          state.state = 'close';
        } else if (d > max) {
          if (far === 0) game.events.emit('notify', { text: 'You are falling behind. Close the gap.', kind: 'bad' });
          far += dt;
          close = 0;
          state.state = 'far';
        } else {
          close = Math.max(0, close - dt * 2);
          far = Math.max(0, far - dt * 2);
          state.state = 'good';
          state.good += dt;
        }
        if (close > grace) tools.fail(options.spookedReason || 'You spooked them.');
        else if (far > grace) tools.fail(options.lostReason || 'You lost them.');
        if (goal !== undefined && state.good >= goal) return true;
        return WAITING;
      },
      cleanup() {
        tools.unmark(step.marker);
        if (run.view.tail === state) run.view.tail = null;
      },
    };
    return waitFor(step);
  }

  /**
   * Put the options on screen as key prompts and resolve with the id of the one the player picks.
   * options: [{id, key: 'E' | 'F' (or an action name), text}]
   */
  function choice(options) {
    const list = (options || []).filter(Boolean);
    const prompts = list.map((option) => ({ key: option.key || 'E', text: option.text || option.id }));
    return waitFor({
      check() {
        if (list.length === 0) return null;
        const input = game.input;
        game.prompts?.offer?.(45, prompts[0].key, prompts[0].text);
        if (list.length > 1) game.hud?.setPrompts?.(prompts);
        for (let i = 0; i < list.length; i += 1) {
          const action = ACTION_FOR_KEY[list[i].key] || list[i].key || 'interact';
          if (input && input.pressed(action)) {
            game.audio?.play?.('menuSelect');
            return list[i].id;
          }
        }
        return WAITING;
      },
    });
  }

  /**
   * Follow a state object that something else advances (a drive's arrival, a spoken line): resolves
   * true once state.arrived or state.done is set, false once state.failed is.
   */
  function settleOn(state) {
    return waitFor({
      check() {
        if (!state) return false;
        if (state.arrived || state.done) return true;
        return state.failed ? false : WAITING;
      },
    });
  }

  /** Follow any promise as a wait, so the job's end rejects it too; resolves with its value. */
  function track(promise) {
    const box = { done: false, failed: false, value: undefined, error: null };
    Promise.resolve(promise).then((value) => {
      box.done = true;
      box.value = value;
    }, (error) => {
      box.done = true;
      box.failed = true;
      box.error = error;
    });
    const step = {
      check() {
        if (!box.done) return WAITING;
        if (box.failed) {
          step.rejecting = true;
          step.rejectWith = box.error;
          return null;
        }
        return box.value;
      },
    };
    return waitFor(step);
  }

  /**
   * Register a wait: `step` has check(dt) returning WAITING or the value to resolve with, and
   * optionally start() and cleanup(). Checked once at once and then every frame.
   */
  function waitFor(step) {
    if (run.ended) return endedPromise(run.endReason);
    let settle = null;
    let reject = null;
    const promise = new Promise((resolve, rejectWith) => {
      settle = resolve;
      reject = rejectWith;
    });
    promise.catch(ignore);
    step.resolve = settle;
    step.reject = reject;
    step.settled = false;
    promise.jobWait = step;
    if (step.start) {
      try {
        step.start();
      } catch (error) {
        tools.scriptError(error);
      }
    }
    if (run.ended) {
      step.settled = true;
      cleanupStep(step);
      reject(new JobEnded(run.endReason));
      return promise;
    }
    pending.push(step);
    poll(step, 0);
    return promise;
  }

  /** Stop a wait without settling it (the loser of m.any). */
  function cancel(promise) {
    const step = promise && promise.jobWait;
    if (!step || step.settled) return;
    step.settled = true;
    const index = pending.indexOf(step);
    if (index !== -1) pending.splice(index, 1);
    cleanupStep(step);
  }

  /** Check every pending wait; settle the ones whose moment has come. */
  function update(dt) {
    for (let i = 0; i < pending.length;) {
      const step = pending[i];
      if (!step.settled) poll(step, dt);
      if (pending[i] === step) i += 1;
    }
  }

  /** The job is over: reject everything still pending with `error` (a JobEnded). */
  function endAll(error) {
    const list = pending.splice(0, pending.length);
    for (const step of list) {
      if (step.settled) continue;
      step.settled = true;
      cleanupStep(step);
      step.reject(error);
    }
  }

  function poll(step, dt) {
    let value;
    try {
      value = step.check(dt);
    } catch (error) {
      if (!run.ended) tools.scriptError(error);
      return;
    }
    if (value === WAITING || step.settled || run.ended) return;
    step.settled = true;
    const index = pending.indexOf(step);
    if (index !== -1) pending.splice(index, 1);
    cleanupStep(step);
    if (step.rejecting) step.reject(step.rejectWith);
    else step.resolve(value);
  }

  function cleanupStep(step) {
    if (!step.cleanup) return;
    try {
      step.cleanup();
    } catch (error) {
      console.warn('job wait cleanup failed', error);
    }
  }

  return waits;
}

/** A vehicle that can no longer be driven: wrecked, sunk or taken out of the world. */
export function isGone(vehicle) {
  return !vehicle || vehicle.wrecked || vehicle.sunk || vehicle.despawned === true;
}

/** A person who no longer counts: dead or taken out of the world. */
export function isDown(person) {
  return !person || person.alive === false || person.despawned === true;
}

/** A promise already rejected with JobEnded (handled, so it never warns on its own). */
export function endedPromise(reason) {
  const promise = Promise.reject(new JobEnded(reason));
  promise.catch(ignore);
  return promise;
}

function ignore() {}

/** What a wait's check returns while its moment has not come. */
const WAITING = Symbol('waiting');

/** Prompt keys and the input actions that answer them. */
const ACTION_FOR_KEY = { E: 'interact', F: 'enterVehicle', T: 'phone', Q: 'nextRadio', H: 'horn', R: 'reload' };

const VEHICLE_BLUE = 0x4fb6ff;
const ENEMY_RED = 0xe4572e;
const CHECKPOINT_GOLD = 0xffd24a;
const FINISH_GOLD = 0xffb21a;
const NEXT_CREAM = 0xfff4d6;
