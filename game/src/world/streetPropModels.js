// The kerbside kit of Port Sarab as low-poly models: benches (clean slatted steel downtown, rough
// plank-on-blocks in the flats), litter bins and painted oil-drum bins, coral fire hydrants, bollards,
// glass bus shelters, street-name poles, parking meters, newspaper boxes, bike racks and planters.
// Each faces +Z (its front, toward the road) and stands on y = 0 with a footing that reaches below.
import { createShapeBuilder, rgb } from './propShapes.js';

const CHARCOAL = rgb(0x2c2e33);
const STEEL = rgb(0x8f979c);
const WOOD = rgb(0xb07a48);
const CONCRETE = rgb(0xb8ae9c);
const GLASS = [0.58, 0.76, 0.8];
const CREAM = rgb(0xfff4d6);

/** Slatted hardwood on cast charcoal frames: the downtown bench, 1.9 m long. */
export function buildModernBench() {
  const b = createShapeBuilder();
  for (const side of [-1, 1]) {
    b.box(0.08, 0.6, 0.52, { x: side * 0.86, y: 0.15, color: CHARCOAL });
    b.box(0.08, 0.55, 0.06, { x: side * 0.86, y: 0.72, z: -0.26, rx: -0.16, color: CHARCOAL });
  }
  for (let i = 0; i < 4; i += 1) b.box(1.9, 0.045, 0.11, { y: 0.46, z: -0.19 + i * 0.125, color: WOOD, tint: 1 });
  for (let i = 0; i < 3; i += 1) b.box(1.9, 0.09, 0.03, { y: 0.62 + i * 0.13, z: -0.29 - i * 0.022, rx: -0.16, color: WOOD, tint: 1 });
  return b.build();
}

/** A thick painted plank on two concrete blocks: the flats' and the old town's bench. */
export function buildRoughBench() {
  const b = createShapeBuilder();
  for (const side of [-1, 1]) b.box(0.32, 0.55, 0.44, { x: side * 0.7, y: 0.12, color: CONCRETE });
  b.box(1.85, 0.08, 0.46, { y: 0.43, color: [0.9, 0.9, 0.9], tint: 1 });
  return b.build();
}

/** A round steel litter bin with a domed lid. */
export function buildModernBin() {
  const b = createShapeBuilder();
  b.cylinder(0.25, 0.23, 0.95, 8, { y: 0.3, color: [0.85, 0.85, 0.85], tint: 1 });
  b.cylinder(0.27, 0.27, 0.06, 8, { y: 0.8, color: CHARCOAL });
  b.cylinder(0.16, 0.27, 0.12, 8, { y: 0.88, color: CHARCOAL });
  return b.build();
}

/** An old oil drum painted over and used as a bin, with its two rolling hoops. */
export function buildDrumBin() {
  const b = createShapeBuilder();
  b.cylinder(0.29, 0.29, 1.0, 8, { y: 0.32, color: [0.9, 0.9, 0.9], tint: 1 });
  b.cylinder(0.305, 0.305, 0.05, 8, { y: 0.15, color: [0.6, 0.6, 0.6], tint: 1 });
  b.cylinder(0.305, 0.305, 0.05, 8, { y: 0.5, color: [0.6, 0.6, 0.6], tint: 1 });
  b.cylinder(0.27, 0.27, 0.02, 8, { y: 0.83, color: rgb(0x2a2420) });
  return b.build();
}

/** A coral-red fire hydrant with its cap and two side outlets. */
export function buildHydrant() {
  const b = createShapeBuilder();
  b.cylinder(0.17, 0.19, 0.3, 8, { y: -0.05, color: [0.85, 0.85, 0.85], tint: 1 });
  b.cylinder(0.12, 0.14, 0.62, 8, { y: 0.38, color: [1, 1, 1], tint: 1 });
  b.cylinder(0.15, 0.15, 0.06, 8, { y: 0.66, color: [0.85, 0.85, 0.85], tint: 1 });
  b.sphere(0.12, 8, 4, { y: 0.72, sy: 0.8, color: [1, 1, 1], tint: 1 });
  b.cylinder(0.025, 0.04, 0.08, 5, { y: 0.84, color: STEEL });
  for (const side of [-1, 1]) b.cylinder(0.055, 0.055, 0.14, 6, { x: side * 0.16, y: 0.44, rz: Math.PI / 2, color: STEEL });
  b.cylinder(0.07, 0.07, 0.1, 6, { z: 0.15, y: 0.42, rx: Math.PI / 2, color: STEEL });
  return b.build();
}

/** A steel bollard with a reflective band. */
export function buildBollard() {
  const b = createShapeBuilder();
  b.cylinder(0.11, 0.12, 1.2, 8, { y: 0.35, color: [0.85, 0.85, 0.85], tint: 1 });
  b.cylinder(0.115, 0.115, 0.1, 8, { y: 0.78, color: CREAM });
  b.sphere(0.11, 8, 3, { y: 0.95, sy: 0.5, color: [0.85, 0.85, 0.85], tint: 1 });
  return b.build();
}

/**
 * A glass bus shelter 4.2 m long, open to the road (+Z): charcoal posts, a teal roof (tinted), a glass
 * back and end, a perch bench. An advert banner across the back glass is a separate printed face.
 */
export function buildBusShelter() {
  const b = createShapeBuilder();
  for (const x of [-2.05, 2.05]) {
    for (const z of [-0.72, 0.62]) b.box(0.08, 2.85, 0.08, { x, y: 1.25, z, color: CHARCOAL });
  }
  b.box(4.55, 0.12, 1.95, { y: 2.7, z: -0.02, rx: 0.04, color: rgb(0x1ba39c), tint: 1 });
  b.box(4.4, 0.18, 0.1, { y: 2.6, z: 0.92, color: [0.9, 0.9, 0.9], tint: 1 });
  b.box(4.0, 2.05, 0.04, { y: 1.28, z: -0.72, color: GLASS });
  b.box(0.04, 2.05, 1.25, { x: -2.05, y: 1.28, z: -0.08, color: GLASS });
  b.box(3.0, 0.06, 0.38, { y: 0.5, z: -0.48, color: STEEL });
  for (const x of [-1.2, 1.2]) b.box(0.06, 0.5, 0.06, { x, y: 0.22, z: -0.48, color: CHARCOAL });
  b.box(0.12, 0.32, 0.12, { x: 2.05, y: 2.4, z: 0.62, color: rgb(0xe9b44c) });
  return b.build();
}

/** A slim pole with two enamel name blades at right angles (faces printed separately). */
export function buildNameSignPole() {
  const b = createShapeBuilder();
  b.cylinder(0.05, 0.06, 3.7, 6, { y: 1.6, color: CHARCOAL });
  b.sphere(0.07, 6, 3, { y: 3.48, color: CHARCOAL });
  b.box(1.7, 0.32, 0.04, { x: 0.78, y: 3.2, color: rgb(0x0f5a54) });
  b.box(0.04, 0.32, 1.7, { y: 2.84, z: 0.78, color: rgb(0x0f5a54) });
  return b.build();
}

/** A parking meter: a post and a tinted head with a dark display. */
export function buildParkingMeter() {
  const b = createShapeBuilder();
  b.cylinder(0.04, 0.05, 1.2, 6, { y: 0.45, color: STEEL });
  b.box(0.2, 0.34, 0.15, { y: 1.18, color: [0.9, 0.9, 0.9], tint: 1 });
  b.sphere(0.11, 6, 3, { y: 1.35, sy: 0.6, color: [0.9, 0.9, 0.9], tint: 1 });
  b.box(0.13, 0.09, 0.02, { y: 1.24, z: 0.08, color: rgb(0x1a2a2e) });
  return b.build();
}

/** A newspaper vending box on short legs with a window in its door. */
export function buildNewsBox() {
  const b = createShapeBuilder();
  b.box(0.5, 0.92, 0.44, { y: 0.56, color: [0.92, 0.92, 0.92], tint: 1 });
  b.box(0.38, 0.3, 0.02, { y: 0.72, z: 0.225, color: [0.8, 0.86, 0.86] });
  b.box(0.52, 0.06, 0.46, { y: 1.04, color: CHARCOAL });
  for (const x of [-0.2, 0.2]) b.box(0.05, 0.25, 0.05, { x, y: 0.0, color: CHARCOAL });
  return b.build();
}

/** Three galvanised hoops on the pavement. */
export function buildBikeRack() {
  const b = createShapeBuilder();
  for (const x of [-0.65, 0, 0.65]) {
    b.tube([[x, -0.1, -0.35], [x, 0.7, -0.35], [x, 0.85, -0.15], [x, 0.85, 0.15], [x, 0.7, 0.35], [x, -0.1, 0.35]], 0.03, 4, { color: STEEL });
  }
  return b.build();
}

/** A long planter box (2.4 x 1.0 m) with soil; the flowers are planted separately. */
export function buildPlanter() {
  const b = createShapeBuilder();
  b.box(2.4, 0.75, 1.0, { y: 0.15, color: [0.92, 0.92, 0.92], tint: 1 });
  b.box(2.5, 0.06, 1.1, { y: 0.55, color: [0.8, 0.8, 0.8], tint: 1 });
  b.box(2.2, 0.04, 0.82, { y: 0.5, color: rgb(0x4a3424) });
  return b.build();
}
