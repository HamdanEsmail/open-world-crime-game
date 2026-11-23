// How the drivers of Port Sarab get through a junction: which way each one turns next (mostly
// straight on, keeping to its lane), the smooth curve it drives from its stop line into the lane it
// turns into, which of those curves cross, and who goes first: the lights, then whoever is already
// crossing, then whoever arrived first or comes from the right. Nobody pulls in without room to leave.
import { turnWeight, laneAfterTurn, mustGiveWay } from './trafficRules.js';

/** Straight pieces each crossing curve is cut into. */
export const PATH_PIECES = 12;
/** Two crossing curves whose centre lines come closer than this (metres) would put two cars in each other. */
const CONFLICT_DISTANCE = 3.1;
/** Comfortable sideways acceleration through a turn (m/s^2): sets each curve's speed. */
const TURN_LATERAL_ACCEL = 2.7;
const SLOWEST_TURN = 3.5;
/** A crossing car this close to the end of its curve no longer blocks anyone. */
const CLEARING_DISTANCE = 4.5;
/** Seconds refused at the line before a driver no longer gives way to a car that is not moving either. */
const PATIENCE = 8;

/**
 * Build the junction rules shared by every traffic driver.
 * @param {Object} game
 * @param {{drivers: Object[], grid: Object}} traffic  the traffic system: its drivers' states are read
 */
export function createTrafficJunctions(game, traffic) {
  const paths = new Map();
  const weights = new Float64Array(16);
  const rng = game.rng.fork('traffic-junctions');
  let nextPathId = 1;

  /**
   * Pick the lane a car on `lane` will turn into at the end of it. Straight on is most likely; a turn
   * is taken from the lane nearest that side (the inner lane turns left, the kerb lane right), into
   * the inner lane on a left turn and the kerb lane on a right turn. Buses keep to the boulevards; a
   * panicking driver prefers the way that leads away from (awayX, awayZ).
   * @returns {Object|null} the next lane
   */
  function chooseNextLane(lane, className, avoid, awayX, awayZ) {
    const options = lane.next;
    const count = Math.min(options.length, weights.length);
    if (count === 0) return null;
    if (count === 1) return options[0];
    const lanesHere = lane.edge.lanesEachWay;
    const bend = lane.to.edges.length === 2;
    const fleeing = awayX !== undefined && (awayX !== 0 || awayZ !== 0);
    let total = 0;
    for (let i = 0; i < count; i += 1) {
      const option = options[i];
      const turn = option.edge === lane.edge ? 'uturn' : lane.turns[i];
      const wanted = laneAfterTurn(turn, lane.index, option.edge.lanesEachWay, bend);
      let weight = option.index === wanted ? turnWeight(turn, lane.index, lanesHere, bend) : 0;
      if (className === 'bus' && option.kind !== 'boulevard') weight *= 0.03;
      if (option === avoid) weight *= 0.02;
      if (isDeadEnd(option)) weight *= 0.1;
      if (fleeing && weight > 0) weight *= 0.15 + 2 * Math.max(0, option.dirX * awayX + option.dirZ * awayZ);
      weights[i] = weight;
      total += weight;
    }
    if (total <= 0) return fallbackLane(lane, avoid);
    let roll = rng.next() * total;
    for (let i = 0; i < count; i += 1) {
      if (weights[i] <= 0) continue;
      roll -= weights[i];
      if (roll <= 0) return options[i];
    }
    for (let i = count - 1; i >= 0; i -= 1) if (weights[i] > 0) return options[i];
    return options[0];
  }

  /** The crossing curve from the end of `lane` to the start of `next`, built once and kept. */
  function pathBetween(lane, next) {
    const key = lane.id * 65536 + next.id;
    let path = paths.get(key);
    if (!path) {
      path = buildCrossingPath(lane, next, nextPathId);
      nextPathId += 1;
      paths.set(key, path);
    }
    return path;
  }

  /**
   * Would two cars on these two crossing curves of one junction hit each other? Cars on the same
   * lane simply follow; curves into the same lane merge and always conflict. Worked out once per pair.
   */
  function pathsConflict(a, b) {
    if (a === b || a.from === b.from || a.node !== b.node) return false;
    if (a.to === b.to) return true;
    let known = a.conflicts.get(b.id);
    if (known === undefined) {
      known = curvesCome(a, b, CONFLICT_DISTANCE) || curvesCome(b, a, CONFLICT_DISTANCE);
      a.conflicts.set(b.id, known);
      b.conflicts.set(a.id, known);
    }
    return known;
  }

  /**
   * May the car of driver `state` pull into its junction now? It waits for anyone crossing its path,
   * for anyone already committed to a crossing path, and then by the rules of the road: at the lights a
   * left turn gives way to oncoming traffic; without lights the first to arrive goes first, and at the
   * same moment the car from the right; a highway runs on through a desert junction. Sets
   * state.waitingFor to the car it waits for.
   */
  function mayEnter(state, now) {
    const path = state.path;
    state.waitingFor = null;
    if (!path) return false;
    const node = path.node;
    const list = traffic.drivers;
    const myEta = Math.max(0, state.distToLine) / Math.max(1.5, state.vehicle.speed);
    const myPriority = onPriorityRoad(path);
    // A driver kept waiting this long stops giving way to a car that is not moving anyway (its own
    // eyes still stop it short of anything actually in the way): no junction locks up for good.
    const impatient = state.refusedSince >= 0 && now - state.refusedSince > PATIENCE + (state.vehicle.id % 3);
    for (let i = 0; i < list.length; i += 1) {
      const other = list[i];
      if (other === state || other.mode === 'abandoned' || other.mode === 'confront') continue;
      const otherPath = other.path;
      if (!otherPath || otherPath.node !== node) continue;
      if (!pathsConflict(path, otherPath)) continue;
      if (other.phase === 1) {
        if (otherPath.length - other.pathS > CLEARING_DISTANCE) return waitFor(state, other);
        continue;
      }
      if (other.lane !== otherPath.from) continue;
      const otherEta = Math.max(0, other.distToLine) / Math.max(1.5, other.vehicle.speed);
      if (other.committed && (other.distToLine < 4 || otherEta < 6)) return waitFor(state, other);
      // Impatience only ever overrides a car still waiting at its own line, never one in the box.
      if (impatient && other.stillTime > 4) continue;
      if (other.distToLine > 26) continue;
      if (node.signal && !other.signalGo) continue;
      if (!node.signal) {
        const otherPriority = onPriorityRoad(otherPath);
        if (myPriority && !otherPriority) continue;
        if (otherPriority && !myPriority) {
          if (otherEta < 4.5) return waitFor(state, other);
          continue;
        }
      }
      const otherArrival = other.arrivedAt >= 0 && other.distToLine < 6 ? other.arrivedAt : -1;
      const patient = now - state.arrivedAt < 3 + (state.vehicle.id % 4);
      if (mustGiveWay(node.signal, path.turn, otherPath.turn, myEta, otherEta, state.arrivedAt, otherArrival, comesFromRight(path, otherPath), patient)) {
        return waitFor(state, other);
      }
    }
    return true;
  }

  /**
   * Is there room past the junction for this car? The first stretch of its exit lane must be free of
   * stopped vehicles for its own length, plus the share already claimed by cars crossing into it, so
   * a queue never backs up into the box and locks the junction.
   */
  function exitHasRoom(state) {
    const exit = state.path.to;
    const need = state.vehicle.dynamics.profile.length + 2.5;
    let claimed = 0;
    const list = traffic.drivers;
    for (let i = 0; i < list.length; i += 1) {
      const other = list[i];
      if (other === state || !other.path || other.path.to !== exit) continue;
      if (other.phase === 1 || other.committed) claimed += other.vehicle.dynamics.profile.length + 2;
    }
    const free = traffic.grid.freeLengthOnLane(exit, need + claimed + 5, state.vehicle);
    return free >= need + claimed;
  }

  /** Point `distance` metres along a crossing curve, with the curve's direction there, written into `out`. */
  function pointOnPath(path, distance, out) {
    const along = path.along;
    const points = path.points;
    let i = 0;
    while (i < PATH_PIECES - 1 && along[i + 1] < distance) i += 1;
    const length = along[i + 1] - along[i];
    let t = length > 1e-6 ? (distance - along[i]) / length : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ax = points[i * 2];
    const az = points[i * 2 + 1];
    const bx = points[i * 2 + 2];
    const bz = points[i * 2 + 3];
    out.x = ax + (bx - ax) * t;
    out.z = az + (bz - az) * t;
    const inv = length > 1e-6 ? 1 / length : 0;
    out.dirX = (bx - ax) * inv;
    out.dirZ = (bz - az) * inv;
    return out;
  }

  /**
   * Where a point lies along a crossing curve, searching the pieces near `fromPiece`: writes the
   * distance along the curve, the piece, the signed sideways distance (+ to the right) and the
   * curve's direction into `out`.
   */
  function projectOnPath(path, x, z, fromPiece, out) {
    const points = path.points;
    const along = path.along;
    const first = fromPiece > 0 ? fromPiece - 1 : 0;
    const last = Math.min(PATH_PIECES - 1, fromPiece + 3);
    let best = Infinity;
    for (let i = first; i <= last; i += 1) {
      const ax = points[i * 2];
      const az = points[i * 2 + 1];
      const length = along[i + 1] - along[i];
      if (length < 1e-6) continue;
      const ux = (points[i * 2 + 2] - ax) / length;
      const uz = (points[i * 2 + 3] - az) / length;
      const rx = x - ax;
      const rz = z - az;
      let t = rx * ux + rz * uz;
      const lateral = rz * ux - rx * uz;
      const before = t < 0 ? -t : 0;
      const beyond = t > length ? t - length : 0;
      const miss = Math.abs(lateral) + before + beyond;
      if (miss < best) {
        best = miss;
        if (t < 0 && i > 0) t = 0;
        if (t > length && i < PATH_PIECES - 1) t = length;
        out.distance = along[i] + t;
        out.piece = i;
        out.lateral = lateral;
        out.dirX = ux;
        out.dirZ = uz;
      }
    }
    return out;
  }

  return { chooseNextLane, pathBetween, pathsConflict, mayEnter, exitHasRoom, pointOnPath, projectOnPath };
}

/**
 * The crossing curve from one lane's stop line to the next lane's start: a cubic Bezier whose
 * handles lie along both lanes, sized so a turn is close to a circular arc that meets both tangents.
 * Sampled into PATH_PIECES straight pieces, with its length and the speed it can be taken at.
 */
function buildCrossingPath(lane, next, id) {
  const x0 = lane.x1;
  const z0 = lane.z1;
  const x3 = next.x0;
  const z3 = next.z0;
  const ax = lane.dirX;
  const az = lane.dirZ;
  const bx = next.dirX;
  const bz = next.dirZ;
  const dx = x3 - x0;
  const dz = z3 - z0;
  const chord = Math.sqrt(dx * dx + dz * dz);
  const dot = Math.max(-1, Math.min(1, ax * bx + az * bz));
  const angle = Math.acos(dot);
  const uturn = next.edge === lane.edge;
  let k0 = chord / 3;
  let k1 = chord / 3;
  const det = ax * bz - az * bx;
  if (uturn) {
    k0 = Math.max(7, chord * 1.4);
    k1 = k0;
  } else if (Math.abs(det) > 0.08) {
    // Where the two lanes' lines meet: the corner the curve rounds.
    const toCornerA = (dx * bz - dz * bx) / det;
    const toCornerB = (ax * dz - az * dx) / det;
    if (toCornerA > 0.3 && toCornerB > 0.3) {
      const handle = ((4 / 3) * Math.tan(angle / 4)) / Math.tan(angle / 2);
      k0 = toCornerA * handle;
      k1 = toCornerB * handle;
    } else {
      k0 = chord * 0.36;
      k1 = k0;
    }
  }
  const x1 = x0 + ax * k0;
  const z1 = z0 + az * k0;
  const x2 = x3 - bx * k1;
  const z2 = z3 - bz * k1;
  const points = new Float64Array((PATH_PIECES + 1) * 2);
  const along = new Float64Array(PATH_PIECES + 1);
  let length = 0;
  let px = x0;
  let pz = z0;
  for (let i = 0; i <= PATH_PIECES; i += 1) {
    const t = i / PATH_PIECES;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    const x = w0 * x0 + w1 * x1 + w2 * x2 + w3 * x3;
    const z = w0 * z0 + w1 * z1 + w2 * z2 + w3 * z3;
    if (i > 0) length += Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
    points[i * 2] = x;
    points[i * 2 + 1] = z;
    along[i] = length;
    px = x;
    pz = z;
  }
  const index = lane.next.indexOf(next);
  const turn = uturn ? 'uturn' : index >= 0 ? lane.turns[index] : 'straight';
  const limit = Math.min(lane.speed, next.speed);
  let safeSpeed = limit;
  if (angle > 0.2) {
    const radius = length / angle;
    safeSpeed = Math.max(SLOWEST_TURN, Math.min(limit, Math.sqrt(TURN_LATERAL_ACCEL * radius)));
  }
  return { id, node: lane.to, from: lane, to: next, turn, points, along, length, safeSpeed, conflicts: new Map() };
}

/** True when some point of curve `a` comes within `distance` of some piece of curve `b`. */
function curvesCome(a, b, distance) {
  const pa = a.points;
  const pb = b.points;
  const limit = distance * distance;
  for (let i = 0; i <= PATH_PIECES; i += 1) {
    const x = pa[i * 2];
    const z = pa[i * 2 + 1];
    for (let j = 0; j < PATH_PIECES; j += 1) {
      const sx = pb[j * 2];
      const sz = pb[j * 2 + 1];
      const ex = pb[j * 2 + 2] - sx;
      const ez = pb[j * 2 + 3] - sz;
      const lengthSq = ex * ex + ez * ez;
      let t = lengthSq > 0 ? ((x - sx) * ex + (z - sz) * ez) / lengthSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = sx + ex * t - x;
      const qz = sz + ez * t - z;
      if (qx * qx + qz * qz < limit) return true;
    }
  }
  return false;
}

/** Does the other car's approach come from this car's right? (Its heading is a left turn of ours.) */
function comesFromRight(mine, theirs) {
  const m = mine.from;
  const o = theirs.from;
  return m.dirZ * o.dirX - m.dirX * o.dirZ > 0.5;
}

/** A desert highway running straight on through a junction has the right of way. */
function onPriorityRoad(path) {
  return path.from.kind === 'highway' && path.to.kind === 'highway';
}

function isDeadEnd(lane) {
  return lane.next.length === 1 && lane.next[0].edge === lane.edge;
}

function waitFor(state, other) {
  state.waitingFor = other.vehicle;
  return false;
}

/** When every option was ruled out: carry on in the same lane index, or take the first way that is not `avoid`. */
function fallbackLane(lane, avoid) {
  let best = null;
  for (let i = 0; i < lane.next.length; i += 1) {
    const option = lane.next[i];
    if (option === avoid) continue;
    if (!best || Math.abs(option.index - lane.index) < Math.abs(best.index - lane.index)) best = option;
  }
  return best || lane.next[0];
}
