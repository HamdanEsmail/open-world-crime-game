// Port Sarab's street furniture drawn by kind: one InstancedMesh per kind of prop (a lamp, a palm, a
// bench) that holds only the copies within reach of the camera and is refilled as the camera travels,
// so thousands of props cost a handful of draw calls. A copy can be hidden when a car knocks it flat
// and shown again later; kinds with nothing in reach draw nothing at all.
import * as THREE from 'three';

/**
 * Create the registry every prop set joins. update() refills the sets whose camera has moved far
 * enough; stats() reports what is drawn.
 */
export function createPropInstanceRegistry(game) {
  const sets = [];
  const camera = new THREE.Vector3();

  /** Refill sets near the camera's current position (all of them when `force` is true). */
  function update(force = false) {
    if (!game.camera) return;
    game.camera.getWorldPosition(camera);
    for (let i = 0; i < sets.length; i += 1) {
      const set = sets[i];
      const dx = camera.x - set.lastX;
      const dz = camera.z - set.lastZ;
      if (force || set.dirty || dx * dx + dz * dz > set.moveThreshold * set.moveThreshold) set.refresh(camera.x, camera.z);
    }
  }

  /** Per-kind copies, visible copies, draw calls and triangles of what the sets draw right now. */
  function stats() {
    const kinds = {};
    let drawCalls = 0;
    let triangles = 0;
    let copies = 0;
    let visible = 0;
    for (const set of sets) {
      const entry = kinds[set.name] || (kinds[set.name] = { copies: 0, visible: 0, trianglesEach: set.trianglesPerCopy });
      entry.copies += set.records.length;
      entry.visible += set.mesh.count;
      copies += set.records.length;
      visible += set.mesh.count;
      if (set.mesh.visible && set.mesh.count > 0) {
        drawCalls += 1;
        triangles += set.mesh.count * set.trianglesPerCopy;
      }
    }
    return { kinds, drawCalls, triangles, copies, visible, sets: sets.length };
  }

  return {
    sets,
    add(set) {
      sets.push(set);
      return set;
    },
    update,
    stats,
  };
}

/**
 * One kind of prop as an InstancedMesh. options:
 *   name, geometry (cloned, the original stays clean for loose copies), material, records,
 *   minRange (0), maxRange (metres; a record's own `range` overrides it), moveThreshold,
 *   castShadow, receiveShadow (true), depthMaterial (shadow caster), renderOrder,
 *   attributes: [{ name, size }] extra per-copy values read from record.attrs[name].
 */
export function createPropInstanceSet(options) {
  const records = options.records;
  const capacity = Math.max(1, records.length);
  const geometry = options.geometry.clone();
  geometry.computeBoundingSphere();
  const modelRadius = geometry.boundingSphere.radius + geometry.boundingSphere.center.length();
  const extras = [];
  for (const spec of options.attributes || []) {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * spec.size), spec.size);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(spec.name, attribute);
    extras.push({ name: spec.name, size: spec.size, array: attribute.array, attribute });
  }

  const mesh = new THREE.InstancedMesh(geometry, options.material, capacity);
  mesh.name = `furniture-${options.name}`;
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = !!options.castShadow;
  mesh.receiveShadow = options.receiveShadow !== false;
  if (options.depthMaterial) mesh.customDepthMaterial = options.depthMaterial;
  if (options.renderOrder) mesh.renderOrder = options.renderOrder;
  mesh.matrixAutoUpdate = false;

  // The world-space bounds of the copies on show, used for frustum and shadow culling.
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  mesh.boundingSphere = sphere;
  geometry.boundingSphere = sphere;

  const minRange = options.minRange || 0;
  const maxRange = options.maxRange || 200;
  const set = {
    name: options.name,
    mesh,
    records,
    geometry,
    sourceGeometry: options.geometry,
    minRange,
    maxRange,
    moveThreshold: options.moveThreshold || Math.max(4, Math.min(maxRange * 0.05, 40)),
    trianglesPerCopy: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
    lastX: Infinity,
    lastZ: Infinity,
    dirty: true,
    refresh,
  };
  for (const record of records) record.sets.push(set);

  /** Copy the records within range of (cx, cz) into the instance buffers. */
  function refresh(cx, cz) {
    set.lastX = cx;
    set.lastZ = cz;
    set.dirty = false;
    const matrices = mesh.instanceMatrix.array;
    const colors = mesh.instanceColor.array;
    const min2 = minRange * minRange;
    let count = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let biggest = 0;
    for (let i = 0; i < records.length; i += 1) {
      const r = records[i];
      if (r.hidden) continue;
      const dx = r.x - cx;
      const dz = r.z - cz;
      const d2 = dx * dx + dz * dz;
      const reach = r.range > 0 ? r.range : maxRange;
      if (d2 >= reach * reach || d2 < min2) continue;
      const m = r.m;
      const o = count * 16;
      for (let k = 0; k < 16; k += 1) matrices[o + k] = m[k];
      const c = count * 3;
      colors[c] = r.r;
      colors[c + 1] = r.g;
      colors[c + 2] = r.b;
      for (let e = 0; e < extras.length; e += 1) {
        const extra = extras[e];
        const values = r.attrs ? r.attrs[extra.name] : null;
        const base = count * extra.size;
        for (let k = 0; k < extra.size; k += 1) extra.array[base + k] = values ? values[k] : 0;
      }
      if (r.x < x0) x0 = r.x;
      if (r.x > x1) x1 = r.x;
      if (r.y < y0) y0 = r.y;
      if (r.y > y1) y1 = r.y;
      if (r.z < z0) z0 = r.z;
      if (r.z > z1) z1 = r.z;
      const s = r.sx > r.sy ? (r.sx > r.sz ? r.sx : r.sz) : (r.sy > r.sz ? r.sy : r.sz);
      if (s > biggest) biggest = s;
      count += 1;
    }
    mesh.count = count;
    mesh.visible = count > 0;
    if (count > 0) {
      sphere.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      sphere.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + modelRadius * biggest;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    for (let e = 0; e < extras.length; e += 1) extras[e].attribute.needsUpdate = true;
  }

  return set;
}

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();

/**
 * One placed copy of a prop. fields: kind, x, y, z, yaw, pitch, roll, scale | sx, sy, sz, color,
 * range (draw distance of this copy), attrs (extra per-copy values, e.g. { uvRect: [u, v, w, h] }).
 * The record also carries what the copy owns: its collider, its glows and the records linked to it.
 */
export function createPropRecord(fields) {
  const s = fields.scale === undefined ? 1 : fields.scale;
  const record = {
    kind: fields.kind || 'prop',
    x: fields.x || 0,
    y: fields.y || 0,
    z: fields.z || 0,
    yaw: fields.yaw || 0,
    pitch: fields.pitch || 0,
    roll: fields.roll || 0,
    sx: fields.sx === undefined ? s : fields.sx,
    sy: fields.sy === undefined ? s : fields.sy,
    sz: fields.sz === undefined ? s : fields.sz,
    r: 1,
    g: 1,
    b: 1,
    range: fields.range || 0,
    hidden: false,
    m: new Float32Array(16),
    attrs: fields.attrs || null,
    sets: [],
    def: null,
    collider: null,
    colliderSpec: null,
    glows: null,
    glowSpecs: null,
    linked: null,
    owner: null,
    brokenAt: -1,
    footprint: fields.footprint === undefined ? 0.4 : fields.footprint,
  };
  if (fields.color !== undefined && fields.color !== null) setRecordColor(record, fields.color);
  composeRecordMatrix(record);
  return record;
}

/** Hide or show a record (and what is linked to it) in every set that draws it. */
export function setRecordHidden(record, hidden) {
  record.hidden = hidden;
  for (let i = 0; i < record.sets.length; i += 1) record.sets[i].dirty = true;
  if (record.linked) {
    for (let i = 0; i < record.linked.length; i += 1) setRecordHidden(record.linked[i], hidden);
  }
}

/** Rebuild a record's matrix after its place, turn or scale changed. */
export function composeRecordMatrix(record) {
  _position.set(record.x, record.y, record.z);
  _euler.set(record.pitch, record.yaw, record.roll, 'YXZ');
  _quaternion.setFromEuler(_euler);
  _scale.set(record.sx, record.sy, record.sz);
  _matrix.compose(_position, _quaternion, _scale);
  record.m.set(_matrix.elements);
  return record;
}

/** Paint a record (hex 0xRRGGBB, a THREE.Color or an [r, g, b] list in linear values). */
export function setRecordColor(record, value) {
  if (Array.isArray(value)) {
    record.r = value[0];
    record.g = value[1];
    record.b = value[2];
    return record;
  }
  if (value && value.isColor) _color.copy(value);
  else _color.setHex(value);
  record.r = _color.r;
  record.g = _color.g;
  record.b = _color.b;
  return record;
}
