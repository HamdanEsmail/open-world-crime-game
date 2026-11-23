// Driving the roads of Port Sarab the police way: plotting a route along the street grid to a call,
// following it on the right-hand side of the road through a look-ahead point, and cruising lane by
// lane like careful traffic on patrol, stopping at red lights.

/** Points a stored route can hold. */
const ROUTE_CAPACITY = 64;
/** Metres to the right of a road's centre line a car keeps to where the road is not known. */
const KEEP_RIGHT = 2.2;
/** Width of one traffic lane (as the road network lays them out). */
const LANE_WIDTH = 3.5;
/** Routes the whole force may plot in one frame (route finding is the costliest thing it does). */
const ROUTES_PER_FRAME = 2;
/** Corners further ahead than this (metres) do not slow a car yet. */
const CORNER_HORIZON = 140;
/** Sideways grip (m/s^2) a police driver uses through a junction, and the braking he counts on. */
const CORNER_GRIP = 8.5;
const CORNER_BRAKING = 4.5;

/**
 * Build the road-driving helpers. They work on a unit's drive memory (policeUnitRoster).
 * @param {Object} game
 */
export function createPoliceRoadDriving(game) {
  let routeBudget = ROUTES_PER_FRAME;
  const inNormal = { x: 0, z: 0 };
  const outNormal = { x: 0, z: 0 };
  const rawX = new Float32Array(ROUTE_CAPACITY);
  const rawZ = new Float32Array(ROUTE_CAPACITY);
  const sideOffset = new Float32Array(ROUTE_CAPACITY);

  /** Call once a frame: hands out a fresh route-plotting budget. */
  function beginFrame() {
    routeBudget = ROUTES_PER_FRAME;
  }

  /**
   * Plot a route from (fromX, fromZ) to (toX, toZ) into the drive memory, kept to the right of each
   * road. Returns false when this frame's budget is spent (try again next frame).
   */
  function planRoute(drive, fromX, fromZ, toX, toZ) {
    const roads = game.roads;
    if (!roads || !roads.findRoute || routeBudget <= 0) return false;
    routeBudget -= 1;
    const route = roads.findRoute(fromX, fromZ, toX, toZ);
    const n = Math.min(route.length, ROUTE_CAPACITY);
    for (let i = 0; i < n; i += 1) {
      const source = i === n - 1 ? route[route.length - 1] : route[i];
      rawX[i] = source.x;
      rawZ[i] = source.z;
    }
    // Keep right: each road of the route is shifted to the middle of its right-hand lanes (clear of
    // a boulevard's median), and each corner moves to where two shifted roads cross. The last point
    // is the target itself and stays where it is.
    for (let i = 0; i < n - 2; i += 1) {
      const hit = roads.nearestLane((rawX[i] + rawX[i + 1]) / 2, (rawZ[i] + rawZ[i + 1]) / 2, 30);
      sideOffset[i] = hit ? hit.lane.edge.median / 2 + LANE_WIDTH * hit.lane.edge.lanesEachWay / 2 : KEEP_RIGHT;
    }
    const X = drive.routeX;
    const Z = drive.routeZ;
    for (let i = 0; i < n; i += 1) {
      X[i] = rawX[i];
      Z[i] = rawZ[i];
      if (i === n - 1) continue;
      const hasIn = i > 0 && rightNormal(rawX[i - 1], rawZ[i - 1], rawX[i], rawZ[i], inNormal);
      const hasOut = i < n - 2 && rightNormal(rawX[i], rawZ[i], rawX[i + 1], rawZ[i + 1], outNormal);
      if (hasIn && hasOut) {
        const offIn = sideOffset[i - 1];
        const offOut = sideOffset[i];
        // Directions of the two roads from their right-hand normals: d = (n.z, -n.x).
        const dInX = inNormal.z;
        const dInZ = -inNormal.x;
        const across = dInX * outNormal.x + dInZ * outNormal.z;
        if (Math.abs(across) < 0.25) {
          const off = (offIn + offOut) / 2;
          X[i] += (inNormal.x + outNormal.x) * 0.5 * off;
          Z[i] += (inNormal.z + outNormal.z) * 0.5 * off;
        } else {
          const along = (offOut - (inNormal.x * outNormal.x + inNormal.z * outNormal.z) * offIn) / across;
          X[i] += inNormal.x * offIn + dInX * along;
          Z[i] += inNormal.z * offIn + dInZ * along;
        }
      } else if (hasIn) {
        X[i] += inNormal.x * sideOffset[i - 1];
        Z[i] += inNormal.z * sideOffset[i - 1];
      } else if (hasOut) {
        X[i] += outNormal.x * sideOffset[i];
        Z[i] += outNormal.z * sideOffset[i];
      }
    }
    const cum = drive.routeCum;
    cum[0] = 0;
    for (let i = 1; i < n; i += 1) cum[i] = cum[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]);
    drive.routeCount = n;
    drive.routeIndex = 0;
    drive.routeTargetX = toX;
    drive.routeTargetZ = toZ;
    drive.routeAge = 0;
    return true;
  }

  /**
   * Where to steer along the stored route from (x, z): the point `lookahead` metres further along it,
   * written into `out`. Returns the distance still to drive (0 at the end).
   */
  function followRoute(drive, x, z, lookahead, out) {
    const n = drive.routeCount;
    out.limit = Infinity;
    if (n < 2) {
      out.x = drive.routeTargetX;
      out.z = drive.routeTargetZ;
      return Math.hypot(out.x - x, out.z - z);
    }
    const X = drive.routeX;
    const Z = drive.routeZ;
    const cum = drive.routeCum;
    let i = drive.routeIndex;
    let t = 0;
    for (;;) {
      const sx = X[i + 1] - X[i];
      const sz = Z[i + 1] - Z[i];
      const lengthSq = sx * sx + sz * sz;
      t = lengthSq > 1e-6 ? ((x - X[i]) * sx + (z - Z[i]) * sz) / lengthSq : 1;
      const closeToEnd = (X[i + 1] - x) * (X[i + 1] - x) + (Z[i + 1] - z) * (Z[i + 1] - z) < 49;
      if ((t >= 1 || closeToEnd) && i < n - 2) i += 1;
      else break;
    }
    drive.routeIndex = i;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const along = cum[i] + (cum[i + 1] - cum[i]) * t;
    const total = cum[n - 1];
    const wanted = Math.min(total, along + lookahead);
    let k = i;
    while (k < n - 2 && cum[k + 1] < wanted) k += 1;
    const segment = cum[k + 1] - cum[k];
    const u = segment > 1e-6 ? (wanted - cum[k]) / segment : 1;
    out.x = X[k] + (X[k + 1] - X[k]) * u;
    out.z = Z[k] + (Z[k + 1] - Z[k]) * u;
    // The corners ahead: the fastest speed from which the car can still brake for the tightest one.
    let limit = Infinity;
    for (let c = i + 1; c < n - 1; c += 1) {
      const distance = cum[c] - along;
      if (distance > CORNER_HORIZON) break;
      const turn = turnAngle(X[c - 1], Z[c - 1], X[c], Z[c], X[c + 1], Z[c + 1]);
      const speed = cornerApproachSpeed(turn, distance);
      if (speed < limit) limit = speed;
    }
    out.limit = limit;
    return total - along;
  }

  /** Forget the stored route. */
  function dropRoute(drive) {
    drive.routeCount = 0;
    drive.routeIndex = 0;
  }

  /** Put a patrol car's lane memory on the lane nearest (x, z). Returns false off the road network. */
  function joinLanes(drive, x, z) {
    const roads = game.roads;
    if (!roads || !roads.nearestLane) return false;
    const hit = roads.nearestLane(x, z, 60);
    if (!hit) return false;
    drive.lane = hit.lane;
    drive.nextLane = pickNextLane(hit.lane);
    return true;
  }

  /**
   * Cruise the lanes like traffic: writes the look-ahead point and the pace into `out`
   * {x, z, speed, stop, stopX, stopZ}; stop is set when the light ahead is red.
   */
  function cruiseLanes(drive, vehicle, out) {
    if (!drive.lane && !joinLanes(drive, vehicle.pos.x, vehicle.pos.z)) {
      out.x = vehicle.pos.x;
      out.z = vehicle.pos.z;
      out.speed = 0;
      out.stop = true;
      return out;
    }
    let lane = drive.lane;
    const px = vehicle.pos.x;
    const pz = vehicle.pos.z;
    let t = ((px - lane.x0) * lane.dirX + (pz - lane.z0) * lane.dirZ) / lane.length;
    let remaining = (1 - t) * lane.length;
    const next = drive.nextLane;
    if (next && (remaining < 3 || (next.x0 - px) * (next.x0 - px) + (next.z0 - pz) * (next.z0 - pz) < 36)) {
      drive.lane = next;
      drive.nextLane = pickNextLane(next);
      lane = next;
      t = ((px - lane.x0) * lane.dirX + (pz - lane.z0) * lane.dirZ) / lane.length;
      remaining = (1 - t) * lane.length;
    }
    const speed = Math.abs(vehicle.speed);
    const ahead = 9 + speed * 0.5;
    if (remaining > ahead || !drive.nextLane) {
      const tt = Math.min(1, Math.max(0, t) + ahead / lane.length);
      out.x = lane.x0 + (lane.x1 - lane.x0) * tt;
      out.z = lane.z0 + (lane.z1 - lane.z0) * tt;
    } else {
      const following = drive.nextLane;
      const into = Math.min(following.length, ahead - Math.max(0, remaining));
      out.x = following.x0 + following.dirX * into;
      out.z = following.z0 + following.dirZ * into;
    }
    let pace = lane.speed * 0.78;
    const turning = drive.nextLane && (lane.dirX * drive.nextLane.dirX + lane.dirZ * drive.nextLane.dirZ) < 0.7;
    if (turning && remaining < 28) pace = Math.min(pace, 7.5);
    out.speed = pace;
    out.stop = false;
    const roads = game.roads;
    if (roads.signalFor && remaining > 2.5 && remaining < 32) {
      const light = roads.signalFor(lane);
      if (light === 'red' || (light === 'yellow' && remaining > 12)) {
        out.stop = true;
        out.stopX = lane.x1;
        out.stopZ = lane.z1;
      }
    }
    return out;
  }

  return { beginFrame, planRoute, followRoute, dropRoute, joinLanes, cruiseLanes, turnAngle, cornerApproachSpeed };
}

/**
 * How sharply the road turns at b, coming from a and going on to c, in radians: positive for a left
 * turn (across the junction), negative for a right turn (tight, into the near lane), 0 straight on.
 */
function turnAngle(ax, az, bx, bz, cx, cz) {
  const ux = bx - ax;
  const uz = bz - az;
  const vx = cx - bx;
  const vz = cz - bz;
  const lu = Math.sqrt(ux * ux + uz * uz);
  const lv = Math.sqrt(vx * vx + vz * vz);
  if (lu < 1e-3 || lv < 1e-3) return 0;
  const cos = (ux * vx + uz * vz) / (lu * lv);
  const angle = Math.acos(cos < -1 ? -1 : cos > 1 ? 1 : cos);
  return uz * vx - ux * vz > 0 ? angle : -angle;
}

/**
 * The speed a police car may carry `distance` metres before a corner that turns by `turn` radians
 * (signed as turnAngle): the speed round the corner's arc on the tyres' grip (a right turn hugs the
 * kerb on a tight arc, a left turn sweeps across the junction), plus what hard braking sheds on the way.
 */
function cornerApproachSpeed(turn, distance) {
  const sharp = Math.abs(turn);
  if (sharp < 0.25) return Infinity;
  const radius = turn < 0 ? 2.5 + 4.5 / sharp : 6 + 14 / sharp;
  const through = Math.sqrt(CORNER_GRIP * radius);
  return Math.sqrt(through * through + 2 * CORNER_BRAKING * Math.max(0, distance - 3));
}

/** A patrol's choice at the next junction: mostly straight on, sometimes a turn. */
function pickNextLane(lane) {
  const options = lane.next;
  if (!options || options.length === 0) return null;
  if (options.length === 1) return options[0];
  const roll = Math.random();
  let straight = -1;
  for (let i = 0; i < options.length; i += 1) if (lane.turns[i] === 'straight') straight = i;
  if (straight !== -1 && roll < 0.55) return options[straight];
  return options[Math.floor(Math.random() * options.length)];
}

/** The right-hand normal of the road from a to b, into out; false for a zero-length road. */
function rightNormal(ax, az, bx, bz, out) {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 1e-4) return false;
  out.x = -dz / length;
  out.z = dx / length;
  return true;
}
