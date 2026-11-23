// What Port Sarab's people notice: gunshots and blasts heard down the street (each person reacts
// after their own short delay), a gun pointed at them, a car bearing down on them, the player
// barging past, a body on the pavement, a burning wreck, a police pursuit howling by, and the khamsin
// rising. Turns each into a call on the crowd's reactions.
import { surrendersToAimedGun, divesFromVehicle, shelterFromSandstorm } from './pedestrianRules.js';

/**
 * Build the senses of the crowd.
 * @param {Object} ctx  the crowd context from pedestrianSystem.js
 * @param {Object} respond  the reactions to call: react, onHurt, startFlee, startHandsUp, startStumble,
 *                          startDodge, startStare, startLook, setThreat
 */
export function createDangerPerception(ctx, respond) {
  const { game, rng, people } = ctx;
  const scenes = [];
  for (let i = 0; i < 12; i += 1) scenes.push({ kind: '', ref: null });
  let sceneCount = 0;
  let nextSceneScan = 0;
  let lastPanicEvent = -10;
  const eyeA = { x: 0, y: 0, z: 0 };
  const eyeB = { x: 0, y: 0, z: 0 };

  const perception = { perceive, updateFrame, alarm };

  game.events.on('shot:fired', (shot) => {
    if (!shot) return;
    const loud = shot.weaponId && LOUD_WEAPONS[shot.weaponId] ? 125 : 95;
    alarm('gunfire', shot.x, shot.z, loud, 1, shot.shooter || null, shot);
  });
  game.events.on('explosion', (blast) => {
    if (!blast) return;
    alarm('explosion', blast.x, blast.z, Math.max(70, (blast.radius || 6) * 10), 1.3, blast.source || null, null);
  });
  game.events.on('character:damaged', (hit) => {
    if (!hit || !hit.character) return;
    const victim = hit.character;
    if (victim.ai && victim.ai.owner === ctx.owner) respond.onHurt(victim, victim.ai, hit.source, hit.kind);
    if (hit.kind === 'melee') alarm('fight', victim.pos.x, victim.pos.z, 14, 0.5, hit.source || null, null);
  });
  game.events.on('character:died', (death) => {
    if (!death || !death.character) return;
    alarm('death', death.character.pos.x, death.character.pos.z, 20, 0.7, death.source || null, null);
  });
  game.events.on('character:knockedDown', (fall) => {
    if (!fall || !fall.character || !fall.character.ai || fall.character.ai.owner !== ctx.owner) return;
    respond.setThreat(fall.character.ai, fall.source, fall.character.pos.x, fall.character.pos.z);
  });
  const onStruck = (impact) => {
    if (!impact || !impact.character || !impact.vehicle) return;
    const victim = impact.character;
    if (victim.ai && victim.ai.owner === ctx.owner) respond.setThreat(victim.ai, impact.vehicle, impact.vehicle.pos.x, impact.vehicle.pos.z);
    alarm('crash', victim.pos.x, victim.pos.z, 18, 0.6, impact.vehicle, null);
  };
  game.events.on('vehicle:hitCharacter', onStruck);
  game.events.on('character:hitByVehicle', onStruck);

  /**
   * Something alarming happened at (x, z): everyone of ours within `radius` will react after a short,
   * personal delay, more strongly the closer they are. `source` (a Character or Vehicle) is what they
   * run from when known; a shot's whole path counts as close.
   */
  function alarm(kind, x, z, radius, strength, source, shot) {
    let fleeing = 0;
    for (let i = 0; i < people.length; i += 1) {
      const ped = people[i];
      const mind = ped.ai;
      if (!mind || ped.alive === false || mind.mode === 'dead') continue;
      let d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (shot && typeof shot.hitX === 'number') d = Math.min(d, distanceToSegment(ped.pos.x, ped.pos.z, x, z, shot.hitX, shot.hitZ) + 4);
      if (d > radius) continue;
      const felt = strength * Math.pow(1 - d / radius, 0.6);
      const delay = 0.08 + d / 340 + rng.range(0.05, 0.55) * (1 - 0.6 * mind.fear);
      if (mind.pendingKind && mind.pendingStrength >= felt) continue;
      mind.pendingKind = kind;
      mind.pendingAt = ctx.now + delay;
      mind.pendingX = x;
      mind.pendingZ = z;
      mind.pendingSource = source;
      mind.pendingStrength = felt;
      if (felt > 0.3) fleeing += 1;
    }
    if (fleeing >= 3 && ctx.now - lastPanicEvent > 2) {
      lastPanicEvent = ctx.now;
      game.events.emit('pedestrians:panic', { x, z, count: fleeing, cause: kind });
    }
    // Word gets round: for a while nobody new strolls into a shoot-out or a blast.
    if (strength >= 1) ctx.spawner.keepClear(x, z, kind === 'explosion' ? 110 : 90, 30);
  }

  /** Every frame: due reactions fire, the player's car is watched closely, the scene list refreshes. */
  function updateFrame() {
    const vehicle = ctx.player.vehicle;
    const fast = vehicle && vehicle.vel.x * vehicle.vel.x + vehicle.vel.z * vehicle.vel.z > 16;
    for (let i = 0; i < people.length; i += 1) {
      const ped = people[i];
      const mind = ped.ai;
      if (!mind || ped.alive === false) continue;
      if (mind.pendingKind && ctx.now >= mind.pendingAt) {
        const kind = mind.pendingKind;
        mind.pendingKind = null;
        respond.react(ped, mind, kind, mind.pendingX, mind.pendingZ, mind.pendingSource, mind.pendingStrength);
      }
      if (fast && mind.mode !== 'dodge' && mind.mode !== 'down' && mind.mode !== 'dead') checkVehicle(ped, mind, vehicle);
    }
    if (ctx.now >= nextSceneScan) {
      nextSceneScan = ctx.now + 1;
      scanScenes();
    }
  }

  /** A person's senses, a few times a second: guns, cars, bumps, bodies, sirens, the weather. */
  function perceive(ped, mind) {
    mind.fear = Math.max(0, mind.fear - 0.018);
    const storm = game.weather ? game.weather.sandstorm || 0 : 0;
    const shelter = shelterFromSandstorm(storm);
    if (shelter > 1) {
      mind.hurry = shelter;
      if (!mind.sheltering && mind.walkway) mind.lane = -ctx.walking.roadSideOf(mind.walkway) * (mind.toEnd === 1 ? 1 : -1) * 1.45;
      mind.sheltering = true;
    } else {
      mind.sheltering = false;
      mind.hurry = mind.shaken && mind.fear > 0.15 ? 1.3 : 1;
    }
    if (BUSY[mind.mode]) return;
    if (aimedAt(ped, mind)) return;
    if (bumpedByPlayer(ped, mind)) return;
    const vehicles = game.vehicles ? game.vehicles.list : null;
    if (vehicles) {
      for (let i = 0; i < vehicles.length; i += 1) {
        const v = vehicles[i];
        if (v === ctx.player.vehicle) continue;
        if (checkVehicle(ped, mind, v)) return;
      }
    }
    if (ctx.now >= mind.nextScene) {
      mind.nextScene = ctx.now + 0.9 + rng.next() * 0.3;
      noticeScenes(ped, mind);
    }
  }

  /** Is the player pointing a gun at this person from close by? Hands up, or run. */
  function aimedAt(ped, mind) {
    const shooter = ctx.player.character;
    if (!shooter || !ctx.player.onFoot || shooter.weaponIndex < 0 || !shooter.intent || !shooter.intent.aim) return false;
    const dx = ped.pos.x - shooter.pos.x;
    const dz = ped.pos.z - shooter.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 14) return false;
    const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - shooter.intent.aimYaw));
    const answer = surrendersToAimedGun(mind.courage, d, off, rng.next());
    if (answer) {
      mind.fear = Math.min(1, mind.fear + 0.4);
      if (answer === 'flee') respond.startFlee(ped, mind, shooter.pos.x, shooter.pos.z, 45, 1);
      else respond.startHandsUp(ped, mind, shooter);
      return true;
    }
    // Someone nearby waving a gun about: edge away.
    if ((mind.mode === 'walk' || mind.mode === 'activity' || mind.mode === 'wait') && rng.next() < 0.25) {
      mind.fear = Math.min(1, mind.fear + 0.2);
      respond.startFlee(ped, mind, shooter.pos.x, shooter.pos.z, 25, 0.3);
      return true;
    }
    return false;
  }

  /** The player ran into this person: stumble aside, then shout after them. */
  function bumpedByPlayer(ped, mind) {
    const runner = ctx.player.character;
    if (!runner || !ctx.player.onFoot || ctx.now - mind.lastBump < 5) return false;
    const dx = ped.pos.x - runner.pos.x;
    const dz = ped.pos.z - runner.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1.3) return false;
    if (runner.vel.x * runner.vel.x + runner.vel.z * runner.vel.z < 9) return false;
    mind.lastBump = ctx.now;
    const d = Math.sqrt(d2) || 1;
    respond.startStumble(ped, mind, runner, dx / d, dz / d);
    return true;
  }

  /** A vehicle closing fast on a collision course: dive aside at the last moment. Returns true if it acted. */
  function checkVehicle(ped, mind, v) {
    const vx = v.vel.x;
    const vz = v.vel.z;
    const speed2 = vx * vx + vz * vz;
    if (speed2 < 16) return false;
    const rx = ped.pos.x - v.pos.x;
    const rz = ped.pos.z - v.pos.z;
    if (rx * rx + rz * rz > 1600) return false;
    const t = (rx * vx + rz * vz) / speed2;
    if (t <= 0 || t > 1.8) return false;
    const cx = rx - vx * t;
    const cz = rz - vz * t;
    const miss = Math.sqrt(cx * cx + cz * cz);
    const half = (v.spec ? v.spec.width * 0.5 : 1) + 0.9;
    if (miss > half + 1.2) return false;
    const onKerb = !!game.terrain && game.terrain.surfaceAt(v.pos.x, v.pos.z) !== 'road';
    let answer = divesFromVehicle(miss, half, t, onKerb, mind.courage);
    if (answer === 'flee' && mind.mode === 'flee') answer = miss <= half ? 'dive' : null;
    if (answer === 'flee') respond.startFlee(ped, mind, v.pos.x, v.pos.z, 25, 1);
    else if (answer === 'dive') respond.startDodge(ped, mind, v, cx, cz, t);
    return answer !== null;
  }

  /** Once a second: the bodies, burning wrecks and police pursuits near the player. */
  function scanScenes() {
    sceneCount = 0;
    const p = ctx.player;
    const characters = game.characters ? game.characters.list : null;
    if (characters) {
      for (let i = 0; i < characters.length && sceneCount < 6; i += 1) {
        const c = characters[i];
        if (c.alive !== false || c.vehicle) continue;
        if (Math.abs(c.pos.x - p.x) > 130 || Math.abs(c.pos.z - p.z) > 130) continue;
        addScene('body', c);
      }
    }
    const vehicles = game.vehicles ? game.vehicles.list : null;
    if (vehicles) {
      for (let i = 0; i < vehicles.length && sceneCount < scenes.length; i += 1) {
        const v = vehicles[i];
        if (Math.abs(v.pos.x - p.x) > 150 || Math.abs(v.pos.z - p.z) > 150) continue;
        if (v.onFire || (v.wrecked && v.smoking)) addScene('fire', v);
        else if (v.controls && v.controls.siren && v.vel.x * v.vel.x + v.vel.z * v.vel.z > 36) addScene('siren', v);
      }
    }
  }

  function addScene(kind, ref) {
    scenes[sceneCount].kind = kind;
    scenes[sceneCount].ref = ref;
    sceneCount += 1;
  }

  /** Stop and stare at a body or a burning car (or hurry away); turn to watch a passing pursuit. */
  function noticeScenes(ped, mind) {
    for (let i = 0; i < sceneCount; i += 1) {
      const scene = scenes[i];
      const ref = scene.ref;
      const x = ref.pos.x;
      const z = ref.pos.z;
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (scene.kind === 'siren') {
        if (d > 38 || ctx.now - mind.lastLook < 14) continue;
        respond.startLook(ped, mind, ref);
        return;
      }
      const reach = scene.kind === 'fire' ? 30 : 17;
      if (d > reach || mind.lastScene === ref || !canSee(ped, x, z)) continue;
      mind.lastScene = ref;
      mind.fear = Math.min(1, mind.fear + 0.25);
      if (mind.courage > 0.42) respond.startStare(ped, mind, x, z, scene.kind === 'fire' ? 13 : 4.5, rng.range(5, 11));
      else respond.startFlee(ped, mind, x, z, 30, 0.3);
      return;
    }
  }

  function canSee(ped, x, z) {
    if (!game.colliders) return true;
    eyeA.x = ped.pos.x;
    eyeA.y = ped.pos.y + 1.6;
    eyeA.z = ped.pos.z;
    eyeB.x = x;
    eyeB.y = ped.pos.y + 0.6;
    eyeB.z = z;
    return game.colliders.lineOfSight(eyeA, eyeB);
  }

  return perception;
}

function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  let t = lengthSq > 0 ? ((px - ax) * abx + (pz - az) * abz) / lengthSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

/** Modes in which a person is too busy reacting to notice anything new (their own logic runs). */
const BUSY = { flee: true, cower: true, handsUp: true, fight: true, dodge: true, stumble: true, down: true, dead: true, call: true };
/** Weapons heard from farther away. */
const LOUD_WEAPONS = { shotgun: true, rifle: true, sniper: true, carbine: true };
