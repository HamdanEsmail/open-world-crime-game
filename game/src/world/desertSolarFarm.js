// The Sunfield Solar Array east of the city: rows of tilted photovoltaic tables facing the southern sun,
// deep blue cells in silver frames, on a pale gravel pad with service tracks. Every table is one
// instance of one mesh, so hundreds of panels cost a single draw call.
import * as THREE from 'three';
import { SURFACE } from './groundSurfaceAtlas.js';

const TABLE_LENGTH = 15.5;
const TABLE_DEPTH = 4.2;
const TILT = 0.44;

/**
 * Build the gravel pad into the ground builder and return the instanced panel tables.
 * @returns {THREE.InstancedMesh|null}
 */
export function createSolarFarm(game, ground, mark) {
  const terrain = game.terrain;
  const reach = 150;
  const pad = [];
  for (let k = 0; k < 12; k += 1) {
    const angle = (k / 12) * Math.PI * 2 + Math.PI / 12;
    pad.push([mark.x + Math.sin(angle) * reach * 1.04, mark.z + Math.cos(angle) * reach * 0.84]);
  }
  ground.polygon('paint', pad, 0.01, SURFACE.EARTH, { tint: 0xf4eee2, jitter: 0.1 });
  ground.rect('paint', mark.x - 3, mark.z - reach * 0.8, mark.x + 3, mark.z + reach * 0.8, 0.02, SURFACE.DIRT, { tint: 0xfff2e0, rotate: true });
  const spots = [];
  const halfW = (mark.w || 280) / 2;
  const halfD = (mark.d || 220) / 2;
  for (let z = mark.z - halfD + 8; z <= mark.z + halfD - 6; z += 9.5) {
    for (let x = mark.x - halfW + 10; x <= mark.x + halfW - 8; x += TABLE_LENGTH + 1.6) {
      if (Math.abs(x - mark.x) < 12) continue;
      const nx = (x - mark.x) / (reach * 1.0);
      const nz = (z - mark.z) / (reach * 0.8);
      if (nx * nx + nz * nz > 0.92) continue;
      spots.push([x, z]);
    }
  }
  if (spots.length === 0) return null;
  const texture = new THREE.CanvasTexture(paintPanelCells());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshLambertMaterial({ map: texture });
  const mesh = new THREE.InstancedMesh(buildPanelTable(), material, spots.length);
  mesh.name = 'desert-solar-farm';
  const matrix = new THREE.Matrix4();
  spots.forEach(([x, z], index) => {
    matrix.makeTranslation(x, Math.max(0, terrain.baseHeightAt(x, z)), z);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** One table: a panel tilted to face south (+z), its silver edges and a steel frame on two legs. */
function buildPanelTable() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const L = TABLE_LENGTH / 2;
  const low = 0.7;
  const high = low + Math.sin(TILT) * TABLE_DEPTH;
  const front = Math.cos(TILT) * TABLE_DEPTH / 2;
  const face = (a, b, c, d, uvRect) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const length = Math.hypot(n[0], n[1], n[2]) || 1;
    const [u0, v0, u1, v1] = uvRect;
    const corners = [[a, u0, v0], [b, u1, v0], [c, u1, v1], [a, u0, v0], [c, u1, v1], [d, u0, v1]];
    for (const [p, u, v] of corners) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0] / length, n[1] / length, n[2] / length);
      uvs.push(u, v);
    }
  };
  const cells = [0, 0, 1, 0.75];
  const steel = [0.02, 0.8, 0.06, 0.95];
  // Top (cells) and underside.
  face([-L, low, front], [L, low, front], [L, high, -front], [-L, high, -front], cells);
  face([L, low - 0.06, front], [-L, low - 0.06, front], [-L, high - 0.06, -front], [L, high - 0.06, -front], steel);
  face([-L, low - 0.06, front], [L, low - 0.06, front], [L, low, front], [-L, low, front], steel);
  face([L, high - 0.06, -front], [-L, high - 0.06, -front], [-L, high, -front], [L, high, -front], steel);
  // Two steel legs, each a flat post seen from the front and the back.
  const mid = (low + high) / 2 - 0.1;
  for (const x of [-L * 0.62, L * 0.62]) {
    face([x - 0.1, 0, 0], [x + 0.1, 0, 0], [x + 0.1, mid, 0], [x - 0.1, mid, 0], steel);
    face([x + 0.1, 0, 0], [x - 0.1, 0, 0], [x - 0.1, mid, 0], [x + 0.1, mid, 0], steel);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** Photovoltaic cells: deep blue squares in a silver grid, a slightly lighter sky reflection near the top. */
function paintPanelCells() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c8ccd2';
  ctx.fillRect(0, 0, 512, 128);
  const columns = 24;
  const rows = 4;
  const cw = 512 / columns;
  const ch = 96 / rows;
  for (let c = 0; c < columns; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const t = r / rows;
      ctx.fillStyle = `rgb(${30 + t * 26}, ${48 + t * 34}, ${104 + t * 40})`;
      ctx.fillRect(c * cw + 1.5, 32 + r * ch + 1.5, cw - 3, ch - 3);
    }
  }
  ctx.fillStyle = '#9aa0a8';
  ctx.fillRect(0, 0, 512, 32);
  return canvas;
}
