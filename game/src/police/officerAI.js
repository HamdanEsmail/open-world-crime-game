// PSPD officers on foot in Port Sarab: piling out of their car when the suspect stops or runs,
// taking positions at building corners around him, shouting orders, opening fire when the stars
// allow it, moving in to cuff him at one or two stars, climbing back in when he drives off, and
// walking their beat outside the stations when nobody is wanted. What each officer sees is kept
// fresh by dispatch in officer.ai.eyes.
import { officersShootAtStars, officerAccuracy } from './wantedLevelRules.js';

/** How far each kind of officer engages from: a patrol pistol, a tactical rifle. */
const PISTOL_RANGE = 34;
const RIFLE_RANGE = 58;
/** Seconds an officer holds a position before looking for a better one. */
const HOLD_SECONDS = [3, 6];
/** Officers moving in for the arrest at once. */
const MAX_CUFFERS = 2;

/** Lines the officers shout, by situation. */
const LINES = {
  stopCar: ['PSPD! Out of the vehicle, now!', 'Engine off! Hands on the wheel!', 'Step out of the car, slowly!'],
  cuff: ['Hands where I can see them!', 'On your knees! Now!', 'Turn around, hands behind your back!', 'Do not move!'],
  armed: ['Drop it! Now!', 'Weapon! He is armed!', 'Put the gun down!'],
  fight: ['Shots fired, shots fired!', 'Take cover!', 'Flank him, go wide!', 'Suspect is hostile!', 'Keep him pinned!'],
  tactical: ['Tactical, moving in!', 'Contact front!', 'Covering, push up!', 'Target in sight!'],
  officerDown: ['Officer down! Officer down!', 'We lost one! Send everyone!'],
  loudspeaker: ['PSPD! Pull over now!', 'Stop the vehicle! This is your last warning!', 'Pull over to the side of the road!'],
  arrest: ['You are under arrest.', 'Got him. Suspect in custody.'],
};

/**
 * Build the officers' brains.
 * @param {Object} game
 * @param {Object} sight  from createPoliceSight
 */
export function createOfficerAI(game, sight) {
  const nearbyColliders = [];
  const attackOptions = { accuracy: 0.4 };
  const shot = { shooter: null, weaponId: 'pistol', model: 'pistol', x: 0, y: 0, z: 0, dirX: 0, dirY: 0, dirZ: 1, hitX: 0, hitY: 0, hitZ: 0, hit: null };
  const lineIndex = {};
  let nextShoutTime = 0;

  /** Get the crew out of the car: they will take positions round the suspect. */
  function deploy(unit) {
    const characters = game.characters;
    for (let i = 0; i < unit.officers.length; i += 1) {
      const officer = unit.officers[i];
      if (officer.vehicle && characters && characters.exitVehicle) characters.exitVehicle(officer, {});
      officer.ai.state = 'exiting';
      officer.ai.timer = 0;
      officer.ai.hasGoal = false;
    }
    unit.state = 'deployed';
  }

  /** Call the crew back to the car; the first living officer takes the wheel. */
  function recall(unit) {
    let seat = 0;
    for (let i = 0; i < unit.officers.length; i += 1) {
      const officer = unit.officers[i];
      const ai = officer.ai;
      ai.seat = seat;
      seat += 1;
      if (officer.vehicle === unit.vehicle && ai.state === 'seated') continue;
      ai.state = 'return';
      ai.timer = 0;
    }
  }

  /** How many of the unit's living officers are sitting in its car. */
  function seatedCount(unit) {
    let count = 0;
    for (let i = 0; i < unit.officers.length; i += 1) {
      const officer = unit.officers[i];
      if (officer.vehicle && officer.vehicle === unit.vehicle && officer.ai.state === 'seated') count += 1;
    }
    return count;
  }

  /**
   * One officer's frame. States: 'seated', 'exiting', 'advance' (running to a position), 'cover'
   * (holding it, aiming, firing), 'cuff' (moving in for the arrest), 'return' and 'entering' (back
   * to the car), 'patrol' (walking the beat), 'walkAway' (off duty, leaving the scene).
   */
  function update(officer, unit, dt, ctx) {
    const ai = officer.ai;
    if (!ai || officer.alive === false || ai.state === 'dead') return;
    ai.timer += dt;
    const intent = officer.intent;
    if (ai.state === 'seated') {
      if (!officer.vehicle) startFighting(officer);
      return;
    }
    if (ai.state === 'exiting') {
      if (officer.vehicle && ai.timer > 2.5) game.characters?.exitVehicle?.(officer, { instant: true });
      if (!officer.vehicle && (officer.state !== 'exitVehicle' || ai.timer > 1.5)) startFighting(officer);
      return;
    }
    if (ai.state === 'entering') {
      if (officer.vehicle === unit.vehicle && (officer.state === 'driving' || officer.state === 'passenger')) {
        ai.state = 'seated';
        clearIntent(intent);
      } else if (!unit.vehicle || unit.vehicle.wrecked || ai.timer > 5) {
        if (unit.vehicle && !unit.vehicle.wrecked) game.characters?.enterVehicle?.(officer, unit.vehicle, ai.seat, { instant: true });
        else startFighting(officer);
      }
      return;
    }
    if (officer.vehicle) return;
    if (ai.state === 'patrol') {
      walkTheBeat(officer, dt, ctx);
      return;
    }
    if (ai.state === 'walkAway') {
      walkAway(officer, ctx);
      return;
    }
    if (ai.state === 'return') {
      returnToCar(officer, unit, dt);
      return;
    }
    fight(officer, unit, dt, ctx);
  }

  /** Taking positions, holding them, firing when allowed, or moving in to cuff. */
  function fight(officer, unit, dt, ctx) {
    const ai = officer.ai;
    const intent = officer.intent;
    const pos = officer.pos;
    const sees = ai.eyes.sees;
    if (!ctx.hasPlayer || ctx.playerDown || ctx.level === 0) {
      standStill(intent, null);
      intent.aim = false;
      intent.fire = false;
      return;
    }
    const d = ai.eyes.distance;
    const faceYaw = Math.atan2(ctx.px - pos.x, ctx.pz - pos.z);
    const range = unit.tactical ? RIFLE_RANGE : PISTOL_RANGE;

    if (ctx.arrestable && ai.state !== 'cuff' && ctx.cuffers < MAX_CUFFERS && d < 45) ai.state = 'cuff';
    if (ai.state === 'cuff') {
      if (!ctx.arrestable || ctx.cuffers >= MAX_CUFFERS) {
        ai.state = 'advance';
        ai.hasGoal = false;
      } else {
        ctx.cuffers += 1;
        moveInToCuff(officer, ctx, d, faceYaw, dt);
        if (d < 14) shout(ctx.onFoot ? 'cuff' : 'stopCar', unit);
        return;
      }
    }

    ai.repositionTimer -= dt;
    if (ai.state === 'advance') {
      if (!ai.hasGoal) chooseSpot(officer, unit, ctx, range);
      const arrived = runTo(officer, ai.goalX, ai.goalZ, d > 25 ? 'sprint' : 'run', dt);
      if (arrived) {
        ai.state = 'cover';
        ai.repositionTimer = HOLD_SECONDS[0] + Math.random() * (HOLD_SECONDS[1] - HOLD_SECONDS[0]);
      }
    } else {
      standStill(intent, faceYaw);
      const lostSight = !sees && ctx.now - ai.eyes.lastSeen > 1.5;
      if (ai.repositionTimer <= 0 || lostSight || d > range * 1.15 || d < 3.5) {
        ai.state = 'advance';
        ai.hasGoal = false;
      }
    }

    const mayShoot = sees && d < range && allowedToShoot(ctx);
    if (mayShoot) {
      const accuracy = accuracyFor(unit, ctx);
      const weapons = game.weapons;
      if (weapons && weapons.aiAttack) {
        attackOptions.accuracy = accuracy;
        weapons.aiAttack(officer, ctx.playerCharacter, dt, attackOptions);
      } else {
        fireWithoutWeaponSystem(officer, unit, ctx, dt, accuracy, faceYaw);
      }
      shout(unit.tactical ? 'tactical' : ctx.armed && ctx.level <= 2 ? 'armed' : 'fight', unit);
    } else {
      // Hold him at gunpoint without firing.
      intent.fire = false;
      intent.aim = sees && d < 26 && ai.state === 'cover';
      if (intent.aim) {
        intent.aimYaw = faceYaw;
        intent.aimPitch = 0;
      }
      if (sees && ctx.armed && d < 30) shout('armed', unit);
    }
  }

  /**
   * Walk up to the suspect (to his door if he sits in a car), gun drawn while closing, and stand
   * at arm's length for the cuffs.
   */
  function moveInToCuff(officer, ctx, d, faceYaw, dt) {
    const intent = officer.intent;
    let tx = ctx.px;
    let tz = ctx.pz;
    if (ctx.playerVehicle) {
      const vehicle = ctx.playerVehicle;
      const out = vehicle.dynamics ? vehicle.dynamics.profile.halfWidth + 0.9 : 1.9;
      tx += Math.cos(vehicle.heading) * out;
      tz -= Math.sin(vehicle.heading) * out;
    }
    const dx = tx - officer.pos.x;
    const dz = tz - officer.pos.z;
    const gap = Math.sqrt(dx * dx + dz * dz);
    if (gap > 1.1) runTo(officer, tx, tz, gap > 10 ? 'sprint' : gap > 3 ? 'run' : 'walk', dt);
    else standStill(intent, faceYaw);
    intent.fire = false;
    intent.aim = d < 12 && d > 1.8;
    if (intent.aim) {
      intent.aimYaw = faceYaw;
      intent.aimPitch = 0;
    }
  }

  /** Run back to the car and climb in at the officer's seat. */
  function returnToCar(officer, unit, dt) {
    const ai = officer.ai;
    const vehicle = unit.vehicle;
    if (!vehicle || vehicle.wrecked || vehicle.isPlayer) {
      startFighting(officer);
      return;
    }
    const dx = vehicle.pos.x - officer.pos.x;
    const dz = vehicle.pos.z - officer.pos.z;
    if (dx * dx + dz * dz > 36 && ai.timer < 20) {
      runTo(officer, vehicle.pos.x, vehicle.pos.z, 'sprint', dt);
      officer.intent.aim = false;
      officer.intent.fire = false;
      return;
    }
    clearIntent(officer.intent);
    const entered = game.characters && game.characters.enterVehicle
      ? game.characters.enterVehicle(officer, vehicle, ai.seat, { instant: ai.timer >= 20 }) : false;
    if (entered) {
      ai.state = 'entering';
      ai.timer = 0;
    }
  }

  /** A foot patrol strolls a short beat along the pavement by its post, now and then stopping to talk. */
  function walkTheBeat(officer, dt, ctx) {
    const ai = officer.ai;
    const intent = officer.intent;
    ai.beatTimer -= dt;
    if (ai.beatTimer <= 0) {
      ai.beat = (ai.beat + 1) % 4;
      ai.beatTimer = 6 + Math.random() * 8;
    }
    if (ai.beat === 1 || ai.beat === 3) {
      const along = ai.beat === 1 ? 9 : -9;
      const arrived = runTo(officer, ai.postX + ai.beatX * along, ai.postZ + ai.beatZ * along, 'walk', dt);
      if (arrived) standStill(intent, null);
      intent.gesture = null;
    } else {
      standStill(intent, null);
      intent.gesture = ai.beat === 0 ? 'talk' : null;
    }
    intent.aim = false;
    intent.fire = false;
    if (ctx.level > 0) intent.gesture = null;
  }

  /** Off duty: walk away from the player until out of sight. */
  function walkAway(officer, ctx) {
    const intent = officer.intent;
    let dx = officer.pos.x - ctx.px;
    let dz = officer.pos.z - ctx.pz;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= d;
    dz /= d;
    intent.moveX = dx;
    intent.moveZ = dz;
    intent.pace = 'walk';
    intent.faceYaw = null;
    intent.aim = false;
    intent.fire = false;
    intent.gesture = null;
  }

  /** Back on duty from any situation: choose a position and go. */
  function startFighting(officer) {
    const ai = officer.ai;
    ai.state = 'advance';
    ai.hasGoal = false;
    ai.timer = 0;
  }

  /**
   * Pick a position round the suspect: a handful of points on a ring at a good shooting distance,
   * each snapped to a nearby building corner when there is one (cover), kept only if it has a clear
   * view of him, preferring close, covered, uncrowded spots.
   */
  function chooseSpot(officer, unit, ctx, range) {
    const ai = officer.ai;
    const pos = officer.pos;
    const bearing = Math.atan2(pos.x - ctx.px, pos.z - ctx.pz);
    const radius = range * (ctx.onFoot ? 0.5 : 0.42);
    let bestScore = -Infinity;
    let bestX = ctx.px + Math.sin(bearing) * radius;
    let bestZ = ctx.pz + Math.cos(bearing) * radius;
    for (let k = 0; k < 6; k += 1) {
      const angle = bearing + (k - 2.5) * 0.42 + (officer.id % 3) * 0.17;
      const r = radius * (0.85 + 0.3 * ((k * 37 + officer.id) % 7) / 6);
      let x = ctx.px + Math.sin(angle) * r;
      let z = ctx.pz + Math.cos(angle) * r;
      const corner = nearestCorner(x, z, 7);
      let covered = false;
      if (corner) {
        x = corner.x;
        z = corner.z;
        covered = true;
      }
      if (insideSomething(x, z)) continue;
      if (!sight.clearView(x, groundAt(x, z) + 1.4, z, ctx.px, ctx.py + 1, ctx.pz)) continue;
      let score = -Math.hypot(x - pos.x, z - pos.z) * 0.6 + (covered ? 9 : 0);
      score -= crowding(x, z, officer, ctx) * 12;
      if (!sight.clearView(pos.x, pos.y + 0.6, pos.z, x, groundAt(x, z) + 0.6, z)) score -= 15;
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestZ = z;
      }
    }
    ai.goalX = bestX;
    ai.goalZ = bestZ;
    ai.hasGoal = true;
    ai.stuckTimer = 0;
    ai.lastX = pos.x;
    ai.lastZ = pos.z;
  }

  /** The corner of a building, wall or container within `reach` of (x, z), stepped just outside it. */
  const cornerOut = { x: 0, z: 0 };
  function nearestCorner(x, z, reach) {
    const colliders = game.colliders;
    if (!colliders || !colliders.query) return null;
    colliders.query(x, z, reach, nearbyColliders);
    let best = reach * reach;
    let found = false;
    for (let i = 0; i < nearbyColliders.length; i += 1) {
      const c = nearbyColliders[i];
      if (c.type !== 'box' || c.y1 < 1.2) continue;
      for (let k = 0; k < 4; k += 1) {
        const cx = k & 1 ? c.maxX : c.minX;
        const cz = k & 2 ? c.maxZ : c.minZ;
        const dSq = (cx - x) * (cx - x) + (cz - z) * (cz - z);
        if (dSq >= best) continue;
        best = dSq;
        cornerOut.x = cx + (k & 1 ? 0.9 : -0.9);
        cornerOut.z = cz + (k & 2 ? 0.9 : -0.9);
        found = true;
      }
    }
    return found ? cornerOut : null;
  }

  function insideSomething(x, z) {
    const colliders = game.colliders;
    if (!colliders || !colliders.query) return false;
    colliders.query(x, z, 0.5, nearbyColliders);
    for (let i = 0; i < nearbyColliders.length; i += 1) {
      const c = nearbyColliders[i];
      if (c.type === 'box' && x > c.minX - 0.4 && x < c.maxX + 0.4 && z > c.minZ - 0.4 && z < c.maxZ + 0.4) return true;
    }
    return false;
  }

  /** How many other officers already head for (or stand at) a point within 4 m of (x, z). */
  function crowding(x, z, self, ctx) {
    let count = 0;
    const units = ctx.units;
    for (let i = 0; i < units.length; i += 1) {
      const officers = units[i].officers;
      for (let k = 0; k < officers.length; k += 1) {
        const other = officers[k];
        if (other === self || !other.ai || !other.ai.hasGoal) continue;
        if ((other.ai.goalX - x) * (other.ai.goalX - x) + (other.ai.goalZ - z) * (other.ai.goalZ - z) < 16) count += 1;
      }
    }
    return count;
  }

  /** Steer the intent toward (x, z); true on arrival. Gives up on a goal it cannot reach. */
  function runTo(officer, x, z, pace, dt) {
    const ai = officer.ai;
    const intent = officer.intent;
    const dx = x - officer.pos.x;
    const dz = z - officer.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1.0) {
      intent.moveX = 0;
      intent.moveZ = 0;
      return true;
    }
    intent.moveX = dx / d;
    intent.moveZ = dz / d;
    intent.pace = pace;
    intent.faceYaw = null;
    intent.gesture = null;
    ai.stuckTimer += dt;
    if (ai.stuckTimer > 1.2) {
      const moved = Math.hypot(officer.pos.x - ai.lastX, officer.pos.z - ai.lastZ);
      ai.lastX = officer.pos.x;
      ai.lastZ = officer.pos.z;
      ai.stuckTimer = 0;
      if (moved < 0.5 && officer.state !== 'ragdoll' && officer.state !== 'getUp') ai.hasGoal = false;
    }
    return false;
  }

  /** May the officers open fire? Three stars and up, always; below that only at a real threat. */
  function allowedToShoot(ctx) {
    if (ctx.playerDown || ctx.level === 0) return false;
    return officersShootAtStars(ctx.level, ctx);
  }

  /** Accuracy for this unit now: by stars, better for the tactical team, worse at a fast-moving target. */
  function accuracyFor(unit, ctx) {
    return officerAccuracy(ctx.level, unit.tactical, ctx.pspeed);
  }

  /**
   * Without the weapon system: a shot every so often with a roll to hit, told to the effects and the
   * audio through 'shot:fired' like any other gun.
   */
  function fireWithoutWeaponSystem(officer, unit, ctx, dt, accuracy, faceYaw) {
    const ai = officer.ai;
    const intent = officer.intent;
    intent.aim = true;
    intent.aimYaw = faceYaw;
    intent.aimPitch = 0;
    intent.faceYaw = faceYaw;
    ai.fireTimer -= dt;
    if (ai.fireTimer > 0) return;
    ai.fireTimer = (unit.tactical ? 0.32 : 0.65) + Math.random() * 0.4;
    const mx = officer.pos.x;
    const my = officer.pos.y + 1.45;
    const mz = officer.pos.z;
    const hit = Math.random() < accuracy * 0.7;
    const miss = hit ? 0 : 1.5 + Math.random() * 2;
    const tx = ctx.px + (Math.random() - 0.5) * miss;
    const ty = ctx.py + 1 + (Math.random() - 0.5) * miss * 0.4;
    const tz = ctx.pz + (Math.random() - 0.5) * miss;
    const length = Math.hypot(tx - mx, ty - my, tz - mz) || 1;
    shot.shooter = officer;
    shot.weaponId = unit.tactical ? 'rifle' : 'pistol';
    shot.model = shot.weaponId;
    shot.x = mx;
    shot.y = my;
    shot.z = mz;
    shot.dirX = (tx - mx) / length;
    shot.dirY = (ty - my) / length;
    shot.dirZ = (tz - mz) / length;
    shot.hitX = tx;
    shot.hitY = ty;
    shot.hitZ = tz;
    shot.hit = hit ? ctx.playerCharacter : null;
    game.events.emit('shot:fired', shot);
    if (!hit) return;
    if (ctx.playerVehicle && Math.random() < 0.6) {
      game.vehicles?.applyDamage?.(ctx.playerVehicle, 16, { kind: 'bullet', source: officer, x: tx, z: tz });
    } else {
      game.characters?.damage?.(ctx.playerCharacter, unit.tactical ? 9 : 6, { source: officer, kind: 'bullet', weaponId: shot.weaponId, dirX: shot.dirX, dirZ: shot.dirZ });
    }
  }

  /** A line from the officers (one at a time across the whole force, each kind in turn). */
  function shout(kind, unit) {
    const now = game.time.elapsed;
    if (now < nextShoutTime) return;
    const lines = LINES[kind];
    if (!lines) return;
    nextShoutTime = now + 4.5 + Math.random() * 2;
    const index = lineIndex[kind] || 0;
    lineIndex[kind] = index + 1;
    const speaker = kind === 'loudspeaker' ? 'PSPD Loudspeaker' : unit && unit.tactical ? 'PSPD Tactical' : 'PSPD Officer';
    game.events.emit('subtitle', { speaker, text: lines[index % lines.length], seconds: 2.6 });
  }

  /** Stop moving and shooting. */
  function standDown(officer) {
    clearIntent(officer.intent);
  }

  /** Off duty on foot: leave the scene (dispatch removes the officer once out of sight). */
  function walkOff(officer) {
    if (!officer.ai || officer.ai.state === 'dead') return;
    officer.ai.state = 'walkAway';
    officer.ai.hasGoal = false;
  }

  /** Put a foot officer on a beat along (beatX, beatZ) from a post. */
  function startPatrol(officer, postX, postZ, beatX, beatZ) {
    const ai = officer.ai;
    ai.state = 'patrol';
    ai.postX = postX;
    ai.postZ = postZ;
    ai.beatX = beatX;
    ai.beatZ = beatZ;
    ai.beat = 0;
  }

  function groundAt(x, z) {
    return game.terrain && game.terrain.heightAt ? game.terrain.heightAt(x, z) : 0;
  }

  return { deploy, recall, seatedCount, update, shout, standDown, startPatrol, startFighting, walkOff, allowedToShoot };
}

function standStill(intent, faceYaw) {
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.faceYaw = faceYaw;
}

function clearIntent(intent) {
  if (!intent) return;
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.aim = false;
  intent.fire = false;
  intent.faceYaw = null;
  intent.gesture = null;
}
