// The guns of Port Sarab in people's hands: every frame it turns each character's intent to fire into
// shots (fire rate, magazines, reloads, spread that blooms with sustained fire and movement), sends
// each round down its line with the ballistics, lands the damage, kicks the player's camera, and tells
// the effects, the audio and the police with 'shot:fired'. It also owns the fists and the bat, blasts,
// pickups and the gunfight AI. Becomes game.weapons; sets game.catalog.weapons and weaponById.
import * as THREE from 'three';
import { damageAtRange, shotSpread, driveBySpread, bloomAfterShot } from './combatRules.js';
import { WEAPON_CATALOG, FISTS, weaponSpecById } from './weaponCatalog.js';
import { createCombatTargetGrid } from './combatTargetGrid.js';
import { createBallistics, heightOf } from './ballistics.js';
import { createAimAssist } from './aimAssist.js';
import { createMeleeCombat } from './meleeCombat.js';
import { createExplosionDamage } from './explosionDamage.js';
import { createWeaponPickups } from './weaponPickups.js';
import { createGunfightAI } from './gunfightAI.js';

/** Seconds a press of the trigger is remembered while a semi-automatic gun is still cycling. */
const TRIGGER_BUFFER = 0.22;
/** Seconds to bring a newly chosen weapon up before it fires. */
const DRAW_SECONDS = 0.18;
/** Share of each recoil kick the camera settles back by itself. */
const RECOIL_RETURN = 0.6;
/** States in which nobody can shoot or swing. */
const HELPLESS = new Set(['ragdoll', 'getUp', 'dead', 'enterVehicle', 'exitVehicle', 'handsUp', 'swim']);

/**
 * Build game.weapons and register the weapon catalogue.
 * @returns {Object} game.weapons
 */
export function createWeaponSystem(game) {
  game.catalog.weapons = WEAPON_CATALOG;
  game.catalog.weaponById = weaponSpecById;

  const grid = createCombatTargetGrid(game);
  const ballistics = createBallistics(game, grid);
  /** @type {WeakMap<Object, Object>} per-character trigger, magazine and recoil state */
  const armsStates = new WeakMap();
  const stats = createCombatStats();
  const melee = createMeleeCombat(game, grid, { onHit: (attacker, target, amount, weaponId) => stats.hit(attacker, target, amount, weaponId, false) });
  const explosions = createExplosionDamage(game, grid, ballistics, { onHit: () => {} });
  const gunfight = createGunfightAI(game, { current, isReloading, reload, ballistics, grid });
  const aimAssist = createAimAssist(game, grid, ballistics, isHostile);

  const muzzle = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const pelletDir = new THREE.Vector3();
  /** The crosshair's ray (from level with the player) for the shot being fired, when there is one. */
  const look = new THREE.Vector3();
  const probeOrigin = new THREE.Vector3();
  let crosshairShown = false;
  const sideAxis = new THREE.Vector3();
  const upAxis = new THREE.Vector3();
  const probeTrace = ballistics.makeTrace();
  const shotTrace = ballistics.makeTrace();
  const damageInfo = { source: null, weaponId: '', dirX: 0, dirZ: 0, headshot: false, kind: 'bullet' };
  const vehicleInfo = { source: null, kind: 'bullet', x: 0, z: 0 };
  const shotEvents = [];
  for (let i = 0; i < 24; i += 1) shotEvents.push(makeShotEvent());
  let nextShotEvent = 0;
  const hitEvent = { shooter: null, target: null, amount: 0, headshot: false, killed: false, weaponId: '' };
  const soundOptions = { x: 0, y: 0, z: 0, volume: 1, pitch: 1 };
  let pendingArsenal = null;
  let playerRecoilDebt = 0;
  let playerLastShot = -10;
  let driveByWarned = false;

  const weapons = {
    catalog: WEAPON_CATALOG,
    give,
    take,
    current,
    aiAttack: gunfight.aiAttack,
    ai: gunfight.fights,
    explode: explosions.explode,
    dropPickup,
    reload,
    isReloading,
    reloadProgress,
    spreadOf,
    isHostile,
    traceShot: ballistics.traceShot,
    serialize,
    deserialize,
    stats,
    update,
    /** The person the aim assist is leaning the camera toward, for a HUD target marker. */
    get assistTarget() {
      return aimAssist.target;
    },
  };
  const pickups = createWeaponPickups(game, { give, current, catalog: weaponSpecById });
  weapons.pickups = pickups;

  // ---- the frame ------------------------------------------------------------------------------------

  /** Fighters think, triggers are read, rounds fly, swings land, pickups spin. */
  function update(dt) {
    if (!(dt > 0)) return;
    const started = performance.now();
    stats.externalMs = 0;
    grid.refresh();
    if (pendingArsenal) applyArsenal();
    gunfight.fights.update(dt);
    const playerCharacter = game.player ? game.player.character : null;
    const people = game.characters ? game.characters.list : null;
    if (people) {
      for (let i = 0; i < people.length; i += 1) {
        const person = people[i];
        if (person) updateArms(person, dt, person === playerCharacter);
      }
    }
    if (playerCharacter) {
      aimAssist.updateCameraPull(dt, playerCharacter);
      settleRecoil(dt);
    }
    pickups.update(dt);
    stats.frameMs = performance.now() - started;
    stats.ownMs = Math.max(0, stats.frameMs - stats.externalMs);
    stats.averageMs += (stats.ownMs - stats.averageMs) * 0.05;
  }

  /** One character's weapon for a frame: weapon changes, reloads, the trigger, melee. */
  function updateArms(character, dt, isPlayer) {
    const intent = character.intent;
    if (!intent || !character.weapons) return;
    let arms = armsStates.get(character);
    if (!arms) {
      if (!intent.fire && character.weapons.length === 0) return;
      arms = makeArms(character);
      armsStates.set(character, arms);
    }
    if (character.alive === false) {
      arms.reloadTimer = 0;
      melee.reset(arms);
      return;
    }
    if (arms.lastIndex !== character.weaponIndex) {
      arms.lastIndex = character.weaponIndex;
      arms.reloadTimer = 0;
      arms.cooldown = Math.max(arms.cooldown, DRAW_SECONDS);
      arms.lastFire = !!intent.fire;
      arms.queued = 0;
      melee.reset(arms);
    }
    if (arms.reloadTimer > 0) {
      arms.reloadTimer -= dt;
      if (arms.reloadTimer <= 0) finishReload(character, arms);
    }
    const fire = !!intent.fire;
    const pressed = fire && !arms.lastFire;
    arms.lastFire = fire;
    if (pressed) arms.queued = TRIGGER_BUFFER;
    else if (arms.queued > 0) arms.queued -= dt;
    arms.cooldown -= dt;
    const spec = current(character);
    if (spec && arms.bloom > 0) arms.bloom = Math.max(0, arms.bloom - spec.bloomRecovery * dt);

    if (HELPLESS.has(character.state)) return;
    if (isPlayer && game.input && game.input.pressed('reload')) startReload(character, arms);

    if (!spec || spec.melee) {
      if (!character.vehicle) melee.updateMelee(character, arms, spec || FISTS, dt, pressed);
      return;
    }
    if (character.vehicle && !spec.oneHanded) {
      if (isPlayer && pressed) switchToDriveByWeapon(character);
      return;
    }
    if (arms.reloadTimer > 0) return;
    const slot = character.weapons[character.weaponIndex];
    if (slot.clip <= 0) {
      if (slot.ammo > 0) startReload(character, arms);
      else if (pressed) dryFire(character, isPlayer);
      return;
    }
    if (!fire && arms.queued <= 0) {
      if (arms.cooldown < 0) arms.cooldown = 0;
      return;
    }
    if (spec.automatic) {
      if (!fire) return;
      let shots = 0;
      while (arms.cooldown <= 0 && slot.clip > 0 && shots < 3) {
        fireRound(character, arms, spec, slot, isPlayer);
        arms.cooldown += 1 / spec.fireRate;
        shots += 1;
      }
    } else if (arms.queued > 0 && arms.cooldown <= 0) {
      arms.queued = 0;
      fireRound(character, arms, spec, slot, isPlayer);
      arms.cooldown = Math.max(0, arms.cooldown) + 1 / spec.fireRate;
    }
    if (slot.clip === 0 && slot.ammo > 0) startReload(character, arms);
  }

  /**
   * One pull of the trigger: a round (or the shotgun's pellets) from the muzzle toward where the
   * shooter aims, through the spread, into whatever it meets.
   */
  function fireRound(shooter, arms, spec, slot, isPlayer) {
    slot.clip -= 1;
    const intent = shooter.intent;
    const now = game.time.elapsed;
    arms.lastShotAt = now;
    muzzleOf(shooter, intent.aimYaw, muzzle);
    let preciseAim = false;
    if (isPlayer) {
      if (shooter.vehicle) {
        if (!aimAssist.driverAim(shooter, intent.aimYaw, muzzle.x, muzzle.y, muzzle.z, aimDir)) crosshairDirection(shooter, spec, aimDir);
      } else {
        preciseAim = crosshairDirection(shooter, spec, aimDir);
        if (!preciseAim && crosshairShown) aimAssist.bendShot(shooter, muzzle, probeOrigin, look, aimDir, spec);
      }
    } else {
      directionOf(intent.aimYaw, intent.aimPitch, aimDir);
    }
    // An AI fighting through aiAttack has its hit or miss decided by the gunfight AI; a gun fired any
    // other way strays by its spread.
    const decided = !isPlayer && gunfight.aimShot(shooter, spec, muzzle, aimDir);
    const spread = decided ? 0 : spreadFor(shooter, spec, arms, isPlayer);
    const pellets = Math.max(1, spec.pellets);
    stats.shot(shooter, spec.id, pellets);
    for (let p = 0; p < pellets; p += 1) {
      scatter(aimDir, pellets > 1 ? spec.spread * (isPlayer && game.input && game.input.held('aim') ? 0.85 : 1) : spread, pelletDir);
      const trace = ballistics.traceShot(shooter, muzzle.x, muzzle.y, muzzle.z, pelletDir.x, pelletDir.y, pelletDir.z, spec.range, shotTrace);
      landRound(shooter, spec, trace, pelletDir, isPlayer);
      if (p === 0) announceShot(shooter, spec, trace, pellets);
      else drawExtraPellet(trace);
    }
    arms.bloom = bloomAfterShot(spec, arms.bloom);
    if (isPlayer) kickCamera(shooter, spec);
  }

  /** The damage a round does where it lands. */
  function landRound(shooter, spec, trace, dir, isPlayer) {
    if (trace.kind === 'character') {
      const target = trace.target;
      const amount = damageAtRange(spec, trace.distance) * trace.damageScale;
      const wasAlive = target.alive !== false;
      damageInfo.source = shooter;
      damageInfo.weaponId = spec.id;
      damageInfo.dirX = dir.x;
      damageInfo.dirZ = dir.z;
      damageInfo.headshot = trace.headshot;
      const handedOver = performance.now();
      if (game.characters && game.characters.damage) game.characters.damage(target, amount, damageInfo);
      stats.externalMs += performance.now() - handedOver;
      damageInfo.source = null;
      const killed = wasAlive && target.alive === false;
      stats.hit(shooter, target, amount, spec.id, killed, trace.headshot);
      if (isPlayer) announceHit(shooter, target, amount, trace.headshot, killed, spec.id);
    } else if (trace.kind === 'vehicle') {
      const vehicle = trace.target;
      const amount = damageAtRange(spec, trace.distance) * spec.vehicleDamage;
      vehicleInfo.source = shooter;
      vehicleInfo.x = trace.x;
      vehicleInfo.z = trace.z;
      const handedOver = performance.now();
      if (game.vehicles && game.vehicles.applyDamage) game.vehicles.applyDamage(vehicle, amount, vehicleInfo);
      stats.externalMs += performance.now() - handedOver;
      vehicleInfo.source = null;
      stats.hit(shooter, vehicle, amount, spec.id, false);
      if (isPlayer) announceHit(shooter, vehicle, amount, false, false, spec.id);
    }
  }

  /** 'shot:fired' for the effects (flash, tracer, impact), the audio (the gun) and the police. */
  function announceShot(shooter, spec, trace, pellets) {
    const event = shotEvents[nextShotEvent];
    nextShotEvent = (nextShotEvent + 1) % shotEvents.length;
    event.shooter = shooter;
    event.weaponId = spec.id;
    event.model = spec.model;
    event.x = muzzle.x;
    event.y = muzzle.y;
    event.z = muzzle.z;
    event.dirX = pelletDir.x;
    event.dirY = pelletDir.y;
    event.dirZ = pelletDir.z;
    event.hitX = trace.x;
    event.hitY = trace.y;
    event.hitZ = trace.z;
    event.hit = trace.kind;
    event.target = trace.kind === 'world' ? null : trace.target;
    event.headshot = trace.headshot;
    event.pellets = pellets;
    event.isPlayer = !!(game.player && game.player.character === shooter);
    const handedOver = performance.now();
    game.events.emit('shot:fired', event);
    stats.externalMs += performance.now() - handedOver;
  }

  /** A shotgun's other pellets: a tracer and an impact each, without another bang. */
  function drawExtraPellet(trace) {
    const effects = game.effects;
    if (!effects) return;
    const handedOver = performance.now();
    if (effects.tracer && Math.random() < 0.5) effects.tracer(muzzle.x, muzzle.y, muzzle.z, trace.x, trace.y, trace.z);
    if (trace.kind && trace.kind !== 'character' && effects.bulletImpact) {
      effects.bulletImpact(trace.x, trace.y, trace.z, trace.nx, trace.ny, trace.nz, trace.kind === 'vehicle' ? trace.target : null);
    }
    stats.externalMs += performance.now() - handedOver;
  }

  /** The player's hit, for a hit marker on the HUD and a sound. */
  function announceHit(shooter, target, amount, headshot, killed, weaponId) {
    hitEvent.shooter = shooter;
    hitEvent.target = target;
    hitEvent.amount = amount;
    hitEvent.headshot = headshot;
    hitEvent.killed = killed;
    hitEvent.weaponId = weaponId;
    game.events.emit('combat:playerHit', hitEvent);
  }

  // ---- where shots come from and go -----------------------------------------------------------------

  /**
   * Where the player's crosshair points: a ray from the camera through the screen centre (starting
   * level with the player, so nothing behind them is aimed at), and from the muzzle toward that point.
   * Returns true when the crosshair sits on a person (no aim assist needed).
   */
  function crosshairDirection(shooter, spec, out) {
    const rig = game.cameraRig;
    const camera = game.camera;
    crosshairShown = !!(rig && !rig.isCinematic && camera);
    if (!crosshairShown) {
      directionOf(shooter.intent.aimYaw, shooter.intent.aimPitch, out);
      return false;
    }
    look.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const cp = camera.position;
    const depth = Math.max(0, (muzzle.x - cp.x) * look.x + (muzzle.y - cp.y) * look.y + (muzzle.z - cp.z) * look.z);
    probeOrigin.copy(cp).addScaledVector(look, depth);
    const probe = ballistics.traceShot(shooter, probeOrigin.x, probeOrigin.y, probeOrigin.z, look.x, look.y, look.z, spec.range + 30, probeTrace);
    out.set(probe.x - muzzle.x, probe.y - muzzle.y, probe.z - muzzle.z);
    const length = out.length();
    if (length < 1.2) {
      out.copy(look);
      return probe.kind === 'character';
    }
    out.multiplyScalar(1 / length);
    if (out.dot(look) < 0.3) out.copy(look);
    return probe.kind === 'character';
  }

  /** The muzzle: at chest height a little ahead and to the right, or at the car window toward the aim. */
  function muzzleOf(character, yaw, out) {
    const vehicle = character.vehicle;
    if (vehicle && vehicle.pos && vehicle.spec) {
      const reach = vehicle.spec.width * 0.5 + 0.35;
      return out.set(vehicle.pos.x + Math.sin(yaw) * reach, vehicle.pos.y + vehicle.spec.height * 0.78, vehicle.pos.z + Math.cos(yaw) * reach);
    }
    const characters = game.characters;
    if (characters && typeof characters.getMuzzlePosition === 'function' && current(character)) {
      characters.getMuzzlePosition(character, out);
      if (Number.isFinite(out.x) && Math.abs(out.y - character.pos.y) < 2.2) return out;
    }
    const scale = heightOf(character) / 1.78;
    const crouch = character.intent && character.intent.crouch;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    return out.set(
      character.pos.x + fx * 0.45 - fz * 0.16,
      character.pos.y + (crouch ? 1.0 : 1.45) * scale,
      character.pos.z + fz * 0.45 + fx * 0.16,
    );
  }

  /**
   * The cone (radians) a round may stray in: the weapon's own, wider from the hip, while moving or
   * driving, after sustained fire, and for a poor shot; tighter crouched.
   */
  function spreadFor(character, spec, arms, isPlayer) {
    const accuracy = isPlayer ? 1 : gunfight.accuracyOf(character);
    if (character.vehicle) return shotSpread(spec, arms.bloom, 0, false, false, accuracy) + driveBySpread(character.vehicle.speed || 0);
    const hipFire = isPlayer && !(game.input && game.input.held('aim'));
    const vel = character.vel;
    const runShare = vel ? Math.min(1, Math.sqrt(vel.x * vel.x + vel.z * vel.z) / 7.4) : 0;
    return shotSpread(spec, arms.bloom, runShare, hipFire, !!(character.intent && character.intent.crouch), accuracy);
  }

  /** Turn a unit direction by a random angle within `cone`, uniformly over the disc. */
  function scatter(dir, cone, out) {
    if (!(cone > 0)) return out.copy(dir);
    sideAxis.set(dir.z, 0, -dir.x);
    if (sideAxis.lengthSq() < 1e-8) sideAxis.set(1, 0, 0);
    sideAxis.normalize();
    upAxis.crossVectors(sideAxis, dir).normalize();
    const radius = cone * Math.sqrt(Math.random());
    const angle = Math.random() * Math.PI * 2;
    const a = Math.tan(radius * Math.cos(angle));
    const b = Math.tan(radius * Math.sin(angle));
    return out.copy(dir).addScaledVector(sideAxis, a).addScaledVector(upAxis, b).normalize();
  }

  /** The player's camera kicks up a little with each shot and shakes with the weapon's weight. */
  function kickCamera(shooter, spec) {
    playerLastShot = game.time.elapsed;
    const rig = game.cameraRig;
    if (!rig || rig.isCinematic || shooter.vehicle) {
      if (rig && shooter.vehicle) rig.shake(spec.shake * 0.5);
      return;
    }
    const aimed = game.input && game.input.held('aim');
    const kick = spec.recoil * (aimed ? 0.8 : 1);
    rig.pitch = Math.max(-0.32, rig.pitch - kick);
    rig.yaw += (Math.random() - 0.5) * kick * 0.5;
    playerRecoilDebt += kick * RECOIL_RETURN;
    rig.shake(spec.shake);
  }

  /** After a burst the camera eases most of the way back down. */
  function settleRecoil(dt) {
    if (playerRecoilDebt <= 0) return;
    if (game.time.elapsed - playerLastShot < 0.09) return;
    const rig = game.cameraRig;
    if (!rig) {
      playerRecoilDebt = 0;
      return;
    }
    const step = Math.min(playerRecoilDebt, Math.max(0.003, playerRecoilDebt * 9 * dt));
    rig.pitch = Math.min(1.25, rig.pitch + step);
    playerRecoilDebt -= step;
  }

  // ---- magazines --------------------------------------------------------------------------------------

  function startReload(character, arms) {
    const spec = current(character);
    if (!spec || spec.melee || arms.reloadTimer > 0) return false;
    const slot = character.weapons[character.weaponIndex];
    if (!slot || slot.clip >= spec.clipSize || !(slot.ammo > 0)) return false;
    arms.reloadTimer = spec.reloadSeconds;
    arms.reloadTotal = spec.reloadSeconds;
    arms.reloadSlot = character.weaponIndex;
    soundOptions.x = character.pos.x;
    soundOptions.y = character.pos.y + 1.2;
    soundOptions.z = character.pos.z;
    soundOptions.volume = 0.8;
    soundOptions.pitch = 1;
    game.audio?.play?.('reload', soundOptions);
    game.events.emit('weapon:reload', { character, weaponId: spec.id, seconds: spec.reloadSeconds });
    return true;
  }

  function finishReload(character, arms) {
    arms.reloadTimer = 0;
    const slot = character.weapons[arms.reloadSlot];
    const spec = slot ? weaponSpecById(slot.id) : null;
    if (!slot || !spec || arms.reloadSlot !== character.weaponIndex) return;
    const take = Math.min(spec.clipSize - slot.clip, slot.ammo);
    if (!(take > 0)) return;
    slot.clip += take;
    slot.ammo -= take;
  }

  /** Reload the character's gun now (the player's R key; an AI behind cover). */
  function reload(character) {
    if (!character) return false;
    let arms = armsStates.get(character);
    if (!arms) {
      arms = makeArms(character);
      armsStates.set(character, arms);
    }
    return startReload(character, arms);
  }

  function isReloading(character) {
    const arms = armsStates.get(character);
    return !!(arms && arms.reloadTimer > 0);
  }

  /** 0..1 through a reload, or -1 when not reloading (for the HUD's ammo counter). */
  function reloadProgress(character) {
    const arms = armsStates.get(character);
    if (!arms || !(arms.reloadTimer > 0)) return -1;
    return 1 - arms.reloadTimer / (arms.reloadTotal || 1);
  }

  /** Radians of spread the character's next shot would have (for a crosshair that opens up). */
  function spreadOf(character) {
    const spec = current(character);
    if (!spec || spec.melee) return 0;
    const arms = armsStates.get(character);
    const isPlayer = !!(game.player && game.player.character === character);
    return spreadFor(character, spec, arms || NO_ARMS, isPlayer);
  }

  function dryFire(character, isPlayer) {
    soundOptions.x = character.pos.x;
    soundOptions.y = character.pos.y + 1.2;
    soundOptions.z = character.pos.z;
    soundOptions.volume = 1;
    soundOptions.pitch = 1;
    game.audio?.play?.('emptyClick', soundOptions);
    if (isPlayer) game.events.emit('notify', { text: 'Out of ammo', kind: 'bad' });
  }

  /** The player pulls the trigger at the wheel with a two-handed gun: switch to an SMG or a pistol. */
  function switchToDriveByWeapon(character) {
    const list = character.weapons;
    let best = -1;
    for (let i = 0; i < list.length; i += 1) {
      const spec = weaponSpecById(list[i].id);
      if (!spec || !spec.oneHanded || !(list[i].clip > 0 || list[i].ammo > 0)) continue;
      if (best === -1 || spec.id === 'smg') best = i;
    }
    if (best === -1) {
      if (!driveByWarned) {
        driveByWarned = true;
        game.events.emit('notify', { text: 'Shooting from the wheel takes a pistol or an SMG', kind: 'info' });
      }
      return;
    }
    character.weaponIndex = best;
    game.events.emit('player:weaponChanged', { character, weaponIndex: best });
  }

  // ---- the arsenal ------------------------------------------------------------------------------------

  /**
   * Give a weapon with `ammo` rounds (the magazine is filled first), or add the rounds to one already
   * carried. A character who had no weapons draws it at once. Returns the inventory slot or null.
   */
  function give(character, weaponId, ammo) {
    const spec = weaponSpecById(weaponId);
    if (!character || !character.weapons || !spec || spec === FISTS) return null;
    const rounds = typeof ammo === 'number' && ammo >= 0 ? ammo : spec.startAmmo;
    const list = character.weapons;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id !== spec.id) continue;
      if (!spec.melee) list[i].ammo += rounds;
      game.events.emit('weapon:given', { character, weaponId: spec.id, ammo: rounds });
      return list[i];
    }
    const hadNothing = list.length === 0;
    const clip = spec.melee ? 0 : Math.min(spec.clipSize, rounds);
    const slot = { id: spec.id, ammo: spec.melee ? 0 : rounds - clip, clip };
    // Keep the inventory in catalogue order so cycling feels the same every time.
    const order = WEAPON_CATALOG.indexOf(spec);
    let at = list.length;
    for (let i = 0; i < list.length; i += 1) {
      if (WEAPON_CATALOG.indexOf(weaponSpecById(list[i].id)) > order) {
        at = i;
        break;
      }
    }
    list.splice(at, 0, slot);
    if (character.weaponIndex >= at) character.weaponIndex += 1;
    if (hadNothing) character.weaponIndex = at;
    const arms = armsStates.get(character);
    if (arms) arms.lastIndex = character.weaponIndex;
    if (hadNothing && game.player && game.player.character === character) {
      game.events.emit('player:weaponChanged', { character, weaponIndex: character.weaponIndex });
    }
    game.events.emit('weapon:given', { character, weaponId: spec.id, ammo: rounds });
    return slot;
  }

  /** Take a weapon away; whoever held it is left with their fists or the next weapon down. */
  function take(character, weaponId) {
    if (!character || !character.weapons) return false;
    const list = character.weapons;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id !== weaponId) continue;
      list.splice(i, 1);
      if (character.weaponIndex === i) character.weaponIndex = list.length > 0 ? Math.min(i, list.length - 1) : -1;
      else if (character.weaponIndex > i) character.weaponIndex -= 1;
      const arms = armsStates.get(character);
      if (arms) {
        arms.lastIndex = character.weaponIndex;
        arms.reloadTimer = 0;
      }
      return true;
    }
    return false;
  }

  /** The spec of the weapon in the character's hands, or null for bare fists. */
  function current(character) {
    if (!character || !character.weapons) return null;
    const index = character.weaponIndex;
    if (!(index >= 0) || index >= character.weapons.length) return null;
    return weaponSpecById(character.weapons[index].id);
  }

  /** Put a pickup on the ground: kind 'weapon'|'ammo'|'health'|'armor'|'cash', options {weaponId?, amount?, fixed?}. */
  function dropPickup(kind, x, z, options) {
    return pickups.drop(kind, x, z, options || {});
  }

  /**
   * Is this person fighting the player? Anyone a gunfight is aimed at the player, anyone whose AI
   * names the player as its target or enemy or says it is hostile, and the police while wanted.
   */
  function isHostile(character) {
    const player = game.player ? game.player.character : null;
    if (!character || character === player) return false;
    if (player && gunfight.fights.targetOf(character) === player) return true;
    const ai = character.ai;
    if (ai && player && (ai.target === player || ai.enemy === player || ai.hostile === true)) return true;
    if (character.tags && character.tags.hostile) return true;
    if ((character.kind === 'officer' || character.faction === 'police') && game.wanted && game.wanted.level > 0) return true;
    return false;
  }

  /** The player's weapons for a save: [{id, ammo, clip}] and the one in hand. */
  function serialize() {
    const character = game.player ? game.player.character : null;
    if (!character) return { weapons: [], weaponIndex: -1 };
    return {
      weapons: character.weapons.map((slot) => ({ id: slot.id, ammo: Number.isFinite(slot.ammo) ? slot.ammo : 999, clip: slot.clip })),
      weaponIndex: character.weaponIndex,
    };
  }

  /** Restore the player's weapons from a save (applied as soon as the player exists). */
  function deserialize(data) {
    if (!data || !Array.isArray(data.weapons)) return;
    pendingArsenal = data;
    if (game.player && game.player.character) applyArsenal();
  }

  function applyArsenal() {
    const character = game.player ? game.player.character : null;
    if (!character) return;
    const data = pendingArsenal;
    pendingArsenal = null;
    character.weapons.length = 0;
    for (const slot of data.weapons) {
      const spec = weaponSpecById(slot.id);
      if (!spec || spec === FISTS) continue;
      character.weapons.push({ id: spec.id, ammo: Math.max(0, slot.ammo | 0), clip: Math.min(spec.clipSize, Math.max(0, slot.clip | 0)) });
    }
    const index = data.weaponIndex | 0;
    character.weaponIndex = index >= 0 && index < character.weapons.length ? index : -1;
    const arms = armsStates.get(character);
    if (arms) {
      arms.lastIndex = character.weaponIndex;
      arms.reloadTimer = 0;
    }
  }

  function makeArms(character) {
    return {
      lastIndex: character.weaponIndex, lastFire: false, queued: 0, cooldown: 0,
      reloadTimer: 0, reloadTotal: 0, reloadSlot: -1, bloom: 0, lastShotAt: -10, melee: null,
    };
  }

  return weapons;
}

/** A unit direction from a heading and a pitch (positive looks up). */
function directionOf(yaw, pitch, out) {
  const c = Math.cos(pitch || 0);
  return out.set(Math.sin(yaw || 0) * c, Math.sin(pitch || 0), Math.cos(yaw || 0) * c);
}

function makeShotEvent() {
  return {
    shooter: null, weaponId: '', model: '', x: 0, y: 0, z: 0, dirX: 0, dirY: 0, dirZ: 1,
    hitX: 0, hitY: 0, hitZ: 0, hit: null, target: null, headshot: false, pellets: 1, isPlayer: false,
  };
}

const NO_ARMS = { bloom: 0 };

/**
 * Running figures for each weapon (shots, hits, damage, kills, headshots) and the cost of the combat
 * update, for the pause screen's statistics and for testing.
 */
function createCombatStats() {
  const byWeapon = {};
  const row = (id) => {
    let entry = byWeapon[id];
    if (!entry) {
      entry = { shots: 0, pellets: 0, hits: 0, damage: 0, kills: 0, headshots: 0, firstShot: -1, lastShot: -1 };
      byWeapon[id] = entry;
    }
    return entry;
  };
  return {
    byWeapon,
    /** Milliseconds of the last update in all, and without what other systems did on our events. */
    frameMs: 0,
    ownMs: 0,
    externalMs: 0,
    averageMs: 0,
    shot(shooter, weaponId, pellets) {
      const entry = row(weaponId);
      entry.shots += 1;
      entry.pellets += pellets;
      const now = performance.now() / 1000;
      if (entry.firstShot < 0) entry.firstShot = now;
      entry.lastShot = now;
    },
    hit(shooter, target, amount, weaponId, killed, headshot) {
      const entry = row(weaponId);
      entry.hits += 1;
      entry.damage += amount;
      if (killed) entry.kills += 1;
      if (headshot) entry.headshots += 1;
    },
    reset() {
      for (const id of Object.keys(byWeapon)) delete byWeapon[id];
    },
  };
}
