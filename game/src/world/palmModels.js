// The palms and planting of Port Sarab as low-poly models: the tall date palm with its ringed, gently
// curved trunk and full crown of arched, drooping fronds (a near and a far version), a short bushy fan
// palm, shrubs, flower beds and blossoming trees, all cut from one painted foliage atlas.
import { createShapeBuilder } from './propShapes.js';
import { FOLIAGE_REGIONS } from './palmFoliageAtlas.js';

/**
 * The date palm: an 8.4 m trunk leaning gently, a woody boot, and a crown of 12 fronds in four ages
 * (young upright, full arching, old drooping, one dry and hanging) with clusters of dates beneath.
 * lod 'near' is about 500 triangles; 'far' about 50 with fatter fronds that hold up at a distance;
 * 'distant' about 30, for the palms that are a few pixels tall across the city.
 */
export function buildDatePalmGeometry(lod = 'near') {
  const near = lod === 'near';
  const distant = lod === 'distant';
  const b = createShapeBuilder();
  const trunkHeight = 8.4;
  const lean = 0.55;
  const top = { x: lean, y: trunkHeight, z: 0 };
  addCurvedTrunk(b, {
    height: trunkHeight, lean, sides: near ? 7 : distant ? 3 : 4, rings: near ? 8 : distant ? 1 : 2, region: FOLIAGE_REGIONS.barkDate,
    radius: (t) => 0.3 + 0.16 * Math.pow(1 - t, 8) + 0.06 * smoothstep(0.8, 1, t),
    color: (t) => [0.74 + 0.26 * t, 0.7 + 0.25 * t, 0.66 + 0.24 * t],
    bend: (t) => 0.4 * t * t,
  });
  if (near) {
    // The boot: old leaf bases packed under the crown.
    addCurvedTrunk(b, {
      height: 0.9, lean: 0, sides: 7, rings: 1, region: FOLIAGE_REGIONS.barkDate, base: { x: top.x, y: top.y - 0.55, z: 0 },
      radius: (t) => 0.42 - 0.2 * t, color: () => [0.62, 0.52, 0.4], bend: () => 0.42, vFrom: 0.86, vTo: 1,
    });
  }
  const crown = near ? CROWN_NEAR : distant ? CROWN_DISTANT : CROWN_FAR;
  for (let i = 0; i < crown.length; i += 1) {
    const f = crown[i];
    addFrond(b, {
      base: { x: top.x + Math.cos(f.az) * 0.16, y: top.y + f.lift, z: Math.sin(f.az) * 0.16 },
      azimuth: f.az, elevation: f.elevation, droop: f.droop, length: f.length, halfWidth: f.width,
      segments: near ? 5 : distant ? 1 : 2, folded: near, color: f.color,
      region: near ? FOLIAGE_REGIONS.dateFrond : FOLIAGE_REGIONS.dateFrondFar,
    });
  }
  if (near) {
    for (let i = 0; i < 3; i += 1) {
      const a = 0.9 + i * 2.1;
      b.cone(0.17, 0.62, 5, { x: top.x + Math.cos(a) * 0.38, y: top.y - 0.35, z: Math.sin(a) * 0.38, rx: Math.PI, color: [0.95, 0.56, 0.16], bend: 0.42, uvRect: solidUv(FOLIAGE_REGIONS.barkDate) });
    }
  }
  return b.build();
}

/** A short, bushy fan palm: three fibrous stems of different heights, each crowned with fan leaves. */
export function buildFanPalmGeometry() {
  const b = createShapeBuilder();
  const stems = [
    { height: 1.0, lean: 0.4, az: 0.4, leaves: 9 },
    { height: 1.7, lean: 0.3, az: 2.5, leaves: 9 },
    { height: 2.5, lean: 0.2, az: 4.5, leaves: 10 },
  ];
  for (const stem of stems) {
    const ox = Math.cos(stem.az) * 0.25;
    const oz = Math.sin(stem.az) * 0.25;
    addCurvedTrunk(b, {
      height: stem.height, lean: stem.lean, leanAz: stem.az, sides: 5, rings: 2, region: FOLIAGE_REGIONS.barkSmooth,
      base: { x: ox, y: 0, z: oz }, radius: (t) => 0.2 - 0.04 * t, color: () => [0.56, 0.4, 0.27],
      bend: (t) => 0.2 * t * t,
    });
    const topX = ox + Math.cos(stem.az) * stem.lean;
    const topZ = oz + Math.sin(stem.az) * stem.lean;
    for (let k = 0; k < stem.leaves; k += 1) {
      const az = stem.az + (k / stem.leaves) * Math.PI * 2 + 0.3 * Math.sin(k * 3.7);
      const elevation = -0.3 + 1.45 * ((k * 0.618) % 1);
      addFanLeaf(b, { x: topX, y: stem.height - 0.05, z: topZ }, az, elevation, 2.0 + 0.4 * ((k * 0.37) % 1));
    }
  }
  return b.build();
}

/** A rounded shrub clump about 1.1 m tall and 1.6 m across, tinted per copy. */
export function buildShrubGeometry() {
  const b = createShapeBuilder();
  addLeafCards(b, FOLIAGE_REGIONS.shrub, { width: 1.7, height: 1.2, cards: 5, tilt: 0.45, tint: 1, centerY: 0.55 });
  return b.build();
}

/** A low bed of flowering plants for planters and kerbside boxes, about 2.2 m long and 0.9 m wide. */
export function buildFlowerBedGeometry() {
  const b = createShapeBuilder();
  const region = FOLIAGE_REGIONS.flowerBed;
  for (let i = 0; i < 4; i += 1) {
    const x = -0.85 + i * 0.57;
    for (const ry of [0, Math.PI / 2.4]) {
      b.plane(1.05, 0.75, { x, y: 0.3, z: 0, ry: ry + i * 0.4, rx: -0.25, uvRect: uvRect(region), bend: 0.08, color: [1, 1, 1] });
    }
  }
  b.plane(2.3, 0.95, { y: 0.42, rx: -Math.PI / 2, uvRect: uvRect(region), bend: 0.05, color: [0.95, 0.95, 0.95] });
  b.bendNormals(0, { x: 0, y: -0.6, z: 0 }, 0.8);
  return b.build();
}

/**
 * A blossoming tree (bougainvillea, jacaranda, oleander by its tint): a forked trunk under a dome of
 * green leaves dusted with blossom that takes the copy's colour. About 4.6 m tall.
 */
export function buildFloweringTreeGeometry() {
  const b = createShapeBuilder();
  addCurvedTrunk(b, {
    height: 2.5, lean: 0.25, leanAz: 0.6, sides: 5, rings: 3, region: FOLIAGE_REGIONS.barkSmooth,
    radius: (t) => 0.17 - 0.05 * t + 0.06 * Math.pow(1 - t, 6), color: () => [0.6, 0.52, 0.45], bend: (t) => 0.15 * t * t,
  });
  const forkX = Math.cos(0.6) * 0.25;
  const forkZ = Math.sin(0.6) * 0.25;
  for (let i = 0; i < 3; i += 1) {
    const a = i * 2.1 + 0.4;
    b.tube([[forkX, 2.4, forkZ], [forkX + Math.cos(a) * 0.6, 3.1, forkZ + Math.sin(a) * 0.6], [forkX + Math.cos(a) * 1.1, 3.6, forkZ + Math.sin(a) * 1.1]],
      (t) => 0.1 - 0.05 * t, 4, { color: [0.58, 0.5, 0.43], bend: 0.2, uvRect: uvRect(FOLIAGE_REGIONS.barkSmooth) });
  }
  const leafRegion = FOLIAGE_REGIONS.shrub;
  const bloomRegion = FOLIAGE_REGIONS.blossom;
  const domeY = 3.7;
  const canopyStart = b.vertexCount;
  for (let i = 0; i < 11; i += 1) {
    const ring = i < 6 ? 0 : 1;
    const az = (i / (ring ? 5 : 6)) * Math.PI * 2 + ring * 0.5;
    const elevation = ring ? 1.1 : 0.35;
    const r = ring ? 0.9 : 1.75;
    const x = forkX + Math.cos(az) * r * Math.cos(elevation * 0.5);
    const z = forkZ + Math.sin(az) * r * Math.cos(elevation * 0.5);
    const y = domeY + (ring ? 0.75 : 0) + Math.sin(i * 1.7) * 0.15;
    const yaw = -az + Math.PI / 2;
    b.plane(2.3, 1.9, { x, y, z, ry: yaw, rx: -0.35 - elevation * 0.4, order: 'YXZ', uvRect: uvRect(leafRegion), bend: 0.3, color: [0.78, 0.86, 0.72] });
    const bx = forkX + Math.cos(az + 0.3) * (r + 0.3);
    const bz = forkZ + Math.sin(az + 0.3) * (r + 0.3);
    b.plane(2.0, 1.6, { x: bx, y: y + 0.2, z: bz, ry: yaw - 0.3, rx: -0.45 - elevation * 0.4, order: 'YXZ', uvRect: uvRect(bloomRegion), bend: 0.35, tint: 1, color: [1, 1, 1] });
  }
  b.plane(2.6, 2.6, { x: forkX, y: domeY + 1.25, z: forkZ, rx: -Math.PI / 2, uvRect: uvRect(bloomRegion), bend: 0.35, tint: 1 });
  b.bendNormals(canopyStart, { x: forkX, y: domeY - 0.6, z: forkZ }, 0.5);
  return b.build();
}

// ---------------------------------------------------------------------------------------------
// Model parts

/** A tapered, gently curving trunk built ring by ring, mapped onto a bark strip of the atlas. */
function addCurvedTrunk(b, o) {
  const base = o.base || { x: 0, y: 0, z: 0 };
  const leanAz = o.leanAz || 0;
  const rows = [];
  const vFrom = o.vFrom === undefined ? 0 : o.vFrom;
  const vTo = o.vTo === undefined ? 1 : o.vTo;
  const region = o.region;
  for (let j = 0; j <= o.rings; j += 1) {
    const t = j / o.rings;
    const offset = o.lean * Math.pow(t, 1.7);
    const cx = base.x + Math.cos(leanAz) * offset;
    const cz = base.z + Math.sin(leanAz) * offset;
    const cy = base.y + o.height * t - (j === 0 && base.y === 0 ? 0.25 : 0);
    const radius = o.radius(t);
    const color = o.color(t);
    const bend = o.bend(t);
    const row = [];
    for (let k = 0; k <= o.sides; k += 1) {
      const a = (k / o.sides) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = -Math.sin(a);
      row.push(b.vertex(cx + nx * radius, cy, cz + nz * radius, nx, 0.12, nz,
        region.u0 + (region.u1 - region.u0) * (k / o.sides),
        region.v0 + (region.v1 - region.v0) * (vFrom + (vTo - vFrom) * t),
        { color, bend }));
    }
    rows.push(row);
  }
  for (let j = 0; j < rows.length - 1; j += 1) {
    for (let k = 0; k < o.sides; k += 1) b.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
  }
}

/**
 * One date frond: a strip that leaves the crown at `elevation`, arches and droops by `droop` over its
 * `length`, widest a little before its middle and closing to a point, folded into a shallow V along the
 * rachis (near) or flat (far). Normals lean up and out so the crown shades like one soft dome.
 */
function addFrond(b, o) {
  const dirX = Math.cos(o.azimuth);
  const dirZ = Math.sin(o.azimuth);
  const sideX = -dirZ;
  const sideZ = dirX;
  const region = o.region;
  const fold = o.folded ? 0.5 : 0;
  const steps = o.segments;
  let px = o.base.x;
  let py = o.base.y;
  let pz = o.base.z;
  const rows = [];
  for (let k = 0; k <= steps; k += 1) {
    const s = k / steps;
    const angle = o.elevation - o.droop * Math.pow(s, 1.3);
    // The frond's own up: perpendicular to its tangent, in the vertical plane of its azimuth.
    const upX = -Math.sin(angle) * dirX;
    const upY = Math.cos(angle);
    const upZ = -Math.sin(angle) * dirZ;
    const width = o.halfWidth * Math.max(0.03, Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * s)), 0.75));
    const across = Math.cos(fold) * width;
    const lift = Math.sin(fold) * width;
    const nx = upX * 0.5 + dirX * 0.5;
    const ny = upY * 0.5 + 0.45;
    const nz = upZ * 0.5 + dirZ * 0.5;
    const v = region.v0 + (region.v1 - region.v0) * (0.01 + 0.98 * s);
    const tipShade = 1 + 0.08 * s;
    const color = [o.color[0] * tipShade, o.color[1] * tipShade, o.color[2]];
    const bend = 0.42 + 0.58 * Math.pow(s, 1.25);
    const vo = { color, bend, tint: 1 };
    const row = [];
    row.push(b.vertex(px + sideX * across + upX * lift, py + upY * lift, pz + sideZ * across + upZ * lift, nx, ny, nz, region.u0, v, vo));
    if (o.folded) row.push(b.vertex(px, py, pz, nx, ny, nz, (region.u0 + region.u1) / 2, v, vo));
    row.push(b.vertex(px - sideX * across + upX * lift, py + upY * lift, pz - sideZ * across + upZ * lift, nx, ny, nz, region.u1, v, vo));
    rows.push(row);
    if (k < steps) {
      const mid = o.elevation - o.droop * Math.pow((k + 0.5) / steps, 1.3);
      const step = o.length / steps;
      px += Math.cos(mid) * dirX * step;
      py += Math.sin(mid) * step;
      pz += Math.cos(mid) * dirZ * step;
    }
  }
  for (let k = 0; k < steps; k += 1) {
    const r0 = rows[k];
    const r1 = rows[k + 1];
    if (o.folded) {
      b.quad(r0[1], r0[0], r1[0], r1[1]);
      b.quad(r0[2], r0[1], r1[1], r1[2]);
    } else {
      b.quad(r0[1], r0[0], r1[0], r1[1]);
    }
  }
}

/** One fan leaf on its stalk, opening outward at `elevation` and folded along its middle. */
function addFanLeaf(b, base, azimuth, elevation, size) {
  const region = FOLIAGE_REGIONS.fanLeaf;
  const dirX = Math.cos(azimuth) * Math.cos(elevation);
  const dirY = Math.sin(elevation);
  const dirZ = Math.sin(azimuth) * Math.cos(elevation);
  const sideX = -Math.sin(azimuth);
  const sideZ = Math.cos(azimuth);
  const upX = -Math.sin(elevation) * Math.cos(azimuth);
  const upY = Math.cos(elevation);
  const upZ = -Math.sin(elevation) * Math.sin(azimuth);
  const half = size * 0.5;
  const fold = 0.45;
  const rows = [];
  for (let k = 0; k <= 1; k += 1) {
    const along = k * size;
    const cx = base.x + dirX * along;
    const cy = base.y + dirY * along - k * 0.25;
    const cz = base.z + dirZ * along;
    const v = region.v0 + (region.v1 - region.v0) * (k ? 0.99 : 0.01);
    const nx = upX * 0.6 + dirX * 0.4;
    const ny = upY * 0.6 + 0.4;
    const nz = upZ * 0.6 + dirZ * 0.4;
    const bend = 0.3 + 0.5 * k;
    const color = [0.86, 0.96, 0.82];
    const lift = Math.sin(fold) * half;
    const across = Math.cos(fold) * half;
    rows.push([
      b.vertex(cx + sideX * across + upX * lift, cy + upY * lift, cz + sideZ * across + upZ * lift, nx, ny, nz, region.u0, v, { color, bend, tint: 1 }),
      b.vertex(cx, cy, cz, nx, ny, nz, (region.u0 + region.u1) / 2, v, { color, bend, tint: 1 }),
      b.vertex(cx - sideX * across + upX * lift, cy + upY * lift, cz - sideZ * across + upZ * lift, nx, ny, nz, region.u1, v, { color, bend, tint: 1 }),
    ]);
  }
  b.quad(rows[0][1], rows[0][0], rows[1][0], rows[1][1]);
  b.quad(rows[0][2], rows[0][1], rows[1][1], rows[1][2]);
}

/** Crossed and tilted leaf cards around a centre: a cheap, full-looking clump. */
function addLeafCards(b, region, o) {
  const start = b.vertexCount;
  for (let i = 0; i < o.cards; i += 1) {
    const yaw = (i / o.cards) * Math.PI;
    const tilt = i % 2 ? o.tilt : -o.tilt * 0.5;
    b.plane(o.width, o.height, { y: o.centerY, ry: yaw, rx: tilt, order: 'YXZ', uvRect: uvRect(region), tint: o.tint, bend: (x, y) => Math.max(0, y) * 0.12, color: [1, 1, 1] });
  }
  b.plane(o.width * 0.9, o.width * 0.9, { y: o.centerY + o.height * 0.25, rx: -Math.PI / 2, uvRect: uvRect(region), tint: o.tint, bend: 0.1, color: [1.05, 1.05, 1.05] });
  b.bendNormals(start, { x: 0, y: o.centerY - 0.5, z: 0 }, 0.6);
}

function uvRect(region) {
  return [region.u0, region.v0, region.u1, region.v1];
}

/** A tiny patch in the middle of a region: for small solid parts that only need its colour. */
function solidUv(region) {
  const u = (region.u0 + region.u1) / 2;
  const v = (region.v0 + region.v1) / 2;
  return [u, v, u + 0.001, v + 0.001];
}

function smoothstep(a, b, t) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

// The crowns: azimuth, how far above the trunk top the frond starts, elevation and droop (radians),
// length and half width (metres), colour. Young fronds stand up pale and yellow-green; the full ones
// arch out; old ones droop dark; one dry frond hangs brown against the trunk.
const GOLDEN = 2.39996;
const CROWN_NEAR = [
  frond(0, 0.46, 1.3, 0.75, 3.2, 0.62, [0.98, 1.08, 0.7]),
  frond(1, 0.44, 1.18, 0.9, 3.5, 0.68, [0.96, 1.06, 0.7]),
  frond(2, 0.4, 1.02, 1.15, 3.9, 0.76, [0.93, 1.03, 0.7]),
  frond(3, 0.34, 0.85, 1.4, 4.3, 0.84, [0.9, 1.0, 0.69]),
  frond(4, 0.28, 0.66, 1.6, 4.7, 0.92, [0.86, 0.98, 0.68]),
  frond(5, 0.25, 0.55, 1.7, 4.9, 0.95, [0.84, 0.97, 0.66]),
  frond(6, 0.22, 0.46, 1.75, 5.0, 0.95, [0.82, 0.96, 0.66]),
  frond(7, 0.2, 0.38, 1.8, 5.0, 0.95, [0.8, 0.94, 0.64]),
  frond(8, 0.17, 0.3, 1.8, 4.9, 0.94, [0.78, 0.92, 0.62]),
  frond(9, 0.13, 0.2, 1.75, 4.8, 0.92, [0.76, 0.9, 0.61]),
  frond(10, 0.09, 0.1, 1.7, 4.6, 0.9, [0.73, 0.87, 0.59]),
  frond(11, 0.06, 0.0, 1.6, 4.4, 0.86, [0.7, 0.84, 0.57]),
  frond(12, 0.03, -0.12, 1.45, 4.2, 0.82, [0.68, 0.81, 0.55]),
  frond(13, 0.0, -0.25, 1.3, 4.0, 0.78, [0.66, 0.78, 0.54]),
  frond(14, -0.22, -0.8, 0.5, 3.3, 0.62, [0.9, 0.74, 0.46]),
  frond(15, -0.35, -1.1, 0.3, 3.0, 0.55, [0.95, 0.72, 0.44]),
];
const CROWN_FAR = [
  frond(0, 0.44, 1.15, 0.9, 3.5, 0.85, [0.95, 1.05, 0.7]),
  frond(1, 0.36, 0.85, 1.35, 4.2, 1.0, [0.9, 1.0, 0.68]),
  frond(2, 0.28, 0.58, 1.65, 4.8, 1.1, [0.84, 0.97, 0.66]),
  frond(3, 0.22, 0.42, 1.75, 4.9, 1.1, [0.81, 0.95, 0.64]),
  frond(4, 0.16, 0.26, 1.75, 4.8, 1.05, [0.77, 0.9, 0.62]),
  frond(5, 0.1, 0.1, 1.65, 4.5, 1.02, [0.74, 0.87, 0.6]),
  frond(6, 0.03, -0.1, 1.45, 4.2, 0.95, [0.7, 0.83, 0.57]),
  frond(7, -0.25, -0.8, 0.45, 3.2, 0.72, [0.92, 0.74, 0.46]),
];
const CROWN_DISTANT = [
  frond(0, 0.4, 1.0, 1.0, 3.8, 1.1, [0.92, 1.02, 0.68]),
  frond(1, 0.28, 0.55, 1.6, 4.8, 1.25, [0.84, 0.97, 0.66]),
  frond(2, 0.22, 0.4, 1.7, 4.9, 1.25, [0.8, 0.94, 0.64]),
  frond(3, 0.16, 0.25, 1.7, 4.8, 1.2, [0.77, 0.9, 0.62]),
  frond(4, 0.1, 0.1, 1.6, 4.5, 1.2, [0.74, 0.87, 0.6]),
  frond(5, 0.04, -0.05, 1.45, 4.2, 1.15, [0.71, 0.84, 0.58]),
];

function frond(i, lift, elevation, droop, length, width, color) {
  const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  return { az: i * GOLDEN + jitter * 0.25, lift, elevation, droop, length, width, color };
}

