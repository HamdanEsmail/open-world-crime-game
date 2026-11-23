// How Port Sarab's people react to danger, each in their own way by their courage: gunfire and blasts
// send a crowd screaming down the sidewalks or cowering on the spot; a gun in their face puts their
// hands up; a car mounting the kerb makes them dive aside and shout after it; a punch makes most run
// and a brave few swing back; bodies and burning wrecks draw stares, sirens turn heads and phones
// come out to film. What they notice comes from dangerPerception.js.
import { createDangerPerception } from './dangerPerception.js';
import { reactionToGunfire, fightsBack } from './pedestrianRules.js';
import { moveToward, moveAlong, standStill, releaseIntent, headingToward, chooseClearHeading } from './pedestrianSteering.js';

/**
 * Build the reactions of the crowd (and its senses).
 * @param {Object} ctx  the crowd context from pedestrianSystem.js
 */
export function createPedestrianReactions(ctx) {
  const { game, rng } = ctx;
  const clear = { x: 0, z: 0 };
  let lastScream = -10;
  let lastShout = -10;

  const reactions = {
    modes: ['flee', 'cower', 'handsUp', 'fight', 'stare', 'dodge', 'shout', 'stumble', 'look', 'down', 'dead'],
    think,
    drive,
    react,
    onHurt,
    startFlee,
    startHandsUp,
    startStumble,
    startDodge,
    startStare,
    startLook,
    setThreat,
    enterDead,
    enterDown,
    unstick,
    perceive: null,
    updateFrame: null,
    alarm: null,
  };
  const senses = createDangerPerception(ctx, reactions);
  reactions.perceive = senses.perceive;
  reactions.updateFrame = senses.updateFrame;
  reactions.alarm = senses.alarm;

  /** React to an alarm now that it has reached this person. */
  function react(ped, mind, kind, x, z, source, felt) {
    if (mind.mode === 'dead' || mind.mode === 'down') return;
    const before = mind.fear;
    mind.fear = Math.min(1, mind.fear + felt * (1.15 - 0.6 * mind.courage));
    const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
    const tx = source && source.pos ? source.pos.x : x;
    const tz = source && source.pos ? source.pos.z : z;
    if (kind === 'gunfire' || kind === 'explosion' || kind === 'panic') {
      if (mind.mode === 'fight' && mind.courage > 0.9 && kind !== 'explosion') return;
      // Someone already on the phone to the police keeps talking unless it is right beside them.
      if (mind.mode === 'call' && d > 12) return;
      if (mind.mode === 'cower') {
        mind.reactUntil = Math.max(mind.reactUntil, ctx.now + rng.range(2, 5));
        return;
      }
      const closeRange = kind === 'explosion' ? 30 : 15;
      const close = d < closeRange;
      if (mind.mode !== 'flee' && reactionToGunfire(mind.courage, d, closeRange, rng.next()) === 'cower') startCower(ped, mind, tx, tz, rng.range(4, 9));
      else startFlee(ped, mind, tx, tz, 45 + 45 * felt, felt > 0.28 || close ? 1 : 0.4);
      if ((close || felt > 0.5) && before < 0.6) scream(ped);
      return;
    }
    // A fight, a crash or a death nearby: the bold look on, the rest hurry away.
    if (mind.mode === 'flee' || mind.mode === 'cower') return;
    if (mind.courage > 0.5 && rng.next() < 0.65) startStare(ped, mind, x, z, kind === 'fight' ? 4.5 : 6, rng.range(5, 10));
    else startFlee(ped, mind, tx, tz, 28, 0.35);
  }

  /** Hurt by someone: run from them, or (the brave few, punched) swing back. */
  function onHurt(ped, mind, source, kind) {
    if (ped.alive === false) return;
    setThreat(mind, source, ped.pos.x, ped.pos.z);
    mind.fear = Math.min(1, mind.fear + 0.5);
    if (kind === 'melee' && source && source.pos && source.intent && mind.mode !== 'fight' && fightsBack(mind.courage, rng.next())) {
      startFight(ped, mind, source);
      return;
    }
    if (mind.mode === 'down' || mind.mode === 'dead') return;
    startFlee(ped, mind, mind.threatX, mind.threatZ, 60, 1);
    scream(ped);
  }

  // --- Starting a reaction -----------------------------------------------------------------

  /**
   * Run from (fromX, fromZ) until at least `minDistance` away and calm again: along the sidewalks
   * when on one, else straight away round obstacles. `strength` 0..1 picks a jog or a flat sprint.
   */
  function startFlee(ped, mind, fromX, fromZ, minDistance = 45, strength = 1) {
    leaveCalmLife(ped, mind);
    mind.threatX = fromX;
    mind.threatZ = fromZ;
    mind.fleeMin = minDistance;
    const sprint = strength >= 0.5;
    mind.fleeSpeed = sprint ? rng.range(5.4, 6.8) * (0.9 + 0.2 * (1 - mind.courage)) : rng.range(2.6, 3.6);
    mind.calmAt = ctx.now + (sprint ? rng.range(8, 14) : rng.range(5, 9));
    mind.shaken = true;
    const hit = game.roads.nearestWalkway(ped.pos.x, ped.pos.z, 3.4);
    if (hit) {
      const w = hit.walkway;
      const along = (ped.pos.x - fromX) * w.dirX + (ped.pos.z - fromZ) * w.dirZ;
      mind.walkway = w;
      mind.toEnd = Math.abs(along) < 0.5 ? (rng.chance(0.5) ? 1 : 0) : along > 0 ? 1 : 0;
    } else {
      mind.walkway = null;
    }
    aimAway(ped, mind);
    ctx.setMode(ped, 'flee');
  }

  function startCower(ped, mind, fromX, fromZ, seconds) {
    leaveCalmLife(ped, mind);
    mind.threatX = fromX;
    mind.threatZ = fromZ;
    mind.reactUntil = ctx.now + seconds;
    mind.shaken = true;
    ctx.setMode(ped, 'cower');
  }

  function startHandsUp(ped, mind, shooter) {
    leaveCalmLife(ped, mind);
    mind.threatX = shooter.pos.x;
    mind.threatZ = shooter.pos.z;
    mind.threatSource = shooter;
    mind.reactUntil = ctx.now + rng.range(3, 7);
    mind.lowered = -1;
    mind.shaken = true;
    ctx.setMode(ped, 'handsUp');
  }

  function startStare(ped, mind, x, z, keepAway, seconds) {
    mind.lookX = x;
    mind.lookZ = z;
    mind.keepAway = keepAway;
    mind.reactUntil = ctx.now + seconds;
    mind.reactGesture = rng.chance(0.3) ? 'phone' : null;
    ctx.setMode(ped, 'stare');
  }

  /** Turn to watch something going by (a pursuit); some hold up a phone to film it. */
  function startLook(ped, mind, ref) {
    mind.lastLook = ctx.now;
    mind.lookRef = ref;
    mind.lookX = ref.pos.x;
    mind.lookZ = ref.pos.z;
    mind.reactUntil = ctx.now + rng.range(2, 4.5);
    mind.reactGesture = rng.chance(0.25) ? 'phone' : null;
    if (mind.reactGesture) mind.reactUntil += rng.range(2, 4);
    ctx.setMode(ped, 'look');
  }

  function startFight(ped, mind, target) {
    leaveCalmLife(ped, mind);
    mind.fightTarget = target;
    mind.reactUntil = ctx.now + rng.range(4, 7);
    mind.nextSwing = ctx.now + rng.range(0.2, 0.6);
    ctx.setMode(ped, 'fight');
  }

  /** Dive or dash out of a vehicle's path, sideways to its travel, from the side already on. */
  function startDodge(ped, mind, v, sideX, sideZ, timeLeft) {
    const speed = Math.hypot(v.vel.x, v.vel.z) || 1;
    let nx = -v.vel.z / speed;
    let nz = v.vel.x / speed;
    let side = sideX * nx + sideZ * nz;
    if (Math.abs(side) < 0.25) side = rng.chance(0.5) ? 1 : -1;
    if (side < 0) {
      nx = -nx;
      nz = -nz;
    }
    mind.dodgeX = nx;
    mind.dodgeZ = nz;
    mind.dodgeFrom = v;
    mind.dodgeDive = timeLeft < 0.5;
    mind.reactUntil = ctx.now + rng.range(0.7, 1.0);
    mind.fear = Math.min(1, mind.fear + 0.35);
    leaveCalmLife(ped, mind, true);
    ctx.setMode(ped, 'dodge');
    if (timeLeft < 0.7) scream(ped);
  }

  /** Barged by a runner: stagger a step aside (dirX, dirZ), then shout after them. */
  function startStumble(ped, mind, runner, dirX, dirZ) {
    mind.dodgeX = dirX;
    mind.dodgeZ = dirZ;
    mind.dodgeFrom = runner;
    mind.reactUntil = ctx.now + 0.6;
    leaveCalmLife(ped, mind, true);
    ctx.setMode(ped, 'stumble');
  }

  // --- Running each reaction ---------------------------------------------------------------

  function think(ped, mind) {
    switch (mind.mode) {
      case 'flee': thinkFlee(ped, mind); break;
      case 'cower':
        if (ctx.now >= mind.reactUntil) startFlee(ped, mind, mind.threatX, mind.threatZ, 40, 0.45);
        break;
      case 'handsUp': thinkHandsUp(ped, mind); break;
      case 'fight': thinkFight(ped, mind); break;
      case 'dodge':
      case 'stumble':
        if (ctx.now >= mind.reactUntil) afterNearMiss(ped, mind);
        break;
      case 'stare':
      case 'look':
      case 'shout':
        if (ctx.now >= mind.reactUntil) calmDown(ped, mind);
        break;
      default: break;
    }
  }

  function drive(ped, mind) {
    switch (mind.mode) {
      case 'flee': driveFlee(ped, mind); break;
      case 'cower':
        standStill(ped, headingToward(mind.threatX, mind.threatZ, ped.pos.x, ped.pos.z), 'cower');
        ped.intent.crouch = true;
        break;
      case 'handsUp': {
        const source = mind.threatSource;
        standStill(ped, source && source.pos ? headingToward(ped.pos.x, ped.pos.z, source.pos.x, source.pos.z) : null, 'handsUp');
        break;
      }
      case 'fight': driveFight(ped, mind); break;
      case 'dodge':
        moveAlong(ped, mind.dodgeX, mind.dodgeZ, 6.5, ctx.speeds);
        if (mind.dodgeDive && ctx.now - mind.modeSince < 0.15) ped.intent.jump = true;
        ped.intent.gesture = null;
        break;
      case 'stumble':
        moveAlong(ped, mind.dodgeX, mind.dodgeZ, 1.7, ctx.speeds);
        ped.intent.gesture = null;
        break;
      case 'stare': driveStare(ped, mind); break;
      case 'look': {
        const ref = mind.lookRef;
        if (ref && ref.pos) {
          mind.lookX = ref.pos.x;
          mind.lookZ = ref.pos.z;
        }
        standStill(ped, headingToward(ped.pos.x, ped.pos.z, mind.lookX, mind.lookZ), mind.reactGesture);
        break;
      }
      case 'shout':
        standStill(ped, headingToward(ped.pos.x, ped.pos.z, mind.lookX, mind.lookZ), 'wave');
        break;
      case 'down': getBackUp(ped, mind); break;
      default:
        releaseIntent(ped);
        break;
    }
  }

  /** Back on their feet: swing at whoever floored them if they meant to fight, else run. */
  function getBackUp(ped, mind) {
    if (ped.vehicle || DOWN_STATES[ped.state]) {
      releaseIntent(ped);
      return;
    }
    const target = mind.fightTarget;
    if (target && target.pos && target.alive !== false && Math.hypot(target.pos.x - ped.pos.x, target.pos.z - ped.pos.z) < 7) {
      startFight(ped, mind, target);
      return;
    }
    mind.fightTarget = null;
    startFlee(ped, mind, mind.threatX || ped.pos.x + 1, mind.threatZ || ped.pos.z, 50, 1);
  }

  function driveFlee(ped, mind) {
    const source = mind.threatSource;
    if (source && source.pos && source.alive !== false) {
      mind.threatX = source.pos.x;
      mind.threatZ = source.pos.z;
    }
    if (!(mind.walkway && ctx.walking.driveAlongWalkway(ped, mind, mind.fleeSpeed, true))) {
      moveAlong(ped, mind.fleeX, mind.fleeZ, mind.fleeSpeed, ctx.speeds);
    }
    ped.intent.gesture = null;
  }

  function thinkFlee(ped, mind) {
    const d = Math.hypot(ped.pos.x - mind.threatX, ped.pos.z - mind.threatZ);
    if (ctx.now >= mind.calmAt && d > mind.fleeMin) {
      calmDown(ped, mind);
      return;
    }
    if (mind.walkway) {
      // Running toward the danger along this sidewalk? Turn round.
      const sign = mind.toEnd === 1 ? 1 : -1;
      const ahead = ((mind.threatX - ped.pos.x) * mind.walkway.dirX + (mind.threatZ - ped.pos.z) * mind.walkway.dirZ) * sign;
      if (ahead > 0 && d < 18) mind.toEnd = 1 - mind.toEnd;
    } else {
      aimAway(ped, mind);
      const hit = game.roads.nearestWalkway(ped.pos.x, ped.pos.z, 2.5);
      if (hit && d > 8) {
        const along = (ped.pos.x - mind.threatX) * hit.walkway.dirX + (ped.pos.z - mind.threatZ) * hit.walkway.dirZ;
        if (Math.abs(along) > 2) {
          mind.walkway = hit.walkway;
          mind.toEnd = along > 0 ? 1 : 0;
        }
      }
    }
    mind.fleeSpeed = Math.max(2.4, mind.fleeSpeed * 0.985);
  }

  /** Straight away from the threat, swung round whatever is in the way. */
  function aimAway(ped, mind) {
    let ax = ped.pos.x - mind.threatX;
    let az = ped.pos.z - mind.threatZ;
    const d = Math.hypot(ax, az);
    if (d < 0.01) {
      const a = rng.next() * Math.PI * 2;
      ax = Math.sin(a);
      az = Math.cos(a);
    } else {
      ax /= d;
      az /= d;
    }
    chooseClearHeading(game.colliders, ped.pos.x, ped.pos.z, ax, az, 3.5, clear);
    mind.fleeX = clear.x;
    mind.fleeZ = clear.z;
  }

  /** Hands stay up while the gun stays on them; when it drops, they run (some after a long beat, then bolt). */
  function thinkHandsUp(ped, mind) {
    const shooter = mind.threatSource;
    let aiming = false;
    if (shooter && shooter.intent && shooter.intent.aim && shooter.weaponIndex >= 0 && ctx.player.onFoot) {
      const dx = ped.pos.x - shooter.pos.x;
      const dz = ped.pos.z - shooter.pos.z;
      aiming = Math.hypot(dx, dz) < 13 && Math.abs(wrapAngle(Math.atan2(dx, dz) - shooter.intent.aimYaw)) < 0.5;
    }
    if (aiming) {
      mind.lowered = -1;
      if (ctx.now >= mind.reactUntil && rng.chance(0.4)) startFlee(ped, mind, shooter.pos.x, shooter.pos.z, 50, 1);
      else if (ctx.now >= mind.reactUntil) mind.reactUntil = ctx.now + rng.range(2, 4);
      return;
    }
    if (mind.lowered < 0) mind.lowered = ctx.now;
    if (ctx.now - mind.lowered > rng.range(0.8, 1.8)) startFlee(ped, mind, mind.threatX, mind.threatZ, 40, mind.courage > 0.5 ? 0.4 : 1);
  }

  function driveFight(ped, mind) {
    const target = mind.fightTarget;
    if (!target || !target.pos) {
      releaseIntent(ped);
      return;
    }
    const dx = target.pos.x - ped.pos.x;
    const dz = target.pos.z - ped.pos.z;
    const yaw = Math.atan2(dx, dz);
    if (Math.hypot(dx, dz) > 1.35) {
      moveToward(ped, target.pos.x, target.pos.z, 3.6, ctx.speeds);
      ped.intent.gesture = null;
      return;
    }
    standStill(ped, yaw, null);
    const intent = ped.intent;
    intent.aimYaw = yaw;
    intent.aimPitch = 0;
    intent.fire = false;
    if (ctx.now >= mind.nextSwing) {
      intent.fire = true;
      mind.nextSwing = ctx.now + rng.range(0.55, 1.1);
    }
  }

  function thinkFight(ped, mind) {
    const target = mind.fightTarget;
    const gone = !target || target.alive === false || target.vehicle || !target.pos;
    const far = !gone && Math.hypot(target.pos.x - ped.pos.x, target.pos.z - ped.pos.z) > 9;
    if (gone || far || ctx.now >= mind.reactUntil) {
      mind.fightTarget = null;
      if (target && target.pos) startFlee(ped, mind, target.pos.x, target.pos.z, 30, 0.35);
      else calmDown(ped, mind);
    }
  }

  function driveStare(ped, mind) {
    const dx = ped.pos.x - mind.lookX;
    const dz = ped.pos.z - mind.lookZ;
    const d = Math.hypot(dx, dz);
    if (d < mind.keepAway - 0.5 && d > 0.01) {
      moveToward(ped, mind.lookX + (dx / d) * mind.keepAway, mind.lookZ + (dz / d) * mind.keepAway, 1.4, ctx.speeds);
      ped.intent.gesture = null;
      return;
    }
    standStill(ped, headingToward(ped.pos.x, ped.pos.z, mind.lookX, mind.lookZ), mind.reactGesture);
  }

  /** After a dodge or a stumble: shout after whoever it was, or hurry away if shaken. */
  function afterNearMiss(ped, mind) {
    const from = mind.dodgeFrom;
    mind.dodgeFrom = null;
    if (!from || !from.pos) {
      calmDown(ped, mind);
      return;
    }
    if (mind.courage < 0.3 || mind.fear > 0.85) {
      startFlee(ped, mind, from.pos.x, from.pos.z, 25, 0.35);
      return;
    }
    mind.lookX = from.pos.x;
    mind.lookZ = from.pos.z;
    mind.reactUntil = ctx.now + rng.range(1.4, 2.4);
    ctx.setMode(ped, 'shout');
    if (ctx.now - lastShout > 1.2) {
      lastShout = ctx.now;
      game.audio?.play?.('shout', { x: ped.pos.x, y: ped.pos.y + 1.6, z: ped.pos.z, volume: 0.8 });
    }
  }

  /** The fright is over: back to the spot, the sidewalk, or (still shaken) a brisk walk away. */
  function calmDown(ped, mind) {
    mind.fleeSpeed = 0;
    mind.threatSource = null;
    mind.lookRef = null;
    ctx.resume(ped);
  }

  /** Leave group, spot and errand behind (keepSpot: a quick dodge may return to the standing life). */
  function leaveCalmLife(ped, mind, keepSpot) {
    if (mind.leader || mind.followers.length > 0) ctx.walking.leaveGroup(ped, mind);
    if (!keepSpot) ctx.activities.abandon(ped, mind);
    mind.travelThen = null;
  }

  /** Remember who or what to run from once back on their feet. */
  function setThreat(mind, source, x, z) {
    mind.threatSource = source && source.pos ? source : null;
    mind.threatX = source && source.pos ? source.pos.x : x;
    mind.threatZ = source && source.pos ? source.pos.z : z;
  }

  function scream(ped) {
    if (ctx.now - lastScream < 0.35) return;
    lastScream = ctx.now;
    game.audio?.play?.('scream', { x: ped.pos.x, y: ped.pos.y + 1.6, z: ped.pos.z, volume: 0.9, pitch: 0.85 + rng.next() * 0.4 });
  }

  /** This person has died: let go of everything they were part of. */
  function enterDead(ped, mind) {
    leaveCalmLife(ped, mind);
    ctx.witnesses.forget(ped, mind);
    ctx.setMode(ped, 'dead');
  }

  /** Knocked flat (or bundled into a car): wait until the character system gives the body back. */
  function enterDown(ped, mind) {
    leaveCalmLife(ped, mind);
    mind.fear = Math.min(1, mind.fear + 0.6);
    ctx.setMode(ped, 'down');
  }

  /** A fleeing person got nowhere: swing off in a new direction. */
  function unstick(ped, mind) {
    if (mind.mode === 'flee') {
      mind.walkway = null;
      const a = rng.range(-2.4, 2.4);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = mind.fleeX * c + mind.fleeZ * s;
      mind.fleeZ = -mind.fleeX * s + mind.fleeZ * c;
      mind.fleeX = x;
    } else if (mind.mode === 'stare' || mind.mode === 'fight') {
      calmDown(ped, mind);
    }
  }

  return reactions;
}

function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

const DOWN_STATES = { ragdoll: true, getUp: true };
