// The golden falcon statuette hidden twenty times around Port Sarab: a low-poly falcon in polished
// gold with its wings raised in a proud fan of feathers, perched on a branch over a night-blue
// hexagonal plinth with a gold rim. Simple shapes merged into one vertex-coloured geometry, about
// 1.3 m tall, facing +Z, standing on y = 0.
import * as THREE from 'three';

const GOLD = new THREE.Color(0xffd45a);
const DEEP_GOLD = new THREE.Color(0xe2a72e);
const PALE_GOLD = new THREE.Color(0xfff0b0);
const PLINTH = new THREE.Color(0x14304a);
const DARK = new THREE.Color(0x3a2306);

/** One merged geometry (position, normal, color) for the whole statuette. */
export function buildGoldenFalconGeometry() {
  const parts = [];
  const add = (geometry, color, place) => {
    place(geometry);
    parts.push({ geometry, color });
  };

  // Plinth: a hexagonal drum with a gold rim.
  add(new THREE.CylinderGeometry(0.34, 0.4, 0.22, 6), PLINTH, (g) => g.translate(0, 0.11, 0));
  add(new THREE.CylinderGeometry(0.37, 0.37, 0.045, 6), DEEP_GOLD, (g) => g.translate(0, 0.24, 0));
  // The branch it grips, and two clenched feet.
  add(new THREE.CylinderGeometry(0.035, 0.042, 0.46, 5), DEEP_GOLD, (g) => {
    g.rotateZ(Math.PI / 2);
    g.translate(0, 0.3, 0.03);
  });
  for (const side of [1, -1]) add(new THREE.SphereGeometry(0.05, 5, 3), DEEP_GOLD, (g) => g.translate(side * 0.07, 0.33, 0.05));
  // Body: a faceted egg, upright and leaning a little forward, with a pale breast.
  add(new THREE.SphereGeometry(1, 7, 5), GOLD, (g) => {
    g.scale(0.17, 0.31, 0.18);
    g.rotateX(0.2);
    g.translate(0, 0.6, 0);
  });
  add(new THREE.SphereGeometry(1, 6, 4), PALE_GOLD, (g) => {
    g.scale(0.11, 0.2, 0.08);
    g.rotateX(0.22);
    g.translate(0, 0.62, 0.11);
  });
  // Head, dark eyes and a hooked beak.
  add(new THREE.SphereGeometry(0.11, 7, 5), GOLD, (g) => g.translate(0, 0.94, 0.06));
  for (const side of [1, -1]) add(new THREE.SphereGeometry(0.022, 4, 3), DARK, (g) => g.translate(side * 0.075, 0.96, 0.12));
  add(new THREE.ConeGeometry(0.042, 0.12, 4), DEEP_GOLD, (g) => {
    g.rotateX(Math.PI / 2 + 0.65);
    g.translate(0, 0.9, 0.19);
  });
  // Wings raised in a V: a broad covert from each shoulder, then a fan of four long flight feathers.
  for (const side of [1, -1]) {
    add(feather(0.4, 0.12), GOLD, (g) => {
      tilt(g, side, 0.62, 0.15);
      g.translate(side * 0.11, 0.76, -0.03);
    });
    const elbowX = side * (0.11 + 0.4 * Math.cos(0.62));
    const elbowY = 0.76 + 0.4 * Math.sin(0.62);
    const fan = [[0.56, 0.62, 0.05], [0.6, 0.9, 0.18], [0.54, 1.16, 0.32], [0.44, 1.4, 0.46]];
    fan.forEach(([length, elevation, sweep], i) => {
      add(feather(length, 0.075), i % 2 === 0 ? PALE_GOLD : GOLD, (g) => {
        tilt(g, side, elevation, sweep);
        g.translate(elbowX, elbowY, -0.05 - i * 0.012);
      });
    });
  }
  // Tail fan.
  for (const angle of [-0.28, 0, 0.28]) {
    add(feather(0.32, 0.07), DEEP_GOLD, (g) => {
      g.rotateZ(Math.PI);
      g.rotateZ(angle);
      g.rotateX(0.55);
      g.translate(0, 0.42, -0.14);
    });
  }

  return mergeColoured(parts);
}

/** A flat tapered feather blade along +Y from the origin, `length` long and `width` wide. */
function feather(length, width) {
  const blade = new THREE.ConeGeometry(width, length, 4);
  blade.rotateY(Math.PI / 4);
  blade.translate(0, length / 2, 0);
  blade.scale(1, 1, 0.3);
  return blade;
}

/** Turn a blade pointing up (+Y) out to one side at `elevation` above the horizon, swept back by `sweep`. */
function tilt(geometry, side, elevation, sweep) {
  geometry.rotateZ(-side * (Math.PI / 2 - elevation));
  geometry.rotateY(side * sweep);
}

/** Merge geometries into one non-indexed geometry with a flat colour per part. */
function mergeColoured(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  for (const part of parts) {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    // Flat facets catch the light like cut metal.
    geometry.computeVertexNormals();
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(part.color.r, part.color.g, part.color.b);
    }
    if (geometry !== part.geometry) geometry.dispose();
    part.geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}
