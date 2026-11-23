// The stunt ramps of Port Sarab: timber-and-scaffold kickers at every ramp in the city plan, their
// plank decks following the ground height the cars drive on exactly, painted with red-and-white
// chevrons and a striped lip, and flagged at both corners so they read from far down the road.
import * as THREE from 'three';
import { createShapeBuilder, rgb, triangleCount } from './propShapes.js';

const PLANK_LIGHT = rgb(0xc08a50);
const PLANK_DARK = rgb(0x9c6c3c);
const SKIRT = rgb(0x7a5230);
const STEEL = rgb(0x8a9096);
const RED = rgb(0xd7263d);
const WHITE = rgb(0xf6f2ea);
const FLAG = rgb(0xffc21a);
const SEGMENTS = 16;

/** Build every ramp of game.city.stuntRamps into one static mesh and show it. */
export function createStuntRamps(game, kit) {
  const b = createShapeBuilder();
  const terrain = game.terrain;
  const heightAt = (x, z) => (terrain ? terrain.heightAt(x, z) : 0);
  const baseAt = (x, z) => (terrain && terrain.baseHeightAt ? terrain.baseHeightAt(x, z) : 0);
  for (const ramp of game.city.stuntRamps) buildRamp(b, ramp, heightAt, baseAt);
  const geometry = b.build();
  const mesh = new THREE.Mesh(geometry, kit.materials.prop);
  mesh.name = 'furniture-stuntRamps';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  kit.addStaticMesh(mesh, triangleCount(geometry));
  return { mesh, ramps: game.city.stuntRamps };
}

/** One kicker: deck, side skirts with braces, the lip face, scaffold legs, chevrons and two flags. */
function buildRamp(b, ramp, heightAt, baseAt) {
  const fx = Math.sin(ramp.heading);
  const fz = Math.cos(ramp.heading);
  const sx = Math.cos(ramp.heading);
  const sz = -Math.sin(ramp.heading);
  const half = ramp.width / 2;
  const at = (along, across) => [ramp.x + fx * along + sx * across, ramp.z + fz * along + sz * across];
  // The ramp's own surface: sampled a hair inside the edges, where heightAt holds the ramp's lift.
  const deckY = (along, across) => {
    const a = Math.min(ramp.length - 0.02, Math.max(0.02, along));
    const c = Math.max(-half + 0.02, Math.min(half - 0.02, across));
    const [x, z] = at(a, c);
    return heightAt(x, z) + 0.025;
  };
  const rise = ramp.height / ramp.length;
  const normal = new THREE.Vector3(-fx * rise, 1, -fz * rise).normalize();

  // Deck planks, alternating light and dark down the ramp.
  for (let k = 0; k < SEGMENTS; k += 1) {
    const a0 = (k / SEGMENTS) * ramp.length;
    const a1 = ((k + 1) / SEGMENTS) * ramp.length;
    const color = k % 2 ? PLANK_DARK : PLANK_LIGHT;
    const corners = [[a0, -half], [a0, half], [a1, half], [a1, -half]].map(([a, c]) => {
      const [x, z] = at(a, c);
      return b.vertex(x, deckY(a, c), z, normal.x, normal.y, normal.z, 0, 0, { color });
    });
    b.quad(corners[0], corners[3], corners[2], corners[1]);
  }

  // Side skirts down to the ground on both sides, and the vertical lip face at the high end.
  for (const side of [-1, 1]) {
    for (let k = 0; k < SEGMENTS; k += 1) {
      const a0 = (k / SEGMENTS) * ramp.length;
      const a1 = ((k + 1) / SEGMENTS) * ramp.length;
      const [x0, z0] = at(a0, side * half);
      const [x1, z1] = at(a1, side * half);
      const vo = { color: SKIRT };
      const p = b.vertex(x0, deckY(a0, side * half), z0, sx * side, 0, sz * side, 0, 0, vo);
      const q = b.vertex(x1, deckY(a1, side * half), z1, sx * side, 0, sz * side, 0, 0, vo);
      const r = b.vertex(x1, baseAt(x1, z1) - 0.3, z1, sx * side, 0, sz * side, 0, 0, vo);
      const s = b.vertex(x0, baseAt(x0, z0) - 0.3, z0, sx * side, 0, sz * side, 0, 0, vo);
      b.quad(p, q, r, s);
      b.quad(p, s, r, q);
    }
  }
  const lipCorners = [-half, half].map((c) => at(ramp.length, c));
  {
    const vo = { color: SKIRT };
    const [ax, az] = lipCorners[0];
    const [bx, bz] = lipCorners[1];
    const p = b.vertex(ax, deckY(ramp.length, -half), az, fx, 0, fz, 0, 0, vo);
    const q = b.vertex(bx, deckY(ramp.length, half), bz, fx, 0, fz, 0, 0, vo);
    const r = b.vertex(bx, baseAt(bx, bz) - 0.3, bz, fx, 0, fz, 0, 0, vo);
    const s = b.vertex(ax, baseAt(ax, az) - 0.3, az, fx, 0, fz, 0, 0, vo);
    b.quad(p, s, r, q);
  }

  // Scaffold legs and cross braces under the high half.
  for (const along of [ramp.length * 0.55, ramp.length * 0.78, ramp.length - 0.15]) {
    for (const across of [-half + 0.15, 0, half - 0.15]) {
      const [x, z] = at(along, across);
      const top = deckY(along, across) - 0.05;
      const bottom = baseAt(x, z) - 0.3;
      if (top - bottom < 0.4) continue;
      b.box(0.12, top - bottom, 0.12, { x, y: (top + bottom) / 2, z, ry: ramp.heading, color: STEEL });
    }
  }
  for (const side of [-1, 1]) {
    const [x0, z0] = at(ramp.length * 0.5, side * (half + 0.03));
    const [x1, z1] = at(ramp.length - 0.2, side * (half + 0.03));
    const y0 = baseAt(x0, z0) + 0.1;
    const y1 = deckY(ramp.length - 0.2, side * half) - 0.15;
    b.tube([[x0, y0, z0], [x1, y1, z1]], 0.05, 4, { color: STEEL });
  }

  // The lip: red and white stripes across the last metre, chevrons pointing up the ramp.
  const stripes = Math.max(4, Math.round(ramp.width / 0.9));
  for (let i = 0; i < stripes; i += 1) {
    const c0 = -half + (i / stripes) * ramp.width;
    const c1 = -half + ((i + 1) / stripes) * ramp.width;
    const color = i % 2 ? WHITE : RED;
    const a0 = ramp.length - 1.0;
    const a1 = ramp.length - 0.02;
    const pts = [[a0, c0], [a0, c1], [a1, c1], [a1, c0]].map(([a, c]) => {
      const [x, z] = at(a, c);
      return b.vertex(x, deckY(a, c) + 0.012, z, normal.x, normal.y, normal.z, 0, 0, { color });
    });
    b.quad(pts[0], pts[3], pts[2], pts[1]);
  }
  const arm = Math.min(half * 0.75, 2.6);
  for (let n = 0; n < 3; n += 1) {
    const tip = ramp.length * (0.3 + n * 0.2);
    for (const side of [-1, 1]) {
      const quad = [
        [tip, 0], [tip - arm * 0.8, side * arm], [tip - arm * 0.8 - 0.5, side * arm], [tip - 0.5, 0],
      ].map(([a, c]) => {
        const [x, z] = at(a, c);
        return b.vertex(x, deckY(a, c) + 0.014, z, normal.x, normal.y, normal.z, 0, 0, { color: n % 2 ? WHITE : RED });
      });
      b.quad(quad[0], quad[1], quad[2], quad[3]);
      b.quad(quad[0], quad[3], quad[2], quad[1]);
    }
  }

  // Flags on both lip corners.
  for (const side of [-1, 1]) {
    const [x, z] = at(ramp.length - 0.2, side * (half + 0.15));
    const y = deckY(ramp.length - 0.2, side * (half - 0.05));
    b.cylinder(0.03, 0.03, 2.6, 4, { x, y: y + 1.3, z, color: WHITE });
    const fy = y + 2.5;
    const vo = { color: side > 0 ? FLAG : RED, bend: (px, py, pz) => Math.min(1, Math.hypot(px - x, pz - z) * 0.8) };
    const p0 = b.vertex(x, fy, z, sx, 0, sz, 0, 0, vo);
    const p1 = b.vertex(x, fy - 0.55, z, sx, 0, sz, 0, 0, vo);
    const p2 = b.vertex(x - fx * 0.9, fy - 0.27, z - fz * 0.9, sx, 0, sz, 0, 0, vo);
    b.triangle(p0, p1, p2);
    b.triangle(p0, p2, p1);
  }
}
