// People who see the player commit a crime and phone the police. Every crime the player commits
// (gunfire, a beating, a body, a hit-and-run, a carjacking, a blast, anything reported as a 'crime')
// becomes an incident; one bystander who saw it and is not too terrified backs off, takes out a phone
// and three to five seconds later the police know ('crime:witnessed'). Scare that caller off, knock
// them down or kill them first, and no call is made.
import { witnessPhonesPolice } from './pedestrianRules.js';
import { moveAlong, moveToward, standStill, headingToward, chooseClearHeading } from './pedestrianSteering.js';

/**
 * Build the crime witnesses.
 * @param {Object} ctx  the crowd context from pedestrianSystem.js
 */
export function createCrimeWitnesses(ctx) {
  const { game, rng, people, stats } = ctx;
  const incidents = [];
  for (let i = 0; i < 12; i += 1) incidents.push(blankIncident());
  const shortlist = [null, null, null, null];
  const shortScores = [0, 0, 0, 0];
  const eye = { x: 0, y: 0, z: 0 };
  const scene = { x: 0, y: 0, z: 0 };
  const away = { x: 0, z: 0 };

  const witnesses = {
    modes: ['call'],
    think,
    drive,
    update,
    forget,
    report,
    incidents,
  };

  // --- The player's crimes become incidents --------------------------------------------------

  game.events.on('crime', (crime) => {
    if (crime && typeof crime.x === 'number') report(crime.type || 'trespass', crime.x, crime.z, crime.victim || null);
  });
  game.events.on('shot:fired', (shot) => {
    if (shot && byPlayer(shot.shooter)) report('gunfire', shot.x, shot.z, null);
  });
  game.events.on('character:damaged', (hit) => {
    if (!hit || !hit.character || !byPlayer(hit.source) || hit.character === ctx.player.character) return;
    report(hit.character.kind === 'officer' ? 'officerAssault' : 'assault', hit.character.pos.x, hit.character.pos.z, hit.character);
  });
  game.events.on('character:died', (death) => {
    if (!death || !death.character || !byPlayer(death.source) || death.character === ctx.player.character) return;
    report(death.character.kind === 'officer' ? 'officerKilled' : 'murder', death.character.pos.x, death.character.pos.z, death.character);
  });
  const onStruck = (impact) => {
    if (!impact || !impact.vehicle || !impact.character) return;
    if (!(impact.vehicle.isPlayer || impact.vehicle === ctx.player.vehicle)) return;
    if ((impact.speed || 0) < HIT_AND_RUN_SPEED) return;
    report('hitAndRun', impact.character.pos.x, impact.character.pos.z, impact.character);
  };
  game.events.on('vehicle:hitCharacter', onStruck);
  game.events.on('character:hitByVehicle', onStruck);
  game.events.on('vehicle:carjacked', (jack) => {
    if (jack && jack.vehicle && byPlayer(jack.by)) report('carjacking', jack.vehicle.pos.x, jack.vehicle.pos.z, jack.victim || null);
  });
  game.events.on('explosion', (blast) => {
    if (blast && byPlayer(blast.source)) report('explosion', blast.x, blast.z, null);
  });

  /**
   * Record a crime at (x, z). Crimes close together in place and time are one incident (the worst
   * of them names it), so a burst of shots makes one phone call, not twenty.
   */
  function report(type, x, z, victim) {
    const rank = RANK[type] || 1;
    for (let i = 0; i < incidents.length; i += 1) {
      const incident = incidents[i];
      if (!incident.live || incident.done) continue;
      if (Math.abs(incident.x - x) > 28 || Math.abs(incident.z - z) > 28 || ctx.now - incident.time > 9) continue;
      if (rank > incident.rank) {
        incident.type = type;
        incident.rank = rank;
        incident.victim = victim || incident.victim;
      }
      incident.time = ctx.now;
      return incident;
    }
    const incident = freeIncident();
    incident.live = true;
    incident.type = type;
    incident.rank = rank;
    incident.x = x;
    incident.z = z;
    incident.victim = victim;
    incident.time = ctx.now;
    incident.born = ctx.now;
    incident.searchAt = ctx.now + rng.range(0.4, 1.0);
    incident.searches = 0;
    incident.caller = null;
    incident.done = false;
    incident.reported = false;
    return incident;
  }

  /** Find callers for fresh incidents; notice callers who were stopped. */
  function update() {
    for (let i = 0; i < incidents.length; i += 1) {
      const incident = incidents[i];
      if (!incident.live) continue;
      if (ctx.now - incident.born > 40) {
        incident.live = false;
        continue;
      }
      if (incident.done) continue;
      const caller = incident.caller;
      if (caller) {
        if (!caller.ai || caller.ai.call !== incident || caller.ai.mode !== 'call' || caller.alive === false) {
          // Scared off, knocked down, killed or taken away: this incident goes unreported.
          if (caller.ai && caller.ai.call === incident) caller.ai.call = null;
          incident.caller = null;
          incident.done = true;
        }
        continue;
      }
      if (ctx.now >= incident.searchAt && incident.searches < 3) {
        incident.searches += 1;
        incident.searchAt = ctx.now + 1.6;
        chooseCaller(incident);
      }
    }
  }

  /**
   * The bystander most likely to call: near, bold enough, not paralysed with fear, able to see the
   * spot. A handful of the best are checked for line of sight.
   */
  function chooseCaller(incident) {
    const radius = REACH[incident.type] || 35;
    for (let k = 0; k < shortlist.length; k += 1) {
      shortlist[k] = null;
      shortScores[k] = 0;
    }
    for (let i = 0; i < people.length; i += 1) {
      const ped = people[i];
      const mind = ped.ai;
      if (!mind || ped.alive === false || NO_CALL[mind.mode] || ped === incident.victim || mind.call) continue;
      const d = Math.hypot(ped.pos.x - incident.x, ped.pos.z - incident.z);
      if (d > radius) continue;
      const willing = witnessPhonesPolice(mind.courage, mind.fear, d);
      if (willing <= 0) continue;
      const score = willing * (0.8 + 0.4 * rng.next());
      for (let k = 0; k < shortlist.length; k += 1) {
        if (score > shortScores[k]) {
          for (let m = shortlist.length - 1; m > k; m -= 1) {
            shortlist[m] = shortlist[m - 1];
            shortScores[m] = shortScores[m - 1];
          }
          shortlist[k] = ped;
          shortScores[k] = score;
          break;
        }
      }
    }
    for (let k = 0; k < shortlist.length; k += 1) {
      const ped = shortlist[k];
      if (!ped) break;
      if (!sawIt(ped, incident)) continue;
      startCall(ped, ped.ai, incident);
      return true;
    }
    return false;
  }

  function sawIt(ped, incident) {
    if (!game.colliders) return true;
    eye.x = ped.pos.x;
    eye.y = ped.pos.y + 1.6;
    eye.z = ped.pos.z;
    scene.x = incident.x;
    scene.y = ped.pos.y + 1.1;
    scene.z = incident.z;
    return game.colliders.lineOfSight(eye, scene);
  }

  /** Become the caller: back off first if the player is close, then phone. */
  function startCall(ped, mind, incident) {
    if (mind.leader || mind.followers.length > 0) ctx.walking.leaveGroup(ped, mind);
    ctx.activities.abandon(ped, mind);
    incident.caller = ped;
    mind.call = incident;
    const p = ctx.player;
    const d = Math.hypot(ped.pos.x - p.x, ped.pos.z - p.z);
    mind.callPhase = d < 16 ? 'retreat' : 'dial';
    mind.callAt = ctx.now + rng.range(3, 5);
    if (mind.callPhase === 'retreat') aimAwayFromPlayer(ped, mind);
    ctx.setMode(ped, 'call');
  }

  function think(ped, mind) {
    const incident = mind.call;
    if (!incident || incident.done || incident.caller !== ped) {
      finish(ped, mind);
      return;
    }
    if (scaredOff(ped)) {
      incident.done = true;
      incident.caller = null;
      mind.call = null;
      mind.fear = Math.min(1, mind.fear + 0.5);
      ctx.reactions.startFlee(ped, mind, ctx.player.x, ctx.player.z, 50, 1);
      return;
    }
    const p = ctx.player;
    if (mind.callPhase === 'retreat') {
      const d = Math.hypot(ped.pos.x - p.x, ped.pos.z - p.z);
      if (d >= 18 || ctx.now - mind.modeSince > 4.5) {
        mind.callAt = ctx.now + rng.range(3, 5);
        mind.callPhase = 'dial';
        // Nobody stands in the traffic to make a call: step onto the sidewalk first.
        if (game.terrain && game.terrain.surfaceAt(ped.pos.x, ped.pos.z) === 'road') {
          const hit = game.roads.nearestWalkway(ped.pos.x, ped.pos.z, 40);
          if (hit) {
            mind.tx = hit.x;
            mind.tz = hit.z;
            mind.callPhase = 'kerb';
          }
        }
      } else {
        aimAwayFromPlayer(ped, mind);
      }
      return;
    }
    if (mind.callPhase === 'kerb') {
      if (Math.hypot(mind.tx - ped.pos.x, mind.tz - ped.pos.z) < 1.2 || ctx.now - mind.modeSince > 14) {
        mind.callPhase = 'dial';
        mind.callAt = ctx.now + rng.range(3, 5);
      }
      return;
    }
    if (mind.callPhase === 'dial' && ctx.now >= mind.callAt) {
      incident.done = true;
      incident.reported = true;
      stats.calls += 1;
      game.events.emit('crime:witnessed', {
        type: incident.type, x: incident.x, z: incident.z, witness: ped, victim: incident.victim, severity: 1,
      });
      mind.callPhase = 'after';
      mind.callAt = ctx.now + rng.range(1.5, 3);
      return;
    }
    if (mind.callPhase === 'after' && ctx.now >= mind.callAt) finish(ped, mind);
  }

  function drive(ped, mind) {
    if (mind.callPhase === 'retreat') {
      moveAlong(ped, mind.fleeX, mind.fleeZ, 4.2, ctx.speeds);
      ped.intent.gesture = null;
      return;
    }
    if (mind.callPhase === 'kerb') {
      moveToward(ped, mind.tx, mind.tz, 2.6, ctx.speeds);
      ped.intent.gesture = 'phone';
      return;
    }
    const incident = mind.call;
    const lookX = incident ? incident.x : ctx.player.x;
    const lookZ = incident ? incident.z : ctx.player.z;
    standStill(ped, headingToward(ped.pos.x, ped.pos.z, lookX, lookZ), 'phone');
  }

  /** The player came at the caller: on foot close by, a gun pointed at them, or a car driven at them. */
  function scaredOff(ped) {
    const p = ctx.player;
    const dx = ped.pos.x - p.x;
    const dz = ped.pos.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const character = p.character;
    if (p.onFoot && character) {
      if (d < 5.5) return true;
      const intent = character.intent;
      if (intent && intent.aim && character.weaponIndex >= 0 && d < 20) {
        const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - intent.aimYaw));
        if (off < 0.45) return true;
      }
      return false;
    }
    const v = p.vehicle;
    if (v && d < 12) {
      const closing = -(dx * v.vel.x + dz * v.vel.z) / Math.max(0.1, d);
      if (closing > 3) return true;
    }
    return false;
  }

  function aimAwayFromPlayer(ped, mind) {
    let ax = ped.pos.x - ctx.player.x;
    let az = ped.pos.z - ctx.player.z;
    const d = Math.hypot(ax, az) || 1;
    ax /= d;
    az /= d;
    chooseClearHeading(game.colliders, ped.pos.x, ped.pos.z, ax, az, 3, away);
    mind.fleeX = away.x;
    mind.fleeZ = away.z;
  }

  /** Off the phone: walk on (still shaken). */
  function finish(ped, mind) {
    mind.call = null;
    mind.callPhase = '';
    mind.shaken = true;
    ctx.resume(ped);
  }

  /** A person leaving the world or dying mid-call: their incident goes unreported. */
  function forget(ped, mind) {
    if (!mind || !mind.call) return;
    const incident = mind.call;
    if (incident.caller === ped && !incident.reported) {
      incident.done = true;
      incident.caller = null;
    }
    mind.call = null;
  }

  /** Who is the player, in any of their forms? */
  function byPlayer(source) {
    if (!source) return false;
    const p = ctx.player;
    return source === p.character || (p.vehicle && source === p.vehicle) || source.kind === 'player' || source.isPlayer === true;
  }

  function freeIncident() {
    let oldest = incidents[0];
    for (let i = 0; i < incidents.length; i += 1) {
      const incident = incidents[i];
      if (!incident.live) return incident;
      if (incident.done && incident.born < oldest.born) oldest = incident;
    }
    return oldest;
  }

  return witnesses;
}

function blankIncident() {
  return { live: false, type: '', rank: 0, x: 0, z: 0, victim: null, time: 0, born: 0, searchAt: 0, searches: 0, caller: null, done: false, reported: false };
}

function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** How grave each crime is (the gravest names a merged incident). */
const RANK = {
  trespass: 1, propertyDamage: 1, carTheft: 2, vehicleRamming: 2, assault: 2, robbery: 3, carjacking: 3, hitAndRun: 3,
  gunfire: 3, explosion: 4, policeCarTheft: 4, officerAssault: 4, murder: 5, officerKilled: 6,
};
/** How far away a bystander can witness each kind of crime, metres. */
const REACH = {
  gunfire: 70, explosion: 85, murder: 45, officerKilled: 50, hitAndRun: 45, carjacking: 35, carTheft: 25, assault: 32,
  officerAssault: 35, vehicleRamming: 35, robbery: 35, propertyDamage: 30, policeCarTheft: 35, trespass: 20,
};
/** A person struck faster than this (m/s) by the player's car is a hit-and-run. */
const HIT_AND_RUN_SPEED = 5;
/** People in these states cannot take a call. */
const NO_CALL = { dead: true, down: true, call: true, fight: true, handsUp: true, cower: true, dodge: true, stumble: true };
