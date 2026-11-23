// Knockdowns in Port Sarab: a person hit by a car, a blast or a heavy blow is launched as a tumbling
// rigid body (mass, spin, gravity) that bounces and slides on the ground with friction while the limbs
// flail on damped springs inside their joint limits, then settles lying face up or face down and either
// gets back up a few seconds later or stays down. Slow shoves only make a person stagger.
import * as THREE from 'three';
import { POSE, FRAME } from './characterRig.js';
import { poseLying } from './characterActionPoses.js';
import { tumbleSpin, secondsUntilGetUp } from './characterAnimationRules.js';

/**
 * Launch a person as a ragdoll. (vx, vy, vz) is the launch velocity in m/s, added to how they were
 * already moving; options.swept marks a hit at the legs (a car), which flips the body over the blow.
 */
export function startRagdoll(character, body, vx, vy, vz, options = {}) {
  const rag = body.ragdoll || createRagdollState();
  body.ragdoll = rag;
  const pelvis = body.frames[FRAME.PELVIS];
  pelvis.decompose(rag.pelvisPos, rag.q, _scale);
  if (!(rag.q.lengthSq() > 0.5)) rag.q.set(0, 0, 0, 1);
  rag.q.normalize();
  _v.set(0, COM_ABOVE_PELVIS * body.rig.height, 0).applyQuaternion(rag.q);
  rag.p.copy(rag.pelvisPos).add(_v);
  if (!Number.isFinite(rag.p.x)) rag.p.set(character.pos.x, character.pos.y + 1.05, character.pos.z);
  rag.v.set(character.vel.x * 0.6 + vx, Math.max(character.vel.y, 0) + vy, character.vel.z * 0.6 + vz);
  const horizontal = Math.sqrt(vx * vx + vz * vz);
  rag.w.set(0, 0, 0);
  if (horizontal > 0.01) {
    _dir.set(vx / horizontal, 0, vz / horizontal);
    // A blow at the legs sweeps the feet along it (the head goes back over the bonnet); a blow higher
    // up topples the body along it.
    const spin = tumbleSpin(horizontal, !!options.swept);
    if (options.swept) rag.w.crossVectors(_dir, _up).multiplyScalar(spin);
    else rag.w.crossVectors(_up, _dir).multiplyScalar(spin);
  }
  rag.w.x += (Math.random() - 0.5) * 3;
  rag.w.y += (Math.random() - 0.5) * 4;
  rag.w.z += (Math.random() - 0.5) * 3;
  rag.time = 0;
  rag.restTime = 0;
  rag.settle = 0;
  rag.settling = false;
  rag.settled = false;
  rag.lieTime = 0;
  rag.getUpAfter = secondsUntilGetUp(Math.random());
  rag.energy = 1;
  rag.seed = Math.random();
  rag.contacts = 0;
  rag.hitCooldown = 0;
  for (let i = 0; i < FLAIL.length; i += 1) {
    rag.angle[i] = body.pose[FLAIL[i]];
    rag.speed[i] = (Math.random() - 0.5) * 6 * Math.min(1, horizontal / 6 + 0.3);
    rag.freq[i] = 7 + Math.random() * 7;
    rag.offset[i] = Math.random() * Math.PI * 2;
  }
  poseLying(rag.lying, body.rig, true, rag.seed);
  body.ragdollPose.set(body.pose);
  body.rootOverride = true;
  body.mode = 'ragdoll';
  character.grounded = false;
}

/**
 * Advance a ragdoll. Returns 'tumbling' while it moves, 'settled' the frame it comes to rest, and
 * 'lying' afterwards (with rag.lieTime counting how long it has been still).
 */
export function updateRagdoll(character, body, dt, game) {
  const rag = body.ragdoll;
  if (!rag) return 'lying';
  rag.time += dt;
  rag.hitCooldown = Math.max(0, rag.hitCooldown - dt);
  const terrain = game.terrain;
  const rig = body.rig;
  const h = rig.height;
  if (rag.settled) {
    rag.lieTime += dt;
    return 'lying';
  }
  if (!rag.settling) {
    const steps = Math.max(1, Math.min(4, Math.ceil(dt / (1 / 120))));
    const step = dt / steps;
    for (let s = 0; s < steps; s += 1) integrate(rag, step, terrain, h, game);
    const speed = rag.v.length();
    const spin = rag.w.length();
    rag.energy = damp(rag.energy, clamp((speed + spin * 0.35) / 6, 0, 1), 6, dt);
    if (rag.contacts > 0 && speed < 0.55 && spin < 1.2) rag.restTime += dt;
    else rag.restTime = Math.max(0, rag.restTime - dt * 0.5);
    if (rag.restTime > 0.3 || rag.time > 5) beginSettle(character, body, rag, terrain);
  }
  if (rag.settling) {
    // Ease into a clean lying pose on the ground, face up or face down.
    rag.settle = Math.min(1, rag.settle + dt / 0.45);
    const t = smooth(rag.settle);
    rag.q.slerpQuaternions(rag.settleFromQ, rag.settleQ, t);
    rag.pelvisPos.lerpVectors(rag.settleFromPos, rag.settlePos, t);
    rag.energy = damp(rag.energy, 0, 5, dt);
  } else {
    _v.set(0, -COM_ABOVE_PELVIS * h, 0).applyQuaternion(rag.q);
    rag.pelvisPos.copy(rag.p).add(_v);
  }
  body.rootMatrix.compose(rag.pelvisPos, rag.q, _one);
  flailLimbs(rag, body, dt);
  character.pos.set(rag.pelvisPos.x, groundAt(terrain, rag.pelvisPos.x, rag.pelvisPos.z), rag.pelvisPos.z);
  character.vel.copy(rag.settling ? _zero : rag.v);
  if (rag.settling && rag.settle >= 1) {
    rag.settled = true;
    rag.settling = false;
    character.heading = rag.lieHeading;
    character.pos.set(rag.settlePos.x, groundAt(terrain, rag.settlePos.x, rag.settlePos.z), rag.settlePos.z);
    character.vel.set(0, 0, 0);
    body.rootOverride = false;
    body.mode = 'lying';
    return 'settled';
  }
  return 'tumbling';
}

/**
 * Give a lying or tumbling body another shove (run over, shot again, caught in a blast). With `match`
 * the body is only brought up to the shove's speed (a car pushing what it already hit), not beyond.
 */
export function kickRagdoll(body, vx, vy, vz, match = false) {
  const rag = body.ragdoll;
  if (!rag) return false;
  if (rag.settled || rag.settling) {
    // Back into the tumble from where it lies.
    rag.settled = false;
    rag.settling = false;
    _v.set(0, COM_ABOVE_PELVIS * body.rig.height, 0).applyQuaternion(rag.q);
    rag.p.copy(rag.pelvisPos).add(_v);
    rag.v.set(0, 0, 0);
    rag.w.set(0, 0, 0);
    body.rootOverride = true;
    body.mode = 'ragdoll';
    rag.time = Math.min(rag.time, 3);
  }
  if (match) {
    const speed = Math.sqrt(vx * vx + vz * vz);
    if (speed > 1e-3) {
      const along = (rag.v.x * vx + rag.v.z * vz) / speed;
      if (along < speed) {
        rag.v.x += (vx / speed) * (speed - along);
        rag.v.z += (vz / speed) * (speed - along);
      }
    }
    rag.v.y = Math.max(rag.v.y, vy * 0.6);
  } else {
    rag.v.x += vx;
    rag.v.y += vy;
    rag.v.z += vz;
  }
  rag.w.x += (Math.random() - 0.5) * 6;
  rag.w.z += (Math.random() - 0.5) * 6;
  rag.restTime = 0;
  rag.energy = 1;
  return true;
}

/**
 * A tumble that has only just begun was a car sweeping the legs: spin it so the feet go along the
 * car's travel and the head back over the bonnet.
 */
export function sweepTumble(body, speed) {
  const rag = body.ragdoll;
  if (!rag || rag.settled || rag.settling || rag.time > 0.1) return;
  const horizontal = Math.sqrt(rag.v.x * rag.v.x + rag.v.z * rag.v.z);
  if (horizontal < 0.5) return;
  _dir.set(rag.v.x / horizontal, 0, rag.v.z / horizontal);
  rag.w.crossVectors(_dir, _up).multiplyScalar(tumbleSpin(Math.max(speed, horizontal), true));
  rag.w.y += (Math.random() - 0.5) * 3;
}

/** Semi-implicit rigid-body step with contacts at the head, shoulders, hips, knees and feet. */
function integrate(rag, dt, terrain, h, game) {
  rag.v.y -= GRAVITY * dt;
  rag.p.addScaledVector(rag.v, dt);
  // q += 0.5 * (0, w) * q * dt
  _qw.set(rag.w.x, rag.w.y, rag.w.z, 0).multiply(rag.q);
  rag.q.x += _qw.x * 0.5 * dt;
  rag.q.y += _qw.y * 0.5 * dt;
  rag.q.z += _qw.z * 0.5 * dt;
  rag.q.w += _qw.w * 0.5 * dt;
  rag.q.normalize();

  let deepest = 0;
  let contacts = 0;
  for (let i = 0; i < CONTACTS.length; i += 3) {
    _r.set(CONTACTS[i], CONTACTS[i + 1] * h, CONTACTS[i + 2]).applyQuaternion(rag.q);
    const px = rag.p.x + _r.x;
    const py = rag.p.y + _r.y;
    const pz = rag.p.z + _r.z;
    const ground = groundAt(terrain, px, pz);
    const depth = ground - py;
    if (depth <= 0) continue;
    contacts += 1;
    if (depth > deepest) deepest = depth;
    // velocity of the contact point: v + w x r
    _pv.crossVectors(rag.w, _r).add(rag.v);
    const vn = _pv.y;
    if (vn < 0) {
      // normal impulse (n = up): effective mass with an isotropic inertia
      _rn.set(-_r.z, 0, _r.x); // r x up
      const k = 1 / MASS + _rn.lengthSq() / INERTIA;
      const j = (-(1 + RESTITUTION) * vn) / k;
      rag.v.y += j / MASS;
      rag.w.addScaledVector(_rn, j / INERTIA);
      // friction impulse against the sliding velocity, limited by the normal impulse
      _vt.set(_pv.x, 0, _pv.z);
      const slide = _vt.length();
      if (slide > 1e-4) {
        _vt.multiplyScalar(1 / slide);
        _rt.crossVectors(_r, _vt);
        const kt = 1 / MASS + _rt.lengthSq() / INERTIA;
        const jt = Math.min(FRICTION * j, slide / kt);
        rag.v.addScaledVector(_vt, -jt / MASS);
        rag.w.addScaledVector(_rt, -jt / INERTIA);
      }
      if (j > 25) kickLimbs(rag, i / 3, j);
    }
  }
  if (deepest > 0) rag.p.y += deepest * 0.85;
  rag.contacts = contacts;
  const slow = clamp(1 - rag.v.length() / 4, 0, 1);
  const angularDrag = contacts > 0 ? 3.2 + 5 * slow : 0.15;
  rag.w.multiplyScalar(Math.exp(-angularDrag * dt));
  if (contacts > 0) {
    const drag = Math.exp(-(0.9 + 2.5 * slow) * dt);
    rag.v.x *= drag;
    rag.v.z *= drag;
    // Limbs and the body's own shape never let it balance on its head or its feet: topple it flat.
    _head.set(0, 1, 0).applyQuaternion(rag.q);
    const upright = _head.y;
    _axis.crossVectors(_head, _up);
    const length = _axis.length();
    if (length > 1e-3) rag.w.addScaledVector(_axis, (-TOPPLE * upright * dt) / length);
    else rag.w.x += TOPPLE * dt * (upright > 0 ? 1 : -1);
  }
  // Walls, palms and posts.
  const colliders = game.colliders;
  if (colliders && typeof colliders.pushOutCircle === 'function') {
    _wallProbe.set(rag.p.x, rag.p.y, rag.p.z);
    const contact = colliders.pushOutCircle(_wallProbe, 0.32, rag.p.y - 0.4, rag.p.y + 0.4);
    if (contact) {
      rag.p.x = _wallProbe.x;
      rag.p.z = _wallProbe.z;
      const into = rag.v.x * contact.nx + rag.v.z * contact.nz;
      if (into < 0) {
        rag.v.x -= contact.nx * into * 1.35;
        rag.v.z -= contact.nz * into * 1.35;
        rag.w.x += (Math.random() - 0.5) * 4;
        rag.w.z += (Math.random() - 0.5) * 4;
      }
    }
  }
}

/** Decide face up or down and where the body ends, and start easing it there. */
function beginSettle(character, body, rag, terrain) {
  rag.settling = true;
  rag.settle = 0;
  _chest.set(0, 0, 1).applyQuaternion(rag.q);
  _head.set(0, 1, 0).applyQuaternion(rag.q);
  const faceUp = _chest.y >= 0;
  rag.faceUp = faceUp;
  let hx = _head.x;
  let hz = _head.z;
  if (hx * hx + hz * hz < 1e-4) {
    hx = Math.sin(character.heading);
    hz = Math.cos(character.heading);
  }
  rag.lieHeading = faceUp ? Math.atan2(-hx, -hz) : Math.atan2(hx, hz);
  _euler.set(faceUp ? -Math.PI / 2 : Math.PI / 2, rag.lieHeading, 0, 'YXZ');
  rag.settleQ.setFromEuler(_euler);
  rag.settleFromQ.copy(rag.q);
  rag.settleFromPos.copy(rag.pelvisPos);
  const ground = groundAt(terrain, rag.pelvisPos.x, rag.pelvisPos.z);
  rag.settlePos.set(rag.pelvisPos.x, ground + 0.11 * body.rig.height, rag.pelvisPos.z);
  poseLying(rag.lying, body.rig, faceUp, rag.seed);
  // The pose's root channels now describe the same lying body, so the hand-over is seamless.
  const pose = body.ragdollPose;
  pose[POSE.ROOT_X] = 0;
  pose[POSE.ROOT_Z] = 0;
  pose[POSE.ROOT_Y] = rag.lying[POSE.ROOT_Y];
  pose[POSE.ROOT_PITCH] = rag.lying[POSE.ROOT_PITCH];
  pose[POSE.ROOT_ROLL] = 0;
  pose[POSE.ROOT_YAW] = 0;
}

/** Limbs on damped springs: thrown about while the body tumbles, easing into the lying pose as it stops. */
function flailLimbs(rag, body, dt) {
  const pose = body.ragdollPose;
  const settle = rag.settling ? smooth(rag.settle) : rag.settled ? 1 : 0;
  _local.copy(rag.w).applyQuaternion(_inverse.copy(rag.q).invert());
  const energy = rag.energy;
  const step = Math.min(dt, 1 / 30);
  for (let i = 0; i < FLAIL.length; i += 1) {
    const channel = FLAIL[i];
    const limp = LIMP[i];
    const lying = rag.lying[channel];
    let target = limp + (lying - limp) * Math.max(settle, 1 - energy * 1.4);
    target += Math.sin(rag.time * rag.freq[i] + rag.offset[i]) * FLAIL_AMPLITUDE[i] * energy * (1 - settle);
    target += INERTIA_X[i] * _local.x * 0.06 * (1 - settle) + INERTIA_Z[i] * Math.abs(_local.z) * 0.05 * (1 - settle);
    const stiffness = 55 + 60 * settle;
    const damping = 6 + 6 * settle;
    rag.speed[i] += (stiffness * (target - rag.angle[i]) - damping * rag.speed[i]) * step;
    rag.angle[i] += rag.speed[i] * step;
    const min = LIMIT_MIN[i];
    const max = LIMIT_MAX[i];
    if (rag.angle[i] < min) { rag.angle[i] = min; rag.speed[i] *= -0.3; }
    if (rag.angle[i] > max) { rag.angle[i] = max; rag.speed[i] *= -0.3; }
    pose[channel] = rag.angle[i];
  }
  // Everything the springs do not drive follows the lying pose.
  for (let i = 0; i < PASSIVE.length; i += 1) {
    const channel = PASSIVE[i];
    pose[channel] += (rag.lying[channel] - pose[channel]) * Math.min(1, dt * 8);
  }
  pose[POSE.L_HAND_IK] = 0;
  pose[POSE.R_HAND_IK] = 0;
  pose[POSE.L_FOOT_IK] = 0;
  pose[POSE.R_FOOT_IK] = 0;
  pose[POSE.AIM_HAND] = 0;
  pose[POSE.SUPPORT_GRIP] = 0;
  pose[POSE.L_GRIP] = 0;
  pose[POSE.R_GRIP] = 0;
}

/** A hard contact jolts the nearest limbs. */
function kickLimbs(rag, contactIndex, impulse) {
  const strength = Math.min(6, impulse * 0.02);
  const group = CONTACT_LIMBS[contactIndex] || [];
  for (let i = 0; i < group.length; i += 1) rag.speed[group[i]] += (Math.random() - 0.4) * strength * 2;
}

function createRagdollState() {
  const n = FLAIL.length;
  return {
    p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
    pelvisPos: new THREE.Vector3(), settleQ: new THREE.Quaternion(), settleFromQ: new THREE.Quaternion(),
    settlePos: new THREE.Vector3(), settleFromPos: new THREE.Vector3(),
    angle: new Float32Array(n), speed: new Float32Array(n), freq: new Float32Array(n), offset: new Float32Array(n),
    lying: new Float32Array(64),
    time: 0, restTime: 0, settle: 0, settling: false, settled: false, lieTime: 0, getUpAfter: 3,
    energy: 1, seed: 0, contacts: 0, faceUp: true, lieHeading: 0, hitCooldown: 0,
  };
}

function groundAt(terrain, x, z) {
  if (terrain && typeof terrain.heightAt === 'function') {
    const y = terrain.heightAt(x, z);
    return Number.isFinite(y) ? y : 0;
  }
  return 0;
}

function damp(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function smooth(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

const GRAVITY = 9.81;
const MASS = 75;
const INERTIA = 11;
const RESTITUTION = 0.22;
const FRICTION = 0.72;
const COM_ABOVE_PELVIS = 0.12;
const TOPPLE = 26;

// Contact points around the centre of mass (x left, y toward the head, z toward the chest), y scaled by height.
const CONTACTS = [
  0, 0.7, 0.02, 0, 0.6, 0.1, 0.2, 0.42, 0, -0.2, 0.42, 0, 0, 0.25, 0.12, 0, 0.25, -0.12,
  0.15, -0.12, 0, -0.15, -0.12, 0, 0, -0.1, -0.12, 0, 0.0, 0.11,
  0.1, -0.55, 0.05, -0.1, -0.55, 0.05, 0.11, -0.95, 0.06, -0.11, -0.95, 0.06,
];

// Channels driven by the limb springs, their slack pose while tumbling, flail size, and joint limits.
const FLAIL = [
  POSE.L_SWING, POSE.L_ABD, POSE.L_ELBOW, POSE.R_SWING, POSE.R_ABD, POSE.R_ELBOW,
  POSE.L_HIP, POSE.L_HIP_ABD, POSE.L_KNEE, POSE.R_HIP, POSE.R_HIP_ABD, POSE.R_KNEE,
  POSE.SPINE_PITCH, POSE.SPINE_ROLL, POSE.NECK_PITCH, POSE.NECK_ROLL,
];
const LIMP = [0.4, 1.0, 0.6, 0.2, 1.1, 0.5, 0.35, 0.22, 0.6, 0.15, 0.18, 0.4, 0.1, 0, 0.1, 0];
const FLAIL_AMPLITUDE = [1.1, 0.6, 0.7, 1.1, 0.6, 0.7, 0.6, 0.25, 0.7, 0.6, 0.25, 0.7, 0.25, 0.2, 0.35, 0.3];
const INERTIA_X = [1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, 0.5, 0, 0.6, 0];
const INERTIA_Z = [0, 1, 0.5, 0, 1, 0.5, 0, 1, 0.3, 0, 1, 0.3, 0, 0, 0, 0];
const LIMIT_MIN = [-1.4, -0.15, 0.02, -1.4, -0.15, 0.02, -0.5, -0.15, 0.02, -0.5, -0.15, 0.02, -0.45, -0.4, -0.7, -0.6];
const LIMIT_MAX = [2.7, 2.3, 2.3, 2.7, 2.3, 2.3, 1.9, 1.0, 2.3, 1.9, 1.0, 2.3, 0.8, 0.4, 0.8, 0.6];
const PASSIVE = [
  POSE.L_TWIST, POSE.R_TWIST, POSE.L_WRIST, POSE.R_WRIST, POSE.L_HIP_TWIST, POSE.R_HIP_TWIST,
  POSE.L_ANKLE, POSE.R_ANKLE, POSE.SPINE_YAW, POSE.NECK_YAW,
];
// Which springs each contact point jolts (indices into FLAIL).
const CONTACT_LIMBS = [
  [14, 15], [14, 12], [0, 1, 2], [3, 4, 5], [12, 0, 3], [12, 13], [6, 7], [9, 10], [6, 9], [12],
  [6, 8], [9, 11], [8, 6], [11, 9],
];

const _scale = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Vector3();
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _r = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _rn = new THREE.Vector3();
const _vt = new THREE.Vector3();
const _rt = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _head = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _local = new THREE.Vector3();
const _wallProbe = new THREE.Vector3();
const _qw = new THREE.Quaternion();
const _inverse = new THREE.Quaternion();
const _euler = new THREE.Euler();
