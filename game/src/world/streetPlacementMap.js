// Where Port Sarab's street furniture may stand: the sidewalk runs beside every road (a kerb strip and
// a wall strip with the walking line between them), the boulevard medians, the stretches kept clear
// for doors and driveways, the run-ups of the stunt ramps, and a ledger of the ground already taken,
// so nothing lands in a lane, on another prop, inside a building, in the water or across a garage mouth.

const LEDGER_CELL = 8;
const STRUCTURE_KINDS = new Set(['building', 'wall', 'container', 'landmark']);
const VEHICLE_LOT_USES = new Set(['parking', 'carLot', 'truckYard', 'scrapYard', 'policeYard', 'containerYard']);

/**
 * Build the placement map from game.city, game.roads, game.terrain and game.colliders.
 * A sidewalk run is one side of one road segment between two junctions:
 *   { id, edge, name, kind, half, median, lanes, alongX, fixed, side, outer, from, to, district, zone, spans }
 * `alongX` runs east-west (along = x, fixed = the road's z); otherwise north-south (along = z, fixed = x).
 * `side` is -1 or +1: which side of the centre line. Offsets are measured from the kerb into the sidewalk
 * (0 at the road edge, `sidewalk` at the lot line). `outer` sides face out of the grid (the beach, the dunes).
 */
export function createStreetPlacementMap(game) {
  const city = game.city;
  const terrain = game.terrain;
  const colliders = game.colliders;
  const walk = city.roadKinds.street.sidewalk;
  const urban = city.urban;
  const ledger = new Map();
  const nearby = [];
  const scratch = { x: 0, z: 0, heading: 0 };
  const bands = buildRoadBands(city);
  const sidewalkRuns = [];
  const medianRuns = [];

  const map = {
    sidewalk: walk,
    sidewalkRuns,
    medianRuns,
    runPoint,
    medianPoint,
    isFree,
    claim,
    take,
    insideStructure,
    onRoadway,
    inSpan,
    reserveSpan,
    runsBesideBlockEdge,
    get ledgerSize() {
      let total = 0;
      for (const list of ledger.values()) total += list.length;
      return total;
    },
  };

  buildRuns();
  reserveRampApproaches();
  reservePlacesAndDriveways();
  return map;

  /**
   * The point `offset` metres into the sidewalk from the kerb, `along` the run; writes {x, z, heading}
   * where heading faces the road (a bench's or a lamp arm's front).
   */
  function runPoint(run, along, offset, out = scratch) {
    const across = run.side * (run.half + offset);
    if (run.alongX) {
      out.x = along;
      out.z = run.fixed + across;
      out.heading = run.side > 0 ? Math.PI : 0;
    } else {
      out.x = run.fixed + across;
      out.z = along;
      out.heading = run.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    return out;
  }

  /** The point on a median's centre line, `along` it; heading runs along the road. */
  function medianPoint(run, along, out = scratch) {
    out.x = run.alongX ? along : run.fixed;
    out.z = run.alongX ? run.fixed : along;
    out.heading = run.alongX ? Math.PI / 2 : 0;
    return out;
  }

  /** True when a circle is clear of the ledger, the buildings, the roadway and the water. */
  function isFree(x, z, radius) {
    if (ledgerHit(x, z, radius)) return false;
    if (onRoadway(x, z, radius)) return false;
    if (insideStructure(x, z, radius)) return false;
    if (terrain && terrain.isWater(x, z)) return false;
    return true;
  }

  /** Take the ground for a prop if it is free; returns whether it was. */
  function claim(x, z, radius) {
    if (!isFree(x, z, radius)) return false;
    take(x, z, radius);
    return true;
  }

  /** Mark a circle as taken, whatever is there. */
  function take(x, z, radius) {
    const entry = { x, z, r: radius };
    const x0 = Math.floor((x - radius) / LEDGER_CELL);
    const x1 = Math.floor((x + radius) / LEDGER_CELL);
    const z0 = Math.floor((z - radius) / LEDGER_CELL);
    const z1 = Math.floor((z + radius) / LEDGER_CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const key = cellKey(cx, cz);
        let list = ledger.get(key);
        if (!list) {
          list = [];
          ledger.set(key, list);
        }
        list.push(entry);
      }
    }
  }

  function ledgerHit(x, z, radius) {
    const x0 = Math.floor((x - radius) / LEDGER_CELL);
    const x1 = Math.floor((x + radius) / LEDGER_CELL);
    const z0 = Math.floor((z - radius) / LEDGER_CELL);
    const z1 = Math.floor((z + radius) / LEDGER_CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const list = ledger.get(cellKey(cx, cz));
        if (!list) continue;
        for (let i = 0; i < list.length; i += 1) {
          const e = list[i];
          const reach = e.r + radius;
          const dx = e.x - x;
          const dz = e.z - z;
          if (dx * dx + dz * dz < reach * reach) return true;
        }
      }
    }
    return false;
  }

  /** True when a circle overlaps a building, a garden wall, a container stack or a landmark. */
  function insideStructure(x, z, radius) {
    if (!colliders) return false;
    colliders.query(x, z, radius + 0.1, nearby);
    for (let i = 0; i < nearby.length; i += 1) {
      const c = nearby[i];
      if (!STRUCTURE_KINDS.has(c.kind)) continue;
      if (c.type === 'post') {
        const reach = radius + c.radius;
        if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < reach * reach) return true;
      } else {
        const px = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
        const pz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
        if ((x - px) * (x - px) + (z - pz) * (z - pz) < radius * radius) return true;
      }
    }
    return false;
  }

  /**
   * True when a circle touches the carriageway of any road: grid lanes, junction boxes, desert
   * highways. A circle wholly on a boulevard median (away from the junctions) is not on the roadway.
   */
  function onRoadway(x, z, radius) {
    let avenue = null;
    let avenueDistance = 0;
    let street = null;
    let streetDistance = 0;
    if (z > bands.avenueZ0 - radius && z < bands.avenueZ1 + radius) {
      for (const band of bands.avenues) {
        const d = Math.abs(x - band.at);
        if (d < band.half + radius) {
          avenue = band;
          avenueDistance = d;
          break;
        }
      }
    }
    if (x > bands.streetX0 - radius && x < bands.streetX1 + radius) {
      for (const band of bands.streets) {
        const d = Math.abs(z - band.at);
        if (d < band.half + radius) {
          street = band;
          streetDistance = d;
          break;
        }
      }
    }
    if (avenue && street) return true;
    if (avenue && !(avenue.median > 0 && avenueDistance + radius < avenue.median / 2)) return true;
    if (street && !(street.median > 0 && streetDistance + radius < street.median / 2)) return true;
    for (const segment of bands.desert) {
      const abx = segment.bx - segment.ax;
      const abz = segment.bz - segment.az;
      let t = ((x - segment.ax) * abx + (z - segment.az) * abz) / segment.lengthSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (segment.ax + abx * t);
      const dz = z - (segment.az + abz * t);
      if (dx * dx + dz * dz < (segment.half + radius) * (segment.half + radius)) return true;
    }
    return false;
  }

  /** True when `along` lies within `pad` of a span kept clear on this run. */
  function inSpan(run, along, pad = 0) {
    for (let i = 0; i < run.spans.length; i += 1) {
      const span = run.spans[i];
      if (along > span[0] - pad && along < span[1] + pad) return true;
    }
    return false;
  }

  /** Keep a stretch of a run clear of furniture. */
  function reserveSpan(run, from, to) {
    run.spans.push([Math.min(from, to), Math.max(from, to)]);
  }

  /**
   * The sidewalk runs that lie along one edge of a block's lot: edge 'n', 's', 'w' or 'e'.
   * (The run beside the north edge is the south side of the street to the north, and so on.)
   */
  function runsBesideBlockEdge(block, edge) {
    const lot = block.lot;
    const found = [];
    for (const run of sidewalkRuns) {
      const lotLine = run.fixed + run.side * (run.half + walk);
      if (edge === 'n' && run.alongX && run.side > 0 && Math.abs(lotLine - lot.z0) < 1 && run.from < lot.x1 && run.to > lot.x0) found.push(run);
      else if (edge === 's' && run.alongX && run.side < 0 && Math.abs(lotLine - lot.z1) < 1 && run.from < lot.x1 && run.to > lot.x0) found.push(run);
      else if (edge === 'w' && !run.alongX && run.side > 0 && Math.abs(lotLine - lot.x0) < 1 && run.from < lot.z1 && run.to > lot.z0) found.push(run);
      else if (edge === 'e' && !run.alongX && run.side < 0 && Math.abs(lotLine - lot.x1) < 1 && run.from < lot.z1 && run.to > lot.z0) found.push(run);
    }
    return found;
  }

  /** Both sides of every grid road segment, and the median of every boulevard segment. */
  function buildRuns() {
    const probe = { x: 0, z: 0, heading: 0 };
    for (const edge of game.roads.edges) {
      if (!edge.grid) continue;
      const alongX = edge.grid === 'ew';
      const a = edge.a;
      const b = edge.b;
      const fixed = alongX ? a.z : a.x;
      const start = alongX ? a.x : a.z;
      const end = alongX ? b.x : b.z;
      for (const side of [-1, 1]) {
        const outer = alongX
          ? (side < 0 ? fixed <= urban.minZ : fixed >= urban.maxZ)
          : (side < 0 ? fixed <= urban.minX : fixed >= urban.maxX);
        const run = {
          id: sidewalkRuns.length,
          edge,
          name: edge.name,
          kind: edge.kind,
          half: edge.half,
          median: edge.median,
          lanes: edge.lanesEachWay,
          alongX,
          fixed,
          side,
          outer,
          from: start + cornerClearance(a, alongX, side, outer),
          to: end - cornerClearance(b, alongX, side, outer),
          nodeA: a,
          nodeB: b,
          spans: [],
          district: null,
          zone: null,
        };
        const mid = (run.from + run.to) / 2;
        runPoint(run, mid, walk + 8, probe);
        run.zone = city.districtAt(probe.x, probe.z);
        if (outer) {
          const across = run.fixed - side * (run.half + walk + 8);
          run.district = alongX ? city.districtAt(mid, across) : city.districtAt(across, mid);
        } else {
          run.district = run.zone;
        }
        sidewalkRuns.push(run);
      }
      if (edge.median > 0) {
        const mid = (start + end) / 2;
        const px = alongX ? mid : fixed + edge.half + walk + 8;
        const pz = alongX ? fixed + edge.half + walk + 8 : mid;
        medianRuns.push({
          id: medianRuns.length,
          edge,
          name: edge.name,
          alongX,
          fixed,
          half: edge.half,
          median: edge.median,
          from: start + a.trim + 4,
          to: end - b.trim - 4,
          district: city.districtAt(px, pz),
        });
      }
    }
  }

  /** How far a run must stop short of a junction: past the corner square, unless it is an open outer edge. */
  function cornerClearance(node, alongX, side, outer) {
    const crossHalf = alongX ? node.halfNS : node.halfEW;
    if (!outer) return crossHalf + walk + 1;
    for (const e of node.edges) {
      const other = e.a === node ? e.b : e.a;
      const away = alongX ? (other.z - node.z) * side : (other.x - node.x) * side;
      if (away > 1) return e.half + 5;
    }
    const corner = alongX ? (node.x <= urban.minX || node.x >= urban.maxX) : (node.z <= urban.minZ || node.z >= urban.maxZ);
    return corner ? crossHalf + walk + 1 : 1.5;
  }

  /** Keep each stunt ramp, its run-up and its landing clear. */
  function reserveRampApproaches() {
    for (const ramp of city.stuntRamps) {
      const sx = Math.sin(ramp.heading);
      const cz = Math.cos(ramp.heading);
      for (let s = -20; s <= ramp.length + 34; s += 3) take(ramp.x + sx * s, ramp.z + cz * s, ramp.width / 2 + 2.5);
    }
  }

  /** Doors, garage mouths and side-job pickups stay clear, and so do the gates of car and truck lots. */
  function reservePlacesAndDriveways() {
    for (const place of city.places) {
      const drive = !!place.drive;
      take(place.x, place.z, place.kind === 'collectible' ? 1.2 : drive ? 4.5 : 2.2);
      for (const run of sidewalkRuns) {
        const across = run.alongX ? place.z - run.fixed : place.x - run.fixed;
        if (Math.sign(across) !== run.side) continue;
        if (Math.abs(Math.abs(across) - (run.half + walk / 2)) > walk / 2 + 0.6) continue;
        const along = run.alongX ? place.x : place.z;
        if (along < run.from - 25 || along > run.to + 25) continue;
        const pad = drive ? 8 : place.kind === 'collectible' ? 1.5 : 3;
        reserveSpan(run, along - pad, along + pad);
      }
    }
    for (const lot of city.openLots) {
      if (!VEHICLE_LOT_USES.has(lot.use)) continue;
      const block = city.blocks[lot.block];
      if (!block) continue;
      const bl = block.lot;
      const touches = { n: lot.z0 - bl.z0 < 14, s: bl.z1 - lot.z1 < 14, w: lot.x0 - bl.x0 < 14, e: bl.x1 - lot.x1 < 14 };
      for (const edge of ['n', 's', 'w', 'e']) {
        if (!touches[edge]) continue;
        const alongX = edge === 'n' || edge === 's';
        const from = alongX ? lot.x0 + 3 : lot.z0 + 3;
        const to = alongX ? lot.x1 - 3 : lot.z1 - 3;
        for (const run of runsBesideBlockEdge(block, edge)) reserveSpan(run, from, to);
      }
    }
  }
}

/** The carriageway bands of the grid roads and the desert highway segments. */
function buildRoadBands(city) {
  const kinds = city.roadKinds;
  const avenues = city.avenues.map((a) => ({ at: a.x, half: kinds[a.kind].width / 2, median: kinds[a.kind].median }));
  const streets = city.streets.map((s) => ({ at: s.z, half: kinds[s.kind].width / 2, median: kinds[s.kind].median }));
  const desert = [];
  for (const road of city.desertRoads) {
    const half = kinds[road.kind].width / 2;
    for (let i = 0; i < road.points.length - 1; i += 1) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      desert.push({ ax, az, bx, bz, half, lengthSq: (bx - ax) * (bx - ax) + (bz - az) * (bz - az) });
    }
  }
  return {
    avenues,
    streets,
    desert,
    avenueZ0: city.urban.minZ - streets[0].half,
    avenueZ1: city.urban.maxZ + streets[streets.length - 1].half,
    streetX0: city.urban.minX - avenues[0].half,
    streetX1: city.urban.maxX + avenues[avenues.length - 1].half,
  };
}

function cellKey(cx, cz) {
  return (cx + 4096) * 8192 + (cz + 4096);
}
