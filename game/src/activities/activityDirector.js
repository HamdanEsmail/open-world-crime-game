// Everything to do in Port Sarab outside the story: street races, taxi fares, courier runs, the
// Pier 9 export list, stunt jumps and the twenty hidden golden falcons. The director starts and
// stops them, shows the running one on the HUD's job card, pays out, stands aside for story jobs,
// and keeps every best time, fare and falcon for the save. Becomes game.activities.
import { createStreetRaces } from './streetRaces.js';
import { createTaxiFares } from './taxiFares.js';
import { createCourierRuns } from './courierRuns.js';
import { createVehicleExports } from './vehicleExports.js';
import { createStuntJumps } from './stuntJumps.js';
import { createCollectibleFalcons } from './collectibleFalcons.js';

/**
 * Build game.activities.
 * @returns {Object} { active, running, races, taxi, courier, exports, stunts, falcons, canStart(), begin(module, card),
 *   complete(module, result), fail(module, reason), payout(result), cancel(reason), update(dt), serialize(), deserialize(data), reset(),
 *   offer(priority, keyLabel, text) -> pressed, kerbPose(place), playerVehicle(), say(), toast(), banner(), money(n), clock(s) }
 */
export function createActivities(game) {
  const kerbCache = new Map();
  const activities = {
    /** The running activity as the HUD's job card shows it, or null. */
    active: null,
    /** The module that owns the running activity, or null. */
    running: null,
    /** Milliseconds the last update took (smoothed). */
    cost: 0,
    races: null,
    taxi: null,
    courier: null,
    exports: null,
    stunts: null,
    falcons: null,
    canStart,
    begin,
    complete,
    fail,
    release: end,
    payout,
    cancel,
    update,
    serialize,
    deserialize,
    reset,
    offer,
    kerbPose,
    playerVehicle,
    say,
    toast,
    banner,
    money: formatMoney,
    clock: formatRaceTime,
    ordinal,
  };

  activities.races = createStreetRaces(game, activities);
  activities.taxi = createTaxiFares(game, activities);
  activities.courier = createCourierRuns(game, activities);
  activities.exports = createVehicleExports(game, activities);
  activities.stunts = createStuntJumps(game, activities);
  activities.falcons = createCollectibleFalcons(game, activities);
  const modules = [activities.races, activities.taxi, activities.courier, activities.exports, activities.stunts, activities.falcons];
  const failedOnce = new Set();

  /** Step every activity: the running one plays, the others watch for the player at their start. */
  function update(dt) {
    if (!(dt > 0)) return;
    const started = performance.now();
    for (let i = 0; i < modules.length; i += 1) {
      const module = modules[i];
      try {
        module.update(dt);
      } catch (error) {
        if (!failedOnce.has(module.id)) {
          failedOnce.add(module.id);
          console.warn(`activities: ${module.id} update failed`, error);
        }
      }
    }
    activities.cost += (performance.now() - started - activities.cost) * 0.1;
  }

  /** True when a new side job may start: no story job, nothing else running, the player free to act. */
  function canStart() {
    if (activities.running) return false;
    if (game.missions && game.missions.active) return false;
    if (game.mode !== 'playing') return false;
    const player = game.player;
    return Boolean(player && player.character && player.state !== 'down' && player.character.alive !== false);
  }

  /** Make `card` the running activity (the job card on the HUD) and its module the owner. */
  function begin(module, card) {
    activities.running = module;
    activities.active = card;
    card.giver = 'activity';
    game.events.emit('activity:started', { activity: card });
    game.audio?.play?.('missionStart');
  }

  /**
   * Pay for something done: money, reputation, the HUD's banner and a sound. With `paid` the money
   * was already handed over along the way (taxi fares) and is only reported.
   * @param {{id:string, title:string, reward?:number, rep?:number, detail?:string, sound?:string|null, banner?:boolean, paid?:boolean}} result
   */
  function payout(result) {
    const economy = game.economy;
    const reward = Math.round(result.reward || 0);
    if (economy && reward > 0 && !result.paid) economy.addMoney(reward, result.title);
    if (economy && result.rep > 0) economy.addRep(result.rep, result.title);
    if (result.banner !== false) {
      game.events.emit('activity:completed', { id: result.id, title: result.title, reward, rep: Math.round(result.rep || 0), detail: result.detail || '' });
    }
    const sound = result.sound === undefined ? 'missionPassed' : result.sound;
    if (sound) game.audio?.play?.(sound);
  }

  /** The running activity ended well: pay it out and clear the job card. */
  function complete(module, result) {
    const card = activities.active;
    payout({
      id: result.id || (card ? card.id : module.id),
      title: result.title || (card ? card.title : 'Side job'),
      reward: result.reward,
      rep: result.rep,
      detail: result.detail,
      sound: result.sound,
      paid: result.paid,
    });
    end(module);
  }

  /** The running activity was lost: say why and clear the job card. */
  function fail(module, reason) {
    const card = activities.active;
    game.events.emit('activity:failed', { id: card ? card.id : module.id, title: card ? card.title : '', reason: reason || '' });
    if (reason) toast(reason, 'bad');
    game.audio?.play?.('missionFailed');
    end(module);
  }

  /** Stop whatever runs (a story job started, the player was knocked out or arrested, a save loads). */
  function cancel(reason) {
    const module = activities.running;
    if (!module) return;
    try {
      module.stop(reason || 'cancelled');
    } catch (error) {
      console.warn(`activities: ${module.id} could not stop cleanly`, error);
    }
    if (reason) fail(module, reason);
    else end(module);
  }

  function end(module) {
    if (activities.running !== module) return;
    const card = activities.active;
    activities.running = null;
    activities.active = null;
    game.events.emit('activity:ended', { activity: card });
  }

  /**
   * Offer an E prompt this frame; true when E was pressed while this very prompt was the one shown,
   * so two systems never answer the same key press.
   */
  function offer(priority, keyLabel, text) {
    const prompts = game.prompts;
    if (!prompts) return false;
    prompts.offer(priority, keyLabel, text);
    return game.input.pressed('interact') && prompts.current === text;
  }

  /** Where a car stops for a place: at the kerb beside it, facing the way traffic runs on that side. */
  function kerbPose(place) {
    let pose = kerbCache.get(place.id);
    if (pose) return pose;
    const atKerb = place.curbX !== undefined && (place.curbX !== place.x || place.curbZ !== place.z);
    pose = atKerb
      ? { x: place.curbX, z: place.curbZ, heading: wrap(place.heading + Math.PI / 2) }
      : { x: place.x, z: place.z, heading: place.heading || 0 };
    kerbCache.set(place.id, pose);
    return pose;
  }

  /** The vehicle the player is driving, or null. */
  function playerVehicle() {
    const player = game.player;
    return player && player.vehicle && !player.vehicle.wrecked ? player.vehicle : null;
  }

  function say(speaker, text, seconds) {
    game.events.emit('subtitle', { speaker, text, seconds: seconds || 3.5 });
  }

  function toast(text, kind) {
    game.events.emit('notify', { text, kind: kind || 'info' });
  }

  /** A big centred line for a moment: a countdown digit, STUNT JUMP, a finish time. */
  function banner(text, sub, kind, seconds) {
    game.events.emit('activity:banner', { text, sub: sub || '', kind: kind || 'info', seconds: seconds || 2.5 });
  }

  /** A new game: nothing running, every record, list, jump and falcon back to the start. */
  function reset() {
    cancel(null);
    for (const module of modules) module.deserialize(null);
  }

  /** Progress of every activity, for the save. */
  function serialize() {
    const data = {};
    for (const module of modules) data[module.id] = module.serialize();
    return data;
  }

  function deserialize(data) {
    cancel(null);
    if (!data) return;
    for (const module of modules) {
      if (data[module.id] !== undefined) module.deserialize(data[module.id]);
    }
  }

  // Story jobs come first; being knocked out or arrested ends any side job.
  game.events.on('mission:started', () => cancel('A job came up: side job dropped'));
  game.events.on('player:died', () => cancel('You were knocked out'));
  game.events.on('player:arrested', () => cancel('Arrested by the PSPD'));
  game.events.on('save:loading', () => cancel(null));
  return activities;
}

/** Dollars as the HUD writes them: $12,400. */
export function formatMoney(amount) {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

/** A race clock: 1:23.45. */
export function formatRaceTime(seconds) {
  if (!(seconds >= 0) || !Number.isFinite(seconds)) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(2)}`;
}

/** 1st, 2nd, 3rd, 4th ... */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`;
}

function wrap(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
