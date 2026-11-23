// The striped sawhorse barriers PSPD drags across the road at a roadblock: one instanced batch for
// every barrier in town, each with an amber lamp that blinks (brightest at night). Every barrier
// stands in the collision world as a breakable post, and a car that hits one sends it tumbling
// down the road to lie where it lands.
import * as THREE from 'three';
import { buildSawhorseGeometry, paintBarrierStripes, SAWHORSE_LAMP } from './roadblockPropGeometry.js';

const CAPACITY = 24;
const GRAVITY = 9.81;

/**
 * Create the barrier pool.
 * @returns {{place: Function, remove: Function, clear: Function, update: Function, readonly count: number}}
 */
export function createRoadblockBarriers(game) {
  const material = new THREE.MeshLambertMaterial({ map: paintBarrierStripes(), vertexColors: true });
  const mesh = new THREE.InstancedMesh(buildSawhorseGeometry(), material, CAPACITY);
  mesh.name = 'roadblock barriers';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  game.scene.add(mesh);

  const lamps = buildBarrierLamps();
  game.scene.add(lamps.points);

  const matrix = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  const lampPoint = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const yAxis = new THREE.Vector3(0, 1, 0);

  const records = [];
  for (let i = 0; i < CAPACITY; i += 1) {
    records.push({
      index: i, active: false, state: 'standing', collider: null,
      position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), heading: 0,
      velocity: new THREE.Vector3(), spinAxis: new THREE.Vector3(1, 0, 0), spinRate: 0, bounces: 0,
    });
    hideInstance(i);
  }
  mesh.instanceMatrix.needsUpdate = true;
  let active = 0;
  let clock = 0;

  game.events.on('prop:broken', onPropBroken);

  /**
   * Stand a barrier at (x, z) with its boards facing along `heading` (boards run across that heading).
   * Returns the barrier, or null when all are in use.
   */
  function place(x, z, heading) {
    const record = records.find((r) => !r.active);
    if (!record) return null;
    record.active = true;
    record.state = 'standing';
    record.heading = heading;
    record.position.set(x, groundAt(x, z), z);
    record.quaternion.setFromAxisAngle(yAxis, heading);
    record.velocity.set(0, 0, 0);
    record.bounces = 0;
    record.collider = game.colliders
      ? game.colliders.addPost({ x, z, radius: 0.8, y0: 0, y1: 1.2, kind: 'barrier', breakable: true, ref: record })
      : null;
    writeInstance(record);
    active += 1;
    return record;
  }

  /** Take a barrier away (and its collider, if still standing). */
  function remove(record) {
    if (!record || !record.active) return;
    if (record.collider && !record.collider.removed && game.colliders) game.colliders.remove(record.collider);
    record.collider = null;
    record.active = false;
    hideInstance(record.index);
    lamps.hide(record.index);
    mesh.instanceMatrix.needsUpdate = true;
    active -= 1;
  }

  function clear() {
    for (const record of records) remove(record);
  }

  /** Tumble the barriers that were hit, and blink the lamps. */
  function update(dt) {
    if (!(dt > 0)) return;
    clock += dt;
    let moved = false;
    for (let i = 0; i < CAPACITY; i += 1) {
      const record = records[i];
      if (!record.active || record.state !== 'tumbling') continue;
      tumble(record, Math.min(dt, 0.05));
      writeInstance(record);
      moved = true;
    }
    if (moved) mesh.instanceMatrix.needsUpdate = true;
    const sky = game.sky;
    lamps.uniforms.uTime.value = clock;
    lamps.uniforms.uNight.value = sky && typeof sky.night === 'number' ? sky.night : 0;
  }

  /** A car went through a barrier: it flies off with the car's momentum, spinning. */
  function onPropBroken(e) {
    const record = e && e.collider && e.collider.ref;
    if (!record || records[record.index] !== record || !record.active) return;
    record.collider = null;
    record.state = 'tumbling';
    const vx = Number.isFinite(e.vx) ? e.vx : 0;
    const vz = Number.isFinite(e.vz) ? e.vz : 0;
    record.velocity.set(vx * 0.75 + (Math.random() - 0.5) * 3, 3 + Math.hypot(vx, vz) * 0.08, vz * 0.75 + (Math.random() - 0.5) * 3);
    record.spinAxis.set(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize();
    record.spinRate = 7 + Math.random() * 6;
    lamps.hide(record.index);
  }

  function tumble(record, dt) {
    const p = record.position;
    record.velocity.y -= GRAVITY * dt;
    p.addScaledVector(record.velocity, dt);
    spin.setFromAxisAngle(record.spinAxis, record.spinRate * dt);
    record.quaternion.premultiply(spin);
    const ground = groundAt(p.x, p.z) + 0.1;
    if (p.y > ground || record.velocity.y > 0) return;
    p.y = ground;
    record.bounces += 1;
    if (record.bounces < 2 && Math.abs(record.velocity.y) > 2) {
      record.velocity.y *= -0.3;
      record.velocity.x *= 0.5;
      record.velocity.z *= 0.5;
      record.spinRate *= 0.5;
      return;
    }
    // Come to rest flat on its side, pointing the way it was going.
    record.state = 'down';
    euler.set(Math.PI / 2, Math.atan2(record.velocity.x, record.velocity.z) + Math.PI / 2, 0, 'YXZ');
    record.quaternion.setFromEuler(euler);
    p.y = groundAt(p.x, p.z) + 0.03;
  }

  function writeInstance(record) {
    matrix.compose(record.position, record.quaternion, one);
    mesh.setMatrixAt(record.index, matrix);
    if (record.state === 'standing') {
      lampPoint.set(SAWHORSE_LAMP.x, SAWHORSE_LAMP.y, SAWHORSE_LAMP.z).applyQuaternion(record.quaternion).add(record.position);
      lamps.show(record.index, lampPoint, (record.index * 0.37) % 1);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function hideInstance(index) {
    matrix.compose(zero, spin.identity(), zero);
    mesh.setMatrixAt(index, matrix);
  }

  function groundAt(x, z) {
    return game.terrain ? game.terrain.heightAt(x, z) : 0;
  }

  return {
    place, remove, clear, update, mesh,
    get count() { return active; },
  };
}

/** The amber lamps on the barriers: one batch of points that flash in turn. */
function buildBarrierLamps() {
  const positions = new Float32Array(CAPACITY * 3);
  const phases = new Float32Array(CAPACITY);
  const visible = new Float32Array(CAPACITY);
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const phaseAttribute = new THREE.BufferAttribute(phases, 1);
  const visibleAttribute = new THREE.BufferAttribute(visible, 1);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aPhase', phaseAttribute);
  geometry.setAttribute('aVisible', visibleAttribute);
  const uniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: LAMP_VERTEX_SHADER,
    fragmentShader: LAMP_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return {
    points,
    uniforms,
    show(index, point, phase) {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
      phases[index] = phase;
      visible[index] = 1;
      positionAttribute.needsUpdate = true;
      phaseAttribute.needsUpdate = true;
      visibleAttribute.needsUpdate = true;
    },
    hide(index) {
      visible[index] = 0;
      visibleAttribute.needsUpdate = true;
    },
  };
}

const LAMP_VERTEX_SHADER = /* glsl */ `
attribute float aPhase;
attribute float aVisible;
uniform float uTime;
uniform float uNight;
varying float vOn;
void main() {
  float f = fract(uTime * 1.1 + aPhase);
  vOn = (0.15 + 0.85 * step(f, 0.42)) * aVisible;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = mix(0.5, 1.1, uNight) * 520.0 / max(1.0, -mv.z);
  gl_PointSize = max(2.0, size) * step(0.01, vOn);
  gl_Position = projectionMatrix * mv;
}
`;

const LAMP_FRAGMENT_SHADER = /* glsl */ `
varying float vOn;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float glow = exp(-r * 6.0) + exp(-r * 2.0) * 0.4;
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.12) * glow + vec3(exp(-r * 14.0) * 0.5), glow * vOn);
}
`;
