// The props PSPD carries to a roadblock, as geometry: the striped sawhorse barrier (two coral and
// cream boards on A-frame legs, an amber lamp on top) and one link of a stinger spike strip (a flat
// dark plate, hazard-yellow rails and four steel teeth). Each is a single vertex-coloured mesh so a
// whole roadblock's worth draws as one instanced batch per prop.
import * as THREE from 'three';

/** Where the amber lamp sits on a sawhorse (model space; the boards run along X, the road is crossed along X). */
export const SAWHORSE_LAMP = Object.freeze({ x: -0.8, y: 1.2, z: 0 });
/** Length of one spike-strip link along the strip (metres). */
export const SPIKE_LINK_LENGTH = 0.5;

const PLAIN_UV = [0.5, 0.08];

/**
 * The sawhorse barrier: boards 1.9 m long along X at 0.6 m and 1.0 m, legs splayed front and back.
 * Its boards carry uv into the stripe band of paintBarrierStripes(); the rest are vertex coloured.
 */
export function buildSawhorseGeometry() {
  const parts = [];
  const topBoard = new THREE.BoxGeometry(1.9, 0.27, 0.05);
  topBoard.translate(0, 1.0, 0);
  parts.push({ geometry: topBoard, stripes: true });
  const lowBoard = new THREE.BoxGeometry(1.9, 0.2, 0.05);
  lowBoard.translate(0, 0.6, 0);
  parts.push({ geometry: lowBoard, stripes: true });
  const lean = Math.atan2(0.34, 1.1);
  for (const x of [-0.8, 0.8]) {
    for (const side of [1, -1]) {
      const leg = new THREE.BoxGeometry(0.06, 1.16, 0.06);
      leg.rotateX(lean * side);
      leg.translate(x, 0.56, 0.17 * side);
      parts.push({ geometry: leg, color: 0xd9d4c7 });
    }
  }
  const lamp = new THREE.BoxGeometry(0.15, 0.15, 0.09);
  lamp.translate(SAWHORSE_LAMP.x, SAWHORSE_LAMP.y - 0.04, 0);
  parts.push({ geometry: lamp, color: 0xf2a31c });
  return mergeColouredParts(parts);
}

/**
 * One link of a spike strip, 0.5 m along X and 0.34 m across: a dark plate with yellow rails and
 * two pairs of steel teeth pointing up.
 */
export function buildSpikeLinkGeometry() {
  const parts = [];
  const plate = new THREE.BoxGeometry(0.48, 0.035, 0.3);
  plate.translate(0, 0.018, 0);
  parts.push({ geometry: plate, color: 0x24272c });
  for (const z of [-0.16, 0.16]) {
    const rail = new THREE.BoxGeometry(0.5, 0.045, 0.035);
    rail.translate(0, 0.023, z);
    parts.push({ geometry: rail, color: 0xe9b44c });
  }
  for (const x of [-0.12, 0.12]) {
    for (const z of [-0.07, 0.07]) {
      const tooth = new THREE.ConeGeometry(0.032, 0.09, 4);
      tooth.translate(x, 0.035 + 0.045, z);
      parts.push({ geometry: tooth, color: 0xc8cdd4 });
    }
  }
  return mergeColouredParts(parts);
}

/** Coral and cream diagonal stripes (the top three quarters) over a plain white band (the bottom). */
export function paintBarrierStripes() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 64);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 256, 48);
  ctx.clip();
  ctx.fillStyle = '#fff4d6';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#e4572e';
  for (let x = -64; x < 320; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 48);
    ctx.lineTo(x + 20, 48);
    ctx.lineTo(x + 68, 0);
    ctx.lineTo(x + 48, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(40, 30, 30, 0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 253, 45);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Merge placed part geometries into one non-indexed mesh with normals, uvs and vertex colours.
 * Parts marked `stripes` keep their uvs squeezed into the stripe band; the rest use a plain texel.
 */
function mergeColouredParts(parts) {
  let count = 0;
  for (const part of parts) count += part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  let o = 0;
  for (const part of parts) {
    const g = part.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const index = g.index;
    const n = index ? index.count : pos.count;
    color.setHex(part.color === undefined ? 0xffffff : part.color);
    for (let i = 0; i < n; i += 1) {
      const k = index ? index.getX(i) : i;
      positions[o * 3] = pos.getX(k);
      positions[o * 3 + 1] = pos.getY(k);
      positions[o * 3 + 2] = pos.getZ(k);
      normals[o * 3] = nor.getX(k);
      normals[o * 3 + 1] = nor.getY(k);
      normals[o * 3 + 2] = nor.getZ(k);
      if (part.stripes && uv) {
        uvs[o * 2] = uv.getX(k);
        uvs[o * 2 + 1] = 0.25 + 0.75 * uv.getY(k);
      } else {
        uvs[o * 2] = PLAIN_UV[0];
        uvs[o * 2 + 1] = PLAIN_UV[1];
      }
      colors[o * 3] = color.r;
      colors[o * 3 + 1] = color.g;
      colors[o * 3 + 2] = color.b;
      o += 1;
    }
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}
