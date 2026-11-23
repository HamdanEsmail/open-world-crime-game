// The golden falcon statuette hidden twenty times around Port Sarab: a low-poly falcon in polished
// gold, wings raised high, perched on a short branch over a night-blue hexagonal plinth with a gold
// rim. Built from a handful of simple shapes merged into one vertex-coloured geometry, about 1.2 m
// tall, facing +Z, standing on y = 0.
import * as THREE from 'three';

const GOLD = new THREE.Color(0xf2b83a);
const DEEP_GOLD = new THREE.Color(0xc98b1c);
const PALE_GOLD = new THREE.Color(0xffe08a);
const PLINTH = new THREE.Color(0x14304a);
const BEAK = new THREE.Color(0x8a5a12);

/** One merged geometry (position, normal, color) for the whole statuette. */
export function buildGoldenFalconGeometry() {
  const parts = [];
  const add = (geometry, color, place) => {
    place(geometry);
    parts.push({ geometry, color });
  };

  // Plinth: a hexagonal drum with a gold rim.
  add(new THREE.CylinderGeometry(0.34, 0.38, 0.2, 6), PLINTH, (g) => g.translate(0, 0.1, 0));
  add(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 6), DEEP_GOLD, (g) => g.translate(0, 0.21, 0));
  // The branch it grips.
  add(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 5), DEEP_GOLD, (g) => {
    g.rotateZ(Math.PI / 2);
    g.translate(0, 0.27, 0.02);
  });
  // Body: a faceted egg, upright and leaning a little forward.
  add(new THREE.SphereGeometry(1, 6, 5), GOLD, (g) => {
    g.scale(0.16, 0.3, 0.17);
    g.rotateX(0.22);
    g.translate(0, 0.58, 0);
  });
  // Chest highlight.
  add(new THREE.SphereGeometry(1, 5, 4), PALE_GOLD, (g) => {
    g.scale(0.1, 0.18, 0.08);
    g.rotateX(0.25);
    g.translate(0, 0.62, 0.1);
  });
  // Head and hooked beak.
  add(new THREE.SphereGeometry(0.105, 6, 5), GOLD, (g) => g.translate(0, 0.92, 0.07));
  add(new THREE.ConeGeometry(0.04, 0.11, 4), BEAK, (g) => {
    g.rotateX(Math.PI / 2 + 0.6);
    g.translate(0, 0.88, 0.19);
  });
  // Wings: raised in a proud V, a broad covert and a long sweep of primaries on each side.
  for (const side of [1, -1]) {
    add(new THREE.BoxGeometry(0.46, 0.05, 0.22), GOLD, (g) => {
      g.translate(side * 0.23, 0, 0);
      g.rotateZ(side * 0.95);
      g.rotateY(side * 0.25);
      g.translate(side * 0.1, 0.72, -0.04);
    });
    add(new THREE.BoxGeometry(0.42, 0.035, 0.15), PALE_GOLD, (g) => {
      g.translate(side * 0.21, 0, 0);
      g.rotateZ(side * 1.25);
      g.rotateY(side * 0.35);
      g.translate(side * 0.3, 1.03, -0.1);
    });
  }
  // Tail fan.
  add(new THREE.BoxGeometry(0.16, 0.03, 0.3), DEEP_GOLD, (g) => {
    g.rotateX(-1.0);
    g.translate(0, 0.36, -0.16);
  });

  return mergeColoured(parts);
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
