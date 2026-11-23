// Who saw it: turns what happens on the streets of Port Sarab into crimes the PSPD hears about. A
// crime in front of a unit counts at once; a minor one nobody in uniform saw counts only if a
// passer-by phones it in; gunfire, blasts, killings and anything done to an officer always reach
// dispatch within seconds. An unwitnessed car theft on an empty street costs nothing.
import { createPoliceSight, WITNESS_RANGE } from './policeSight.js';

/** Crimes loud or grave enough that somebody always calls them in, police in sight or not. */
const ALWAYS_REPORTED = { gunfire: true, explosion: true, murder: true, officerAssault: true, officerKilled: true, robbery: true, policeCarTheft: true };
/** Crimes against the police themselves: the victim is the witness. */
const AGAINST_OFFICERS = { officerAssault: true, officerKilled: true };
/** Seconds before a loud crime nobody in uniform saw reaches dispatch, and before a passer-by gets through. */
const HEARD_DELAY = [2.5, 4.5];
const PHONE_DELAY = [2.0, 4.0];
/** How long and how far a citizen's call can be matched to a crime that happened. */
const MATCH_SECONDS = 25;
const MATCH_DISTANCE = 60;
/** Fastest repeat of the same petty crime, seconds. */
const REPEAT_GAP = { gunfire: 1.8, propertyDamage: 3, vehicleRamming: 1.2 };
/** Shots within this many seconds of the last reported burst count for less: it is the same shoot-out. */
const GUNFIRE_SPREE = 20;
/** Closing speed (m/s) above which a shunt with another car is reckless ramming. */
const RAMMING_SPEED = 4.5;
const POLICE_RAMMING_SPEED = 6.5;
/** A struck pedestrian counts as a hit-and-run above this speed (m/s). */
const HIT_AND_RUN_SPEED = 5;

/**
 * Wire the world's events to game.wanted.report().
 * @param {Object} game
 * @param {Object} wanted  game.wanted (being built)
 */
export function createCrimeReporting(game, wanted) {
  const sight = createPoliceSight(game);
  const calls = [];
  for (let i = 0; i < 16; i += 1) calls.push({ active: false, type: '', x: 0, z: 0, due: 0, victim: null, severity: 1, how: '' });
  const recent = [];
  for (let i = 0; i < 16; i += 1) recent.push({ type: '', x: 0, z: 0, time: -1e9, reported: false });
  let recentCursor = 0;
  const lastOfType = {};
  const victims = [];
  for (let i = 0; i < 12; i += 1) victims.push({ key: null, time: -1e9 });
  let victimCursor = 0;
  let lastGunfireReport = -1e9;
  let lastNotify = -1e9;
  const stats = { seenByPolice: 0, phonedIn: 0, heard: 0, unseen: 0 };

  game.events.on('crime', onCrimeEvent);
  game.events.on('shot:fired', onShotFired);
  game.events.on('character:damaged', onCharacterDamaged);
  game.events.on('character:died', onCharacterDied);
  game.events.on('vehicle:hitCharacter', onVehicleHitCharacter);
  game.events.on('vehicle:collision', onVehicleCollision);
  game.events.on('prop:broken', onPropBroken);
  game.events.on('explosion', onExplosion);
  game.events.on('crime:witnessed', onCitizenCall);

  /**
   * A crime has happened at (x, z). Decide who knows: police eyes on it report it at once, a loud or
   * grave one is called in after a few seconds, a petty one waits for a witness's phone call.
   */
  function consider(type, x, z, victim, severity) {
    if (!wanted || wanted.locked) return;
    const now = game.time.elapsed;
    const gap = REPEAT_GAP[type];
    if (gap && now - (lastOfType[type] || -1e9) < gap) return;
    lastOfType[type] = now;
    const record = remember(type, x, z, now);
    if (AGAINST_OFFICERS[type] || sight.policeSawPoint(x, z, WITNESS_RANGE)) {
      record.reported = true;
      stats.seenByPolice += 1;
      wanted.report(type, x, z, { victim, witnessed: true, severity });
      return;
    }
    if (ALWAYS_REPORTED[type]) {
      record.reported = true;
      stats.heard += 1;
      schedule(type, x, z, victim, severity, HEARD_DELAY, 'heard');
      return;
    }
    stats.unseen += 1;
  }

  /** Once a frame: calls whose moment has come reach dispatch. */
  function update() {
    const now = game.time.elapsed;
    for (let i = 0; i < calls.length; i += 1) {
      const call = calls[i];
      if (!call.active || call.due > now) continue;
      call.active = false;
      if (wanted.locked) continue;
      const player = game.player;
      if (!player || player.state === 'down') continue;
      wanted.report(call.type, call.x, call.z, { victim: call.victim, witnessed: false, severity: call.severity });
      tellPlayer(call);
    }
  }

  /** The 'crime' event: car thefts, carjackings, robberies and whatever missions declare. */
  function onCrimeEvent(event) {
    if (!event || !event.type) return;
    const x = Number.isFinite(event.x) ? event.x : playerX();
    const z = Number.isFinite(event.z) ? event.z : playerZ();
    consider(event.type, x, z, event.victim || null, typeof event.severity === 'number' ? event.severity : 1);
  }

  /** The player pulling a trigger. Shots in one shoot-out after the first count for less. */
  function onShotFired(event) {
    if (!event || !isPlayerSource(event.shooter)) return;
    const now = game.time.elapsed;
    const spree = now - lastGunfireReport < GUNFIRE_SPREE;
    const before = lastOfType.gunfire || -1e9;
    consider('gunfire', finiteOr(event.x, playerX()), finiteOr(event.z, playerZ()), null, spree ? 0.4 : 1);
    if (lastOfType.gunfire !== before) lastGunfireReport = now;
  }

  /** Someone hurt by the player: assault, or an assault on an officer. A car hit is a hit-and-run instead. */
  function onCharacterDamaged(event) {
    if (!event || !event.character || !isPlayerSource(event.source)) return;
    const victim = event.character;
    if (victim === playerCharacter() || victim.kind === 'crew' || victim.kind === 'player') return;
    if (repeatVictim(victim, 5)) return;
    if (victim.kind === 'officer') consider('officerAssault', victim.pos.x, victim.pos.z, victim, 1);
    else if (event.kind !== 'vehicle') consider('assault', victim.pos.x, victim.pos.z, victim, 1);
  }

  /** Someone killed by the player: murder, or an officer killed. Run down by a car counts a little less. */
  function onCharacterDied(event) {
    if (!event || !event.character || !isPlayerSource(event.source)) return;
    const victim = event.character;
    if (victim === playerCharacter() || victim.kind === 'crew' || victim.kind === 'player') return;
    if (victim.kind === 'officer') consider('officerKilled', victim.pos.x, victim.pos.z, victim, 1);
    else consider('murder', victim.pos.x, victim.pos.z, victim, event.kind === 'vehicle' ? 0.6 : 1);
  }

  /** The player's car striking a pedestrian. */
  function onVehicleHitCharacter(event) {
    if (!event || !event.vehicle || !event.vehicle.isPlayer || !event.character) return;
    const victim = event.character;
    if (victim === playerCharacter() || victim.kind === 'officer' || victim.kind === 'crew') return;
    if (!(event.speed > HIT_AND_RUN_SPEED)) return;
    if (repeatVictim(victim, 6)) return;
    consider('hitAndRun', victim.pos.x, victim.pos.z, victim, 1);
  }

  /** The player's car ramming another (the faster car tells the crash); a police car counts far more. */
  function onVehicleCollision(event) {
    if (!event || !event.vehicle || !event.vehicle.isPlayer || !event.other) return;
    const other = event.other;
    const police = other.faction === 'police';
    if (!(event.speed > (police ? POLICE_RAMMING_SPEED : RAMMING_SPEED))) return;
    if (repeatVictim(other, 2.5)) return;
    consider('vehicleRamming', finiteOr(event.x, other.pos.x), finiteOr(event.z, other.pos.z), other, police ? 3.5 : 1);
  }

  /** Lamp posts, palms and bollards flattened by the player's car. */
  function onPropBroken(event) {
    if (!event || !event.vehicle || !event.vehicle.isPlayer) return;
    consider('propertyDamage', finiteOr(event.x, playerX()), finiteOr(event.z, playerZ()), null, 1);
  }

  /** A blast the player caused. */
  function onExplosion(event) {
    if (!event || !isPlayerSource(event.source)) return;
    consider('explosion', finiteOr(event.x, playerX()), finiteOr(event.z, playerZ()), null, 1);
  }

  /** A pedestrian saw something and is calling it in ({type, x, z}). */
  function onCitizenCall(event) {
    if (!event || !event.type || wanted.locked) return;
    const now = game.time.elapsed;
    const x = finiteOr(event.x, playerX());
    const z = finiteOr(event.z, playerZ());
    let match = null;
    for (let i = 0; i < recent.length; i += 1) {
      const record = recent[i];
      if (record.type !== event.type || now - record.time > MATCH_SECONDS) continue;
      if ((record.x - x) * (record.x - x) + (record.z - z) * (record.z - z) > MATCH_DISTANCE * MATCH_DISTANCE) continue;
      match = record;
      break;
    }
    if (match && match.reported) return;
    if (match) match.reported = true;
    else remember(event.type, x, z, now).reported = true;
    stats.phonedIn += 1;
    schedule(event.type, x, z, event.victim || null, typeof event.severity === 'number' ? event.severity : 1, PHONE_DELAY, 'witness');
  }

  function schedule(type, x, z, victim, severity, delay, how) {
    let slot = null;
    for (let i = 0; i < calls.length; i += 1) {
      if (!calls[i].active) {
        slot = calls[i];
        break;
      }
    }
    if (!slot) return;
    slot.active = true;
    slot.type = type;
    slot.x = x;
    slot.z = z;
    slot.victim = victim;
    slot.severity = severity;
    slot.how = how;
    slot.due = game.time.elapsed + delay[0] + Math.random() * (delay[1] - delay[0]);
  }

  function remember(type, x, z, now) {
    const record = recent[recentCursor];
    recentCursor = (recentCursor + 1) % recent.length;
    record.type = type;
    record.x = x;
    record.z = z;
    record.time = now;
    record.reported = false;
    return record;
  }

  /** True when this victim was already counted within `seconds`; otherwise remembers it. */
  function repeatVictim(key, seconds) {
    const now = game.time.elapsed;
    for (let i = 0; i < victims.length; i += 1) {
      if (victims[i].key === key && now - victims[i].time < seconds) return true;
    }
    const slot = victims[victimCursor];
    victimCursor = (victimCursor + 1) % victims.length;
    slot.key = key;
    slot.time = now;
    return false;
  }

  /** A line on screen when a call the player could not see coming reaches the PSPD. */
  function tellPlayer(call) {
    const now = game.time.elapsed;
    if (now - lastNotify < 12) return;
    lastNotify = now;
    const text = call.how === 'witness' ? 'A witness called the PSPD'
      : call.type === 'gunfire' ? 'Shots fired: the PSPD is on its way'
        : call.type === 'explosion' ? 'The blast was reported to the PSPD'
          : call.type === 'murder' ? 'A body was found: the PSPD is on its way'
            : call.type === 'policeCarTheft' ? 'The PSPD is tracking its stolen car'
              : 'The PSPD got a call';
    game.events.emit('notify', { text, kind: 'wanted' });
  }

  function isPlayerSource(source) {
    const player = game.player;
    if (!player || !source) return false;
    if (source === player.character) return true;
    if (player.vehicle && source === player.vehicle) return true;
    return source.kind === 'player' || source.isPlayer === true;
  }

  function playerCharacter() {
    return game.player ? game.player.character : null;
  }

  function playerX() {
    return game.player && game.player.character ? game.player.pos.x : 0;
  }

  function playerZ() {
    return game.player && game.player.character ? game.player.pos.z : 0;
  }

  return { update, consider, stats };
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
