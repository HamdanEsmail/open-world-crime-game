// Walking the sidewalks of Port Sarab. Each person strolls at their own pace in a lane of their own
// (most keep a little to the right, so two streams pass each other), steps round lamp posts, palms
// and slower walkers, and at the corner turns or goes to the kerb to cross (kerbCrossings.js).
// Friends walk in twos and threes, taking turns to talk. Also walks people to a point off the
// sidewalk and back onto it, and leads the fleeing along the sidewalks away from danger.
import { createKerbCrossings } from './kerbCrossings.js';
import { moveToward, moveAlong, standStill, headingToward, findObstacleAhead, chooseClearHeading } from './pedestrianSteering.js';

/**
 * Build the walking behaviour shared by every pedestrian.
 * @param {Object} ctx  the crowd context from pedestrianSystem.js
 */
export function createPedestrianWalking(ctx) {
  const { game, rng } = ctx;
  const roads = game.roads;
  const roadSide = new Float32Array(roads.walkways.length).fill(NaN);
  const neighbours = [];
  const obstacle = { along: 0, latMin: 0, latMax: 0, collider: null };
  const clearDirection = { x: 0, z: 0 };

  const walking = {
    modes: ['walk', 'follow', 'wait', 'cross', 'travel'],
    think,
    drive,
    placeOnWalkway,
    driveAlongWalkway,
    rejoin,
    travelTo,
    formGroup,
    leaveGroup,
    unstick,
    forget,
    roadSideOf,
    lateralOf,
  };
  const crossings = createKerbCrossings(ctx, walking);

  /** Steer one person for this frame by what they are doing. */
  function drive(ped, mind, dt) {
    switch (mind.mode) {
      case 'walk': driveWalk(ped, mind, dt); break;
      case 'follow': driveFollow(ped, mind, dt); break;
      case 'wait': crossings.driveWait(ped, mind); break;
      case 'cross': crossings.driveCross(ped, mind); break;
      case 'travel': driveTravel(ped, mind); break;
      default: break;
    }
  }

  /** A few times a second: make room for others, step round posts, decide at the kerb. */
  function think(ped, mind) {
    switch (mind.mode) {
      case 'walk': thinkWalk(ped, mind); break;
      case 'follow': thinkFollow(ped, mind); break;
      case 'wait': crossings.thinkWait(ped, mind); break;
      case 'cross': crossings.thinkCross(ped, mind); break;
      case 'travel': thinkTravel(ped, mind); break;
      default: break;
    }
  }

  /** Start walking along a sidewalk toward one of its ends (0 or 1). */
  function placeOnWalkway(ped, mind, walkway, toEnd) {
    mind.prevWalkway = mind.walkway;
    mind.walkway = walkway;
    mind.toEnd = toEnd;
    mind.dodge *= 0.5;
    ctx.setMode(ped, 'walk');
  }

  function driveWalk(ped, mind, dt) {
    if (!mind.walkway) {
      rejoin(ped, mind);
      return;
    }
    if (ctx.now > mind.dodgeUntil) mind.dodge *= Math.exp(-1.6 * dt);
    let want = mind.pace * mind.hurry;
    if (ctx.now < mind.slowUntil && mind.slowTo < want) want = Math.max(0.6, mind.slowTo);
    mind.speedNow += (want - mind.speedNow) * Math.min(1, dt * 2.5);
    driveAlongWalkway(ped, mind, mind.speedNow, false);
    ped.intent.gesture = mind.walkGesture;
  }

  /**
   * Follow mind.walkway toward mind.toEnd at `speed`, in the person's lane; at the corner choose
   * where next (a fleeing person takes the way that leads farthest from the threat, without waiting).
   * Returns false when a fleeing person has run out of sidewalk worth taking.
   */
  function driveAlongWalkway(ped, mind, speed, fleeing) {
    const w = mind.walkway;
    if (!w) return false;
    const sign = mind.toEnd === 1 ? 1 : -1;
    const s = (ped.pos.x - w.x0) * w.dirX + (ped.pos.z - w.z0) * w.dirZ;
    const left = mind.toEnd === 1 ? w.length - s : s;
    if (left < 0.7 + speed * 0.12) {
      if (fleeing) takeFleeLink(ped, mind);
      else arriveAtCorner(ped, mind);
      if (!mind.walkway) return false;
      if (mind.mode !== 'walk' && !fleeing) return true;
      if (mind.walkway === w && mind.toEnd === (sign === 1 ? 1 : 0)) {
        standStill(ped, null, null);
        return true;
      }
    }
    const walkway = mind.walkway;
    const along = (ped.pos.x - walkway.x0) * walkway.dirX + (ped.pos.z - walkway.z0) * walkway.dirZ;
    const dir = mind.toEnd === 1 ? 1 : -1;
    const lane = clamp(mind.lane + mind.dodge, -LANE_LIMIT, LANE_LIMIT) * dir;
    const ts = clamp(along + dir * (LOOKAHEAD + speed * 0.4), 0, walkway.length);
    const tx = walkway.x0 + walkway.dirX * ts - walkway.dirZ * lane;
    const tz = walkway.z0 + walkway.dirZ * ts + walkway.dirX * lane;
    moveToward(ped, tx, tz, speed, ctx.speeds);
    return true;
  }

  function thinkWalk(ped, mind) {
    const w = mind.walkway;
    if (!w) return;
    const sign = mind.toEnd === 1 ? 1 : -1;
    const fx = w.dirX * sign;
    const fz = w.dirZ * sign;
    const myLat = lateralOf(ped, w) * sign;
    makeRoom(ped, mind, fx, fz, myLat);
    stepRoundObstacles(ped, mind, fx, fz, myLat);
    if (mind.followers.length > 0) rotateGroupTalk(mind);
    ctx.activities.maybeStopWhileWalking(ped, mind);
  }

  /** Personal space: pass the slow, sidestep the oncoming, slow down behind a wall of people. */
  function makeRoom(ped, mind, fx, fz, myLat) {
    ctx.grid.query(ped.pos.x, ped.pos.z, 4.2, neighbours, ped);
    for (let i = 0; i < neighbours.length; i += 1) {
      const other = neighbours[i];
      if (other === mind.leader || (other.ai && other.ai.leader === ped)) continue;
      const rx = other.pos.x - ped.pos.x;
      const rz = other.pos.z - ped.pos.z;
      const along = rx * fx + rz * fz;
      if (along < 0.2 || along > 3.8) continue;
      const lat = -rx * fz + rz * fx;
      const wanted = clamp(mind.lane + mind.dodge, -LANE_LIMIT, LANE_LIMIT);
      if (Math.abs(lat - (wanted - myLat)) > 0.8 && Math.abs(lat) > 0.7) continue;
      const theirSpeed = other.vel.x * fx + other.vel.z * fz;
      if (theirSpeed < -0.3 || Math.abs(theirSpeed) < 0.3) {
        // Oncoming or standing: both keep right, so they slip past each other.
        mind.dodge += mind.lane + mind.dodge + 0.85 <= LANE_LIMIT ? 0.85 : -0.85;
        mind.dodgeUntil = ctx.now + 1.5;
      } else if (theirSpeed < mind.speedNow - 0.15) {
        const side = lat > 0 ? -1 : 1;
        if (Math.abs(mind.lane + mind.dodge + side * 0.9) <= LANE_LIMIT) {
          mind.dodge += side * 0.9;
          mind.dodgeUntil = ctx.now + 2.2;
        } else {
          mind.slowTo = theirSpeed;
          mind.slowUntil = ctx.now + 0.9;
        }
      }
      mind.dodge = clamp(mind.dodge, -2 * LANE_LIMIT, 2 * LANE_LIMIT);
      return;
    }
  }

  /** Lamp posts, palms, kiosks: shift across the sidewalk early enough to pass them. */
  function stepRoundObstacles(ped, mind, fx, fz, myLat) {
    const reach = 2.5 + mind.speedNow * 1.2;
    const lane = clamp(mind.lane + mind.dodge, -LANE_LIMIT, LANE_LIMIT);
    const sx = ped.pos.x - fz * (lane - myLat) * 0.5;
    const sz = ped.pos.z + fx * (lane - myLat) * 0.5;
    if (!findObstacleAhead(game.colliders, sx, sz, fx, fz, reach, BODY_RADIUS + 0.15, obstacle)) return;
    const base = myLat + (lane - myLat) * 0.5;
    const rightLane = base + obstacle.latMax + BODY_RADIUS + 0.35;
    const leftLane = base + obstacle.latMin - BODY_RADIUS - 0.35;
    const rightOk = rightLane <= LANE_LIMIT + 0.4;
    const leftOk = leftLane >= -LANE_LIMIT - 0.4;
    let newLane;
    if (rightOk && leftOk) newLane = Math.abs(rightLane - lane) < Math.abs(leftLane - lane) ? rightLane : leftLane;
    else if (rightOk) newLane = rightLane;
    else if (leftOk) newLane = leftLane;
    else return;
    mind.dodge = newLane - mind.lane;
    mind.dodgeUntil = ctx.now + (obstacle.along + 2) / Math.max(0.8, mind.speedNow);
  }

  /** At the end of a sidewalk: turn the corner, cross the road, or (a dead end) turn back. */
  function arriveAtCorner(ped, mind) {
    const w = mind.walkway;
    const links = w.links[mind.toEnd];
    if (!links || links.length === 0) {
      mind.toEnd = 1 - mind.toEnd;
      return;
    }
    const far = distanceSq(ped.pos.x, ped.pos.z, ctx.player.x, ctx.player.z) > 55 * 55;
    let total = 0;
    for (let i = 0; i < links.length; i += 1) total += linkWeight(mind, w, links[i], far);
    let roll = rng.next() * total;
    let chosen = links[links.length - 1];
    for (let i = 0; i < links.length; i += 1) {
      roll -= linkWeight(mind, w, links[i], far);
      if (roll <= 0) {
        chosen = links[i];
        break;
      }
    }
    if (!chosen.crossing || !crossings.startCrossing(ped, mind, w, chosen)) placeOnWalkway(ped, mind, chosen.walkway, 1 - chosen.end);
  }

  /** How tempting a way on is: not straight back, fewer crossings when hurrying, toward the player when far. */
  function linkWeight(mind, w, link, far) {
    let weight = link.crossing ? (mind.hurry > 1.2 ? 0.25 : 0.85) : 1;
    if (link.walkway === mind.prevWalkway) weight *= 0.12;
    if (far) {
      const end = link.end === 1 ? 0 : 1;
      const nx = end === 1 ? link.walkway.x1 : link.walkway.x0;
      const nz = end === 1 ? link.walkway.z1 : link.walkway.z0;
      const here = mind.toEnd === 1 ? distanceSq(w.x1, w.z1, ctx.player.x, ctx.player.z) : distanceSq(w.x0, w.z0, ctx.player.x, ctx.player.z);
      if (distanceSq(nx, nz, ctx.player.x, ctx.player.z) < here) weight *= 3;
    }
    return weight;
  }

  /** Walk beside the group's leader, matching their pace; stand with them while they wait. */
  function driveFollow(ped, mind, dt) {
    const leader = mind.leader;
    if (!leader || !leader.ai || leader.alive === false || leader.ai.owner !== ctx.owner) {
      leaveGroup(ped, mind);
      ctx.resume(ped);
      return;
    }
    const lm = leader.ai;
    let fx = Math.sin(leader.heading);
    let fz = Math.cos(leader.heading);
    if (lm.mode === 'walk' && lm.walkway) {
      const sign = lm.toEnd === 1 ? 1 : -1;
      fx = lm.walkway.dirX * sign;
      fz = lm.walkway.dirZ * sign;
    } else if (lm.mode === 'wait' || lm.mode === 'cross') {
      fx = lm.cross.ux;
      fz = lm.cross.uz;
    }
    const side = mind.slot;
    const back = Math.abs(side) < 0.5 ? 1.1 : 0.2;
    const tx = leader.pos.x - fz * side * 0.8 - fx * back;
    const tz = leader.pos.z + fx * side * 0.8 - fz * back;
    const dx = tx - ped.pos.x;
    const dz = tz - ped.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const leaderSpeed = Math.hypot(leader.vel.x, leader.vel.z);
    if (leaderSpeed < 0.3 && d < 0.6) {
      const facing = lm.mode === 'wait' ? Math.atan2(fx, fz) : headingToward(ped.pos.x, ped.pos.z, leader.pos.x, leader.pos.z);
      standStill(ped, facing, mind.walkGesture);
      return;
    }
    const speed = clamp(leaderSpeed + (dx * fx + dz * fz) * 0.9 + (d > 2 ? 0.8 : 0), 0.4, 6);
    mind.speedNow += (speed - mind.speedNow) * Math.min(1, dt * 4);
    moveToward(ped, tx, tz, mind.speedNow, ctx.speeds);
    ped.intent.gesture = mind.walkGesture;
  }

  function thinkFollow(ped, mind) {
    const leader = mind.leader;
    if (!leader || !leader.ai) return;
    if (Math.hypot(leader.pos.x - ped.pos.x, leader.pos.z - ped.pos.z) > 14) {
      leaveGroup(ped, mind);
      ctx.resume(ped);
    }
  }

  /** Take turns to talk while walking together. */
  function rotateGroupTalk(mind) {
    if (ctx.now < mind.talkSwap) return;
    mind.talkSwap = ctx.now + rng.range(2.5, 6);
    const pick = Math.floor(rng.next() * (mind.followers.length + 2));
    mind.walkGesture = pick === 0 ? 'talk' : null;
    for (let i = 0; i < mind.followers.length; i += 1) {
      const fm = mind.followers[i].ai;
      if (fm) fm.walkGesture = pick === i + 1 ? 'talk' : null;
    }
  }

  /** Make `follower` walk beside `leader` (slot -1 left, +1 right, 0 behind). */
  function formGroup(leader, follower, slot) {
    const lm = leader.ai;
    const fm = follower.ai;
    if (!lm || !fm || lm.followers.length >= 2) return false;
    fm.leader = leader;
    fm.slot = slot;
    fm.pace = lm.pace;
    lm.followers.push(follower);
    lm.lane = clamp(lm.lane, -0.6, 0.6);
    lm.jogger = false;
    fm.jogger = false;
    ctx.setMode(follower, 'follow');
    return true;
  }

  /** Leave whatever group a person is in (as a follower or as the leader). */
  function leaveGroup(ped, mind) {
    if (mind.leader && mind.leader.ai) {
      const list = mind.leader.ai.followers;
      const index = list.indexOf(ped);
      if (index !== -1) list.splice(index, 1);
    }
    mind.leader = null;
    for (let i = 0; i < mind.followers.length; i += 1) {
      const fm = mind.followers[i].ai;
      if (fm && fm.leader === ped) fm.leader = null;
    }
    mind.followers.length = 0;
  }

  /**
   * Walk to a point off the sidewalk (a stall, the beach, a plaza) and then do `then`: 'walkway'
   * (step back onto the nearest sidewalk), 'activity' (start the planned standing life) or 'leg'
   * (walk on to mind.legX, mind.legZ and then do mind.legThen).
   */
  function travelTo(ped, mind, x, z, speed, then) {
    mind.tx = x;
    mind.tz = z;
    mind.travelSpeed = speed;
    mind.travelThen = then;
    mind.detourUntil = 0;
    ctx.setMode(ped, 'travel');
  }

  function driveTravel(ped, mind) {
    if (Math.hypot(mind.tx - ped.pos.x, mind.tz - ped.pos.z) < 0.6) {
      arrive(ped, mind);
      return;
    }
    if (ctx.now < mind.detourUntil) moveAlong(ped, mind.detourX, mind.detourZ, mind.travelSpeed, ctx.speeds);
    else moveToward(ped, mind.tx, mind.tz, mind.travelSpeed, ctx.speeds);
    ped.intent.gesture = mind.walkGesture;
  }

  function thinkTravel(ped, mind) {
    const dx = mind.tx - ped.pos.x;
    const dz = mind.tz - ped.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.6 || ctx.now < mind.detourUntil) return;
    const reach = Math.min(d, 3);
    if (!findObstacleAhead(game.colliders, ped.pos.x, ped.pos.z, dx / d, dz / d, reach, BODY_RADIUS, obstacle)) return;
    if (chooseClearHeading(game.colliders, ped.pos.x, ped.pos.z, dx / d, dz / d, reach, clearDirection)) {
      mind.detourX = clearDirection.x;
      mind.detourZ = clearDirection.z;
      mind.detourUntil = ctx.now + 0.9;
    }
  }

  function arrive(ped, mind) {
    const then = mind.travelThen;
    mind.travelThen = null;
    if (then === 'leg') travelTo(ped, mind, mind.legX, mind.legZ, mind.travelSpeed, mind.legThen || 'walkway');
    else if (then === 'activity') ctx.activities.arrived(ped, mind);
    else rejoin(ped, mind);
  }

  /** Back onto the nearest sidewalk, walking whichever way suits (away from a threat when shaken). */
  function rejoin(ped, mind) {
    const hit = roads.nearestWalkway(ped.pos.x, ped.pos.z, 130);
    if (!hit) {
      mind.walkway = null;
      mind.lost = true;
      standStill(ped, null, null);
      ctx.setMode(ped, 'walk');
      return;
    }
    const walkway = hit.walkway;
    if (hit.distance > 3.2 && mind.travelThen !== 'walkway' && mind.mode !== 'travel') {
      travelTo(ped, mind, hit.x, hit.z, Math.max(mind.pace, 1.2) * mind.hurry, 'walkway');
      return;
    }
    let toEnd = rng.chance(0.5) ? 1 : 0;
    if (mind.fear > 0.2 && (mind.threatX !== 0 || mind.threatZ !== 0)) {
      toEnd = (ped.pos.x - mind.threatX) * walkway.dirX + (ped.pos.z - mind.threatZ) * walkway.dirZ >= 0 ? 1 : 0;
    }
    mind.lost = false;
    placeOnWalkway(ped, mind, walkway, toEnd);
  }

  /** Fleeing at a corner: take the way whose far end lies farthest from the threat (roads or not). */
  function takeFleeLink(ped, mind) {
    const w = mind.walkway;
    const links = w.links[mind.toEnd];
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < links.length; i += 1) {
      const link = links[i];
      const nx = link.end === 1 ? link.walkway.x0 : link.walkway.x1;
      const nz = link.end === 1 ? link.walkway.z0 : link.walkway.z1;
      const score = distanceSq(nx, nz, mind.threatX, mind.threatZ) * (0.8 + 0.4 * rng.next());
      if (score > bestScore) {
        bestScore = score;
        best = link;
      }
    }
    const hereX = mind.toEnd === 1 ? w.x1 : w.x0;
    const hereZ = mind.toEnd === 1 ? w.z1 : w.z0;
    mind.prevWalkway = w;
    if (!best || bestScore < distanceSq(hereX, hereZ, mind.threatX, mind.threatZ)) {
      // Every way leads back toward the danger: leave the sidewalks and run straight off.
      mind.walkway = null;
      return;
    }
    mind.walkway = best.walkway;
    mind.toEnd = 1 - best.end;
  }

  /** No progress for a few seconds: try the other side of the sidewalk, another way, or a detour. */
  function unstick(ped, mind) {
    const mode = mind.mode;
    if (mode === 'walk') {
      mind.lane = -mind.lane * 0.6;
      mind.dodge = 0;
      if (rng.chance(0.5)) mind.toEnd = 1 - mind.toEnd;
      if (mind.lost || !mind.walkway) rejoin(ped, mind);
    } else if (mode === 'follow') {
      leaveGroup(ped, mind);
      ctx.resume(ped);
    } else if (mode === 'travel') {
      const angle = rng.range(-1.8, 1.8);
      const dx = mind.tx - ped.pos.x;
      const dz = mind.tz - ped.pos.z;
      const d = Math.max(0.1, Math.hypot(dx, dz));
      mind.detourX = (dx / d) * Math.cos(angle) + (dz / d) * Math.sin(angle);
      mind.detourZ = -(dx / d) * Math.sin(angle) + (dz / d) * Math.cos(angle);
      mind.detourUntil = ctx.now + 2;
      if (ctx.now - mind.modeSince > 20) {
        mind.travelThen = null;
        rejoin(ped, mind);
      }
    } else if (mode === 'cross') {
      mind.cross.goX += -mind.cross.uz * 0.8;
      mind.cross.goZ += mind.cross.ux * 0.8;
    } else if (ctx.reactions.modes.indexOf(mode) !== -1) {
      ctx.reactions.unstick(ped, mind);
    }
  }

  /** A person is leaving the world: let go of their group. */
  function forget(ped, mind) {
    if (mind) leaveGroup(ped, mind);
  }

  /** Which side of a sidewalk the road is on: +1 to the right of its x0 -> x1 direction, -1 to the left. */
  function roadSideOf(walkway) {
    let side = roadSide[walkway.id];
    if (Number.isNaN(side)) {
      const edge = walkway.edge;
      const rx = edge.a.x - walkway.x0;
      const rz = edge.a.z - walkway.z0;
      side = (edge.grid === 'ew' ? rz * walkway.dirX : -rx * walkway.dirZ) >= 0 ? 1 : -1;
      roadSide[walkway.id] = side;
    }
    return side;
  }

  /** How far right of a sidewalk's centre line (in its x0 -> x1 direction) a person stands. */
  function lateralOf(ped, walkway) {
    return -(ped.pos.x - walkway.x0) * walkway.dirZ + (ped.pos.z - walkway.z0) * walkway.dirX;
  }

  return walking;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function distanceSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** How far from the sidewalk's centre line a lane may lie (the sidewalk is 5 m wide). */
const LANE_LIMIT = 1.55;
/** How far ahead along the sidewalk a walker aims, metres. */
const LOOKAHEAD = 1.8;
const BODY_RADIUS = 0.35;
