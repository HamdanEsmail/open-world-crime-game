// The road a Port Sarab traffic car is about to drive, as one ribbon: the rest of its lane, the curve
// through the junction, and the lane after it. Drivers steer after a point on this ribbon and measure
// everything in their way along it, so a car on a bend still sees what is round the corner.
import { PATH_PIECES } from './trafficJunctions.js';

/**
 * The point `distance` metres ahead of the car of driver `state` along its lane, its crossing curve
 * and the lane after it, with the road's direction there, written into `out` {x, z, dirX, dirZ}.
 * @param {Object} junctions  the junction rules (for points on a crossing curve)
 */
export function pointAhead(state, distance, out, junctions) {
  let d = distance;
  const lane = state.lane;
  const path = state.path;
  if (state.phase === 0) {
    const room = lane.length - state.s;
    if (d <= room || !path) {
      const at = state.s + d;
      out.x = lane.x0 + lane.dirX * at;
      out.z = lane.z0 + lane.dirZ * at;
      out.dirX = lane.dirX;
      out.dirZ = lane.dirZ;
      return out;
    }
    d -= room;
  } else {
    d += state.pathS;
  }
  if (d <= path.length) return junctions.pointOnPath(path, d, out);
  d -= path.length;
  const next = path.to;
  out.x = next.x0 + next.dirX * d;
  out.z = next.z0 + next.dirZ * d;
  out.dirX = next.dirX;
  out.dirZ = next.dirZ;
  return out;
}

/**
 * Where the point (x, z) lies relative to the road this car is about to drive, up to `reach` metres
 * ahead: the distance along it from the car, the signed sideways distance (+ right) and the road's
 * direction there, written into `out` {along, lateral, dirX, dirZ}. The piece of road nearest the
 * car's own line (its lane offset) wins. False when the point is off that stretch of road.
 */
export function projectAhead(state, x, z, reach, out) {
  let bestMiss = Infinity;
  let base;
  const path = state.path;
  if (state.phase === 0) {
    const lane = state.lane;
    const rx = x - lane.x0;
    const rz = z - lane.z0;
    const along = rx * lane.dirX + rz * lane.dirZ - state.s;
    const room = lane.length - state.s;
    if (along > -2 && (along <= room + 1.5 || !path)) {
      const lateral = rz * lane.dirX - rx * lane.dirZ;
      bestMiss = Math.abs(lateral - state.offset);
      out.along = along;
      out.lateral = lateral;
      out.dirX = lane.dirX;
      out.dirZ = lane.dirZ;
    }
    if (!path || room > reach) return bestMiss < Infinity;
    base = room;
  } else {
    base = -state.pathS;
  }
  const points = path.points;
  const cumulative = path.along;
  for (let i = 0; i < PATH_PIECES; i += 1) {
    if (base + cumulative[i + 1] < -2) continue;
    if (base + cumulative[i] > reach) break;
    const length = cumulative[i + 1] - cumulative[i];
    if (length < 1e-6) continue;
    const ax = points[i * 2];
    const az = points[i * 2 + 1];
    const ux = (points[i * 2 + 2] - ax) / length;
    const uz = (points[i * 2 + 3] - az) / length;
    const rx = x - ax;
    const rz = z - az;
    const t = rx * ux + rz * uz;
    if (t < -0.75 || t > length + 0.75) continue;
    const lateral = rz * ux - rx * uz;
    const miss = Math.abs(lateral - state.offset);
    if (miss < bestMiss) {
      bestMiss = miss;
      out.along = base + cumulative[i] + t;
      out.lateral = lateral;
      out.dirX = ux;
      out.dirZ = uz;
    }
  }
  base += path.length;
  if (base <= reach) {
    const next = path.to;
    const rx = x - next.x0;
    const rz = z - next.z0;
    const along = rx * next.dirX + rz * next.dirZ;
    if (along > -1.5 && along < reach - base) {
      const lateral = rz * next.dirX - rx * next.dirZ;
      const miss = Math.abs(lateral - state.offset);
      if (miss < bestMiss) {
        bestMiss = miss;
        out.along = base + along;
        out.lateral = lateral;
        out.dirX = next.dirX;
        out.dirZ = next.dirZ;
      }
    }
  }
  return bestMiss < Infinity;
}

/**
 * Where a car stands on its lane: `s` metres along it and `lateral` metres to its right, written
 * into the driver `state`; also the room left to the stop line in front of its bumper.
 */
export function measureOnLane(state, lane, halfLength) {
  const pos = state.vehicle.pos;
  const rx = pos.x - lane.x0;
  const rz = pos.z - lane.z0;
  state.s = rx * lane.dirX + rz * lane.dirZ;
  state.lateral = rz * lane.dirX - rx * lane.dirZ;
  state.distToLine = lane.length - state.s - halfLength;
}
