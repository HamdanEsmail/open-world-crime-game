// The streets of Port Sarab: asphalt on every road of the grid with lighter worn wheel paths and dark
// gutters, clean intersection squares, raised planted medians down the boulevards, and 5 m sidewalks
// of pale stone pavers behind granite kerbs that drop flush to the road at every crossing.
import { SURFACE, SURFACE_METRES } from './groundSurfaceAtlas.js';

/**
 * Heights of the street surfaces, metres. Sidewalks and block floors stand where game.terrain says
 * people walk (its sidewalkHeight); crossings stay flush with the walk so feet never float. Set from
 * the terrain by applyStreetLevels() before anything is built.
 */
export const STREET_LEVELS = { road: 0, sidewalk: 0.14, dropped: 0.14, median: 0.16 };

/** Take the kerb height from game.terrain, the one place that decides it. */
export function applyStreetLevels(game) {
  const kerb = game.terrain && Number.isFinite(game.terrain.sidewalkHeight) ? game.terrain.sidewalkHeight : 0.14;
  STREET_LEVELS.sidewalk = kerb;
  STREET_LEVELS.dropped = kerb;
  STREET_LEVELS.median = kerb + 0.02;
  return STREET_LEVELS;
}

/** Where crossings and stop lines sit, measured from the edge of the crossing road. */
export const CROSSING = { start: 0.6, end: 4.4, stopLine: 5.0, medianNose: 6.0 };

const SIDEWALK = 5;
const KERB_BAND = 0.32;
const RAMP = 1.6;
const ASPHALT_TINT = 0xf6f3f0;

/**
 * Lay the asphalt, sidewalks, kerbs and medians of the street grid into the ground builder.
 * Returns the layout the road markings follow: { crosswalks, medians }.
 */
export function buildRoadSurfaces(game, ground) {
  const city = game.city;
  const roads = game.roads;
  const layout = { crosswalks: collectCrosswalks(roads), medians: [] };
  for (const edge of roads.edges) if (edge.grid) layStreetAsphalt(ground, edge, city);
  for (const node of roads.nodes) if (node.halfNS > 0) layIntersectionSquare(ground, node);
  for (const block of city.blocks) laySidewalkFrame(ground, block, city);
  layOuterSidewalks(ground, game, layout);
  for (const edge of roads.edges) {
    if (edge.grid && edge.kind === 'boulevard') layout.medians.push(layMedian(ground, edge, city));
  }
  return layout;
}

/** One road segment of the grid as a grid of shared vertices: wheel paths, oil streaks and gutters shaded in. */
function layStreetAsphalt(ground, edge, city) {
  const alongX = edge.grid === 'ew';
  const profile = profileFor(edge.half);
  const start = (alongX ? edge.a.x + edge.a.halfNS : edge.a.z + edge.a.halfEW);
  const end = (alongX ? edge.b.x - edge.b.halfNS : edge.b.z - edge.b.halfEW);
  const stations = evenStations(start, end, 60);
  const centre = alongX ? edge.a.z : edge.a.x;
  const district = city.districtAt(alongX ? (start + end) / 2 : centre, alongX ? centre : (start + end) / 2);
  const tint = ground.tintOf(asphaltTintFor(district));
  ground.grid('base', SURFACE.ASPHALT, stations.length, profile.length, (i, j, out) => {
    const s = stations[i];
    const offset = profile[j][0];
    out.x = alongX ? s : centre + offset;
    out.z = alongX ? centre + offset : s;
    out.y = STREET_LEVELS.road;
    out.u = out.x / 4;
    out.v = out.z / 4;
    const shade = profile[j][1] * ground.wobble(out.x, out.z, 0.07);
    out.r = tint[0] * shade;
    out.g = tint[1] * shade;
    out.b = tint[2] * shade;
  });
}

/** The square of asphalt where two grid roads cross, darker and oilier toward its middle. */
function layIntersectionSquare(ground, node) {
  const tint = ground.tintOf(ASPHALT_TINT);
  const offsets = [-1, -0.45, 0, 0.45, 1];
  ground.grid('base', SURFACE.ASPHALT, offsets.length, offsets.length, (i, j, out) => {
    out.x = node.x + offsets[j] * node.halfNS;
    out.z = node.z + offsets[i] * node.halfEW;
    out.y = STREET_LEVELS.road;
    out.u = out.x / 4;
    out.v = out.z / 4;
    const r = Math.max(Math.abs(offsets[i]), Math.abs(offsets[j]));
    const shade = (r > 0.99 ? 0.97 : 0.92 + 0.06 * r) * ground.wobble(out.x, out.z, 0.06);
    out.r = tint[0] * shade;
    out.g = tint[1] * shade;
    out.b = tint[2] * shade;
  });
}

/** The sidewalk ring around one block: four dropped corners where the crossings land, four raised runs. */
function laySidewalkFrame(ground, block, city) {
  const lot = block.lot;
  const x0 = lot.x0 - SIDEWALK;
  const x1 = lot.x1 + SIDEWALK;
  const z0 = lot.z0 - SIDEWALK;
  const z1 = lot.z1 + SIDEWALK;
  const style = sidewalkStyleFor(city.districtById[block.district]);
  layDroppedCorner(ground, x0, z0, 1, 1, style);
  layDroppedCorner(ground, x1, z0, -1, 1, style);
  layDroppedCorner(ground, x0, z1, 1, -1, style);
  layDroppedCorner(ground, x1, z1, -1, -1, style);
  const endsX = [[x0, x0 + SIDEWALK], [x1 - SIDEWALK, x1]];
  const endsZ = [[z0, z0 + SIDEWALK], [z1 - SIDEWALK, z1]];
  laySidewalkRun(ground, { axis: 'x', kerb: z0, inward: 1, s0: x0 + SIDEWALK, s1: x1 - SIDEWALK, dips: endsX, back: 'step', style });
  laySidewalkRun(ground, { axis: 'x', kerb: z1, inward: -1, s0: x0 + SIDEWALK, s1: x1 - SIDEWALK, dips: endsX, back: 'step', style });
  laySidewalkRun(ground, { axis: 'z', kerb: x0, inward: 1, s0: z0 + SIDEWALK, s1: z1 - SIDEWALK, dips: endsZ, back: 'step', style });
  laySidewalkRun(ground, { axis: 'z', kerb: x1, inward: -1, s0: z0 + SIDEWALK, s1: z1 - SIDEWALK, dips: endsZ, back: 'step', style });
}

/** A 5 m corner square sunk flush with the road, kerb stone along its two road edges. */
function layDroppedCorner(ground, cx, cz, sx, sz, style) {
  const y = STREET_LEVELS.dropped;
  const fx = cx + sx * SIDEWALK;
  const fz = cz + sz * SIDEWALK;
  const kx = cx + sx * KERB_BAND;
  const kz = cz + sz * KERB_BAND;
  ground.rect('base', Math.min(kx, fx), Math.min(kz, fz), Math.max(kx, fx), Math.max(kz, fz), y, style.surface, { tint: style.tint, scale: style.scale, jitter: 0.05 });
  ground.rect('base', Math.min(cx, fx), Math.min(cz, kz), Math.max(cx, fx), Math.max(cz, kz), y, SURFACE.KERB, { tint: 0xf4f2ee, jitter: 0.04 });
  ground.rect('base', Math.min(cx, kx), Math.min(kz, fz), Math.max(cx, kx), Math.max(kz, fz), y, SURFACE.KERB, { tint: 0xf4f2ee, jitter: 0.04, rotate: true });
  faceToward(ground, cx, cz, fx, cz, -0.05, y, -0.05, y, 0, -sz, SURFACE.KERB, 0xd8d4cc);
  faceToward(ground, cx, cz, cx, fz, -0.05, y, -0.05, y, -sx, 0, SURFACE.KERB, 0xd8d4cc);
}

/**
 * A straight run of raised sidewalk along a kerb line.
 * run: { axis 'x'|'z', kerb (the kerb line), inward (+1/-1 toward the walk), s0, s1, dips [[a, b]],
 *        back 'step' (meets a raised block floor) | 'skirt' (meets open sand), style, endFaces }
 */
function laySidewalkRun(ground, run) {
  if (run.s1 - run.s0 < 0.05) return;
  const { axis, kerb, inward } = run;
  const width = run.width || SIDEWALK;
  const dips = run.dips || [];
  const topAt = (s) => sidewalkTopAt(s, dips);
  const stations = runStations(run.s0, run.s1, dips);
  const pointX = (s, across) => (axis === 'x' ? s : kerb + inward * across);
  const pointZ = (s, across) => (axis === 'x' ? kerb + inward * across : s);
  const style = run.style;
  const kerbTint = ground.tintOf(0xf6f4f0);
  const walkTint = ground.tintOf(style.tint);
  const bands = [[0, KERB_BAND, SURFACE.KERB, kerbTint, 1], [KERB_BAND, width, style.surface, walkTint, style.scale]];
  for (const [inner, outer, surface, tint, scale] of bands) {
    const metres = scale * SURFACE_METRES[surface];
    ground.grid('base', surface, stations.length, 2, (i, j, out) => {
      const s = stations[i];
      const across = j === 0 ? inner : outer;
      out.x = pointX(s, across);
      out.z = pointZ(s, across);
      out.y = topAt(s);
      out.u = (axis === 'x' ? out.x : out.z) / metres;
      out.v = (axis === 'x' ? out.z : out.x) / metres;
      const shade = ground.wobble(out.x, out.z, 0.06);
      out.r = tint[0] * shade;
      out.g = tint[1] * shade;
      out.b = tint[2] * shade;
    });
  }
  const toRoadX = axis === 'x' ? 0 : -inward;
  const toRoadZ = axis === 'x' ? -inward : 0;
  const corners = runStations(run.s0, run.s1, dips, 0);
  for (let i = 0; i < corners.length - 1; i += 1) {
    const sa = corners[i];
    const sb = corners[i + 1];
    const ta = topAt(sa);
    const tb = topAt(sb);
    faceToward(ground, pointX(sa, 0), pointZ(sa, 0), pointX(sb, 0), pointZ(sb, 0), -0.05, ta, -0.05, tb, toRoadX, toRoadZ, SURFACE.KERB, 0xdcd8d0);
    if (run.back === 'step' && (ta < STREET_LEVELS.sidewalk - 0.001 || tb < STREET_LEVELS.sidewalk - 0.001)) {
      faceToward(ground, pointX(sa, width), pointZ(sa, width), pointX(sb, width), pointZ(sb, width), ta, STREET_LEVELS.sidewalk, tb, STREET_LEVELS.sidewalk, toRoadX, toRoadZ, style.surface, style.tint);
    } else if (run.back === 'skirt') {
      faceToward(ground, pointX(sa, width), pointZ(sa, width), pointX(sb, width), pointZ(sb, width), -0.65, ta, -0.65, tb, -toRoadX, -toRoadZ, SURFACE.KERB, 0xd2cec6);
    }
  }
  if (run.endFaces) {
    for (const [s, sign] of [[run.s0, -1], [run.s1, 1]]) {
      const top = topAt(s);
      faceToward(ground, pointX(s, 0), pointZ(s, 0), pointX(s, width), pointZ(s, width), -0.65, top, -0.65, top,
        axis === 'x' ? sign : 0, axis === 'x' ? 0 : sign, SURFACE.KERB, 0xd2cec6);
    }
  }
}

/**
 * The sidewalks on the outer side of the four ring roads: the seafront promenade on the Corniche and
 * the edge of the dunes. They dip at the crossings and stop where the desert highways leave the grid.
 */
function layOuterSidewalks(ground, game, layout) {
  const city = game.city;
  const kinds = city.roadKinds;
  const west = city.avenues[0];
  const east = city.avenues[city.avenues.length - 1];
  const north = city.streets[0];
  const south = city.streets[city.streets.length - 1];
  const wHalf = kinds[west.kind].width / 2;
  const eHalf = kinds[east.kind].width / 2;
  const nHalf = kinds[north.kind].width / 2;
  const sHalf = kinds[south.kind].width / 2;
  const minX = west.x - wHalf - SIDEWALK;
  const maxX = east.x + eHalf + SIDEWALK;
  const minZ = north.z - nHalf - SIDEWALK;
  const maxZ = south.z + sHalf + SIDEWALK;
  const runs = [
    { axis: 'x', kerb: north.z - nHalf, inward: -1, s0: minX, s1: maxX, style: { surface: SURFACE.PAVERS, tint: 0xfff2dc, scale: 1 } },
    { axis: 'x', kerb: south.z + sHalf, inward: 1, s0: minX, s1: maxX, style: { surface: SURFACE.PAVERS, tint: 0xf2e6d2, scale: 1 } },
    { axis: 'z', kerb: west.x - wHalf, inward: -1, s0: minZ + SIDEWALK, s1: maxZ - SIDEWALK, style: { surface: SURFACE.PAVERS, tint: 0xf2e6d2, scale: 1 } },
    { axis: 'z', kerb: east.x + eHalf, inward: 1, s0: minZ + SIDEWALK, s1: maxZ - SIDEWALK, style: { surface: SURFACE.PAVERS, tint: 0xf2e6d2, scale: 1 } },
  ];
  for (const run of runs) {
    run.dips = [];
    for (const crossing of layout.crosswalks) {
      for (const landing of crossing.landings) {
        if (landing.axis === run.axis && Math.abs(landing.line - run.kerb) < 0.01) run.dips.push([landing.a, landing.b]);
      }
    }
    for (const piece of uncutPieces(run, game)) {
      laySidewalkRun(ground, { ...run, s0: piece[0], s1: piece[1], back: 'skirt', endFaces: true });
    }
  }
}

/** The stretches of an outer sidewalk run not crossed by a desert road. */
function uncutPieces(run, game) {
  const roads = game.city.desertRoads;
  const kinds = game.city.roadKinds;
  const pieces = [];
  let open = null;
  const step = 0.5;
  for (let s = run.s0; s <= run.s1 + 0.0001; s += step) {
    const x = run.axis === 'x' ? s : run.kerb + run.inward * SIDEWALK * 0.5;
    const z = run.axis === 'x' ? run.kerb + run.inward * SIDEWALK * 0.5 : s;
    let blocked = false;
    for (const road of roads) {
      const half = kinds[road.kind].width / 2 + 2.5 + SIDEWALK * 0.5;
      for (let i = 0; i < road.points.length - 1 && !blocked; i += 1) {
        const [ax, az] = road.points[i];
        const [bx, bz] = road.points[i + 1];
        if (game.math.distanceToSegment2D(x, z, ax, az, bx, bz) < half) blocked = true;
      }
      if (blocked) break;
    }
    if (!blocked && open === null) open = s;
    if (blocked && open !== null) {
      if (s - step - open > 1) pieces.push([open, s - step]);
      open = null;
    }
  }
  if (open !== null && run.s1 - open > 1) pieces.push([open, run.s1]);
  return pieces;
}

/** A raised 4 m median down a boulevard: granite kerbs, rounded noses, lawn and low clipped hedges. */
function layMedian(ground, edge, city) {
  const alongX = edge.grid === 'ew';
  const half = edge.median / 2;
  const start = (alongX ? edge.a.x + edge.a.halfNS : edge.a.z + edge.a.halfEW) + CROSSING.medianNose;
  const end = (alongX ? edge.b.x - edge.b.halfNS : edge.b.z - edge.b.halfEW) - CROSSING.medianNose;
  const centre = alongX ? edge.a.z : edge.a.x;
  const district = city.districtAt(alongX ? (start + end) / 2 : centre, alongX ? centre : (start + end) / 2);
  const planted = district.kind !== 'oldtown' && district.kind !== 'docks';
  const top = STREET_LEVELS.median;
  const rect = (s0, s1, a0, a1, surface, tint, layer = 'base') => {
    if (alongX) ground.rect(layer, s0, centre + a0, s1, centre + a1, top, surface, { tint, jitter: 0.06, cell: 45 });
    else ground.rect(layer, centre + a0, s0, centre + a1, s1, top, surface, { tint, jitter: 0.06, rotate: true, cell: 45 });
  };
  const sA = start + half;
  const sB = end - half;
  rect(sA, sB, -half, -half + 0.3, SURFACE.KERB, 0xf4f2ee);
  rect(sA, sB, half - 0.3, half, SURFACE.KERB, 0xf4f2ee);
  if (planted) rect(sA, sB, -half + 0.3, half - 0.3, SURFACE.LAWN, district.kind === 'beach' || district.kind === 'marina' ? 0xf0ffe8 : 0xe6f2dc);
  else rect(sA, sB, -half + 0.3, half - 0.3, district.kind === 'oldtown' ? SURFACE.COBBLES : SURFACE.CONCRETE, 0xf0e8dc);
  const point = (s, a) => (alongX ? [s, centre + a] : [centre + a, s]);
  for (const sign of [-1, 1]) {
    const [ax, az] = point(sA, sign * half);
    const [bx, bz] = point(sB, sign * half);
    faceToward(ground, ax, az, bx, bz, -0.05, top, -0.05, top, alongX ? 0 : sign, alongX ? sign : 0, SURFACE.KERB, 0xdcd8d0);
  }
  for (const [cs, dir] of [[sA, -1], [sB, 1]]) {
    const fan = [];
    const segments = 8;
    for (let k = 0; k <= segments; k += 1) {
      const angle = (k / segments) * Math.PI;
      const along = cs + dir * Math.sin(angle) * half;
      const across = Math.cos(angle) * half;
      fan.push(point(along, across));
    }
    ground.polygon('base', fan, top, SURFACE.KERB, { tint: 0xf4f2ee, jitter: 0.03 });
    for (let k = 0; k < segments; k += 1) {
      const [px, pz] = fan[k];
      const [qx, qz] = fan[k + 1];
      const mx = (px + qx) / 2 - point(cs, 0)[0];
      const mz = (pz + qz) / 2 - point(cs, 0)[1];
      faceToward(ground, px, pz, qx, qz, -0.05, top, -0.05, top, mx, mz, SURFACE.KERB, 0xdcd8d0);
    }
  }
  if (planted) layMedianHedges(ground, alongX, centre, sA, sB, district);
  return { alongX, centre, start, end, half, district: district.id, planted };
}

/** Low clipped hedges in segments, leaving gaps where palms and lamp posts can stand. */
function layMedianHedges(ground, alongX, centre, s0, s1, district) {
  const segment = 13;
  const gap = 4;
  const flowering = district.kind === 'beach' || district.kind === 'marina' || district.kind === 'villas' || district.kind === 'strip';
  let index = 0;
  for (let s = s0 + 3; s + segment <= s1 - 2; s += segment + gap) {
    const blossom = flowering && index % 3 === 1;
    const tint = blossom ? 0xff5fb4 : 0xd8f0c0;
    const surface = blossom ? SURFACE.PAINT : SURFACE.LAWN;
    const h = STREET_LEVELS.median + 0.42;
    if (alongX) ground.box('solid', s, centre - 0.65, s + segment, centre + 0.65, STREET_LEVELS.median, h, surface, surface, { tint, sideTint: tint, jitter: 0.1, shadeBottom: 0.7 });
    else ground.box('solid', centre - 0.65, s, centre + 0.65, s + segment, STREET_LEVELS.median, h, surface, surface, { tint, sideTint: tint, jitter: 0.1, shadeBottom: 0.7, rotate: true });
    index += 1;
  }
}

/**
 * Every zebra crossing of the grid: one across each grid arm of each intersection, as the continuation
 * of the crossing road's sidewalk. landings name where it meets the kerb on either side.
 */
function collectCrosswalks(roads) {
  const crosswalks = [];
  for (const node of roads.nodes) {
    if (!(node.halfNS > 0)) continue;
    for (const edge of node.edges) {
      if (!edge.grid) continue;
      const other = edge.a === node ? edge.b : edge.a;
      const alongX = edge.grid === 'ew';
      const sign = alongX ? Math.sign(other.x - node.x) : Math.sign(other.z - node.z);
      const crossHalf = alongX ? node.halfNS : node.halfEW;
      const near = crossHalf + CROSSING.start;
      const far = crossHalf + CROSSING.end;
      const base = alongX ? node.x : node.z;
      const a = base + sign * (sign > 0 ? near : far);
      const b = base + sign * (sign > 0 ? far : near);
      const side = alongX ? node.z : node.x;
      crosswalks.push({
        node, edge, alongX, sign, crossHalf, half: edge.half, median: edge.median,
        from: Math.min(a, b), to: Math.max(a, b), line: side,
        landings: [
          { axis: alongX ? 'x' : 'z', line: side - edge.half, a: Math.min(a, b), b: Math.max(a, b) },
          { axis: alongX ? 'x' : 'z', line: side + edge.half, a: Math.min(a, b), b: Math.max(a, b) },
        ],
      });
    }
  }
  return crosswalks;
}

/** A vertical face between two points, oriented to face (nx, nz). */
function faceToward(ground, x0, z0, x1, z1, bottom0, top0, bottom1, top1, nx, nz, surface, tint) {
  const fx = z1 - z0;
  const fz = -(x1 - x0);
  if (fx * nx + fz * nz >= 0) ground.face('base', x0, z0, x1, z1, bottom0, top0, bottom1, top1, surface, { tint, jitter: 0.04, shadeBottom: 0.72 });
  else ground.face('base', x1, z1, x0, z0, bottom1, top1, bottom0, top0, surface, { tint, jitter: 0.04, shadeBottom: 0.72 });
}

/** The height of a sidewalk run's top at s: flush inside a dip, ramping up over RAMP outside it. */
function sidewalkTopAt(s, dips) {
  const { sidewalk, dropped } = STREET_LEVELS;
  let lowest = sidewalk;
  for (const [a, b] of dips) {
    let t;
    if (s >= a && s <= b) t = 1;
    else if (s < a) t = 1 - (a - s) / RAMP;
    else t = 1 - (s - b) / RAMP;
    if (t > 0) lowest = Math.min(lowest, sidewalk - (sidewalk - dropped) * Math.min(1, t));
  }
  return lowest;
}

/** Stations along a sidewalk run: its ends, every ramp corner, and a vertex every `spacing` metres (0: none). */
function runStations(s0, s1, dips, spacing = 40) {
  const list = [s0, s1];
  for (const [a, b] of dips) list.push(a - RAMP, a, b, b + RAMP);
  if (spacing > 0) for (let s = s0 + spacing; s < s1 - spacing / 2; s += spacing) list.push(s);
  const sorted = list.filter((s) => s >= s0 - 0.0001 && s <= s1 + 0.0001).sort((p, q) => p - q);
  const out = [];
  for (const s of sorted) if (out.length === 0 || s - out[out.length - 1] > 0.02) out.push(s);
  return out;
}

function evenStations(start, end, spacing) {
  const count = Math.max(1, Math.round((end - start) / spacing));
  const list = [];
  for (let i = 0; i <= count; i += 1) list.push(start + ((end - start) * i) / count);
  return list;
}

/**
 * Cross-section of a road as [offset from the centre line, shade]: gutters dark, wheel paths polished
 * lighter, an oil streak down the middle of each lane.
 */
function profileFor(half) {
  const sideOfStreet = [[-7.5, 0.82], [-7.05, 0.95], [-6.1, 0.93], [-4.75, 1], [-2.6, 1.08], [-1.75, 0.95], [-0.9, 1.08]];
  const sideOfBoulevard = [[-14, 0.82], [-13.45, 0.95], [-8.05, 1.07], [-7.25, 0.95], [-6.45, 1.07], [-4.55, 1.07], [-3.75, 0.95], [-2.95, 1.07], [-2, 0.97]];
  const side = half > 10 ? sideOfBoulevard : sideOfStreet;
  const scale = half / -side[0][0];
  const list = side.map(([o, s]) => [o * scale, s]);
  list.push([0, 1]);
  for (let i = side.length - 1; i >= 0; i -= 1) list.push([-side[i][0] * scale, side[i][1]]);
  return list;
}

function asphaltTintFor(district) {
  if (!district) return ASPHALT_TINT;
  if (district.kind === 'docks' || district.kind === 'southgate') return 0xf4eee6;
  if (district.kind === 'oldtown') return 0xf8f0e8;
  return ASPHALT_TINT;
}

/** The paving of a district's sidewalks: swatch, tint and scale. */
function sidewalkStyleFor(district) {
  switch (district && district.kind) {
    case 'downtown': return { surface: SURFACE.PAVERS, tint: 0xf6f4f2, scale: 1 };
    case 'marina': return { surface: SURFACE.PAVERS, tint: 0xfff6e6, scale: 1 };
    case 'oldtown': return { surface: SURFACE.PAVERS, tint: 0xf8dcb8, scale: 1.2 };
    case 'docks': return { surface: SURFACE.CONCRETE, tint: 0xe2e0dc, scale: 0.375 };
    case 'villas': return { surface: SURFACE.PAVERS, tint: 0xfff0dc, scale: 1 };
    case 'strip': return { surface: SURFACE.PAVERS, tint: 0xe8d8d4, scale: 1 };
    case 'flats': return { surface: SURFACE.CONCRETE, tint: 0xf0ece4, scale: 0.375 };
    default: return { surface: SURFACE.CONCRETE, tint: 0xe8e2d8, scale: 0.375 };
  }
}
