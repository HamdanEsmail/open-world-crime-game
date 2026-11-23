// How armed people fight in Port Sarab: police, Dune Jackals gangs and the Vane Spire's guards.
// aiAttack() turns one character on a target for a frame (face, track with a human lag, fire in
// bursts once they have seen you, reload, or close in to punch). The fight manager on top of it moves
// fighters by intent: they hold a distance that suits their gun, strafe, dash to cover, lean out to
// shoot and duck back, fall back when hurt, run when their nerve breaks, and stop when it is over.
import * as THREE from 'three';
import {
  aiHitChance, aiReactionSeconds, enemyTakesCover, isBadlyHurt, nerveLost, nerveBreaks, fightingDistance,
} from './combatRules.js';
import { searchCoverStep, coverStillHides, COVER_SEARCH_STEPS } from './combatCover.js';

/** Default accuracy (0..1) of a fighter whose caller gave none. */
const DEFAULT_ACCURACY = 0.55;
/** Seconds between line-of-sight checks per attacker. */
const SIGHT_INTERVAL = 0.24;
/** Fighters stop when their target is this far beyond their leash. */
const LEASH_SLACK = 40;

/**
 * Create the gunfight AI. `arms` gives it the weapon system's helpers:
 * { current(character) -> spec|null, isReloading(character), reload(character), ballistics, grid }.
 * @returns {{aiAttack: Function, aimShot: Function, fights: Object, accuracyOf: Function}}
 */
export function createGunfightAI(game, arms) {
  const { ballistics } = arms;
  /** @type {WeakMap<Object, Object>} per-attacker aiming state */
  const attackStates = new WeakMap();
  /** People taken out of the world: never a target again. */
  const removed = new WeakSet();
  game.events.on('character:despawned', (event) => {
    if (event && event.character) removed.add(event.character);
  });
  /** Someone still worth shooting at. */
  const isLiveTarget = (target) => !!(target && target.pos && target.alive !== false && !target.despawned
    && target.state !== 'dead' && !removed.has(target));
  const chest = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const coverOut = { x: 0, z: 0, peekX: 0, peekZ: 0, vehicle: null };
  /** What the cover search needs to count parked cars: the grid, traced rounds, whom to skip. */
  const coverTools = { grid: arms.grid, ballistics, trace: ballistics.makeTrace(), skip: null };

  /**
   * Turn `character` on `target` for this frame: face and aim at its chest (tracking with a lag and
   * leading a runner slightly), fire in bursts when it is in sight and in range after a human reaction
   * time, and close in to punch or swing when there is no gun. Returns false when there is nothing to
   * attack (the intent is then relaxed).
   * @param {{accuracy?: number}} [options]  0..1: aim error, reaction time and spread
   */
  function aiAttack(character, target, dt, options) {
    if (!character || !character.intent || character.alive === false) return false;
    const intent = character.intent;
    if (!isLiveTarget(target) || target === character) {
      relax(intent);
      return false;
    }
    const accuracy = clamp01(options && Number.isFinite(options.accuracy) ? options.accuracy : DEFAULT_ACCURACY);
    const state = attackStateOf(character);
    state.accuracy = accuracy;
    state.lastUsed = game.time.elapsed;
    if (state.target !== target) {
      state.target = target;
      state.seen = 0;
      state.aimReady = false;
      state.sightTimer = 0;
    }

    // Where to aim: the chest, a touch ahead of a moving target, tracked with a human lag.
    ballistics.chestPoint(target, chest);
    const velocity = target.vehicle ? target.vehicle.vel : target.vel;
    if (velocity) {
      const lead = 0.05 + 0.1 * accuracy;
      chest.x += velocity.x * lead;
      chest.z += velocity.z * lead;
    }
    if (!state.aimReady) {
      state.aim.copy(chest);
      state.aimReady = true;
    } else {
      state.aim.lerp(chest, 1 - Math.exp(-(3.5 + 8 * accuracy) * dt));
    }
    muzzle.set(character.pos.x, character.pos.y + 1.45, character.pos.z);
    const dx = state.aim.x - muzzle.x;
    const dy = state.aim.y - muzzle.y;
    const dz = state.aim.z - muzzle.z;
    const flat = Math.sqrt(dx * dx + dz * dz);
    state.wander += dt;
    const error = (1 - accuracy) * 0.055;
    const yaw = Math.atan2(dx, dz) + Math.sin(state.wander * 1.9) * error;
    const pitch = Math.atan2(dy, flat) + Math.sin(state.wander * 1.3 + 2) * error * 0.5;
    intent.aimYaw = yaw;
    intent.aimPitch = pitch;
    intent.faceYaw = yaw;

    const weapon = arms.current(character);
    if (!weapon || weapon.melee) return closeInAndSwing(character, target, weapon, state, dt);
    if (character.vehicle && !weapon.oneHanded) {
      intent.fire = false;
      intent.aim = false;
      return true;
    }
    if (!hasRounds(character)) {
      // Dry: fall back to another gun with rounds, or to the fists.
      switchToUsable(character);
      intent.fire = false;
      return true;
    }
    intent.aim = true;

    state.sightTimer -= dt;
    if (state.sightTimer <= 0) {
      state.sightTimer = SIGHT_INTERVAL + Math.random() * 0.1;
      ballistics.chestPoint(target, chest);
      state.inSight = !game.colliders || game.colliders.lineOfSight(muzzle, chest);
    }
    const distance = Math.sqrt(flat * flat + dy * dy);
    if (!state.inSight || distance > weapon.range * 0.92) {
      state.seen = Math.max(0, state.seen - dt * 1.5);
      intent.fire = false;
      return true;
    }
    state.seen += dt;
    if (state.seen < aiReactionSeconds(accuracy) || arms.isReloading(character)) {
      intent.fire = false;
      return true;
    }
    fireInBursts(intent, weapon, state, accuracy, dt);
    return true;
  }

  /** Automatic guns in short bursts with pauses; others shot by shot at a human pace. */
  function fireInBursts(intent, weapon, state, accuracy, dt) {
    if (weapon.automatic) {
      if (state.burst > 0) {
        state.burst -= dt;
        intent.fire = true;
        if (state.burst <= 0) state.pause = range(0.3, 0.9) * (1.6 - accuracy * 0.6);
      } else {
        state.pause -= dt;
        intent.fire = false;
        if (state.pause <= 0) state.burst = range(0.22, 0.65);
      }
      return;
    }
    state.pause -= dt;
    if (state.pause <= 0 && !intent.fire) {
      intent.fire = true;
      state.pause = (1 / weapon.fireRate) * range(1.25, 2.4) * (1.5 - 0.5 * accuracy);
    } else {
      intent.fire = false;
    }
  }

  /** No gun: run in and punch (or swing the bat) once within reach. */
  function closeInAndSwing(character, target, weapon, state, dt) {
    const intent = character.intent;
    intent.aim = false;
    if (character.vehicle) {
      intent.fire = false;
      return true;
    }
    const reach = weapon ? weapon.range : 1.3;
    const tx = target.vehicle ? target.vehicle.pos.x : target.pos.x;
    const tz = target.vehicle ? target.vehicle.pos.z : target.pos.z;
    const dx = tx - character.pos.x;
    const dz = tz - character.pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > reach * 0.85) {
      intent.moveX = dx / (distance || 1);
      intent.moveZ = dz / (distance || 1);
      intent.pace = distance > 6 ? 'sprint' : 'run';
      intent.fire = false;
      return true;
    }
    intent.moveX = 0;
    intent.moveZ = 0;
    state.swing -= dt;
    if (state.swing <= 0 && !intent.fire) {
      intent.fire = true;
      state.swing = (weapon ? 0.75 : 0.42) + Math.random() * 0.35;
    } else {
      intent.fire = false;
    }
    return true;
  }

  /**
   * Decide where an AI's round goes. If the shooter is attacking someone through aiAttack and its gun
   * points their way, roll the chance of a hit (accuracy, distance against the weapon's reach, how fast
   * the target moves, crouching, the shooter on the move, a long burst) and aim the round at a point on
   * the body, or past it by half a metre to two metres so the miss is seen and heard. Rewrites `dir`
   * (unit) and returns true; returns false when the shot should simply follow the intent.
   */
  function aimShot(shooter, spec, muzzlePoint, dir) {
    const state = attackStates.get(shooter);
    if (!state || !isLiveTarget(state.target) || game.time.elapsed - state.lastUsed > 0.5) return false;
    const target = state.target;
    ballistics.chestPoint(target, chest);
    const dx = chest.x - muzzlePoint.x;
    const dy = chest.y - muzzlePoint.y;
    const dz = chest.z - muzzlePoint.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance < 0.5 || (dx * dir.x + dy * dir.y + dz * dir.z) / distance < 0.85) return false;
    const now = game.time.elapsed;
    state.burstShots = now - state.lastShot < 0.35 ? state.burstShots + 1 : 0;
    state.lastShot = now;
    const chance = hitChance(shooter, target, spec, state, distance);
    // A point on the body for a hit; beside, above or short of it for a miss.
    const sideX = -dz / (Math.sqrt(dx * dx + dz * dz) || 1);
    const sideZ = dx / (Math.sqrt(dx * dx + dz * dz) || 1);
    let side;
    let lift;
    if (Math.random() < chance) {
      side = (Math.random() - 0.5) * 0.36;
      lift = (Math.random() - 0.45) * 0.6;
    } else {
      side = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4);
      lift = -0.4 + Math.random() * 1.4;
    }
    dir.set(dx + sideX * side, dy + lift, dz + sideZ * side).normalize();
    return true;
  }

  /** The chance (0..1) that an AI's next round hits `target` (the rule is aiHitChance). */
  function hitChance(shooter, target, spec, state, distance) {
    const velocity = target.vehicle ? target.vehicle.vel : target.vel;
    const speed = velocity ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) : 0;
    const own = shooter.vel;
    const moving = !!own && own.x * own.x + own.z * own.z > 4;
    const crouched = !!(target.intent && target.intent.crouch);
    return aiHitChance(state.accuracy, distance, spec, speed, !!target.vehicle, crouched, moving, state.burstShots);
  }

  /** How well a character shoots (0..1): its last aiAttack accuracy, or a middling default. */
  function accuracyOf(character) {
    const state = attackStates.get(character);
    return state ? state.accuracy : DEFAULT_ACCURACY;
  }

  function attackStateOf(character) {
    let state = attackStates.get(character);
    if (!state) {
      state = {
        target: null, accuracy: DEFAULT_ACCURACY, seen: 0, inSight: false, sightTimer: 0,
        aim: new THREE.Vector3(), aimReady: false, wander: Math.random() * 10,
        burst: 0, pause: Math.random() * 0.4, swing: 0, lastUsed: 0, lastShot: -10, burstShots: 0,
      };
      attackStates.set(character, state);
    }
    return state;
  }

  function hasRounds(character) {
    const slot = character.weapons[character.weaponIndex];
    return !!slot && (slot.clip > 0 || slot.ammo > 0);
  }

  function switchToUsable(character) {
    const weapons = character.weapons;
    for (let i = 0; i < weapons.length; i += 1) {
      const spec = game.catalog.weaponById ? game.catalog.weaponById(weapons[i].id) : null;
      if (spec && !spec.melee && (weapons[i].clip > 0 || weapons[i].ammo > 0)) {
        character.weaponIndex = i;
        return;
      }
    }
    for (let i = 0; i < weapons.length; i += 1) {
      if (weapons[i].id === 'bat') {
        character.weaponIndex = i;
        return;
      }
    }
    character.weaponIndex = -1;
  }

  // ---- the fight manager: fighters that move and fight by themselves -------------------------------

  /** @type {Object[]} */
  const fighters = [];
  const coverQueue = [];
  /** The cover search in progress: whose, which step, the best score so far, where it started. */
  const search = { record: null, step: 0, best: Infinity, fromX: 0, fromZ: 0 };
  const byCharacter = new WeakMap();

  const fights = {
    fighters,
    engage,
    disengage,
    isEngaged: (character) => {
      const record = byCharacter.get(character);
      return !!(record && record.active);
    },
    targetOf: (character) => {
      const record = byCharacter.get(character);
      return record && record.active ? record.target : null;
    },
    update,
    get count() {
      let n = 0;
      for (let i = 0; i < fighters.length; i += 1) if (fighters[i].active) n += 1;
      return n;
    },
    /** The slowest recent cover search (ms), and how many searches ran and found a spot. */
    coverSearchMs: 0,
    coverSearches: 0,
    coverFound: 0,
  };

  /**
   * Make `character` fight `target` by itself until one of them is down, the target is beyond the
   * leash, or disengage() is called.
   * options: style 'guard' (hold the ground it stands on) | 'rush' (press in, strafing) | 'cover'
   * (cover to cover); accuracy 0..1; leash metres from where it started (guard 10, others 60);
   * opponents: an array (or a function returning one) to pick the next target from when this one falls;
   * bravery 0..1.2 (how much fire it takes before it runs; 0 never runs).
   */
  function engage(character, target, options = {}) {
    if (!character || !character.intent) return null;
    let record = byCharacter.get(character);
    if (!record) {
      record = makeFighter(character);
      byCharacter.set(character, record);
      fighters.push(record);
    }
    const style = options.style === 'guard' || options.style === 'rush' || options.style === 'cover' ? options.style : 'cover';
    record.active = true;
    record.target = target || null;
    record.style = style;
    record.accuracy = clamp01(Number.isFinite(options.accuracy) ? options.accuracy : DEFAULT_ACCURACY);
    record.leash = Number.isFinite(options.leash) ? options.leash : style === 'guard' ? 10 : 60;
    record.opponents = options.opponents || null;
    record.bravery = Number.isFinite(options.bravery) ? options.bravery : 1;
    record.morale = record.bravery;
    record.anchorX = character.pos.x;
    record.anchorZ = character.pos.z;
    record.mode = 'engage';
    record.modeTimer = 0;
    record.thinkTimer = Math.random() * 0.3;
    record.hasCover = false;
    record.coverCooldown = Math.random() * 0.5;
    record.lastHealth = character.health;
    record.underFire = 0;
    record.strafeSign = Math.random() < 0.5 ? -1 : 1;
    record.strafeTimer = range(0.8, 2);
    record.seed = Math.random() * Math.PI * 2;
    record.fleeTimer = 0;
    return record;
  }

  /** Stop a fighter: it lowers its gun and stands still (its owner takes it back). */
  function disengage(character) {
    const record = byCharacter.get(character);
    if (!record || !record.active) return;
    release(record);
  }

  /** Run every fighter for a frame; at most one cover search per frame. */
  function update(dt) {
    for (let i = 0; i < fighters.length; i += 1) {
      const record = fighters[i];
      if (!record.active) continue;
      const character = record.character;
      if (character.alive === false || character.despawned || removed.has(character)) {
        release(record);
        continue;
      }
      if (!isLiveTarget(record.target) && !retarget(record)) {
        release(record);
        continue;
      }
      updateNerve(record, dt);
      record.thinkTimer -= dt;
      record.coverCooldown -= dt;
      if (record.thinkTimer <= 0) {
        record.thinkTimer = 0.3 + Math.random() * 0.25;
        think(record);
        if (!record.active) continue;
      }
      act(record, dt);
    }
    serveOneCoverSearch();
  }

  /** Being hit drains nerve, which slowly comes back. */
  function updateNerve(record, dt) {
    const character = record.character;
    if (character.health < record.lastHealth) {
      record.morale -= nerveLost(record.lastHealth - character.health, character.maxHealth);
      record.underFire = 2.5;
    }
    record.lastHealth = character.health;
    record.underFire -= dt;
    if (record.morale < record.bravery) record.morale = Math.min(record.bravery, record.morale + dt * 0.02);
  }

  /** Decide what to do next: charge, advance, hold and strafe, take cover, fall back or run. */
  function think(record) {
    const character = record.character;
    const target = record.target;
    const tx = targetX(target);
    const tz = targetZ(target);
    const distance = Math.hypot(tx - character.pos.x, tz - character.pos.z);
    const fromAnchor = Math.hypot(character.pos.x - record.anchorX, character.pos.z - record.anchorZ);
    const targetFromAnchor = Math.hypot(tx - record.anchorX, tz - record.anchorZ);
    if (targetFromAnchor > record.leash + LEASH_SLACK && fromAnchor > record.leash * 0.5) {
      release(record);
      return;
    }
    if (record.mode === 'flee') {
      if (distance > 70) release(record);
      return;
    }
    if (nerveBreaks(record.morale, record.bravery)) {
      record.mode = 'flee';
      game.events.emit('fighter:fled', { character, target });
      return;
    }
    const weapon = arms.current(character);
    if (!weapon || weapon.melee) {
      record.mode = 'charge';
      return;
    }
    const band = fightingDistance(weapon);
    const healthShare = character.health / (character.maxHealth || 100);
    const hurt = isBadlyHurt(healthShare);
    if (record.hasCover) {
      ballistics.chestPoint(target, chest);
      coverTools.skip = target;
      if (!coverStillHides(game, coverTools, record.coverX, record.coverZ, chest, record.coverVehicle)
        || Math.hypot(tx - record.coverX, tz - record.coverZ) > band[1] * 1.8 + 8) {
        record.hasCover = false;
        record.coverVehicle = null;
      }
      coverTools.skip = null;
    }
    const wantsCover = enemyTakesCover(record.style, healthShare, record.underFire > 0);
    if (wantsCover && !record.hasCover && record.coverCooldown <= 0 && search.record !== record && coverQueue.indexOf(record) === -1) {
      coverQueue.push(record);
    }
    if (record.hasCover) {
      if (record.mode !== 'hidden' && record.mode !== 'peek' && record.mode !== 'toCover') record.mode = 'toCover';
      return;
    }
    if (hurt && record.style !== 'rush') {
      record.mode = 'fallBack';
      return;
    }
    // Guards hold their ground (strafe keeps them near it); the others close to their distance.
    record.mode = distance > band[1] * 1.1 && record.style !== 'guard' ? 'advance' : 'engage';
  }

  /** Move and shoot for one frame according to the fighter's mode. */
  function act(record, dt) {
    const character = record.character;
    const intent = character.intent;
    const target = record.target;
    const tx = targetX(target);
    const tz = targetZ(target);
    const dx = tx - character.pos.x;
    const dz = tz - character.pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz) || 0.001;
    const towardX = dx / distance;
    const towardZ = dz / distance;
    intent.crouch = false;
    intent.gesture = null;
    switch (record.mode) {
      case 'charge':
        aiAttack(character, target, dt, record);
        return;
      case 'flee':
        relax(intent);
        setMove(intent, -towardX, -towardZ, 'sprint');
        return;
      case 'advance':
        aiAttack(character, target, dt, record);
        setMove(intent, towardX, towardZ, 'run');
        return;
      case 'fallBack':
        aiAttack(character, target, dt, record);
        setMove(intent, -towardX + -towardZ * record.strafeSign * 0.5, -towardZ + towardX * record.strafeSign * 0.5, 'run');
        return;
      case 'toCover': {
        aiAttack(character, target, dt, record);
        intent.fire = false;
        intent.aim = false;
        const cx = record.coverX - character.pos.x;
        const cz = record.coverZ - character.pos.z;
        const away = Math.sqrt(cx * cx + cz * cz);
        if (away < 0.6) {
          record.mode = 'hidden';
          record.modeTimer = range(0.7, 1.8);
          setMove(intent, 0, 0, 'walk');
        } else {
          setMove(intent, cx / away, cz / away, away > 4 ? 'sprint' : 'run');
        }
        return;
      }
      case 'hidden':
        aiAttack(character, target, dt, record);
        intent.fire = false;
        intent.aim = false;
        intent.crouch = true;
        steerTo(intent, character, record.coverX, record.coverZ, 'walk');
        if (needsReload(character)) arms.reload(character);
        record.modeTimer -= dt;
        if (record.modeTimer <= 0 && !arms.isReloading(character)) {
          record.mode = 'peek';
          record.modeTimer = range(1.1, 2.4);
        }
        return;
      case 'peek':
        aiAttack(character, target, dt, record);
        steerTo(intent, character, record.peekX, record.peekZ, 'walk');
        record.modeTimer -= dt;
        if (record.modeTimer <= 0 || needsReload(character)) {
          record.mode = 'hidden';
          record.modeTimer = range(0.8, 2.2);
        }
        return;
      default:
        aiAttack(character, target, dt, record);
        strafe(record, character, intent, towardX, towardZ, distance, dt);
    }
  }

  /** Side-step across the target's line of fire while keeping the weapon's distance (guards stay home). */
  function strafe(record, character, intent, towardX, towardZ, distance, dt) {
    const band = fightingDistance(arms.current(character));
    record.strafeTimer -= dt;
    if (record.strafeTimer <= 0) {
      record.strafeSign = -record.strafeSign;
      record.strafeTimer = range(0.9, 2.3);
    }
    let mx = -towardZ * record.strafeSign;
    let mz = towardX * record.strafeSign;
    if (distance > band[1]) {
      mx += towardX * 1.2;
      mz += towardZ * 1.2;
    } else if (distance < band[0]) {
      mx -= towardX * 1.2;
      mz -= towardZ * 1.2;
    }
    if (record.style === 'guard') {
      const ax = record.anchorX - character.pos.x;
      const az = record.anchorZ - character.pos.z;
      const away = Math.sqrt(ax * ax + az * az);
      if (away > record.leash * 0.4) {
        mx = ax / away;
        mz = az / away;
      } else {
        mx *= 0.6;
        mz *= 0.6;
      }
    }
    setMove(intent, mx, mz, 'walk');
  }

  /**
   * Cover searches are the costly part: one fighter's search runs at a time, one step a frame (a ring
   * of wall spots, then the parked cars), and its result is taken when the last step is done.
   */
  function serveOneCoverSearch() {
    if (!search.record) {
      while (coverQueue.length > 0 && !search.record) {
        const record = coverQueue.shift();
        if (!record.active || record.hasCover || !isLiveTarget(record.target)) continue;
        record.seed += 0.7;
        search.record = record;
        search.step = 0;
        search.best = Infinity;
        search.fromX = record.character.pos.x;
        search.fromZ = record.character.pos.z;
      }
      if (!search.record) return;
    }
    const record = search.record;
    if (!record.active || record.hasCover || !isLiveTarget(record.target)) {
      search.record = null;
      return;
    }
    const started = performance.now();
    ballistics.chestPoint(record.target, chest);
    coverTools.skip = record.target;
    search.best = searchCoverStep(game, coverTools, search.step, search.fromX, search.fromZ, chest,
      fightingDistance(arms.current(record.character)), record.seed, coverOut, search.best);
    coverTools.skip = null;
    fights.coverSearchMs = Math.max(fights.coverSearchMs * 0.98, performance.now() - started);
    search.step += 1;
    if (search.step < COVER_SEARCH_STEPS) return;
    search.record = null;
    fights.coverSearches += 1;
    if (search.best < Infinity) {
      fights.coverFound += 1;
      record.hasCover = true;
      record.coverX = coverOut.x;
      record.coverZ = coverOut.z;
      record.peekX = coverOut.peekX;
      record.peekZ = coverOut.peekZ;
      record.coverVehicle = coverOut.vehicle;
      record.mode = 'toCover';
    } else {
      record.coverCooldown = range(2.5, 4);
    }
  }

  /** The current target is gone: take the nearest live opponent, if the fighter was given any. */
  function retarget(record) {
    let pool = record.opponents;
    if (typeof pool === 'function') pool = pool(record.character);
    if (!pool || !pool.length) return false;
    const character = record.character;
    let best = null;
    let bestDistance = record.leash + LEASH_SLACK + 60;
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      if (!isLiveTarget(candidate) || candidate === character) continue;
      const d = Math.hypot(targetX(candidate) - character.pos.x, targetZ(candidate) - character.pos.z);
      if (d < bestDistance) {
        best = candidate;
        bestDistance = d;
      }
    }
    record.target = best;
    record.hasCover = false;
    record.mode = 'engage';
    return best !== null;
  }

  function release(record) {
    record.active = false;
    record.target = null;
    record.hasCover = false;
    record.opponents = null;
    const character = record.character;
    if (character && character.intent) relax(character.intent);
    const index = coverQueue.indexOf(record);
    if (index !== -1) coverQueue.splice(index, 1);
  }

  /** A friend of a fighter falls nearby: everyone on that side loses a little nerve. */
  function onCharacterDied(event) {
    const dead = event && event.character;
    if (!dead || !dead.pos) return;
    for (let i = 0; i < fighters.length; i += 1) {
      const record = fighters[i];
      if (!record.active || record.character === dead) continue;
      if (record.character.faction !== dead.faction) continue;
      const d = Math.hypot(record.character.pos.x - dead.pos.x, record.character.pos.z - dead.pos.z);
      if (d < 18) record.morale -= 0.12;
    }
  }
  game.events.on('character:died', onCharacterDied);

  function needsReload(character) {
    const slot = character.weapons[character.weaponIndex];
    const spec = arms.current(character);
    return !!(slot && spec && !spec.melee && slot.clip < spec.clipSize * 0.4 && slot.ammo > 0);
  }

  return { aiAttack, aimShot, fights, accuracyOf };
}

/** A fresh fighter record (reused when the same character is engaged again). */
function makeFighter(character) {
  return {
    character, active: false, target: null, style: 'cover', accuracy: DEFAULT_ACCURACY, leash: 60, opponents: null,
    bravery: 1, morale: 1, anchorX: 0, anchorZ: 0, mode: 'engage', modeTimer: 0, thinkTimer: 0,
    hasCover: false, coverX: 0, coverZ: 0, peekX: 0, peekZ: 0, coverVehicle: null, coverCooldown: 0, lastHealth: 100,
    underFire: 0, strafeSign: 1, strafeTimer: 1, seed: 0, fleeTimer: 0,
  };
}

function targetX(target) {
  return target.vehicle && target.vehicle.pos ? target.vehicle.pos.x : target.pos.x;
}

function targetZ(target) {
  return target.vehicle && target.vehicle.pos ? target.vehicle.pos.z : target.pos.z;
}

/** Lower the gun, stop, stand. */
function relax(intent) {
  intent.fire = false;
  intent.aim = false;
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.crouch = false;
  intent.faceYaw = null;
}

function setMove(intent, x, z, pace) {
  const length = Math.sqrt(x * x + z * z);
  if (length < 1e-4) {
    intent.moveX = 0;
    intent.moveZ = 0;
    return;
  }
  intent.moveX = x / length;
  intent.moveZ = z / length;
  intent.pace = pace;
}

/** Walk to a spot and stop on it. */
function steerTo(intent, character, x, z, pace) {
  const dx = x - character.pos.x;
  const dz = z - character.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.3) {
    intent.moveX = 0;
    intent.moveZ = 0;
    return;
  }
  const speed = Math.min(1, d / 0.8);
  intent.moveX = (dx / d) * speed;
  intent.moveZ = (dz / d) * speed;
  intent.pace = pace;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function range(min, max) {
  return min + Math.random() * (max - min);
}
