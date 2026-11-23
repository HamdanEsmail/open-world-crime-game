// The people of Port Sarab: spawning and removing them, health, armour and deaths, knockdowns and
// people struck by cars, getting in and out of vehicles, melee blows, and the per-frame update that
// moves, animates and draws every one of them. Other systems only write character.intent (or call
// this API); everything else about a body happens here.
import * as THREE from 'three';
import { createRig, createPose, createBodyFrames, standingBodyFrame, solveSkeleton, FRAME, POSE } from './characterRig.js';
import { randomLook, castLook } from './characterLooks.js';
import { paintBody } from './characterPaint.js';
import { createAnimationState, animateCharacter, flinch, recoil, stagger } from './characterAnimations.js';
import { createMotionState, updateFootMotion, resolveVehicleContacts, separatePeople, groundAt } from './characterMotion.js';
import { startRagdoll, updateRagdoll, kickRagdoll, sweepTumble } from './characterRagdoll.js';
import { beginBoarding, beginExit, updateBoarding } from './characterVehicleBoarding.js';
import { createCharacterRenderer } from './characterRenderer.js';
import { MELEE_MOVES } from './characterActionPoses.js';
import { WEAPON_SHAPES, WEAPON_GRIP_DROP } from './characterPartShapes.js';
import { animationStateFor, ragdollLaunchFromHit, armourSoaks, staggersOnly } from './characterAnimationRules.js';

/**
 * Create game.characters.
 * @param {Object} game
 * @param {{capacity?:number, drawDistance?:number}} [options]
 */
export function createCharacterManager(game, options = {}) {
  const list = [];
  const renderer = createCharacterRenderer(game, options);
  const lookRandom = game.rng && typeof game.rng.fork === 'function' ? game.rng.fork('character-looks') : null;
  const playerConfig = (game.config && game.config.player) || {};
  const worldConfig = (game.config && game.config.world) || {};
  const config = {
    walkSpeed: playerConfig.walkSpeed || 2.0,
    runSpeed: playerConfig.runSpeed || 4.6,
    sprintSpeed: playerConfig.sprintSpeed || 7.4,
    jumpSpeed: playerConfig.jumpSpeed || 4.6,
    gravity: worldConfig.gravity || 9.81,
    seaLevel: worldConfig.seaLevel !== undefined ? worldConfig.seaLevel : -1,
  };
  let frameNumber = 0;

  const manager = {
    list,
    renderer,
    /** When true (default) melee blows land damage here; turn off if the weapons system resolves them. */
    meleeDamage: true,
    stats: { count: 0, updateMs: 0, drawn: 0 },
    spawn,
    despawn,
    nearest,
    damage,
    knockDown,
    kill,
    enterVehicle,
    exitVehicle,
    revive,
    randomLook: (archetype, rng) => randomLook(archetype, rng || lookRandom),
    castLook,
    setLook,
    getHandPosition,
    getMuzzlePosition,
    getHeadPosition,
    update,
    draw,
  };

  const boardingApi = {
    game,
    rig: (body) => body.rig,
    emit: (name, payload) => game.events.emit(name, payload),
    exitVehicle,
    groundAt: (x, z) => groundAt(game, x, z),
    isGone: (vehicle) => {
      const vehicles = game.vehicles && game.vehicles.list;
      return Array.isArray(vehicles) && vehicles.indexOf(vehicle) === -1;
    },
    throwOut(character, vx, vy, vz, options) {
      launch(character, vx, vy, vz, { swept: false });
      game.events.emit('character:knockedDown', { character, source: options.by || null });
    },
    exited(character, vehicle) {
      game.events.emit('character:exitedVehicle', { character, vehicle });
    },
  };

  const motionContext = {
    config,
    damage,
    knockDown,
    onLanded(character, speed) {
      if (speed > 3) game.events.emit('character:landed', { character, speed });
    },
    onSplash(character) {
      game.events.emit('character:splash', { character, x: character.pos.x, z: character.pos.z });
    },
    onVehicleHit: hitByVehicle,
  };

  const animationContext = {
    config,
    onStrike: landMeleeBlow,
    onFootstep(character, side) {
      const body = character.body;
      if (body.cameraDistance2 > 900) return;
      // One reused payload: listeners read it during the call and must not keep it.
      const step = _footstep;
      step.character = character;
      step.x = character.pos.x;
      step.z = character.pos.z;
      step.side = side;
      step.speed = Math.sqrt(character.vel.x * character.vel.x + character.vel.z * character.vel.z);
      step.surface = game.terrain && typeof game.terrain.surfaceAt === 'function' ? game.terrain.surfaceAt(step.x, step.z) : 'road';
      game.events.emit('character:footstep', step);
    },
  };

  game.events.on('shot:fired', (shot) => {
    const shooter = shot && shot.shooter;
    if (!shooter || !shooter.body) return;
    const weaponClass = shooter.body.weaponClass;
    recoil(shooter.body.anim, RECOIL[weaponClass] || 0.6);
  });
  // The vehicle system knocks people down and hurts them itself, then tells us: remember the hit so
  // our own contact check does not count it twice, and flip the fresh tumble over the bonnet.
  game.events.on('vehicle:hitCharacter', (hit) => {
    const character = hit && hit.character;
    if (!character || !character.body || !hit.vehicle) return;
    const motion = character.body.motion;
    motion.lastVehicleHitId = hit.vehicle.id;
    motion.lastVehicleHitTime = game.time ? game.time.elapsed : 0;
    if (character.body.mode === 'ragdoll') sweepTumble(character.body, hit.speed || 0);
  });

  /**
   * Bring a person into the world.
   * @param {{kind?:string, x:number, z:number, y?:number, heading?:number, faction?:string, look?:Object,
   *   archetype?:string, name?:string, health?:number, armor?:number, weapons?:Array, weaponIndex?:number}} spec
   */
  function spawn(spec = {}) {
    const kind = spec.kind || 'civilian';
    const archetype = spec.archetype || DEFAULT_ARCHETYPE[kind] || 'civilian';
    const look = spec.look || randomLook(archetype, lookRandom);
    const maxHealth = spec.health || (kind === 'player' ? playerConfig.maxHealth || 100 : archetype === 'swat' ? 140 : kind === 'civilian' ? 70 : 100);
    const x = spec.x || 0;
    const z = spec.z || 0;
    const character = {
      id: game.newEntityId(),
      kind,
      faction: spec.faction || DEFAULT_FACTION[kind] || 'civilian',
      name: spec.name,
      pos: new THREE.Vector3(x, spec.y !== undefined ? spec.y : groundAt(game, x, z), z),
      heading: spec.heading || 0,
      vel: new THREE.Vector3(),
      intent: game.createCharacterIntent(),
      state: 'idle',
      grounded: true,
      alive: true,
      health: maxHealth,
      maxHealth,
      armor: spec.armor || (archetype === 'swat' ? 50 : 0),
      lastDamageTime: -1e6,
      look,
      weapons: spec.weapons || [],
      weaponIndex: spec.weaponIndex !== undefined ? spec.weaponIndex : -1,
      vehicle: null,
      seat: 0,
      ai: null,
      tags: {},
      body: null,
    };
    character.body = createBody(character, look);
    list.push(character);
    game.events.emit('character:spawned', { character });
    return character;
  }

  /** Take a person out of the world (frees their seat). */
  function despawn(character) {
    const index = list.indexOf(character);
    if (index === -1) return;
    if (character.vehicle) {
      const vehicle = character.vehicle;
      if (vehicle.driver === character) vehicle.driver = null;
      if (Array.isArray(vehicle.passengers)) {
        const p = vehicle.passengers.indexOf(character);
        if (p !== -1) vehicle.passengers.splice(p, 1);
      }
      character.vehicle = null;
    }
    list[index] = list[list.length - 1];
    list.pop();
    if (character.body) character.body.hidden = true;
    game.events.emit('character:despawned', { character });
  }

  /** The closest person to (x, z) within maxDistance that passes `filter`. */
  function nearest(x, z, maxDistance = Infinity, filter) {
    let best = null;
    let bestD2 = maxDistance * maxDistance;
    for (let i = 0; i < list.length; i += 1) {
      const c = list[i];
      const dx = c.pos.x - x;
      const dz = c.pos.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2 && (!filter || filter(c))) {
        best = c;
        bestD2 = d2;
      }
    }
    return best;
  }

  /**
   * Hurt a person. Armour soaks the damage first. Returns the health actually lost. People tagged
   * invulnerable (cutscenes) take nothing. info: {source?, weaponId?, dirX?, dirZ?, headshot?,
   * kind?: 'bullet'|'melee'|'vehicle'|'explosion'|'fall'|'fire'}
   */
  function damage(character, amount, info = {}) {
    if (!character || !character.alive || !(amount > 0) || isInvulnerable(character)) return 0;
    const kind = info.kind || 'bullet';
    const absorbed = character.armor > 0 ? armourSoaks(character.armor, amount, kind) : 0;
    character.armor -= absorbed;
    const lost = Math.min(character.health, amount - absorbed);
    character.health -= lost;
    character.lastDamageTime = game.time ? game.time.elapsed : 0;
    game.events.emit('character:damaged', { character, amount, source: info.source || null, kind, weaponId: info.weaponId, headshot: !!info.headshot });
    const body = character.body;
    const dirX = info.dirX || 0;
    const dirZ = info.dirZ || 0;
    if (body) {
      const s = Math.sin(character.heading);
      const c = Math.cos(character.heading);
      flinch(body.anim, dirX * c - dirZ * s, dirX * s + dirZ * c, Math.max(0.35, amount / 28) * (info.headshot ? 1.4 : 1));
      if ((body.mode === 'lying' || body.mode === 'ragdoll') && kind === 'bullet') kickRagdoll(body, dirX * 0.8, 0.3, dirZ * 0.8);
    }
    // A blast throws the person, unless the caller says they were sheltered (noThrow) or this same
    // blast already threw them a moment ago (a knockDown and a damage call for one explosion).
    if (kind === 'explosion' && character.health > 0 && info.noThrow !== true && body && now() - body.motion.lastThrowTime >= BLAST_WINDOW) {
      const push = Math.min(12, 3 + amount * 0.12);
      knockDown(character, dirX * push, 2.5 + push * 0.35, dirZ * push, { source: info.source, blast: true });
    }
    if (character.health <= 0) kill(character, info);
    return lost;
  }

  /** Kill a person outright: they fall (out of any vehicle) and 'character:died' is told once. */
  function kill(character, info = {}) {
    if (!character || !character.alive) return;
    character.alive = false;
    character.health = 0;
    const body = character.body;
    const kind = info.kind || 'bullet';
    if (body && !body.diedTold) {
      body.diedTold = true;
      game.events.emit('character:died', { character, source: info.source || null, kind });
    }
    if (!body) return;
    if (character.vehicle || (body.boarding && body.boarding.phase === 'approach')) {
      if (character.vehicle) {
        exitVehicle(character, { thrown: true });
        return;
      }
      cancelApproach(character, body);
    }
    if (body.mode === 'ragdoll' || body.mode === 'lying') return;
    const dirX = info.dirX || 0;
    const dirZ = info.dirZ || 0;
    const blast = kind === 'explosion' && info.noThrow !== true;
    const push = kind === 'melee' ? 2.6 : blast ? 6 : kind === 'vehicle' ? 4 : kind === 'fall' ? 0.3 : 1.7;
    launch(character, dirX * push, blast ? 4 : 0.5, dirZ * push, { swept: false });
    body.motion.lastThrowTime = now();
  }

  /**
   * Knock a person off their feet with a launch velocity (m/s). Slow shoves (under 3 m/s) only make
   * them stagger; a fast sideways launch from a car (options.swept) flips them over it.
   */
  function knockDown(character, vx, vy, vz, options = {}) {
    if (!character || !character.body || isInvulnerable(character)) return;
    const body = character.body;
    if (character.vehicle) {
      exitVehicle(character, { thrown: true });
      return;
    }
    // One explosion throws a person once: a second throw inside the window after a blast is the same blast.
    const time = now();
    if (time - body.motion.lastBlastTime < BLAST_WINDOW && !options.match) return;
    if (options.blast) body.motion.lastBlastTime = time;
    if (body.boarding && body.boarding.phase === 'approach') cancelApproach(character, body);
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (body.mode === 'ragdoll' || body.mode === 'lying') {
      kickRagdoll(body, vx, vy, vz, !!options.match);
      body.motion.lastThrowTime = time;
      return;
    }
    if (character.alive && staggersOnly(speed) && body.mode === 'foot') {
      character.vel.x += vx;
      character.vel.z += vz;
      body.motion.stumbleTime = 0.45 + speed * 0.15;
      const s = Math.sin(character.heading);
      const c = Math.cos(character.heading);
      stagger(body.anim, vx * c - vz * s, vx * s + vz * c, Math.min(1, speed / 2.5 + 0.3));
      return;
    }
    launch(character, vx, vy, vz, options);
    body.motion.lastThrowTime = time;
    game.events.emit('character:knockedDown', { character, source: options.source || null });
  }

  /** Put a person into a seat; they run to the door first unless {instant: true}. */
  function enterVehicle(character, vehicle, seat = 0, options = {}) {
    if (!character || !vehicle || !character.alive || !character.body) return false;
    const body = character.body;
    if (body.mode === 'ragdoll' || body.mode === 'lying' || body.mode === 'getUp') return false;
    if (character.vehicle === vehicle && character.seat === seat) return true;
    if (character.vehicle) exitVehicle(character, { instant: true });
    const seats = Math.max(1, (vehicle.spec && vehicle.spec.seats) || 4);
    const chosen = Math.max(0, Math.min(seats - 1, seat | 0));
    beginBoarding(character, body, vehicle, chosen, !!options.instant, boardingApi);
    if (options.instant) game.events.emit('character:enteredVehicle', { character, vehicle, seat: chosen });
    return true;
  }

  /** Get out of the current vehicle: {instant?, thrown?}. Cancels a run to a door. */
  function exitVehicle(character, options = {}) {
    if (!character || !character.body) return false;
    const body = character.body;
    if (!character.vehicle) {
      if (body.boarding && body.boarding.phase === 'approach') {
        cancelApproach(character, body);
        return true;
      }
      return false;
    }
    return beginExit(character, body, options, boardingApi);
  }

  /** Change how a person looks (rebuilds their build and painted parts). */
  function setLook(character, look) {
    if (!character || !character.body || !look) return;
    character.look = look;
    character.body.rig = createRig(look.build);
    character.body.drawList = paintBody(look, character.body.rig);
  }

  /** World position of a hand ('left' or 'right'), from the last drawn frame or an estimate. */
  function getHandPosition(character, side, out = new THREE.Vector3()) {
    const body = character && character.body;
    if (body && body.frames.solvedFrame >= frameNumber - 2) {
      return out.set(0, -0.08, 0).applyMatrix4(body.frames[side === 'left' ? FRAME.HAND_L : FRAME.HAND_R]);
    }
    return estimate(character, side === 'left' ? 0.22 : -0.22, 1.0, 0.1, out);
  }

  /** World position of the muzzle of the held gun (the right hand when unarmed). */
  function getMuzzlePosition(character, out = new THREE.Vector3()) {
    const body = character && character.body;
    const shape = body && body.weaponClass ? WEAPON_SHAPES[body.weaponClass] : null;
    if (body && shape && body.frames.solvedFrame >= frameNumber - 2) {
      const m = shape.muzzle;
      return out.set(m[0], -m[2] - WEAPON_GRIP_DROP, m[1]).applyMatrix4(body.frames[FRAME.HAND_R]);
    }
    if (body && body.frames.solvedFrame >= frameNumber - 2) return getHandPosition(character, 'right', out);
    return estimate(character, -0.15, 1.42, 0.55, out);
  }

  /** World position of the middle of the head (for headshots and the camera). */
  function getHeadPosition(character, out = new THREE.Vector3()) {
    const body = character && character.body;
    if (body && body.frames.solvedFrame >= frameNumber - 2) return out.set(0, 0.17, 0.01).applyMatrix4(body.frames[FRAME.HEAD]);
    return estimate(character, 0, 1.64, 0, out);
  }

  /** Move, animate and draw everyone. Run after game.vehicles.update so seated people ride exactly with their cars. */
  function update(dt) {
    const started = performance.now();
    frameNumber += 1;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < list.length; i += 1) {
      const character = list[i];
      try {
        updateCharacter(character, step);
      } catch (error) {
        if (!character.body.warned) {
          character.body.warned = true;
          console.warn('characters: update failed for', character.id, error);
        }
      }
    }
    if (step > 0) separatePeople(list);
    renderer.draw(list, frameNumber);
    manager.stats.count = list.length;
    manager.stats.drawn = renderer.stats.drawn;
    manager.stats.updateMs = performance.now() - started;
  }

  /** Redraw everyone as they stand for the current camera without moving time (paused or staged frames). */
  function draw() {
    frameNumber += 1;
    renderer.draw(list, frameNumber);
    manager.stats.drawn = renderer.stats.drawn;
  }

  /** One person's frame: vehicles, ragdoll, getting up or walking; then the animator. */
  function updateCharacter(character, dt) {
    const body = character.body;
    resolveWeapon(character, body);
    const boarding = body.boarding;
    if (boarding && boarding.phase) {
      const before = boarding.phase;
      const phase = updateBoarding(character, body, dt, boardingApi);
      if (phase === 'seated' && before !== 'seated') game.events.emit('character:enteredVehicle', { character, vehicle: character.vehicle, seat: character.seat });
      if (phase === 'approach') walk(character, body, dt);
    } else if (body.mode === 'ragdoll' || body.mode === 'lying') {
      const status = updateRagdoll(character, body, dt, game);
      if (body.mode === 'ragdoll' && body.ragdoll) resolveVehicleContacts(character, body, body.ragdoll.p, game, motionContext);
      if (status === 'lying' && character.alive && body.ragdoll && body.ragdoll.lieTime > body.ragdoll.getUpAfter) {
        body.getUp = body.getUp || { t: 0, duration: 1.35, faceUp: false };
        body.getUp.t = 0;
        body.getUp.faceUp = body.ragdoll.faceUp;
        body.mode = 'getUp';
      }
    } else if (body.mode === 'getUp') {
      body.getUp.t += dt;
      character.vel.set(0, 0, 0);
      if (body.getUp.t >= body.getUp.duration) {
        body.mode = 'foot';
        character.grounded = true;
      }
    } else {
      walk(character, body, dt);
    }
    const far = body.cameraDistance2 > ANIMATE_EVERY_OTHER2;
    if (body.cameraDistance2 > NOT_DRAWN2) {
      // Too far to be drawn: nobody sees the pose, so skip it (the body still moves and falls).
      body.animDebt = 0;
    } else if (far) {
      body.animDebt += dt;
      if ((frameNumber + character.id) % 2 === 0) {
        animateCharacter(character, body, body.animDebt, animationContext);
        body.animDebt = 0;
      }
    } else {
      animateCharacter(character, body, dt + body.animDebt, animationContext);
      body.animDebt = 0;
    }
    character.state = resolveState(character, body);
  }

  /** On-foot (or swimming) movement and the shoves of other cars. */
  function walk(character, body, dt) {
    if (dt <= 0) return;
    updateFootMotion(character, body, dt, game, motionContext);
    if (body.mode === 'foot' || body.mode === 'swim') body.mode = body.motion.swimming ? 'swim' : 'foot';
    resolveVehicleContacts(character, body, character.pos, game, motionContext);
  }

  /** A car struck this person at `closing` m/s along (nx, nz). */
  function hitByVehicle(character, vehicle, closing, nx, nz) {
    const body = character.body;
    if (!body || character.vehicle === vehicle || isInvulnerable(character)) return;
    const now = game.time ? game.time.elapsed : performance.now() / 1000;
    if (body.motion.lastVehicleHitId === vehicle.id && now - body.motion.lastVehicleHitTime < 0.8) return;
    body.motion.lastVehicleHitId = vehicle.id;
    body.motion.lastVehicleHitTime = now;
    const vel = vehicle.vel || _zero;
    const speed = Math.max(closing, 0);
    game.events.emit('character:hitByVehicle', { character, vehicle, speed });
    const source = vehicle.driver || vehicle;
    const hit = ragdollLaunchFromHit(speed, _hit);
    const shove = hit.swept ? 1.2 : 1.6;
    knockDown(character, vel.x * hit.carry + nx * shove, hit.lift, vel.z * hit.carry + nz * shove, { source, swept: hit.swept, match: true });
    if (hit.harm > 0) damage(character, hit.harm, { source, kind: 'vehicle', dirX: nx, dirZ: nz });
  }

  /**
   * Stand a dead, knocked-down or hurt person back up, alive at full health, where they are now
   * (the player's respawn moves them first, then calls this).
   */
  function revive(character) {
    if (!character || !character.body) return;
    const body = character.body;
    character.alive = true;
    character.health = character.maxHealth;
    character.lastDamageTime = -1e6;
    body.diedTold = false;
    if (body.mode === 'ragdoll' || body.mode === 'lying' || body.mode === 'getUp' || body.mode === 'swim') {
      if (body.boarding) body.boarding.phase = null;
      body.rootOverride = false;
      body.ragdoll = null;
      body.getUp = null;
      body.mode = 'foot';
      body.anim.mode = 'foot';
      body.anim.blendT = body.anim.blendDuration;
      character.pos.y = groundAt(game, character.pos.x, character.pos.z);
    }
    character.grounded = true;
    character.vel.set(0, 0, 0);
    body.motion.stumbleTime = 0;
    body.motion.autoTarget = false;
    body.motion.swimming = false;
    body.anim.meleeMove = null;
    body.anim.stumble = 0;
    body.anim.flinchPitch = body.anim.flinchRoll = body.anim.flinchYaw = 0;
    body.anim.flinchPitchV = body.anim.flinchRollV = body.anim.flinchYawV = 0;
    character.state = resolveState(character, body);
    game.events.emit('character:revived', { character });
  }

  /** The game clock in seconds. */
  function now() {
    return game.time ? game.time.elapsed : performance.now() / 1000;
  }

  function isInvulnerable(character) {
    return !!(character.tags && character.tags.invulnerable === true);
  }

  /** The moment a punch, kick or bat swing lands: find who stands in front, hurt and shove them. */
  function landMeleeBlow(attacker, move) {
    const spec = MELEE_MOVES[move];
    if (!spec) return;
    const fx = Math.sin(attacker.heading);
    const fz = Math.cos(attacker.heading);
    game.events.emit('melee:strike', { attacker, move, x: attacker.pos.x + fx * 0.6, y: attacker.pos.y + 1.3, z: attacker.pos.z + fz * 0.6, dirX: fx, dirZ: fz });
    if (!manager.meleeDamage) return;
    let target = null;
    let best = (spec.reach + 0.35) * (spec.reach + 0.35);
    for (let i = 0; i < list.length; i += 1) {
      const other = list[i];
      if (other === attacker || !other.alive || other.vehicle) continue;
      const dx = other.pos.x - attacker.pos.x;
      const dz = other.pos.z - attacker.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > best || Math.abs(other.pos.y - attacker.pos.y) > 1.2) continue;
      const d = Math.sqrt(d2) || 1;
      if ((dx * fx + dz * fz) / d < 0.55) continue;
      target = other;
      best = d2;
    }
    if (!target) return;
    damage(target, spec.damage, { source: attacker, kind: 'melee', weaponId: move, dirX: fx, dirZ: fz });
    if (target.alive) knockDown(target, fx * spec.push, spec.push > 3 ? 1.2 : 0, fz * spec.push, { source: attacker });
    game.events.emit('melee:hit', { attacker, target, move });
  }

  /** Throw a person into a ragdoll tumble, making sure their body was posed at least once. */
  function launch(character, vx, vy, vz, options) {
    const body = character.body;
    if (body.frames.solvedFrame < 0 || body.cameraDistance2 > 150 * 150) {
      if (body.mode !== 'seated' && body.mode !== 'boarding' && body.mode !== 'unboarding') {
        standingBodyFrame(body.base, character.pos.x, character.pos.y, character.pos.z, character.heading);
      }
      solveSkeleton(body.rig, body.pose, body.base, null, body.frames, body.aimDir, null);
    }
    if (body.boarding) body.boarding.phase = null;
    body.motion.autoTarget = false;
    body.anim.meleeMove = null;
    startRagdoll(character, body, vx, vy, vz, options);
  }

  function cancelApproach(character, body) {
    const vehicle = body.boarding.vehicle;
    if (vehicle) {
      if (vehicle.driver === character) {
        if (game.vehicles && typeof game.vehicles.setDriver === 'function') {
          try { game.vehicles.setDriver(vehicle, null); } catch (error) { /* the field below is enough */ }
        }
        vehicle.driver = null;
      }
      if (Array.isArray(vehicle.passengers)) {
        const p = vehicle.passengers.indexOf(character);
        if (p !== -1) vehicle.passengers.splice(p, 1);
      }
    }
    body.boarding.phase = null;
    body.boarding.vehicle = null;
    body.motion.autoTarget = false;
    character.vehicle = null;
  }

  /** Which weapon class the right hand shows, from the weapon catalogue or the weapon's id. */
  function resolveWeapon(character, body) {
    const weapon = character.weaponIndex >= 0 ? character.weapons[character.weaponIndex] : null;
    const id = weapon ? weapon.id : null;
    if (id === body.weaponId) return;
    body.weaponId = id;
    if (!id) {
      body.weaponClass = null;
      return;
    }
    const catalog = game.catalog || {};
    const entry = typeof catalog.weaponById === 'function' ? catalog.weaponById(id) : null;
    const model = entry && entry.model;
    body.weaponClass = WEAPON_SHAPES[model] ? model : guessWeaponClass(id);
  }

  function createBody(character, look) {
    const rig = createRig(look.build);
    const seed = Math.random();
    const body = {
      rig,
      pose: createPose(),
      frames: createBodyFrames(),
      base: new THREE.Matrix4(),
      rootMatrix: new THREE.Matrix4(),
      rootOverride: false,
      aimDir: new THREE.Vector3(0, 0, 1),
      supportPoint: new THREE.Vector3(),
      supportGrip: null,
      drawList: paintBody(look, rig),
      weaponId: null,
      weaponClass: null,
      anim: createAnimationState(seed),
      motion: createMotionState(),
      ragdoll: null,
      ragdollPose: createPose(),
      getUp: null,
      boarding: null,
      wheel: { reach: 1 },
      mode: 'foot',
      hidden: false,
      cameraDistance2: 0,
      animDebt: 0,
      diedTold: false,
      warned: false,
    };
    standingBodyFrame(body.base, character.pos.x, character.pos.y, character.pos.z, character.heading);
    body.pose[POSE.L_FOOT_IK] = 0;
    return body;
  }

  function estimate(character, x, y, z, out) {
    const s = Math.sin(character.heading);
    const c = Math.cos(character.heading);
    return out.set(character.pos.x + x * c + z * s, character.pos.y + y, character.pos.z - x * s + z * c);
  }

  return manager;
}

/** The state other systems read: a summary of the body handed to the shared state rule. */
function resolveState(character, body) {
  const s = _summary;
  s.mode = body.mode;
  s.alive = character.alive;
  s.seat = character.seat;
  s.boarding = !!(body.boarding && body.boarding.phase === 'approach');
  s.stumbling = body.motion.stumbleTime > 0;
  s.grounded = character.grounded;
  s.vy = character.vel.y;
  s.melee = !!body.anim.meleeMove;
  s.aiming = body.anim.aimW > 0.5;
  s.gesture = character.intent.gesture;
  s.crouching = body.motion.crouching;
  s.speed = Math.sqrt(character.vel.x * character.vel.x + character.vel.z * character.vel.z);
  return animationStateFor(s);
}

/** A weapon id's look when the catalogue does not say: 'pistol', 'smg', 'rifle', 'shotgun' or 'bat'. */
function guessWeaponClass(id) {
  const text = String(id).toLowerCase();
  if (/shot|scatter|pump/.test(text)) return 'shotgun';
  if (/smg|sub|machine|uzi|vector/.test(text)) return 'smg';
  if (/rifle|carbine|sniper|assault|\bar\b|marksman/.test(text)) return 'rifle';
  if (/bat|club|pipe|crowbar|baton|stick|wrench/.test(text)) return 'bat';
  return 'pistol';
}

const DEFAULT_ARCHETYPE = { player: 'player', civilian: 'civilian', officer: 'officer', gang: 'gang', crew: 'crew', target: 'business' };
const DEFAULT_FACTION = { player: 'player', civilian: 'civilian', officer: 'police', gang: 'gang', crew: 'crew', target: 'civilian' };
const RECOIL = { pistol: 0.7, smg: 0.32, rifle: 0.45, shotgun: 1.0, bat: 0 };
const ANIMATE_EVERY_OTHER2 = 65 * 65;
const NOT_DRAWN2 = 170 * 170;
/** Seconds within which one explosion's knockDown and damage calls throw a person only once. */
const BLAST_WINDOW = 0.3;
const _zero = new THREE.Vector3();
const _hit = { carry: 0, lift: 0, swept: false, harm: 0 };
const _footstep = { character: null, x: 0, z: 0, side: 0, speed: 0, surface: 'road' };
const _summary = {
  mode: 'foot', alive: true, seat: 0, boarding: false, stumbling: false, grounded: true, vy: 0,
  melee: false, aiming: false, gesture: null, crouching: false, speed: 0,
};
