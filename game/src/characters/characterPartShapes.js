// The sculpted low-poly pieces every Port Sarab body is assembled from: pelvis, torso, a head with a
// nose and ears, tapered limbs, mitten hands, shoes, hair, beards, caps, hard hats, sun hats, the head
// cloth and head scarf of the old town, robes and dresses, gang scarves and the five held weapons.
// Each piece is built once, in its joint's local space (limbs hang along -Y, the front is +Z).
import * as THREE from 'three';

/** One instanced mesh per part kind. */
export const PART = {
  PELVIS: 0, TORSO: 1, HEAD: 2, UPPER_ARM: 3, FOREARM: 4, HAND: 5, THIGH: 6, SHIN: 7, FOOT: 8,
  HAIR_SHORT: 9, HAIR_LONG: 10, BEARD: 11, CAP: 12, HELMET: 13, SUN_HAT: 14, HEAD_CLOTH: 15,
  HEAD_SCARF: 16, SKIRT: 17, NECK_SCARF: 18,
  PISTOL: 19, SMG: 20, RIFLE: 21, SHOTGUN: 22, BAT: 23,
};
export const PART_COUNT = 24;

/** Per part kind: drawn from both sides (open garments), casts a shadow, instances per person. */
export const PART_INFO = [
  { name: 'pelvis', doubleSided: false, shadow: true, perPerson: 1 },
  { name: 'torso', doubleSided: false, shadow: true, perPerson: 1 },
  { name: 'head', doubleSided: false, shadow: true, perPerson: 1 },
  { name: 'upperArm', doubleSided: false, shadow: true, perPerson: 2 },
  { name: 'forearm', doubleSided: false, shadow: true, perPerson: 2 },
  { name: 'hand', doubleSided: false, shadow: true, perPerson: 2 },
  { name: 'thigh', doubleSided: false, shadow: true, perPerson: 2 },
  { name: 'shin', doubleSided: false, shadow: true, perPerson: 2 },
  { name: 'foot', doubleSided: false, shadow: true, perPerson: 2 },
  { name: 'hairShort', doubleSided: true, shadow: true, perPerson: 1 },
  { name: 'hairLong', doubleSided: true, shadow: true, perPerson: 1 },
  { name: 'beard', doubleSided: true, shadow: false, perPerson: 1 },
  { name: 'cap', doubleSided: true, shadow: true, perPerson: 1 },
  { name: 'helmet', doubleSided: true, shadow: true, perPerson: 1 },
  { name: 'sunHat', doubleSided: true, shadow: true, perPerson: 1 },
  { name: 'headCloth', doubleSided: true, shadow: true, perPerson: 1 },
  { name: 'headScarf', doubleSided: true, shadow: true, perPerson: 1 },
  { name: 'skirt', doubleSided: true, shadow: true, perPerson: 1 },
  { name: 'neckScarf', doubleSided: true, shadow: false, perPerson: 1 },
  { name: 'pistol', doubleSided: false, shadow: false, perPerson: 1 },
  { name: 'smg', doubleSided: false, shadow: false, perPerson: 1 },
  { name: 'rifle', doubleSided: false, shadow: false, perPerson: 1 },
  { name: 'shotgun', doubleSided: false, shadow: false, perPerson: 1 },
  { name: 'bat', doubleSided: false, shadow: false, perPerson: 1 },
];

/** Held weapons sit in the right hand: where the grip is, where the muzzle is, where the left hand holds. */
export const WEAPON_GRIP_DROP = 0.075;
export const WEAPON_SHAPES = {
  pistol: { part: PART.PISTOL, muzzle: [0, 0.038, 0.16], support: [0, -0.03, 0.0], twoHanded: false },
  smg: { part: PART.SMG, muzzle: [0, 0.035, 0.31], support: [0, -0.02, 0.14], twoHanded: true },
  rifle: { part: PART.RIFLE, muzzle: [0, 0.035, 0.63], support: [0, -0.015, 0.27], twoHanded: true },
  shotgun: { part: PART.SHOTGUN, muzzle: [0, 0.035, 0.69], support: [0, -0.01, 0.37], twoHanded: true },
  bat: { part: PART.BAT, muzzle: [0, 0, 0.72], support: [0, 0, 0.1], twoHanded: true },
};

/** Build the geometry of every part kind, indexed by PART. */
export function buildPartGeometries() {
  const list = new Array(PART_COUNT);
  list[PART.PELVIS] = loft([
    [-0.115, 0.07, 0.065, 0, 0.005], [-0.09, 0.132, 0.092, 0, 0], [-0.03, 0.163, 0.104, 0, -0.005],
    [0.03, 0.156, 0.1, 0, -0.005], [0.088, 0.146, 0.094, 0, 0],
  ], 12, 2.6, true, true);
  list[PART.TORSO] = loft([
    [-0.03, 0.144, 0.094, 0, 0], [0.08, 0.147, 0.1, 0, 0.006], [0.2, 0.158, 0.11, 0, 0.014],
    [0.31, 0.172, 0.116, 0, 0.016], [0.385, 0.188, 0.104, 0, 0.006], [0.44, 0.152, 0.084, 0, 0.004],
    [0.478, 0.066, 0.058, 0, 0.012],
  ], 14, 2.5, true, true);
  list[PART.HEAD] = buildHead();
  list[PART.UPPER_ARM] = loft([
    [0.05, 0.026, 0.026, 0, 0], [0.028, 0.054, 0.055, 0, 0], [-0.03, 0.057, 0.058, 0, 0],
    [-0.14, 0.047, 0.051, 0, 0], [-0.25, 0.041, 0.043, 0, 0], [-0.292, 0.033, 0.035, 0, 0],
  ], 10, 2.2, true, true);
  list[PART.FOREARM] = loft([
    [0.018, 0.028, 0.03, 0, 0], [-0.01, 0.042, 0.045, 0, 0], [-0.07, 0.045, 0.048, 0, 0.002],
    [-0.2, 0.033, 0.035, 0, 0], [-0.252, 0.028, 0.03, 0, 0],
  ], 10, 2.2, true, true);
  list[PART.HAND] = buildHand();
  list[PART.THIGH] = loft([
    [0.065, 0.066, 0.066, 0, 0], [0.0, 0.088, 0.092, 0, 0], [-0.12, 0.084, 0.088, 0, 0.005],
    [-0.3, 0.065, 0.068, 0, 0.004], [-0.4, 0.055, 0.058, 0, 0.007], [-0.445, 0.046, 0.048, 0, 0.004],
  ], 10, 2.2, true, true);
  list[PART.SHIN] = loft([
    [0.035, 0.046, 0.046, 0, 0.004], [-0.02, 0.054, 0.056, 0, 0.004], [-0.11, 0.055, 0.061, 0, -0.012],
    [-0.3, 0.04, 0.043, 0, 0], [-0.4, 0.035, 0.037, 0, 0], [-0.432, 0.031, 0.033, 0, 0],
  ], 10, 2.2, true, true);
  list[PART.FOOT] = buildFoot();
  list[PART.HAIR_SHORT] = buildHairCap(false);
  list[PART.HAIR_LONG] = buildHairCap(true);
  list[PART.BEARD] = loft([
    [0.128, 0.091, 0.104, 0, 0.007], [0.108, 0.085, 0.104, 0, 0.014], [0.088, 0.077, 0.099, 0, 0.018],
    [0.069, 0.064, 0.089, 0, 0.022], [0.053, 0.05, 0.07, 0, 0.018],
  ], 14, 2.2, false, false, [-1.85, 1.85]);
  list[PART.CAP] = buildCap();
  list[PART.HELMET] = buildHelmet();
  list[PART.SUN_HAT] = buildSunHat();
  list[PART.HEAD_CLOTH] = buildHeadCloth();
  list[PART.HEAD_SCARF] = buildHeadScarf();
  list[PART.SKIRT] = loft([
    [0.0, 0.153, 0.104, 0, 0], [-0.1, 0.172, 0.12, 0, 0], [-0.25, 0.186, 0.138, 0, 0.004],
    [-0.5, 0.198, 0.156, 0, 0.006], [-0.75, 0.208, 0.17, 0, 0.006], [-0.86, 0.214, 0.176, 0, 0.006],
  ], 14, 2.2, false, false);
  list[PART.NECK_SCARF] = buildNeckScarf();
  list[PART.PISTOL] = buildPistol();
  list[PART.SMG] = buildSmg();
  list[PART.RIFLE] = buildRifle();
  list[PART.SHOTGUN] = buildShotgun();
  list[PART.BAT] = buildBat();
  for (const geometry of list) {
    geometry.computeBoundingSphere();
  }
  return list;
}

/** The head: an egg-shaped skull on a neck, with a nose that shows which way the face looks, and ears. */
function buildHead() {
  const skull = loft([
    [0.0, 0.052, 0.052, 0, 0], [0.055, 0.054, 0.056, 0, 0.002], [0.075, 0.066, 0.078, 0, 0.016],
    [0.105, 0.078, 0.092, 0, 0.014], [0.15, 0.088, 0.1, 0, 0.006], [0.2, 0.092, 0.104, 0, 0],
    [0.245, 0.087, 0.1, 0, -0.006], [0.28, 0.068, 0.08, 0, -0.01], [0.3, 0.036, 0.042, 0, -0.012],
    [0.307, 0.008, 0.008, 0, -0.012],
  ], 12, 2.3, true, true);
  const nose = triangles([
    // left side, right side, underside, and a small bridge face
    0, 0.198, 0.1, -0.017, 0.15, 0.104, 0, 0.156, 0.134,
    0, 0.198, 0.1, 0, 0.156, 0.134, 0.017, 0.15, 0.104,
    -0.017, 0.15, 0.104, 0.017, 0.15, 0.104, 0, 0.156, 0.134,
  ]);
  const earL = box(0.082, 0.1, 0.158, 0.206, -0.022, 0.012);
  const earR = box(-0.1, -0.082, 0.158, 0.206, -0.022, 0.012);
  return merge([skull, nose, earL, earR]);
}

/** A mitten hand with a thumb, palm facing the thigh when the arm hangs. */
function buildHand() {
  const palm = loft([
    [0.012, 0.022, 0.03, 0, 0], [-0.035, 0.027, 0.044, 0, 0], [-0.09, 0.024, 0.046, 0, -0.002],
    [-0.14, 0.019, 0.039, 0, -0.004], [-0.165, 0.011, 0.024, 0, -0.004],
  ], 8, 2.8, true, true);
  const thumb = loft([
    [0.0, 0.012, 0.012, 0, 0], [-0.03, 0.011, 0.011, 0, 0], [-0.055, 0.008, 0.008, 0, 0],
  ], 6, 2, true, true);
  thumb.rotateX(-0.55);
  thumb.translate(0.004, -0.03, 0.04);
  return merge([palm, thumb]);
}

/** A shoe built heel to toe along +Z, its sole on the ground (0.08 below the ankle joint). */
function buildFoot() {
  // rings: [z, halfWidth, top, bottom]
  const sections = [
    [-0.07, 0.034, -0.012, -0.08], [-0.045, 0.041, 0.022, -0.08], [0.03, 0.047, 0.004, -0.08],
    [0.1, 0.05, -0.034, -0.08], [0.152, 0.044, -0.05, -0.08], [0.172, 0.028, -0.062, -0.08],
  ];
  const rings = sections.map(([z, half, top, bottom]) => [z, half, (top - bottom) * 0.5, 0, -(top + bottom) * 0.5]);
  const shoe = loft(rings, 10, 3.2, true, true);
  shoe.rotateX(Math.PI / 2);
  return shoe;
}

/** Hair: a cap over the skull with a hairline high at the forehead and low at the nape; long hair adds a fall down the back. */
function buildHairCap(long) {
  const front = 1.05;
  const back = long ? 2.3 : 2.22;
  const cap = shell(18, 7, (u, v, out) => {
    const theta = u * Math.PI * 2;
    const around = (1 - Math.cos(theta)) * 0.5;
    const limit = front + (back - front) * Math.pow(around, 1.4);
    const phi = v * limit;
    const swell = 1 + 0.06 * Math.sin(Math.min(phi, 1.6)) * (1 - v * 0.6);
    out.set(0.1 * swell * Math.sin(phi) * Math.sin(theta), 0.19 + 0.126 * Math.cos(phi), -0.004 + 0.114 * swell * Math.sin(phi) * Math.cos(theta));
  });
  if (!long) return cap;
  const fall = loft([
    [0.2, 0.098, 0.05, 0, -0.072], [0.1, 0.1, 0.048, 0, -0.084], [0.0, 0.094, 0.042, 0, -0.098],
    [-0.08, 0.09, 0.036, 0, -0.104], [-0.13, 0.08, 0.026, 0, -0.106],
  ], 12, 2.4, false, true, [Math.PI * 0.5, Math.PI * 1.5]);
  return merge([cap, fall]);
}

/** A peaked cap: a soft crown and a curved bill over the eyes. */
function buildCap() {
  const crown = shell(16, 5, (u, v, out) => {
    const theta = u * Math.PI * 2;
    const phi = v * 1.42;
    out.set(0.104 * Math.sin(phi) * Math.sin(theta), 0.2 + 0.12 * Math.cos(phi), -0.004 + 0.117 * Math.sin(phi) * Math.cos(theta));
  });
  const bill = grid(9, 2, (u, v, out) => {
    const theta = (u - 0.5) * 2.1;
    const edge = 0.117 * Math.sin(1.42);
    const reach = edge + v * 0.075 * Math.pow(Math.cos(theta * 0.75), 0.6);
    out.set(0.104 * Math.sin(theta) * (reach / edge) * 0.98, 0.2 + 0.12 * Math.cos(1.42) - v * 0.014, -0.004 + reach * Math.cos(theta));
  });
  return merge([crown, bill]);
}

/** A rounded helmet with a short brim: hard hats on the docks, armour helmets on the SWAT team. */
function buildHelmet() {
  const dome = shell(16, 6, (u, v, out) => {
    const theta = u * Math.PI * 2;
    const phi = v * 1.62;
    out.set(0.113 * Math.sin(phi) * Math.sin(theta), 0.19 + 0.132 * Math.cos(phi), -0.004 + 0.124 * Math.sin(phi) * Math.cos(theta));
  });
  const brim = grid(16, 1, (u, v, out) => {
    const theta = u * Math.PI * 2;
    const front = Math.max(0, Math.cos(theta));
    const grow = 1 + v * (0.16 + 0.22 * front * front);
    const phi = 1.62;
    out.set(0.113 * Math.sin(phi) * Math.sin(theta) * grow, 0.19 + 0.132 * Math.cos(phi) - v * 0.006, -0.004 + 0.124 * Math.sin(phi) * Math.cos(theta) * grow);
  });
  return merge([dome, brim]);
}

/** A tourist's wide-brimmed sun hat. */
function buildSunHat() {
  const crown = shell(16, 4, (u, v, out) => {
    const theta = u * Math.PI * 2;
    const phi = v * 1.32;
    const flat = 1 - 0.25 * Math.cos(phi);
    out.set(0.102 * Math.sin(phi) * Math.sin(theta), 0.218 + 0.105 * Math.cos(phi) * flat, -0.004 + 0.113 * Math.sin(phi) * Math.cos(theta));
  });
  const brim = grid(18, 2, (u, v, out) => {
    const theta = u * Math.PI * 2;
    const phi = 1.32;
    const radius = 1 + v * 1.0;
    out.set(0.102 * Math.sin(phi) * Math.sin(theta) * radius, 0.218 + 0.105 * Math.cos(phi) * 0.94 - v * v * 0.03, -0.004 + 0.113 * Math.sin(phi) * Math.cos(theta) * radius);
  });
  return merge([crown, brim]);
}

/** The white head cloth of Old Sarab, open at the face and falling to the shoulders, with its band. */
function buildHeadCloth() {
  const cloth = openLoft([
    [0.318, 0.02, 0.02, 0, -0.01, 0], [0.305, 0.072, 0.077, 0, -0.01, 0], [0.28, 0.099, 0.109, 0, -0.008, 0],
    [0.24, 0.108, 0.118, 0, -0.006, 0], [0.2, 0.112, 0.118, 0, -0.01, 0.74], [0.14, 0.116, 0.118, 0, -0.02, 0.9],
    [0.08, 0.122, 0.12, 0, -0.03, 0.98], [0.02, 0.138, 0.126, 0, -0.04, 1.04], [-0.05, 0.172, 0.142, 0, -0.05, 1.1],
    [-0.11, 0.205, 0.152, 0, -0.06, 1.15],
  ], 18);
  const band = loft([
    [0.226, 0.115, 0.125, 0, -0.006], [0.243, 0.12, 0.13, 0, -0.006], [0.26, 0.114, 0.124, 0, -0.006],
  ], 18, 2, false, false);
  return merge([cloth, band]);
}

/** A head scarf wrapped close around the face and draped over the shoulders. */
function buildHeadScarf() {
  return openLoft([
    [0.318, 0.02, 0.02, 0, -0.01, 0], [0.3, 0.077, 0.082, 0, -0.012, 0], [0.27, 0.1, 0.11, 0, -0.01, 0],
    [0.226, 0.105, 0.115, 0, -0.008, 0.52], [0.17, 0.103, 0.113, 0, -0.004, 0.92], [0.11, 0.094, 0.106, 0, 0.004, 1.0],
    [0.07, 0.08, 0.097, 0, 0.014, 0.62], [0.04, 0.072, 0.084, 0, 0.012, 0], [-0.02, 0.112, 0.094, 0, 0.0, 0],
    [-0.05, 0.18, 0.116, 0, -0.008, 0], [-0.085, 0.222, 0.132, 0, -0.012, 0],
  ], 18);
}

/** A gang scarf: a knotted ring at the collar and a point down the chest. */
function buildNeckScarf() {
  const ring = loft([
    [0.425, 0.1, 0.09, 0, -0.004], [0.462, 0.088, 0.078, 0, -0.008], [0.5, 0.072, 0.066, 0, -0.01],
  ], 14, 2.2, false, false);
  const point = triangles([
    -0.07, 0.44, 0.088, 0, 0.3, 0.142, 0.07, 0.44, 0.088,
  ]);
  return merge([ring, point]);
}

function buildPistol() {
  return weaponFrame(merge([
    box(-0.014, 0.014, 0.018, 0.056, -0.035, 0.155),
    slanted(-0.013, 0.013, -0.085, 0.022, -0.04, 0.0, -0.012),
    box(-0.004, 0.004, -0.012, 0.018, 0.0, 0.03),
  ]));
}

function buildSmg() {
  return weaponFrame(merge([
    box(-0.019, 0.019, 0.0, 0.062, -0.09, 0.2),
    box(-0.009, 0.009, 0.024, 0.046, 0.2, 0.31),
    slanted(-0.015, 0.015, -0.09, 0.005, -0.03, 0.01, -0.015),
    box(-0.012, 0.012, -0.13, 0.0, 0.06, 0.092),
    box(-0.008, 0.008, 0.02, 0.05, -0.24, -0.09),
  ]));
}

function buildRifle() {
  return weaponFrame(merge([
    box(-0.021, 0.021, -0.006, 0.066, -0.09, 0.31),
    box(-0.01, 0.01, 0.024, 0.046, 0.31, 0.63),
    box(-0.016, 0.016, 0.066, 0.09, -0.02, 0.12),
    slanted(-0.019, 0.019, -0.05, 0.052, -0.35, -0.09, 0.0),
    slanted(-0.015, 0.015, -0.09, 0.0, -0.035, 0.008, -0.016),
    slanted(-0.013, 0.013, -0.135, 0.0, 0.085, 0.13, 0.03),
  ]));
}

function buildShotgun() {
  return weaponFrame(merge([
    box(-0.015, 0.015, 0.02, 0.052, -0.05, 0.69),
    box(-0.021, 0.021, -0.008, 0.038, 0.3, 0.46),
    box(-0.021, 0.021, -0.012, 0.062, -0.09, 0.09),
    slanted(-0.019, 0.019, -0.065, 0.042, -0.37, -0.09, -0.02),
    slanted(-0.015, 0.015, -0.085, 0.0, -0.035, 0.008, -0.014),
  ]));
}

function buildBat() {
  const bat = loft([
    [-0.085, 0.022, 0.022, 0, 0], [-0.07, 0.018, 0.018, 0, 0], [0.18, 0.02, 0.02, 0, 0],
    [0.42, 0.031, 0.031, 0, 0], [0.7, 0.037, 0.037, 0, 0], [0.75, 0.03, 0.03, 0, 0],
  ], 8, 2, true, true);
  // built along +Y; turn it to run along the weapon's +Z like the guns
  bat.rotateX(Math.PI / 2);
  return weaponFrame(bat);
}

/** Turn a weapon built with its barrel along +Z and its grip at the origin into the right hand's frame. */
function weaponFrame(geometry) {
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, -WEAPON_GRIP_DROP, 0);
  return geometry;
}

/**
 * A tube through cross-section rings [y, rx, rz, cx, cz] (superellipse sections with `exponent`;
 * 2 is an ellipse, higher is boxier), capped or open at each end. `arc` limits the sections to an
 * angle range (0 faces +Z, PI/2 faces +X).
 */
function loft(rings, sides, exponent, capBottom, capTop, arc) {
  const open = !!arc;
  const columns = open ? sides + 1 : sides;
  const start = open ? arc[0] : 0;
  const span = open ? arc[1] - arc[0] : Math.PI * 2;
  const positions = [];
  const indices = [];
  const power = 2 / exponent;
  for (const [y, rx, rz, cx, cz] of rings) {
    for (let j = 0; j < columns; j += 1) {
      const theta = start + (span * j) / (open ? sides : sides);
      const s = Math.sin(theta);
      const c = Math.cos(theta);
      positions.push(cx + rx * Math.sign(s) * Math.pow(Math.abs(s), power), y, cz + rz * Math.sign(c) * Math.pow(Math.abs(c), power));
    }
  }
  const ringCount = rings.length;
  for (let i = 0; i < ringCount - 1; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * columns + j;
      const b = i * columns + ((j + 1) % columns);
      const c = (i + 1) * columns + j;
      const d = (i + 1) * columns + ((j + 1) % columns);
      if (rings[i + 1][0] >= rings[i][0]) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const ascending = rings[ringCount - 1][0] >= rings[0][0];
  const addCap = (ringIndex, isTop) => {
    const ring = rings[ringIndex];
    const center = positions.length / 3;
    positions.push(ring[3], ring[0] + (isTop === ascending ? 0.004 : -0.004), ring[4]);
    for (let j = 0; j < sides; j += 1) {
      const a = ringIndex * columns + j;
      const b = ringIndex * columns + ((j + 1) % columns);
      const upward = isTop === ascending;
      if (upward) indices.push(a, b, center);
      else indices.push(a, center, b);
    }
  };
  if (capBottom && !open) addCap(0, false);
  if (capTop && !open) addCap(ringCount - 1, true);
  return finish(positions, indices);
}

/** Like loft, but each ring [y, rx, rz, cx, cz, gap] leaves the front open by +-gap radians (a hood around a face). */
function openLoft(rings, columns) {
  const positions = [];
  const indices = [];
  for (const [y, rx, rz, cx, cz, gap] of rings) {
    for (let j = 0; j <= columns; j += 1) {
      const theta = gap + ((Math.PI * 2 - 2 * gap) * j) / columns;
      positions.push(cx + rx * Math.sin(theta), y, cz + rz * Math.cos(theta));
    }
  }
  const stride = columns + 1;
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let j = 0; j < columns; j += 1) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return finish(positions, indices);
}

/**
 * A closed-around shell from a top pole down to a boundary, through pointAt(u around, v down).
 * u runs from the back of the head round to the back again, so the seam hides behind.
 */
function shell(columns, rows, pointAt) {
  return grid(columns, rows, (u, v, out) => pointAt(u + 0.5, v, out), true);
}

/** A (columns x rows) sheet of quads through pointAt(u, v, out), u and v in 0..1. */
function grid(columns, rows, pointAt, wrapsAround = false) {
  const positions = [];
  const indices = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= rows; i += 1) {
    for (let j = 0; j <= columns; j += 1) {
      pointAt(j / columns, i / rows, p);
      positions.push(p.x, p.y, p.z);
    }
  }
  const stride = columns + 1;
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < columns; j += 1) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = finish(positions, indices);
  if (wrapsAround) geometry.userData.wraps = true;
  return geometry;
}

/** A box with flat faces. */
function box(x0, x1, y0, y1, z0, z1) {
  const geometry = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geometry.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return geometry.toNonIndexed();
}

/** A box whose bottom is shifted along z by `rake` (a pistol grip or a rifle stock). */
function slanted(x0, x1, y0, y1, z0, z1, rake) {
  const geometry = box(x0, x1, y0, y1, z0, z1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) < (y0 + y1) / 2) position.setZ(i, position.getZ(i) + rake);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Loose triangles from a flat list of xyz triples (drawn from both sides by the garment parts). */
function triangles(flat) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function finish(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

/** Join non-indexed geometries (position and normal only) into one. */
function merge(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  let offset = 0;
  for (const g of list) {
    const source = g.index ? g.toNonIndexed() : g;
    if (!source.attributes.normal) source.computeVertexNormals();
    positions.set(source.attributes.position.array, offset * 3);
    normals.set(source.attributes.normal.array, offset * 3);
    offset += source.attributes.position.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}
