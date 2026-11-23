// What sits on Port Sarab's roofs: parapets and their coping, plant rooms, water tanks, satellite
// dishes and air-conditioning boxes on the flats, pools and pergolas on the towers, helipads and
// masts, the old town's wind towers and domes, and the red beacons that blink on every tall
// crown after dark (one cloud of glowing points for the whole city).
import * as THREE from 'three';
import { insetPoints, rectPoints, ellipsePoints } from './buildingGeometryBuilder.js';

/**
 * The aircraft-warning lights of the skyline as one set of additive points. `points` is a list of
 * { x, y, z, color, size, blink } (blink 0 is steady). Returns { points, update(time, night, pixelScale) }.
 */
export function createBeaconLights(points) {
  if (!points.length) return { points: null, update() {} };
  const positions = new Float32Array(points.length * 3);
  const colors = new Float32Array(points.length * 3);
  const sizes = new Float32Array(points.length);
  const blinks = new Float32Array(points.length);
  const color = new THREE.Color();
  points.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    color.setHex(p.color);
    colors.set([color.r, color.g, color.b], i * 3);
    sizes[i] = p.size;
    blinks[i] = p.blink ? p.blink + (i % 7) * 0.13 : 0;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('beaconColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('beaconSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('beaconBlink', new THREE.BufferAttribute(blinks, 1));
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uPixelScale: { value: 600 } },
    vertexShader: BEACON_VERTEX,
    fragmentShader: BEACON_FRAGMENT,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const cloud = new THREE.Points(geometry, material);
  cloud.name = 'skylineBeacons';
  cloud.frustumCulled = false;
  cloud.renderOrder = 2;
  return {
    points: cloud,
    update(time, night, pixelScale) {
      material.uniforms.uTime.value = time;
      material.uniforms.uNight.value = night;
      if (pixelScale) material.uniforms.uPixelScale.value = pixelScale;
    },
  };
}

/**
 * Close a roof behind a parapet. The caller has raised the outer walls of `outline` to `topY`;
 * this adds the parapet's inner face, its coping and the roof `height` below the top.
 */
export function parapetRoof(b, outline, topY, height, thickness, roofTile = 'roofGravel', roofTint = 0xe8e2d6) {
  const inner = insetPoints(outline, thickness);
  const roofY = topY - height;
  const tile = b.tileName;
  // inner faces look inward: walk the inner outline backwards
  const n = inner.length;
  for (let i = 0; i < n; i += 1) {
    const a = inner[(i + 1) % n];
    const c = inner[i];
    b.wall(a[0], a[1], c[0], c[1], roofY, topY, { vBase: roofY });
  }
  // coping along the top, between the outer and inner outlines
  b.use('plain');
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    b.quad([outline[i][0], topY, outline[i][1]], [outline[j][0], topY, outline[j][1]], [inner[j][0], topY, inner[j][1]], [inner[i][0], topY, inner[i][1]], 0, 0, 1, 0.1);
  }
  b.use(roofTile, roofTint);
  b.cap(inner, roofY, true);
  b.use(tile);
  return { inner, roofY };
}

/** A box-shaped plant room with vents, and a lid. */
export function plantRoom(b, cx, cz, w, d, y, h, tint = 0xd8d8d2) {
  b.use('coldPanels', tint);
  b.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, { top: 'metalPanel', topTint: 0xbfc4c8 });
}

/** A scatter of air-conditioning boxes inside a rectangle of roof. */
export function airConUnits(b, rng, x0, z0, x1, z1, y, count) {
  b.use('metalPanel', 0xe4e6e6);
  for (let i = 0; i < count; i += 1) {
    const w = 1.0 + rng.next() * 0.8;
    const d = 0.8 + rng.next() * 0.5;
    const x = x0 + w / 2 + rng.next() * Math.max(0, x1 - x0 - w);
    const z = z0 + d / 2 + rng.next() * Math.max(0, z1 - z0 - d);
    b.box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.9, z + d / 2);
  }
}

/** Water tanks on little stands: white, blue and black plastic drums. */
export function waterTanks(b, rng, x0, z0, x1, z1, y, count) {
  for (let i = 0; i < count; i += 1) {
    const r = 0.7 + rng.next() * 0.4;
    const x = x0 + r + rng.next() * Math.max(0, x1 - x0 - 2 * r);
    const z = z0 + r + rng.next() * Math.max(0, z1 - z0 - 2 * r);
    b.use('concrete', 0xbdb8ae);
    b.box(x - r * 0.9, y, z - r * 0.9, x + r * 0.9, y + 0.5, z + r * 0.9, { top: false });
    b.use('plain', rng.pick([0xf2f2ee, 0xf2f2ee, 0x2f5f8a, 0x2a2a2c, 0xe9b44c]));
    b.cylinder(x, z, r, y + 0.5, y + 0.5 + r * 1.9, 8);
  }
}

/** Satellite dishes on short poles, all looking up at the same patch of southern sky. */
export function satelliteDishes(b, rng, x0, z0, x1, z1, y, count) {
  for (let i = 0; i < count; i += 1) {
    const x = x0 + rng.next() * (x1 - x0);
    const z = z0 + rng.next() * (z1 - z0);
    const r = 0.45 + rng.next() * 0.3;
    b.use('metalPanel', 0x9a9ea2);
    b.box(x - 0.05, y, z - 0.05, x + 0.05, y + 0.9, z + 0.05, { top: false });
    b.use('plain', 0xf4f4f0);
    // A shallow bowl tilted toward the south: a fan of triangles around its focus.
    const cy = y + 0.9 + r * 0.7;
    const tilt = 0.75;
    const segments = 8;
    for (let s = 0; s < segments; s += 1) {
      const a0 = (s / segments) * Math.PI * 2;
      const a1 = ((s + 1) / segments) * Math.PI * 2;
      const rim = (a) => {
        const u = Math.cos(a) * r;
        const v = Math.sin(a) * r;
        return [x + u, cy + v * Math.cos(tilt), z + v * Math.sin(tilt) * -1 + 0.0];
      };
      const p0 = rim(a0);
      const p1 = rim(a1);
      const back = [x, cy - 0.05, z - 0.18];
      const front = [x, cy + 0.02, z + 0.12];
      b.triangle(front, p0, p1, 0, 0, 1, 0, 0.5, 1);
      b.triangle(back, p1, p0, 0, 0, 1, 0, 0.5, 1);
    }
  }
}

/** Rows of tilted solar panels. */
export function solarPanels(b, x0, z0, x1, z1, y, tiltToSouth = true) {
  b.use('solarPanel', 0xffffff);
  const row = 2.2;
  for (let z = z0; z + row <= z1; z += row + 0.9) {
    const zLow = tiltToSouth ? z + row : z;
    const zHigh = tiltToSouth ? z : z + row;
    const lift = 0.9;
    b.quad([x0, y + 0.3, zLow], [x1, y + 0.3, zLow], [x1, y + lift, zHigh], [x0, y + lift, zHigh], 0, 0, (x1 - x0) / 3, 1);
    b.quad([x1, y + 0.3, zLow], [x0, y + 0.3, zLow], [x0, y + lift, zHigh], [x1, y + lift, zHigh], 0, 0, (x1 - x0) / 3, 1);
  }
}

/** A rooftop helipad: a raised deck with its ring and H, landing lights at the corners. */
export function helipad(ctx, b, cx, cz, size, y) {
  const half = size / 2;
  b.use('metalPanel', 0x8a9096);
  b.box(cx - half, y, cz - half, cx + half, y + 0.9, cz + half, { top: false });
  b.use('helipad', 0xffffff);
  b.quad([cx - half, y + 0.9, cz + half], [cx + half, y + 0.9, cz + half], [cx + half, y + 0.9, cz - half], [cx - half, y + 0.9, cz - half], 0.005, 0.005, 0.995, 0.995);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.beacon(cx + sx * (half - 0.4), y + 1.2, cz + sz * (half - 0.4), 0x7dff9a, 1.6, 0);
}

/** A rooftop pool: turquoise water inside a white coping, with a row of loungers. */
export function roofPool(b, rng, x0, z0, x1, z1, y) {
  const c = 0.35;
  b.use('plain', 0xf6f4ee);
  b.box(x0, y, z0, x1, y + 0.3, z0 + c);
  b.box(x0, y, z1 - c, x1, y + 0.3, z1);
  b.box(x0, y, z0 + c, x0 + c, y + 0.3, z1 - c);
  b.box(x1 - c, y, z0 + c, x1, y + 0.3, z1 - c);
  b.use('poolWater', 0xffffff);
  b.cap(rectPoints((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 - 2 * c, z1 - z0 - 2 * c), y + 0.22, true);
  b.use('plain', 0xffffff);
  const loungers = Math.floor((x1 - x0) / 2.2);
  for (let i = 0; i < loungers; i += 1) {
    const x = x0 + 0.6 + i * 2.2;
    b.box(x, y, z1 + 0.8, x + 0.8, y + 0.4, z1 + 2.6);
  }
  if (rng.chance(0.7)) {
    b.use('awningStripes', rng.pick([0xe4572e, 0x1ba39c, 0xe9b44c]));
    const ux = x0 + (x1 - x0) * 0.3;
    b.cylinder(ux, z1 + 1.8, 1.4, y + 2.3, y + 2.5, 8, { topScale: 0.2 });
  }
}

/** A pergola: four posts and a roof of timber slats, shade for a terrace. */
export function pergola(ctx, x0, z0, x1, z1, y, height) {
  const b = ctx.solid;
  b.use('plain', 0xf4efe4);
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.box(px - 0.15, y, pz - 0.15, px + 0.15, y + height, pz + 0.15);
  ctx.cutout.use('woodSlats', 0xffffff);
  ctx.cutout.quad([x0, y + height, z1], [x1, y + height, z1], [x1, y + height, z0], [x0, y + height, z0], 0, 0, (x1 - x0) / 2, (z1 - z0) / 2);
}

/** Planter boxes of greenery along a roof terrace. */
export function roofPlanters(b, rng, x0, z0, x1, z1, y) {
  const along = x1 - x0 > z1 - z0;
  const count = Math.max(2, Math.floor((along ? x1 - x0 : z1 - z0) / 4));
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const x = along ? x0 + (x1 - x0) * t : x0 + 0.8;
    const z = along ? z0 + 0.8 : z0 + (z1 - z0) * t;
    b.use('concrete', 0xe0dcd2);
    b.box(x - 0.9, y, z - 0.6, x + 0.9, y + 0.6, z + 0.6, { top: false });
    b.use('greenery', rng.pick([0x6f9a4a, 0x5a8a3c, 0x82ad55]));
    b.dome(x, z, 1.0, y + 0.6, 0.9 + rng.next() * 0.6, 6, 2);
  }
}

/** A lattice mast with crossbars and a red beacon at its tip. */
export function antennaMast(ctx, b, x, z, y, height, tint = 0xc8ccd0) {
  b.use('metalPanel', tint);
  b.box(x - 0.3, y, z - 0.3, x + 0.3, y + height, z + 0.3);
  for (let k = 1; k <= 3; k += 1) {
    const yy = y + height * (k / 4);
    const span = 1.6 - k * 0.3;
    b.box(x - span, yy, z - 0.08, x + span, yy + 0.18, z + 0.08);
  }
  ctx.beacon(x, y + height + 0.4, z, 0xff2a1a, 3.4, 1);
}

/** A tapering eight-sided needle crowned with a beacon. */
export function spireNeedle(ctx, b, x, z, y, height, radius, tint = 0xe2e6ea) {
  b.use('metalPanel', tint);
  b.prism(ellipsePoints(x, z, radius, radius, 8), y, y + height, { topScale: 0.12, smooth: true, perimeter: true });
  ctx.beacon(x, y + height + 0.6, z, 0xff2a1a, 4.2, 1);
}

/**
 * An Old Sarab wind tower: a square plaster shaft whose head is slotted on all four sides to catch
 * the breeze, divided inside by crossed walls, under a flat cap.
 */
export function windTower(ctx, x, z, y, size, height, tint) {
  const solid = ctx.solid;
  const cut = ctx.cutout;
  const half = size / 2;
  const shaftTop = y + height * 0.5;
  const headTop = y + height * 0.88;
  solid.use('plasterBlank', tint);
  solid.box(x - half, y, z - half, x + half, shaftTop, z + half, { top: false });
  cut.use('windTowerSlats', tint);
  const faces = [
    [x - half, z + half, x + half, z + half],
    [x + half, z + half, x + half, z - half],
    [x + half, z - half, x - half, z - half],
    [x - half, z - half, x - half, z + half],
  ];
  for (const [ax, az, bx, bz] of faces) cut.wall(ax, az, bx, bz, shaftTop, headTop, { u0: 0, u1: 1, v0: 0, v1: 1 });
  solid.use('plasterBlank', tint);
  solid.wall(x - half * 0.95, z - half * 0.95, x + half * 0.95, z + half * 0.95, shaftTop, headTop, { repeatU: 1 });
  solid.wall(x + half * 0.95, z + half * 0.95, x - half * 0.95, z - half * 0.95, shaftTop, headTop, { repeatU: 1 });
  solid.wall(x - half * 0.95, z + half * 0.95, x + half * 0.95, z - half * 0.95, shaftTop, headTop, { repeatU: 1 });
  solid.wall(x + half * 0.95, z - half * 0.95, x - half * 0.95, z + half * 0.95, shaftTop, headTop, { repeatU: 1 });
  solid.box(x - half - 0.2, headTop, z - half - 0.2, x + half + 0.2, headTop + 0.35, z + half + 0.2, { bottom: true });
  solid.box(x - half, headTop + 0.35, z - half, x + half, y + height, z + half);
  cut.use('crenellation', tint);
  for (const [ax, az, bx, bz] of faces) cut.wall(ax, az, bx, bz, y + height, y + height + 0.7, { u0: 0, u1: Math.max(1, Math.round(size / 1.5)) / 2, v0: 0, v1: 1 });
}

/** A low plastered dome on a short drum, with a brass finial. */
export function roofDome(b, x, z, y, radius, tint, tiled = false) {
  b.use('plasterBlank', tint);
  b.cylinder(x, z, radius, y, y + 0.8, 12, { top: false });
  b.use(tiled ? 'tiledDome' : 'plasterBlank', tiled ? 0x6fc4c0 : tint);
  b.dome(x, z, radius, y + 0.8, radius * 0.75, 12, 4);
  b.use('metalPanel', 0xc9962e);
  b.box(x - 0.08, y + 0.8 + radius * 0.72, z - 0.08, x + 0.08, y + 1.6 + radius * 0.75, z + 0.08);
}

const BEACON_VERTEX = /* glsl */ `
attribute vec3 beaconColor;
attribute float beaconSize;
attribute float beaconBlink;
uniform float uTime;
uniform float uNight;
uniform float uPixelScale;
varying vec3 vBeaconColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float pulse = beaconBlink > 0.0 ? 0.25 + 0.75 * step(0.55, fract(uTime * 0.55 + beaconBlink)) : 1.0;
  float strength = mix(0.18, 1.0, uNight) * pulse;
  vBeaconColor = beaconColor * strength;
  gl_PointSize = clamp(beaconSize * uPixelScale / max(-mv.z, 1.0), 2.5, 48.0);
  gl_Position = projectionMatrix * mv;
}
`;

const BEACON_FRAGMENT = /* glsl */ `
varying vec3 vBeaconColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float core = 1.0 - smoothstep(0.0, 1.0, r);
  core = core * core * 1.6;
  gl_FragColor = vec4(vBeaconColor * core, 1.0);
}
`;
