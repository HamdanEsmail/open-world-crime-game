// The road network of Port Sarab: intersections, road segments, the driving lanes traffic and
// police follow (right-hand traffic), traffic signals, the sidewalks people walk, and the route
// finder behind the GPS line. Built once from the city plan; becomes game.roads.

const LANE_WIDTH = 3.5;
const BUCKET = 120;

/** Build nodes, edges, lanes and walkways from game.city. */
export function createRoadNetwork(game) {
  const city = game.city;
  const roads = { nodes: [], edges: [], lanes: [], walkways: [], laneWidth: LANE_WIDTH };
  const nodeByKey = new Map();
  const laneBuckets = new Map();
  const walkBuckets = new Map();

  buildNodesAndEdges(city, roads, nodeByKey);
  buildLanes(roads);
  buildWalkways(city, roads);
  fillBuckets(roads.lanes, laneBuckets);
  fillBuckets(roads.walkways, walkBuckets);

  const found = { lane: null, t: 0, distance: 0, x: 0, z: 0 };
  const foundWalk = { walkway: null, t: 0, distance: 0, x: 0, z: 0 };

  /** The lane nearest a point within maxDistance, or null. The returned object is reused: copy what you keep. */
  roads.nearestLane = (x, z, maxDistance = 60, filter = null) => nearestIn(laneBuckets, x, z, maxDistance, filter, found, 'lane');
  roads.nearestWalkway = (x, z, maxDistance = 60) => nearestIn(walkBuckets, x, z, maxDistance, null, foundWalk, 'walkway');

  /** A random point on a lane between minDistance and maxDistance from (x, z); null when none is found. */
  roads.randomLaneNear = (x, z, minDistance, maxDistance, rng, filter = null) => {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const angle = rng.next() * Math.PI * 2;
      const radius = minDistance + (maxDistance - minDistance) * rng.next();
      const hit = roads.nearestLane(x + Math.sin(angle) * radius, z + Math.cos(angle) * radius, 90, filter);
      if (!hit) continue;
      const d = Math.hypot(hit.x - x, hit.z - z);
      if (d >= minDistance && d <= maxDistance) return hit;
    }
    return null;
  };
  roads.randomWalkwayNear = (x, z, minDistance, maxDistance, rng) => {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const angle = rng.next() * Math.PI * 2;
      const radius = minDistance + (maxDistance - minDistance) * rng.next();
      const hit = roads.nearestWalkway(x + Math.sin(angle) * radius, z + Math.cos(angle) * radius, 90);
      if (!hit) continue;
      const d = Math.hypot(hit.x - x, hit.z - z);
      if (d >= minDistance && d <= maxDistance) return hit;
    }
    return null;
  };

  /** 'green', 'yellow' or 'red' for a lane arriving at its end node right now. */
  roads.signalFor = (lane) => signalFor(lane, game.time.elapsed);
  /** The state of a signalled node for north-south and east-west traffic: { ns, ew }. */
  roads.signalPhase = (node) => signalPhase(node, game.time.elapsed);

  /** The shortest way along the roads between two points, as a new list of {x, z}; ends at the target itself. */
  roads.findRoute = (fromX, fromZ, toX, toZ) => findRoute(roads, fromX, fromZ, toX, toZ);
  roads.routeLength = (route) => {
    let total = 0;
    for (let i = 1; i < route.length; i += 1) total += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
    return total;
  };
  /** Point at parameter t (0..1) along a lane, written into `out` {x, z}. */
  roads.pointOnLane = (lane, t, out) => {
    out.x = lane.x0 + (lane.x1 - lane.x0) * t;
    out.z = lane.z0 + (lane.z1 - lane.z0) * t;
    return out;
  };
  return roads;
}

/** One node per intersection of the grid, plus the bends of the desert roads; one edge per road segment. */
function buildNodesAndEdges(city, roads, nodeByKey) {
  const kinds = city.roadKinds;
  const nodeAt = (x, z) => {
    const key = `${x},${z}`;
    let node = nodeByKey.get(key);
    if (!node) {
      node = { id: roads.nodes.length, x, z, edges: [], signal: false, phase: 0, trim: 5, halfNS: 0, halfEW: 0 };
      roads.nodes.push(node);
      nodeByKey.set(key, node);
    }
    return node;
  };
  const addEdge = (a, b, kind, name) => {
    const spec = kinds[kind];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const edge = {
      id: roads.edges.length, a, b, kind, name,
      width: spec.width, half: spec.width / 2, lanesEachWay: spec.lanes, median: spec.median, speed: spec.speed,
      sidewalk: spec.sidewalk, length,
      dirX: (b.x - a.x) / length, dirZ: (b.z - a.z) / length,
      lanes: [],
    };
    roads.edges.push(edge);
    a.edges.push(edge);
    b.edges.push(edge);
    return edge;
  };

  const avenues = city.avenues;
  const streets = city.streets;
  for (let j = 0; j < streets.length; j += 1) {
    for (let i = 0; i < avenues.length; i += 1) {
      const node = nodeAt(avenues[i].x, streets[j].z);
      node.halfNS = kinds[avenues[i].kind].width / 2;
      node.halfEW = kinds[streets[j].kind].width / 2;
    }
  }
  for (let j = 0; j < streets.length; j += 1) {
    for (let i = 0; i < avenues.length - 1; i += 1) {
      addEdge(nodeAt(avenues[i].x, streets[j].z), nodeAt(avenues[i + 1].x, streets[j].z), streets[j].kind, streets[j].name).grid = 'ew';
    }
  }
  for (let i = 0; i < avenues.length; i += 1) {
    for (let j = 0; j < streets.length - 1; j += 1) {
      addEdge(nodeAt(avenues[i].x, streets[j].z), nodeAt(avenues[i].x, streets[j + 1].z), avenues[i].kind, avenues[i].name).grid = 'ns';
    }
  }
  for (const road of city.desertRoads) {
    for (let p = 0; p < road.points.length - 1; p += 1) {
      addEdge(nodeAt(road.points[p][0], road.points[p][1]), nodeAt(road.points[p + 1][0], road.points[p + 1][1]), road.kind, road.name).grid = null;
    }
  }

  for (const node of roads.nodes) {
    let widest = 0;
    let major = false;
    for (const edge of node.edges) {
      widest = Math.max(widest, edge.half);
      if (edge.kind === 'boulevard') major = true;
    }
    const sharpCorner = node.edges.length === 2 && Math.abs(node.edges[0].dirX * node.edges[1].dirX + node.edges[0].dirZ * node.edges[1].dirZ) < 0.6;
    // Lanes stop at the stop line, behind the zebra crossing: 5.6 m back from the crossing road's edge.
    node.trim = node.edges.length >= 3 || sharpCorner ? widest + 5.6 : 4;
    node.signal = node.edges.length >= 3 && major && node.halfNS > 0;
    node.phase = ((node.x * 0.013 + node.z * 0.021) % 1 + 1) % 1 * SIGNAL_CYCLE;
  }
}

/** For every edge, the lanes each way: offset to the right of travel, trimmed back from each intersection. */
function buildLanes(roads) {
  for (const edge of roads.edges) {
    for (const forward of [true, false]) {
      const from = forward ? edge.a : edge.b;
      const to = forward ? edge.b : edge.a;
      const ux = forward ? edge.dirX : -edge.dirX;
      const uz = forward ? edge.dirZ : -edge.dirZ;
      const rightX = -uz;
      const rightZ = ux;
      for (let index = 0; index < edge.lanesEachWay; index += 1) {
        const offset = edge.median / 2 + LANE_WIDTH * (index + 0.5);
        const x0 = from.x + ux * from.trim + rightX * offset;
        const z0 = from.z + uz * from.trim + rightZ * offset;
        const x1 = to.x - ux * to.trim + rightX * offset;
        const z1 = to.z - uz * to.trim + rightZ * offset;
        const lane = {
          id: roads.lanes.length, edge, from, to, index, forward,
          x0, z0, x1, z1, dirX: ux, dirZ: uz,
          heading: Math.atan2(ux, uz),
          length: Math.hypot(x1 - x0, z1 - z0),
          speed: edge.speed, kind: edge.kind,
          next: [], turns: [],
        };
        roads.lanes.push(lane);
        edge.lanes.push(lane);
      }
    }
  }
  // Where each lane may continue: any lane leaving its end node, except straight back the way it came
  // (a dead end allows the U-turn). turns[i] says how next[i] bends: 'straight', 'left' or 'right'.
  for (const lane of roads.lanes) {
    const options = [];
    for (const edge of lane.to.edges) {
      for (const other of edge.lanes) {
        if (other.from !== lane.to) continue;
        if (other.edge === lane.edge) continue;
        options.push(other);
      }
    }
    if (options.length === 0) {
      for (const other of lane.edge.lanes) if (other.from === lane.to) options.push(other);
    }
    for (const other of options) {
      const cross = lane.dirZ * other.dirX - lane.dirX * other.dirZ; // > 0: heading grows, a left turn
      const dot = lane.dirX * other.dirX + lane.dirZ * other.dirZ;
      lane.next.push(other);
      lane.turns.push(dot > 0.7 ? 'straight' : cross > 0 ? 'left' : 'right');
    }
  }
}

/** Sidewalk centre lines along both sides of every city street, linked at corners and across crossings. */
function buildWalkways(city, roads) {
  const half = city.roadKinds.street.sidewalk / 2;
  for (const edge of roads.edges) {
    if (!edge.grid || edge.sidewalk === 0) continue;
    const alongX = edge.grid === 'ew';
    const offset = edge.half + half;
    for (const side of [1, -1]) {
      const trimA = (alongX ? edge.a.halfNS : edge.a.halfEW) + half;
      const trimB = (alongX ? edge.b.halfNS : edge.b.halfEW) + half;
      const walkway = alongX
        ? { x0: edge.a.x + trimA, z0: edge.a.z + side * offset, x1: edge.b.x - trimB, z1: edge.b.z + side * offset }
        : { x0: edge.a.x + side * offset, z0: edge.a.z + trimA, x1: edge.b.x + side * offset, z1: edge.b.z - trimB };
      walkway.id = roads.walkways.length;
      walkway.edge = edge;
      walkway.length = Math.hypot(walkway.x1 - walkway.x0, walkway.z1 - walkway.z0);
      walkway.dirX = (walkway.x1 - walkway.x0) / walkway.length;
      walkway.dirZ = (walkway.z1 - walkway.z0) / walkway.length;
      walkway.links = [[], []]; // links[0]: walkways reachable from the start end; links[1]: from the far end
      roads.walkways.push(walkway);
    }
  }
  // Link ends that share a corner (turn) or face each other across one road (a crossing).
  const ends = [];
  for (const walkway of roads.walkways) {
    ends.push({ walkway, end: 0, x: walkway.x0, z: walkway.z0 });
    ends.push({ walkway, end: 1, x: walkway.x1, z: walkway.z1 });
  }
  const cells = new Map();
  for (const end of ends) {
    const key = `${Math.round(end.x / 60)},${Math.round(end.z / 60)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(end);
  }
  for (const end of ends) {
    const cx = Math.round(end.x / 60);
    const cz = Math.round(end.z / 60);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const list = cells.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (const other of list) {
          if (other.walkway === end.walkway) continue;
          const ddx = Math.abs(other.x - end.x);
          const ddz = Math.abs(other.z - end.z);
          const sameCorner = ddx < 1.5 && ddz < 1.5;
          const crossing = (ddx < 1.5 && ddz < 36) || (ddz < 1.5 && ddx < 36);
          if (sameCorner || crossing) end.walkway.links[end.end].push({ walkway: other.walkway, end: other.end, crossing: !sameCorner });
        }
      }
    }
  }
}

function fillBuckets(segments, buckets) {
  for (const segment of segments) {
    const steps = Math.max(1, Math.ceil(segment.length / (BUCKET * 0.5)));
    let lastKey = null;
    for (let s = 0; s <= steps; s += 1) {
      const x = segment.x0 + ((segment.x1 - segment.x0) * s) / steps;
      const z = segment.z0 + ((segment.z1 - segment.z0) * s) / steps;
      const key = bucketKey(Math.floor(x / BUCKET), Math.floor(z / BUCKET));
      if (key === lastKey) continue;
      lastKey = key;
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      if (list.indexOf(segment) === -1) list.push(segment);
    }
  }
}

function bucketKey(cx, cz) {
  return (cx + 512) * 1024 + (cz + 512);
}

function nearestIn(buckets, x, z, maxDistance, filter, out, field) {
  const reach = Math.ceil(maxDistance / BUCKET);
  const cx = Math.floor(x / BUCKET);
  const cz = Math.floor(z / BUCKET);
  let best = null;
  let bestDistance = maxDistance;
  let bestT = 0;
  for (let dx = -reach; dx <= reach; dx += 1) {
    for (let dz = -reach; dz <= reach; dz += 1) {
      const list = buckets.get(bucketKey(cx + dx, cz + dz));
      if (!list) continue;
      for (let i = 0; i < list.length; i += 1) {
        const segment = list[i];
        if (filter && !filter(segment)) continue;
        const abx = segment.x1 - segment.x0;
        const abz = segment.z1 - segment.z0;
        let t = ((x - segment.x0) * abx + (z - segment.z0) * abz) / (segment.length * segment.length);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - (segment.x0 + abx * t), z - (segment.z0 + abz * t));
        if (d < bestDistance) {
          bestDistance = d;
          best = segment;
          bestT = t;
        }
      }
    }
  }
  if (!best) return null;
  out[field] = best;
  out.t = bestT;
  out.distance = bestDistance;
  out.x = best.x0 + (best.x1 - best.x0) * bestT;
  out.z = best.z0 + (best.z1 - best.z0) * bestT;
  return out;
}

const SIGNAL_CYCLE = 26;
const PHASE = { ns: 'red', ew: 'red' };

/** Signal timing: north-south green, yellow, a beat of all red, then east-west. */
function signalPhase(node, elapsed) {
  if (!node.signal) {
    PHASE.ns = 'green';
    PHASE.ew = 'green';
    return PHASE;
  }
  const t = (elapsed + node.phase) % SIGNAL_CYCLE;
  PHASE.ns = t < 10 ? 'green' : t < 12.3 ? 'yellow' : 'red';
  PHASE.ew = t >= 13 && t < 23 ? 'green' : t >= 23 && t < 25.3 ? 'yellow' : 'red';
  return PHASE;
}

function signalFor(lane, elapsed) {
  const phase = signalPhase(lane.to, elapsed);
  return Math.abs(lane.dirX) > Math.abs(lane.dirZ) ? phase.ew : phase.ns;
}

/** Dijkstra over the intersections, entered and left through the nearest road segment at each end. */
function findRoute(roads, fromX, fromZ, toX, toZ) {
  const start = roads.nearestLane(fromX, fromZ, 400);
  if (!start) return [{ x: fromX, z: fromZ }, { x: toX, z: toZ }];
  const startEdge = start.lane.edge;
  const startPoint = projectOnEdge(startEdge, fromX, fromZ);
  const goal = roads.nearestLane(toX, toZ, 400);
  if (!goal) return [{ x: fromX, z: fromZ }, { x: toX, z: toZ }];
  const goalEdge = goal.lane.edge;
  const goalPoint = projectOnEdge(goalEdge, toX, toZ);
  const target = { x: toX, z: toZ };
  if (startEdge === goalEdge) return [startPoint, goalPoint, target];

  const count = roads.nodes.length;
  const cost = new Float64Array(count).fill(Infinity);
  const previous = new Int32Array(count).fill(-1);
  const done = new Uint8Array(count);
  cost[startEdge.a.id] = Math.hypot(startPoint.x - startEdge.a.x, startPoint.z - startEdge.a.z);
  cost[startEdge.b.id] = Math.hypot(startPoint.x - startEdge.b.x, startPoint.z - startEdge.b.z);
  const goalCostA = Math.hypot(goalPoint.x - goalEdge.a.x, goalPoint.z - goalEdge.a.z);
  const goalCostB = Math.hypot(goalPoint.x - goalEdge.b.x, goalPoint.z - goalEdge.b.z);
  for (let iteration = 0; iteration < count; iteration += 1) {
    let current = -1;
    let lowest = Infinity;
    for (let i = 0; i < count; i += 1) {
      if (!done[i] && cost[i] < lowest) {
        lowest = cost[i];
        current = i;
      }
    }
    if (current === -1) break;
    done[current] = 1;
    const node = roads.nodes[current];
    for (const edge of node.edges) {
      const other = edge.a === node ? edge.b : edge.a;
      // Faster roads are a little "shorter", so routes prefer boulevards and highways.
      const step = edge.length * (22 / (edge.speed + 8));
      if (cost[current] + step < cost[other.id]) {
        cost[other.id] = cost[current] + step;
        previous[other.id] = current;
      }
    }
  }
  const viaA = cost[goalEdge.a.id] + goalCostA;
  const viaB = cost[goalEdge.b.id] + goalCostB;
  const route = [target, goalPoint];
  let at = viaA <= viaB ? goalEdge.a.id : goalEdge.b.id;
  let guard = 0;
  while (at !== -1 && guard < count + 2) {
    route.push({ x: roads.nodes[at].x, z: roads.nodes[at].z });
    at = previous[at];
    guard += 1;
  }
  route.push(startPoint);
  route.reverse();
  return route;
}

function projectOnEdge(edge, x, z) {
  let t = ((x - edge.a.x) * edge.dirX + (z - edge.a.z) * edge.dirZ) / edge.length;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: edge.a.x + edge.dirX * edge.length * t, z: edge.a.z + edge.dirZ * edge.length * t };
}
