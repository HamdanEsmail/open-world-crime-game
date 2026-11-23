// The roads out into the Amber Dunes: sun-bleached highways with a yellow-painted median, white lane
// and edge lines and sand blown over their shoulders, and packed-sand tracks with dark tyre ruts. Each
// road follows the plan's polyline with gently rounded bends, joins the city grid cleanly at the
// junction square, and hands back where its kilometre posts and bend chevrons stand.
import { SURFACE } from './groundSurfaceAtlas.js';

const ROAD_Y = 0;
const TRACK_Y = -0.03;
const PAINT_Y = 0.012;
const DRIFT_Y = 0.006;

/**
 * Lay every desert road into the ground builder.
 * @returns {{ signs: {kind:'km'|'chevron', x:number, z:number, heading:number, number?:number}[], centrelines: Object[] }}
 */
export function buildDesertHighways(game, ground) {
  const city = game.city;
  const rng = game.rng.fork('desert-highways');
  const signs = [];
  const centrelines = [];
  for (const road of city.desertRoads) {
    const half = city.roadKinds[road.kind].width / 2;
    const line = roundedCentreline(road.points, half);
    clipAtCityJunction(line, road.points[0], game, true);
    clipAtCityJunction(line, road.points[road.points.length - 1], game, false);
    centrelines.push({ name: road.name, kind: road.kind, half, line });
    if (road.kind === 'highway') {
      layHighway(ground, line, half);
      paintHighway(ground, line, half);
      placeHighwaySigns(line, half, road.points, signs);
    } else {
      layTrack(ground, line, half);
    }
    blowSandOverEdges(ground, line, half, road.kind === 'highway' ? 1.8 : 1.4, rng);
  }
  return { signs, centrelines };
}

/**
 * The centre line of a road as dense stations {x, z, tx, tz, s}: straight runs between the plan's
 * points, each bend rounded with an arc small enough that the lanes never leave the asphalt.
 */
function roundedCentreline(points, half) {
  const corners = [];
  for (let i = 0; i < points.length; i += 1) corners.push({ x: points[i][0], z: points[i][1] });
  const path = [{ x: corners[0].x, z: corners[0].z }];
  for (let i = 1; i < corners.length - 1; i += 1) {
    const p = corners[i];
    const a = corners[i - 1];
    const b = corners[i + 1];
    const la = Math.hypot(p.x - a.x, p.z - a.z);
    const lb = Math.hypot(b.x - p.x, b.z - p.z);
    const d0x = (p.x - a.x) / la;
    const d0z = (p.z - a.z) / la;
    const d1x = (b.x - p.x) / lb;
    const d1z = (b.z - p.z) / lb;
    const turn = Math.acos(Math.max(-1, Math.min(1, d0x * d1x + d0z * d1z)));
    if (turn < 0.02) {
      path.push({ x: p.x, z: p.z });
      continue;
    }
    const bulge = 1 / Math.cos(turn / 2) - 1;
    let radius = Math.min(70, (2.2 + half * 0.1) / Math.max(bulge, 1e-4));
    let tangent = radius * Math.tan(turn / 2);
    const limit = 0.42 * Math.min(la, lb);
    if (tangent > limit) {
      tangent = limit;
      radius = tangent / Math.tan(turn / 2);
    }
    const sx = p.x - d0x * tangent;
    const sz = p.z - d0z * tangent;
    const cross = d0x * d1z - d0z * d1x;
    const nx = cross > 0 ? -d0z : d0z;
    const nz = cross > 0 ? d0x : -d0x;
    const cx = sx + nx * radius;
    const cz = sz + nz * radius;
    const startAngle = Math.atan2(sx - cx, sz - cz);
    const steps = Math.max(2, Math.ceil((turn * radius) / 6));
    const direction = cross > 0 ? -1 : 1;
    for (let k = 0; k <= steps; k += 1) {
      const angle = startAngle + direction * turn * (k / steps);
      path.push({ x: cx + Math.sin(angle) * radius, z: cz + Math.cos(angle) * radius, bend: turn });
    }
  }
  path.push({ x: corners[corners.length - 1].x, z: corners[corners.length - 1].z });
  const dense = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const pieces = Math.max(1, Math.round(length / 30));
    for (let k = 0; k < pieces; k += 1) dense.push({ x: a.x + ((b.x - a.x) * k) / pieces, z: a.z + ((b.z - a.z) * k) / pieces, bend: a.bend || 0 });
  }
  dense.push({ ...path[path.length - 1] });
  let s = 0;
  for (let i = 0; i < dense.length; i += 1) {
    const prev = dense[Math.max(0, i - 1)];
    const next = dense[Math.min(dense.length - 1, i + 1)];
    const length = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
    dense[i].tx = (next.x - prev.x) / length;
    dense[i].tz = (next.z - prev.z) / length;
    if (i > 0) s += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
    dense[i].s = s;
  }
  return dense;
}

/**
 * Where a road leaves a city junction, start its asphalt exactly on the edge of the junction square,
 * cut square to that edge, so the two surfaces meet without overlap or gap.
 */
function clipAtCityJunction(line, point, game, atStart) {
  const node = game.roads.nodes.find((n) => n.x === point[0] && n.z === point[1]);
  if (!node || !(node.halfNS > 0)) return;
  const end = atStart ? line[0] : line[line.length - 1];
  const next = atStart ? line[1] : line[line.length - 2];
  const dx = next.x - end.x;
  const dz = next.z - end.z;
  if (Math.abs(dz) >= Math.abs(dx)) {
    end.clipZ = node.z + Math.sign(dz) * node.halfEW;
  } else {
    end.clipX = node.x + Math.sign(dx) * node.halfNS;
  }
}

/** The position of a point `offset` metres to the left of a station, slid along the road onto any clip line. */
function sideOf(station, offset, out) {
  const nx = -station.tz;
  const nz = station.tx;
  let x = station.x + nx * offset;
  let z = station.z + nz * offset;
  if (station.clipZ !== undefined && Math.abs(station.tz) > 0.2) {
    const k = (station.clipZ - z) / station.tz;
    x += station.tx * k;
    z += station.tz * k;
  } else if (station.clipX !== undefined && Math.abs(station.tx) > 0.2) {
    const k = (station.clipX - x) / station.tx;
    x += station.tx * k;
    z += station.tz * k;
  }
  out.x = x;
  out.z = z;
  return out;
}

/** Highway tarmac: sun-bleached, darker in the wheel paths of each lane, dusty toward the shoulders. */
function layHighway(ground, line, half) {
  const profile = [[-half, 0.86], [-8, 1.02], [-6.6, 0.94], [-3.4, 0.94], [-1, 1.04], [1, 1.04], [3.4, 0.94], [6.6, 0.94], [8, 1.02], [half, 0.86]];
  const tint = ground.tintOf(0xf2ece4);
  const point = { x: 0, z: 0 };
  ground.grid('base', SURFACE.ASPHALT_BLEACHED, line.length, profile.length, (i, j, out) => {
    sideOf(line[i], profile[j][0], point);
    out.x = point.x;
    out.z = point.z;
    out.y = ROAD_Y;
    out.u = out.x / 4;
    out.v = out.z / 4;
    const shade = profile[j][1] * ground.wobble(out.x, out.z, 0.08);
    out.r = tint[0] * shade;
    out.g = tint[1] * shade;
    out.b = tint[2] * shade;
  }, line[Math.floor(line.length / 2)].x, line[Math.floor(line.length / 2)].z);
}

/** A packed-sand track with two dark ruts down each lane, its texture streaked along the way. */
function layTrack(ground, line, half) {
  const profile = [[-half, 1.08], [-3.1, 1.04], [-2.6, 0.9], [-2.0, 1.0], [-1.4, 0.9], [-0.9, 1.04], [0.9, 1.04], [1.4, 0.9], [2.0, 1.0], [2.6, 0.9], [3.1, 1.04], [half, 1.08]];
  const tint = ground.tintOf(0xfffaf0);
  const point = { x: 0, z: 0 };
  ground.grid('base', SURFACE.DIRT, line.length, profile.length, (i, j, out) => {
    sideOf(line[i], profile[j][0], point);
    out.x = point.x;
    out.z = point.z;
    out.y = TRACK_Y;
    out.u = line[i].s / 4;
    out.v = profile[j][0] / 4;
    const shade = profile[j][1] * ground.wobble(out.x, out.z, 0.1);
    out.r = tint[0] * shade;
    out.g = tint[1] * shade;
    out.b = tint[2] * shade;
  }, line[Math.floor(line.length / 2)].x, line[Math.floor(line.length / 2)].z);
}

/** Highway paint: two yellow lines and chevron hatching down the median, dashed lane lines, solid edges. */
function paintHighway(ground, line, half) {
  const yellow = { tint: 0xf2be2a, jitter: 0.04 };
  const white = { tint: 0xfffaf0, jitter: 0.04 };
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 0 };
  const solid = (offset, width, options) => {
    for (let i = 0; i < line.length - 1; i += 1) {
      sideOf(line[i], offset, a);
      sideOf(line[i + 1], offset, b);
      ground.bar('paint', a.x, a.z, b.x, b.z, width, PAINT_Y, SURFACE.PAINT, options);
    }
  };
  solid(0.95, 0.15, yellow);
  solid(-0.95, 0.15, yellow);
  solid(8.05, 0.18, white);
  solid(-8.05, 0.18, white);
  const total = line[line.length - 1].s;
  const at = (s, offset, out) => {
    let i = 0;
    while (i < line.length - 2 && line[i + 1].s < s) i += 1;
    const p = line[i];
    const q = line[i + 1];
    const t = q.s > p.s ? (s - p.s) / (q.s - p.s) : 0;
    const station = { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, tx: p.tx + (q.tx - p.tx) * t, tz: p.tz + (q.tz - p.tz) * t };
    const length = Math.hypot(station.tx, station.tz) || 1;
    station.tx /= length;
    station.tz /= length;
    return sideOf(station, offset, out);
  };
  for (let s = 18; s < total - 12; s += 12) {
    for (const offset of [4.5, -4.5]) {
      at(s, offset, a);
      at(s + 4, offset, b);
      ground.bar('paint', a.x, a.z, b.x, b.z, 0.15, PAINT_Y, SURFACE.PAINT, white);
    }
    if (Math.round(s / 12) % 2 === 0) {
      at(s, -0.8, a);
      at(s + 1.4, 0.8, b);
      ground.bar('paint', a.x, a.z, b.x, b.z, 0.28, PAINT_Y, SURFACE.PAINT, yellow);
    }
  }
}

/** Kilometre posts every half kilometre and chevron boards on the outside of each sharp bend. */
function placeHighwaySigns(line, half, points, signs) {
  const total = line[line.length - 1].s;
  let next = 500;
  let side = 1;
  for (let i = 1; i < line.length && next < total; i += 1) {
    if (line[i].s < next) continue;
    const p = line[i];
    signs.push({ kind: 'km', x: p.x - p.tz * (half + 2.2) * side, z: p.z + p.tx * (half + 2.2) * side, heading: Math.atan2(p.tx, p.tz), number: next / 1000 });
    next += 500;
    side = -side;
  }
  for (let i = 1; i < points.length - 1; i += 1) {
    const [ax, az] = points[i - 1];
    const [px, pz] = points[i];
    const [bx, bz] = points[i + 1];
    const d0x = px - ax;
    const d0z = pz - az;
    const d1x = bx - px;
    const d1z = bz - pz;
    const l0 = Math.hypot(d0x, d0z);
    const l1 = Math.hypot(d1x, d1z);
    const turn = Math.acos(Math.max(-1, Math.min(1, (d0x * d1x + d0z * d1z) / (l0 * l1))));
    if (turn < 0.45) continue;
    const cross = d0x * d1z - d0z * d1x;
    const outward = cross > 0 ? 1 : -1;
    const ox = (d0x / l0 - d1x / l1);
    const oz = (d0z / l0 - d1z / l1);
    const ol = Math.hypot(ox, oz) || 1;
    for (let k = -2; k <= 2; k += 1) {
      const angle = Math.atan2(ox, oz) + k * 0.22 * outward;
      const r = half + 7;
      signs.push({ kind: 'chevron', x: px + (ox / ol) * 2 + Math.sin(angle) * r, z: pz + (oz / ol) * 2 + Math.cos(angle) * r, heading: angle + Math.PI, outward });
    }
  }
}

/** Ragged tongues of wind-blown sand creeping over both edges of a desert road. */
function blowSandOverEdges(ground, line, half, reach, rng) {
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 0 };
  const c = { x: 0, z: 0 };
  const d = { x: 0, z: 0 };
  for (const side of [-1, 1]) {
    let inner = rng.range(0.3, reach);
    for (let i = 0; i < line.length - 1; i += 1) {
      const next = rng.range(0.2, reach);
      const steps = Math.max(1, Math.round((line[i + 1].s - line[i].s) / 11));
      for (let k = 0; k < steps; k += 1) {
        const t0 = k / steps;
        const t1 = (k + 1) / steps;
        const w0 = inner + (next - inner) * t0 + Math.sin((line[i].s + k * 11) * 0.37) * 0.35;
        const w1 = inner + (next - inner) * t1 + Math.sin((line[i].s + (k + 1) * 11) * 0.37) * 0.35;
        const s0 = lerpStation(line[i], line[i + 1], t0);
        const s1 = lerpStation(line[i], line[i + 1], t1);
        sideOf(s0, side * (half - w0), a);
        sideOf(s1, side * (half - w1), b);
        sideOf(s1, side * (half + 1.6), c);
        sideOf(s0, side * (half + 1.6), d);
        ground.polygon('paint', [[a.x, a.z], [b.x, b.z], [c.x, c.z], [d.x, d.z]], DRIFT_Y, SURFACE.SAND, { tint: 0xf8dcb0, jitter: 0.04, scale: 1 });
      }
      inner = next;
    }
  }
}

function lerpStation(p, q, t) {
  const station = { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, tx: p.tx + (q.tx - p.tx) * t, tz: p.tz + (q.tz - p.tz) * t };
  if (t === 0 && p.clipX !== undefined) station.clipX = p.clipX;
  if (t === 0 && p.clipZ !== undefined) station.clipZ = p.clipZ;
  if (t === 1 && q.clipX !== undefined) station.clipX = q.clipX;
  if (t === 1 && q.clipZ !== undefined) station.clipZ = q.clipZ;
  const length = Math.hypot(station.tx, station.tz) || 1;
  station.tx /= length;
  station.tz /= length;
  return station;
}
