// The little floating icons of the things lying around Port Sarab: each gun and the bat in miniature,
// a box of rounds, a first-aid case, a body-armour vest and a banded stack of cash. All of them live in
// one geometry, every vertex tagged with its icon's number, so one instanced mesh draws them all.
import * as THREE from 'three';

/** Icon numbers: the value of the per-vertex `iconShape` attribute and of the per-instance choice. */
export const ICON_SHAPE = {
  pistol: 0, smg: 1, shotgun: 2, rifle: 3, bat: 4, marksman: 5, ammo: 6, health: 7, armor: 8, cash: 9,
};

/** What each pickup kind glows as on the ground (0xRRGGBB). */
export const RING_COLORS = {
  weapon: 0xffb43c, ammo: 0xfff0c8, health: 0xff5a4a, armor: 0x38c8ff, cash: 0x5ef08c,
};

const GRAPHITE = 0x2b2f36;
const STEEL = 0x5b626c;
const WOOD = 0xb8834e;
const DARK_WOOD = 0x7a5232;
const GOLD = 0xe9b44c;
const OLIVE = 0x5e6b35;
const BRASS = 0xd9a441;
const WHITE = 0xf6f2e8;
const RED = 0xe23a2c;
const TEAL = 0x2fd0c4;
const NAVY = 0x0f5f68;
const CREAM = 0xfff4d6;
const GREEN = 0x5ad86a;
const DARK_GREEN = 0x3fb653;

/**
 * Build the merged icon geometry: position, normal, color and iconShape attributes, non-indexed.
 * Every icon is centred on its own origin, about 0.3 to 0.9 m across, guns lying along +X.
 */
export function buildPickupIconGeometry() {
  const parts = { positions: [], normals: [], colors: [], shapes: [] };
  const add = (geometry, color, shape, px, py, pz, rx = 0, ry = 0, rz = 0) => addPart(parts, geometry, color, shape, px, py, pz, rx, ry, rz);
  const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
  const rod = (r0, r1, length, segments = 8) => new THREE.CylinderGeometry(r0, r1, length, segments);
  const HALF_PI = Math.PI / 2;

  // Viper 9: slide, frame, raked grip, trigger guard and a gold stripe.
  let s = ICON_SHAPE.pistol;
  add(box(0.3, 0.065, 0.05), GRAPHITE, s, 0.02, 0.05, 0);
  add(box(0.24, 0.04, 0.046), STEEL, s, 0.0, 0.005, 0);
  add(box(0.075, 0.17, 0.048), DARK_WOOD, s, -0.1, -0.075, 0, 0, 0, 0.28);
  add(box(0.07, 0.012, 0.03), GRAPHITE, s, -0.02, -0.045, 0);
  add(box(0.3, 0.012, 0.052), GOLD, s, 0.02, 0.075, 0);

  // Hornet MP: boxy body, short barrel, long magazine, pistol grip, folding stock.
  s = ICON_SHAPE.smg;
  add(box(0.32, 0.09, 0.06), GRAPHITE, s, 0, 0.03, 0);
  add(rod(0.018, 0.018, 0.14), STEEL, s, 0.22, 0.045, 0, 0, 0, HALF_PI);
  add(box(0.045, 0.2, 0.04), STEEL, s, 0.05, -0.1, 0, 0, 0, 0.1);
  add(box(0.06, 0.13, 0.05), GRAPHITE, s, -0.08, -0.07, 0, 0, 0, 0.3);
  add(box(0.2, 0.025, 0.03), STEEL, s, -0.24, 0.02, 0);
  add(box(0.03, 0.09, 0.05), STEEL, s, -0.33, 0.0, 0);
  add(box(0.32, 0.012, 0.062), GOLD, s, 0, 0.077, 0);

  // Dust Devil 12: long barrel over a tube, wooden pump and stock.
  s = ICON_SHAPE.shotgun;
  add(rod(0.022, 0.022, 0.62), STEEL, s, 0.24, 0.045, 0, 0, 0, HALF_PI);
  add(rod(0.018, 0.018, 0.5), GRAPHITE, s, 0.2, 0.0, 0, 0, 0, HALF_PI);
  add(box(0.19, 0.06, 0.06), WOOD, s, 0.24, 0.0, 0);
  add(box(0.2, 0.085, 0.06), GRAPHITE, s, -0.12, 0.03, 0);
  add(box(0.3, 0.09, 0.055), WOOD, s, -0.36, -0.02, 0, 0, 0, -0.16);
  add(box(0.06, 0.1, 0.05), WOOD, s, -0.2, -0.06, 0, 0, 0, 0.35);

  // Jackal AR: receiver, barrel, curved magazine, grip, stock, carry sight.
  s = ICON_SHAPE.rifle;
  add(box(0.34, 0.09, 0.06), GRAPHITE, s, 0, 0.03, 0);
  add(rod(0.016, 0.016, 0.3), STEEL, s, 0.31, 0.04, 0, 0, 0, HALF_PI);
  add(box(0.16, 0.06, 0.065), STEEL, s, 0.24, 0.035, 0);
  add(box(0.055, 0.2, 0.045), STEEL, s, 0.07, -0.1, 0, 0, 0, -0.25);
  add(box(0.06, 0.13, 0.05), GRAPHITE, s, -0.07, -0.07, 0, 0, 0, 0.3);
  add(box(0.24, 0.085, 0.05), DARK_WOOD, s, -0.28, 0.0, 0, 0, 0, -0.08);
  add(box(0.12, 0.03, 0.03), GRAPHITE, s, 0.0, 0.09, 0);
  add(box(0.34, 0.012, 0.066), GOLD, s, 0, -0.012, 0);

  // Cedar Slugger: a tapered cedar bat with a taped handle and a knob.
  s = ICON_SHAPE.bat;
  add(rod(0.05, 0.026, 0.62, 10), WOOD, s, 0.12, 0, 0, 0, 0, -HALF_PI);
  add(rod(0.025, 0.024, 0.24, 8), GRAPHITE, s, -0.31, 0, 0, 0, 0, -HALF_PI);
  add(rod(0.036, 0.036, 0.025, 8), GRAPHITE, s, -0.44, 0, 0, 0, 0, -HALF_PI);
  add(rod(0.051, 0.051, 0.02, 10), GOLD, s, 0.36, 0, 0, 0, 0, -HALF_PI);

  // Longsight 7: a long rifle with a fat scope and a bolt handle.
  s = ICON_SHAPE.marksman;
  add(box(0.3, 0.08, 0.06), GRAPHITE, s, 0, 0.03, 0);
  add(rod(0.016, 0.014, 0.5), STEEL, s, 0.4, 0.045, 0, 0, 0, HALF_PI);
  add(rod(0.032, 0.032, 0.26), GRAPHITE, s, 0.02, 0.12, 0, 0, 0, HALF_PI);
  add(rod(0.04, 0.04, 0.03), GOLD, s, 0.15, 0.12, 0, 0, 0, HALF_PI);
  add(box(0.05, 0.12, 0.04), STEEL, s, 0.06, -0.06, 0);
  add(box(0.34, 0.1, 0.055), WOOD, s, -0.3, -0.01, 0, 0, 0, -0.1);
  add(box(0.02, 0.02, 0.09), STEEL, s, -0.05, 0.06, 0.05);

  // A box of rounds with three brass cartridges standing on it.
  s = ICON_SHAPE.ammo;
  add(box(0.3, 0.16, 0.2), OLIVE, s, 0, -0.04, 0);
  add(box(0.31, 0.03, 0.21), GOLD, s, 0, 0.0, 0);
  for (let i = -1; i <= 1; i += 1) {
    add(rod(0.026, 0.026, 0.12, 8), BRASS, s, i * 0.08, 0.1, 0);
    add(new THREE.ConeGeometry(0.026, 0.06, 8), STEEL, s, i * 0.08, 0.19, 0);
  }

  // A first-aid case: white with a red cross on both faces and a handle.
  s = ICON_SHAPE.health;
  add(box(0.34, 0.26, 0.12), WHITE, s, 0, 0, 0);
  for (const face of [-1, 1]) {
    add(box(0.2, 0.065, 0.02), RED, s, 0, 0, face * 0.065);
    add(box(0.065, 0.2, 0.02), RED, s, 0, 0, face * 0.065);
  }
  add(box(0.12, 0.03, 0.04), GRAPHITE, s, 0, 0.15, 0);

  // A body-armour vest: front plate, shoulder straps, side panels and a cream badge.
  s = ICON_SHAPE.armor;
  add(box(0.36, 0.34, 0.1), TEAL, s, 0, -0.02, 0);
  add(box(0.07, 0.12, 0.09), NAVY, s, -0.12, 0.19, 0);
  add(box(0.07, 0.12, 0.09), NAVY, s, 0.12, 0.19, 0);
  add(box(0.06, 0.26, 0.11), NAVY, s, -0.19, -0.04, 0);
  add(box(0.06, 0.26, 0.11), NAVY, s, 0.19, -0.04, 0);
  add(box(0.38, 0.04, 0.11), NAVY, s, 0, -0.14, 0);
  add(box(0.09, 0.07, 0.02), CREAM, s, 0.06, 0.06, 0.055);

  // Two banded stacks of notes, the top one turned.
  s = ICON_SHAPE.cash;
  add(box(0.32, 0.09, 0.16), GREEN, s, 0, -0.05, 0);
  add(box(0.06, 0.095, 0.165), CREAM, s, 0, -0.05, 0);
  add(box(0.32, 0.09, 0.16), DARK_GREEN, s, 0.02, 0.045, 0.01, 0, 0.5, 0);
  add(box(0.06, 0.095, 0.165), CREAM, s, 0.02, 0.045, 0.01, 0, 0.5, 0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(parts.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(parts.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(parts.colors, 3));
  geometry.setAttribute('iconShape', new THREE.Float32BufferAttribute(parts.shapes, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** A soft glowing ring on a transparent square, drawn on a canvas: the halo under every pickup. */
export function buildGlowRingTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,0.32)');
  glow.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  glow.addColorStop(0.62, 'rgba(255,255,255,0.0)');
  glow.addColorStop(0.7, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.78, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Patch a material so each instance shows only its own icon: vertices whose iconShape differs from the
 * instance's `instanceShape` collapse to the origin and draw nothing.
 */
export function selectIconPerInstance(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iconShape;\nattribute float instanceShape;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  if (abs(iconShape - instanceShape) > 0.5) transformed = vec3(0.0);');
  };
  material.customProgramCacheKey = () => 'khamsin-pickup-icons';
  return material;
}

const _matrix = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _color = new THREE.Color();

/** Transform one part, flatten it, and append its triangles with a colour and an icon number. */
function addPart(parts, geometry, color, shape, px, py, pz, rx, ry, rz) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  _euler.set(rx, ry, rz);
  _matrix.makeRotationFromEuler(_euler).setPosition(px, py, pz);
  flat.applyMatrix4(_matrix);
  const position = flat.attributes.position;
  const normal = flat.attributes.normal;
  _color.setHex(color).convertSRGBToLinear();
  for (let i = 0; i < position.count; i += 1) {
    parts.positions.push(position.getX(i), position.getY(i), position.getZ(i));
    parts.normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    parts.colors.push(_color.r, _color.g, _color.b);
    parts.shapes.push(shape);
  }
  geometry.dispose();
  if (flat !== geometry) flat.dispose();
}
