// The souk of Old Sarab as low-poly models: striped fabric awnings that span the lanes, market stalls
// heaped with fruit, cones of spice or brass and copper, crates, sacks and pots for the lane sides,
// rug rails, tall canopy poles, and strings of coloured glass lanterns that glow after dark.
import { createShapeBuilder, rgb } from './propShapes.js';

const WOOD = rgb(0x9a6a3e);
const WOOD_DARK = rgb(0x6b4528);
const CREAM = rgb(0xfff4d6);
const BURLAP = rgb(0xc8a878);
const BRASS = rgb(0xc9973e);
const COPPER = rgb(0xb5623a);
const TERRACOTTA = rgb(0xc86f4a);

const FRUIT = [0xff9a1f, 0xd7263d, 0x6aa84f, 0xf6d32b, 0x6a2c70, 0xff6b3d].map(rgb);
const SPICE = [0xf2b705, 0xc0392b, 0xe67e22, 0x7a1f3a, 0x8fbf3a, 0x8a4b26].map(rgb);

/**
 * A fabric awning 1 m across (stretch it with the copy's x scale to span a lane) and 3 m deep, sagging
 * in the middle, in stripes that alternate the copy's colour with cream, with a scalloped valance
 * hanging along both edges. Both faces are drawn; the underside glows a little like sunlit cloth.
 */
export function buildLaneAwning() {
  const b = createShapeBuilder();
  const depth = 3;
  const stripes = 6;
  const across = 3;
  const sag = 0.32;
  const heightAt = (u) => -sag * (1 - (2 * u - 1) * (2 * u - 1));
  for (let s = 0; s < stripes; s += 1) {
    const z0 = -depth / 2 + (s / stripes) * depth;
    const z1 = -depth / 2 + ((s + 1) / stripes) * depth;
    const tinted = s % 2 === 0;
    const color = tinted ? [1, 1, 1] : CREAM;
    for (const face of [1, -1]) {
      const rows = [];
      for (let i = 0; i <= across; i += 1) {
        const u = i / across;
        const x = u - 0.5;
        const y = heightAt(u) + (face < 0 ? -0.015 : 0);
        const shadeK = face > 0 ? 1 : 0.92;
        const vo = { color: [color[0] * shadeK, color[1] * shadeK, color[2] * shadeK], tint: tinted ? 1 : 0, bend: 0.05 + 0.12 * (1 - Math.abs(2 * u - 1)) };
        rows.push([b.vertex(x, y, z0, 0, 1, 0, u, 0, vo), b.vertex(x, y, z1, 0, 1, 0, u, 1, vo)]);
      }
      for (let i = 0; i < across; i += 1) {
        if (face > 0) b.quad(rows[i][1], rows[i + 1][1], rows[i + 1][0], rows[i][0]);
        else b.quad(rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]);
      }
    }
  }
  // The valance: short flaps hanging from both long edges, alternating colours.
  for (const edge of [-1, 1]) {
    const z = edge * (depth / 2 + 0.01);
    for (let i = 0; i < 4; i += 1) {
      const u0 = i / 4;
      const u1 = (i + 1) / 4;
      const tinted = i % 2 === 0;
      const vo = { color: tinted ? [1, 1, 1] : CREAM, tint: tinted ? 1 : 0, bend: 0.1 };
      const ya = heightAt(u0);
      const yb = heightAt(u1);
      const a = b.vertex(u0 - 0.5, ya, z, 0, 0, edge, 0, 0, vo);
      const c = b.vertex(u1 - 0.5, yb, z, 0, 0, edge, 1, 0, vo);
      const d = b.vertex(u1 - 0.5, yb - 0.32, z, 0, 0, edge, 1, 1, vo);
      const e = b.vertex(u0 - 0.5, ya - 0.32, z, 0, 0, edge, 0, 1, vo);
      if (edge > 0) b.quad(a, e, d, c);
      else b.quad(a, c, d, e);
      if (edge > 0) b.quad(a, c, d, e);
      else b.quad(a, e, d, c);
    }
  }
  return b.build();
}

/**
 * A market stall 3 m wide facing +Z: timber table with a cloth front, a sloping canopy in the copy's
 * colour with a cream valance, a hanging backcloth and a brass lamp. `goods` heaps the table:
 * 'fruit' (crates of oranges, pomegranates, melons, lemons, figs), 'spice' (cones of colour and sacks)
 * or 'brass' (lanterns, trays and copper pots).
 */
export function buildMarketStall(goods) {
  const b = createShapeBuilder();
  for (const x of [-1.4, 1.4]) {
    b.box(0.07, 2.55, 0.07, { x, y: 1.15, z: 1.0, color: WOOD_DARK });
    b.box(0.07, 2.95, 0.07, { x, y: 1.35, z: -0.95, color: WOOD_DARK });
  }
  b.box(2.8, 0.08, 1.15, { y: 0.86, z: 0.3, color: WOOD });
  b.box(2.8, 0.72, 0.04, { y: 0.48, z: 0.88, color: [1, 1, 1], tint: 1 });
  b.box(2.8, 0.1, 0.05, { y: 0.84, z: 0.9, color: CREAM });
  b.box(3.3, 0.05, 2.5, { y: 2.62, z: 0.05, rx: 0.14, color: [1, 1, 1], tint: 1 });
  b.box(3.3, 0.26, 0.03, { y: 2.32, z: 1.3, color: CREAM });
  b.box(2.8, 1.7, 0.03, { y: 1.75, z: -0.96, color: [0.75, 0.75, 0.75], tint: 1 });
  addHangingLamp(b, 0.9, 2.05, 0.6, 1);
  if (goods === 'fruit') {
    for (let i = 0; i < 4; i += 1) addFruitCrate(b, -1.05 + i * 0.7, 0.9, 0.3, FRUIT[i]);
    addFruitCrate(b, -0.9, 0.0, 1.35, FRUIT[4]);
    addFruitCrate(b, 0.9, 0.0, 1.35, FRUIT[5]);
  } else if (goods === 'spice') {
    b.box(2.7, 0.05, 0.5, { y: 0.92, z: 0.35, color: BRASS });
    for (let i = 0; i < 6; i += 1) b.cone(0.19, 0.32, 6, { x: -1.1 + i * 0.44, y: 1.1, z: 0.35, color: SPICE[i] });
    for (let i = 0; i < 3; i += 1) addSack(b, -0.8 + i * 0.8, 1.45, SPICE[(i + 2) % SPICE.length]);
  } else {
    for (let i = 0; i < 3; i += 1) {
      b.cylinder(0.18, 0.13, 0.22, 6, { x: -0.9 + i * 0.6, y: 1.01, z: 0.4, color: COPPER });
      b.box(0.4, 0.4, 0.02, { x: -0.6 + i * 0.6, y: 1.5, z: -0.92, rz: Math.PI / 4, color: BRASS });
    }
    for (let i = 0; i < 2; i += 1) addHangingLamp(b, -1.0 + i * 0.9, 2.05, 1.05, 0.85);
    b.cylinder(0.26, 0.2, 0.6, 6, { x: 1.1, y: 0.28, z: 1.3, color: TERRACOTTA });
  }
  return b.build();
}

/** A heap of lane-side goods against a wall: fruit crates, open sacks of spice and terracotta pots. */
export function buildLaneGoods() {
  const b = createShapeBuilder();
  addFruitCrate(b, -0.95, 0, 0, FRUIT[0]);
  addFruitCrate(b, -0.35, 0, 0.05, FRUIT[2]);
  b.box(0.62, 0.32, 0.46, { x: -0.65, y: 0.46, z: 0, ry: 0.3, color: WOOD });
  b.sphere(0.26, 5, 2, { x: -0.65, y: 0.64, z: 0, sy: 0.45, color: FRUIT[1] });
  addSack(b, 0.25, 0.08, SPICE[0]);
  addSack(b, 0.8, 0.1, SPICE[2]);
  b.cylinder(0.3, 0.22, 0.62, 6, { x: 1.35, y: 0.25, z: -0.05, color: TERRACOTTA });
  b.sphere(0.24, 6, 4, { x: 1.4, y: 0.75, z: -0.1, sy: 1.5, color: rgb(0x1b6f8a) });
  return b.build();
}

/** A small brass lamp hanging on a wire, glowing amber at night. */
function addHangingLamp(b, x, y, z, s) {
  b.cylinder(0.008, 0.008, 0.32 * s, 3, { x, y: y + 0.3 * s, z, color: BRASS, open: true });
  b.cylinder(0.11 * s, 0.08 * s, 0.26 * s, 6, { x, y, z, color: [1.0, 0.76, 0.4], glow: 1, open: true });
  b.cone(0.14 * s, 0.14 * s, 6, { x, y: y + 0.19 * s, z, color: BRASS });
}

/** A timber rail on two brackets for hanging rugs against a wall (the rugs are printed faces). */
export function buildRugRail() {
  const b = createShapeBuilder();
  b.box(4.2, 0.08, 0.08, { y: 2.95, z: 0.22, color: WOOD_DARK });
  for (const x of [-1.9, 1.9]) b.box(0.06, 0.3, 0.3, { x, y: 2.85, z: 0.1, color: WOOD_DARK });
  return b.build();
}

/** A tall timber pole that holds up awnings and lantern strings. */
export function buildCanopyPole() {
  const b = createShapeBuilder();
  b.cylinder(0.07, 0.09, 5.2, 6, { y: 2.4, color: WOOD_DARK });
  b.sphere(0.1, 6, 3, { y: 5.05, color: BRASS });
  return b.build();
}

/**
 * One small lantern of coloured glass (the copy's colour) in a brass cap, glowing at night, with its
 * stretch of cable (1.4 m along local X): a string of copies, each tilted to the sag, makes the line.
 */
export function buildHangingLantern() {
  const b = createShapeBuilder();
  b.box(1.4, 0.022, 0.022, { color: rgb(0x2a2420) });
  b.cylinder(0.11, 0.08, 0.26, 6, { y: -0.32, color: [1, 1, 1], tint: 1, glow: 1, bend: 0.12, open: true });
  b.cone(0.12, 0.14, 5, { y: -0.13, color: BRASS, bend: 0.1 });
  b.cone(0.07, 0.08, 5, { y: -0.49, rx: Math.PI, color: BRASS, bend: 0.12 });
  return b.build();
}

/** A slatted crate heaped with a mound of fruit, its base at (x, y, z). */
function addFruitCrate(b, x, y, z, fruitColor) {
  b.box(0.6, 0.3, 0.44, { x, y: y + 0.15, z, color: WOOD });
  b.sphere(0.27, 5, 2, { x, y: y + 0.3, z, sx: 1.05, sy: 0.5, sz: 0.8, color: fruitColor });
}

/** An open burlap sack with its top rolled down and full of `color`. */
function addSack(b, x, z, color) {
  b.cylinder(0.24, 0.27, 0.55, 6, { x, y: 0.27, z, color: BURLAP, open: true });
  b.cylinder(0.29, 0.27, 0.1, 6, { x, y: 0.55, z, color: BURLAP, open: true });
  b.cone(0.25, 0.2, 6, { x, y: 0.62, z, color });
}
