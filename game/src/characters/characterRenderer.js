// Draws every person in Port Sarab with one instanced mesh per body-part kind, so the whole crowd
// costs about twenty draw calls: each frame it solves the skeleton of every person near enough and on
// screen, writes the part matrices, colours and painted patterns, and adds the gun or bat in the hand.
// People beyond 150 m are skipped; hands, feet, beards and scarves are skipped beyond 55 m.
import * as THREE from 'three';
import { PART_COUNT, PART_INFO, WEAPON_SHAPES, buildPartGeometries } from './characterPartShapes.js';
import { createPaintedMaterial, DYNAMIC, linear } from './characterPaint.js';
import { FRAME, POSE, solveSkeleton } from './characterRig.js';

/**
 * Create the crowd renderer and add its meshes to game.scene.
 * @param {Object} game
 * @param {{capacity?:number, drawDistance?:number, detailDistance?:number}} [options]
 */
export function createCharacterRenderer(game, options = {}) {
  const capacity = options.capacity || 128;
  const drawDistance = options.drawDistance || 150;
  const detailDistance = options.detailDistance || 55;
  const geometries = buildPartGeometries();
  const batches = [];
  for (let kind = 0; kind < PART_COUNT; kind += 1) batches.push(createBatch(game, kind, geometries[kind], capacity));

  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const cameraPos = new THREE.Vector3();
  const stats = { drawn: 0, instances: 0, drawCalls: 0 };

  /** Solve and draw everyone in `list` for this frame. */
  function draw(list, frameNumber) {
    const camera = game.camera;
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    cameraPos.setFromMatrixPosition(camera.matrixWorld);
    for (let k = 0; k < batches.length; k += 1) batches[k].count = 0;
    const far2 = drawDistance * drawDistance;
    const near2 = detailDistance * detailDistance;
    let drawn = 0;
    for (let i = 0; i < list.length; i += 1) {
      const character = list[i];
      const body = character.body;
      if (!body || body.hidden) continue;
      const dx = character.pos.x - cameraPos.x;
      const dy = character.pos.y - cameraPos.y;
      const dz = character.pos.z - cameraPos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      body.cameraDistance2 = d2;
      if (d2 > far2) continue;
      sphere.center.set(character.pos.x, character.pos.y + 0.9, character.pos.z);
      sphere.radius = 3.2;
      if (!frustum.intersectsSphere(sphere)) continue;
      solveSkeleton(body.rig, body.pose, body.base, body.rootOverride ? body.rootMatrix : null, body.frames, body.aimDir, body.supportGrip);
      body.frames.solvedFrame = frameNumber;
      drawn += 1;
      const near = d2 < near2;
      writeBody(body, near);
    }
    stats.drawn = drawn;
    stats.instances = 0;
    stats.drawCalls = 0;
    for (let k = 0; k < batches.length; k += 1) {
      const batch = batches[k];
      batch.mesh.count = batch.count;
      batch.mesh.visible = batch.count > 0;
      if (batch.count > 0) {
        markUsed(batch.mesh.instanceMatrix, batch.count * 16);
        markUsed(batch.mesh.instanceColor, batch.count * 3);
        markUsed(batch.colorB, batch.count * 3);
        markUsed(batch.pattern, batch.count);
        stats.instances += batch.count;
        stats.drawCalls += 1;
      }
    }
  }

  /** Write one solved body's parts into the batches. */
  function writeBody(body, near) {
    const frames = body.frames;
    const list = body.drawList;
    const pose = body.pose;
    for (let e = 0; e < list.length; e += 1) {
      const entry = list[e];
      if (entry.near && !near) continue;
      const batch = batches[entry.part];
      if (batch.count >= batch.capacity) continue;
      let sx = entry.sx;
      let sy = entry.sy;
      let sz = entry.sz;
      let pattern = entry.pattern;
      if (entry.dynamic === DYNAMIC.GRIP_L) { if (pose[POSE.L_GRIP] > 0.5) sy *= 0.74; }
      else if (entry.dynamic === DYNAMIC.GRIP_R) { if (pose[POSE.R_GRIP] > 0.5) sy *= 0.74; }
      else if (entry.dynamic === DYNAMIC.SKIRT) {
        sz *= 1 + Math.min(0.85, frames.skirtSpread * 0.6);
        sx *= 1 + Math.min(0.25, frames.skirtSpread * 0.12);
        const seated = clamp((frames.skirtLift - 0.5) / 0.9, 0, 1);
        sy *= 1 - 0.5 * seated;
      } else if (entry.dynamic === DYNAMIC.FACE) {
        pattern = pose[POSE.EYES_CLOSED] > 0.5 ? 1 : 0;
      }
      const index = batch.count;
      batch.count += 1;
      writeMatrix(batch.matrices, index * 16, frames[entry.frame], sx, sy, sz);
      const c = entry.color;
      const b = entry.colorB;
      batch.colorsA[index * 3] = c[0];
      batch.colorsA[index * 3 + 1] = c[1];
      batch.colorsA[index * 3 + 2] = c[2];
      batch.colorsB[index * 3] = b[0];
      batch.colorsB[index * 3 + 1] = b[1];
      batch.colorsB[index * 3 + 2] = b[2];
      batch.patterns[index] = pattern;
    }
    // The weapon in the right hand.
    const shape = body.weaponClass ? WEAPON_SHAPES[body.weaponClass] : null;
    if (shape) {
      const batch = batches[shape.part];
      if (batch.count < batch.capacity) {
        const index = batch.count;
        batch.count += 1;
        writeMatrix(batch.matrices, index * 16, frames[FRAME.HAND_R], 1, 1, 1);
        const colours = WEAPON_COLOURS[body.weaponClass];
        batch.colorsA.set(colours[0], index * 3);
        batch.colorsB.set(colours[1], index * 3);
        batch.patterns[index] = 0;
      }
    }
  }

  /** Remove the meshes from the scene and free the GPU buffers. */
  function dispose() {
    for (const batch of batches) {
      game.scene.remove(batch.mesh);
      batch.mesh.geometry.dispose();
      batch.mesh.material.dispose();
    }
  }

  return { draw, dispose, stats, batches, capacity };
}

/** One instanced mesh for one part kind, with its two colour channels and pattern channel. */
function createBatch(game, kind, geometry, capacity) {
  const info = PART_INFO[kind];
  const max = capacity * info.perPerson;
  const material = createPaintedMaterial(kind, info.doubleSided);
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.name = `people-${info.name}`;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const colorB = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  colorB.setUsage(THREE.DynamicDrawUsage);
  const pattern = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  pattern.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceColorB', colorB);
  geometry.setAttribute('instancePattern', pattern);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = info.shadow;
  mesh.receiveShadow = true;
  mesh.visible = false;
  game.scene.add(mesh);
  return {
    kind, mesh, count: 0, capacity: max, colorB, pattern,
    matrices: mesh.instanceMatrix.array, colorsA: mesh.instanceColor.array, colorsB: colorB.array, patterns: pattern.array,
  };
}

/** out[offset..] = frame * scale(sx, sy, sz), column-major like three.js. */
function writeMatrix(out, offset, frame, sx, sy, sz) {
  const e = frame.elements;
  out[offset] = e[0] * sx; out[offset + 1] = e[1] * sx; out[offset + 2] = e[2] * sx; out[offset + 3] = 0;
  out[offset + 4] = e[4] * sy; out[offset + 5] = e[5] * sy; out[offset + 6] = e[6] * sy; out[offset + 7] = 0;
  out[offset + 8] = e[8] * sz; out[offset + 9] = e[9] * sz; out[offset + 10] = e[10] * sz; out[offset + 11] = 0;
  out[offset + 12] = e[12]; out[offset + 13] = e[13]; out[offset + 14] = e[14]; out[offset + 15] = 1;
}

/** Upload only the used part of an instance buffer. */
function markUsed(attribute, length) {
  if (!attribute) return;
  if (typeof attribute.clearUpdateRanges === 'function') {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, length);
  }
  attribute.needsUpdate = true;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

const WEAPON_COLOURS = {
  pistol: [linear(0x23252a), linear(0x3a2a1e)],
  smg: [linear(0x2a2d33), linear(0x16181c)],
  rifle: [linear(0x3a3f35), linear(0x5a4630)],
  shotgun: [linear(0x2b2d31), linear(0x6b4a2f)],
  bat: [linear(0xc8a26a), linear(0x1e1e22)],
};
