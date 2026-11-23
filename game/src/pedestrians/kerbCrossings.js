// Crossing the roads of Port Sarab on foot: people line up along the kerb at the corner, watch the
// lights (remembering when each junction last changed, so nobody steps out on a red that is about
// to end) or, where there is no signal, wait for a gap in the traffic, then cross briskly and hurry
// if the lights change while they are still in the road.
import { mayCrossOnRed, trafficGapNeeded } from './pedestrianRules.js';
import { moveToward, standStill } from './pedestrianSteering.js';

/**
 * Build the kerb-and-crossing behaviour used by walking.
 * @param {Object} ctx  the crowd context from pedestrianSystem.js
 * @param {Object} walking  pedestrianWalking (placeOnWalkway)
 */
export function createKerbCrossings(ctx, walking) {
  const { game, rng } = ctx;
  const roads = game.roads;
  const signalWatch = new Map();

  const crossings = { startCrossing, driveWait, thinkWait, driveCross, thinkCross };

  /**
   * Head for the kerb to cross from the end of sidewalk `w` along `link` to the facing corner.
   * Returns false when no road actually runs there (the empty side of a T-junction): the caller
   * then simply walks on.
   */
  function startCrossing(ped, mind, w, link) {
    const c = mind.cross;
    c.ax = mind.toEnd === 1 ? w.x1 : w.x0;
    c.az = mind.toEnd === 1 ? w.z1 : w.z0;
    c.bx = link.end === 1 ? link.walkway.x1 : link.walkway.x0;
    c.bz = link.end === 1 ? link.walkway.z1 : link.walkway.z0;
    const dx = c.bx - c.ax;
    const dz = c.bz - c.az;
    c.length = Math.max(0.5, Math.sqrt(dx * dx + dz * dz));
    c.ux = dx / c.length;
    c.uz = dz / c.length;
    c.axis = Math.abs(c.ux) > Math.abs(c.uz) ? 'ns' : 'ew';
    c.node = mind.toEnd === 0 ? w.edge.a : w.edge.b;
    c.nextWalkway = link.walkway;
    c.nextEnd = 1 - link.end;
    if (!roadCutExists(c.node, c.axis, (c.ax + c.bx) / 2, (c.az + c.bz) / 2)) return false;
    c.signal = !!c.node.signal;
    // Spread along the kerb and a little back from it, like people really queue at a crossing.
    c.slot = clamp((rng.next() + rng.next() - 1) * 1.3, -1.15, 1.15);
    c.depth = rng.range(0, 0.8);
    const px = -c.uz;
    const pz = c.ux;
    c.waitX = c.ax + c.ux * (1.9 - c.depth) + px * c.slot;
    c.waitZ = c.az + c.uz * (1.9 - c.depth) + pz * c.slot;
    c.goX = c.bx - c.ux * 1.4 + px * c.slot;
    c.goZ = c.bz - c.uz * 1.4 + pz * c.slot;
    c.speed = mind.jogger ? Math.max(3.0, mind.pace) : clamp(mind.pace * 1.4, 1.9, 2.5);
    c.waitSince = ctx.now;
    c.from = w;
    mind.waitGesture = rng.chance(0.14) ? 'phone' : null;
    ctx.setMode(ped, 'wait');
    return true;
  }

  /** Is there really a road where this crossing goes (not the empty side of a T-junction)? */
  function roadCutExists(node, axis, mx, mz) {
    const side = axis === 'ns' ? Math.sign(mz - node.z) : Math.sign(mx - node.x);
    for (let i = 0; i < node.edges.length; i += 1) {
      const edge = node.edges[i];
      const other = edge.a === node ? edge.b : edge.a;
      if (axis === 'ns' && Math.abs(other.x - node.x) < 1 && Math.sign(other.z - node.z) === side) return true;
      if (axis === 'ew' && Math.abs(other.z - node.z) < 1 && Math.sign(other.x - node.x) === side) return true;
    }
    return false;
  }

  function driveWait(ped, mind) {
    const c = mind.cross;
    if (Math.hypot(c.waitX - ped.pos.x, c.waitZ - ped.pos.z) > 0.45) {
      moveToward(ped, c.waitX, c.waitZ, Math.min(mind.pace, 1.4), ctx.speeds);
      ped.intent.gesture = mind.walkGesture;
    } else {
      standStill(ped, Math.atan2(c.ux, c.uz), mind.waitGesture);
    }
  }

  function thinkWait(ped, mind) {
    const c = mind.cross;
    if (canCross(c)) {
      ctx.setMode(ped, 'cross');
      return;
    }
    if (ctx.now - c.waitSince <= (c.signal ? 55 : 32)) return;
    // Given up on this crossing: take the corner instead.
    const links = c.from.links[mind.toEnd];
    for (let i = 0; i < links.length; i += 1) {
      if (!links[i].crossing) {
        walking.placeOnWalkway(ped, mind, links[i].walkway, 1 - links[i].end);
        return;
      }
    }
    mind.toEnd = 1 - mind.toEnd;
    ctx.setMode(ped, 'walk');
  }

  /** May this crossing be started now? Red for the traffic it cuts (and time to finish), and no car coming. */
  function canCross(c) {
    const crossTime = (c.length - 1.5) / c.speed;
    if (c.signal) {
      const watch = observeSignal(c.node);
      const light = c.axis === 'ns' ? watch.ns : watch.ew;
      const since = c.axis === 'ns' ? watch.nsSince : watch.ewSince;
      if (!mayCrossOnRed(light, since < 0 ? -1 : ctx.now - since, crossTime)) return false;
      return !trafficCuts(c, 2.5);
    }
    return !trafficCuts(c, trafficGapNeeded(crossTime));
  }

  /**
   * Remember when each light changed, so a person arriving mid-phase knows whether there is still
   * time to cross (a light first seen mid-phase counts as unknown until it changes again).
   */
  function observeSignal(node) {
    let watch = signalWatch.get(node.id);
    if (!watch) {
      watch = { ns: '', nsSince: -1, ew: '', ewSince: -1, seen: -10 };
      signalWatch.set(node.id, watch);
    }
    const phase = roads.signalPhase(node);
    const fresh = ctx.now - watch.seen < 0.7;
    if (phase.ns !== watch.ns) {
      watch.ns = phase.ns;
      watch.nsSince = fresh ? ctx.now : -1;
    }
    if (phase.ew !== watch.ew) {
      watch.ew = phase.ew;
      watch.ewSince = fresh ? ctx.now : -1;
    }
    watch.seen = ctx.now;
    return watch;
  }

  /** Will a vehicle pass over this crossing within `horizon` seconds (or is one standing on it)? */
  function trafficCuts(c, horizon) {
    const vehicles = game.vehicles ? game.vehicles.list : null;
    if (!vehicles) return false;
    const mx = (c.ax + c.bx) / 2;
    const mz = (c.az + c.bz) / 2;
    const nx = -c.uz;
    const nz = c.ux;
    for (let i = 0; i < vehicles.length; i += 1) {
      const v = vehicles[i];
      if (Math.abs(v.pos.x - mx) > 90 || Math.abs(v.pos.z - mz) > 90) continue;
      const rx = v.pos.x - c.ax;
      const rz = v.pos.z - c.az;
      const d0 = rx * nx + rz * nz;
      const a0 = rx * c.ux + rz * c.uz;
      const reach = (v.spec ? v.spec.length * 0.5 : 2.4) + 1.8;
      const vn = v.vel.x * nx + v.vel.z * nz;
      const speed = Math.hypot(v.vel.x, v.vel.z);
      if (speed < 0.8 || Math.abs(vn) < 0.4) {
        if (Math.abs(d0) < reach && a0 > -1.5 && a0 < c.length + 1.5) return true;
        continue;
      }
      const t = -d0 / vn;
      if (t < -reach / Math.abs(vn) || t > horizon) continue;
      const a = a0 + (v.vel.x * c.ux + v.vel.z * c.uz) * Math.max(0, t);
      if (a > -3 && a < c.length + 3) return true;
    }
    return false;
  }

  function driveCross(ped, mind) {
    const c = mind.cross;
    const d = moveToward(ped, c.goX, c.goZ, c.speed, ctx.speeds);
    ped.intent.gesture = null;
    if (d < 0.8) walking.placeOnWalkway(ped, mind, c.nextWalkway, c.nextEnd);
  }

  /** Lights changed with people still in the road: they hurry. */
  function thinkCross(ped, mind) {
    const c = mind.cross;
    if (c.signal) {
      const watch = observeSignal(c.node);
      if ((c.axis === 'ns' ? watch.ns : watch.ew) !== 'red') c.speed = Math.max(c.speed, 3.6);
    }
    if (ctx.now - mind.modeSince > 30) walking.placeOnWalkway(ped, mind, c.nextWalkway, c.nextEnd);
  }

  return crossings;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
