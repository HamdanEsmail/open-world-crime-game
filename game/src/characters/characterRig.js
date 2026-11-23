// The body of every person in Port Sarab: a stylized 1.78 m skeleton of fifteen rigid parts joined at
// the spine, neck, shoulders, elbows, wrists, hips, knees and ankles, and the joint-chain solver that
// turns a pose (joint angles, plus hand and foot targets reached by two-bone IK) into one world matrix
// per body part. No skinning: each part is a rigid mesh placed by its matrix.
import * as THREE from 'three';

/**
 * Indices into a pose (a Float32Array of POSE_SIZE numbers). Angles are radians.
 * Root: offsets of the pelvis from the body frame (x left, y up from standing hip height, z forward),
 * pitch (+ tips forward), roll (+ leans to the character's left), yaw (+ turns left).
 * Arms and legs: swing (+ forward), abduction (+ outward), twist, elbow/knee flex (+ bends), wrist/ankle
 * (ankle + points the toe down). Hand and foot targets are in the body frame, blended in by their weight.
 */
export const POSE = {
  ROOT_X: 0, ROOT_Y: 1, ROOT_Z: 2, ROOT_PITCH: 3, ROOT_ROLL: 4, ROOT_YAW: 5,
  SPINE_PITCH: 6, SPINE_ROLL: 7, SPINE_YAW: 8,
  NECK_PITCH: 9, NECK_ROLL: 10, NECK_YAW: 11,
  L_SWING: 12, L_ABD: 13, L_TWIST: 14, L_ELBOW: 15, L_WRIST: 16,
  R_SWING: 17, R_ABD: 18, R_TWIST: 19, R_ELBOW: 20, R_WRIST: 21,
  L_HIP: 22, L_HIP_ABD: 23, L_HIP_TWIST: 24, L_KNEE: 25, L_ANKLE: 26,
  R_HIP: 27, R_HIP_ABD: 28, R_HIP_TWIST: 29, R_KNEE: 30, R_ANKLE: 31,
  L_HAND_IK: 32, L_HAND_X: 33, L_HAND_Y: 34, L_HAND_Z: 35,
  R_HAND_IK: 36, R_HAND_X: 37, R_HAND_Y: 38, R_HAND_Z: 39,
  L_POLE_X: 40, L_POLE_Y: 41, L_POLE_Z: 42,
  R_POLE_X: 43, R_POLE_Y: 44, R_POLE_Z: 45,
  L_FOOT_IK: 46, L_FOOT_X: 47, L_FOOT_Y: 48, L_FOOT_Z: 49, L_FOOT_PITCH: 50,
  R_FOOT_IK: 51, R_FOOT_X: 52, R_FOOT_Y: 53, R_FOOT_Z: 54, R_FOOT_PITCH: 55,
  L_GRIP: 56, R_GRIP: 57,
  AIM_HAND: 58,
  EYES_CLOSED: 59,
  SUPPORT_GRIP: 60,
};
export const POSE_SIZE = 61;

/** Per side (0 left, 1 right): the first index of each limb block, and the mirror sign. */
export const ARM_BASE = [POSE.L_SWING, POSE.R_SWING];
export const LEG_BASE = [POSE.L_HIP, POSE.R_HIP];
export const HAND_IK_BASE = [POSE.L_HAND_IK, POSE.R_HAND_IK];
export const POLE_BASE = [POSE.L_POLE_X, POSE.R_POLE_X];
export const FOOT_IK_BASE = [POSE.L_FOOT_IK, POSE.R_FOOT_IK];
export const GRIP_INDEX = [POSE.L_GRIP, POSE.R_GRIP];
export const SIDE_SIGN = [1, -1];

/** The world frames the solver fills: one per rigid part, plus the skirt. */
export const FRAME = {
  PELVIS: 0, CHEST: 1, HEAD: 2,
  UPPER_ARM_L: 3, FOREARM_L: 4, HAND_L: 5,
  UPPER_ARM_R: 6, FOREARM_R: 7, HAND_R: 8,
  THIGH_L: 9, SHIN_L: 10, FOOT_L: 11,
  THIGH_R: 12, SHIN_R: 13, FOOT_R: 14,
  SKIRT: 15,
};
export const FRAME_COUNT = 16;

/**
 * Joint lengths and offsets for one build ({height, bulk, shoulders, hips}, each about 1).
 * A height of 1 is a 1.78 m adult.
 */
export function createRig(build = {}) {
  const h = build.height || 1;
  const w = build.bulk || 1;
  const sh = build.shoulders || 1;
  const hp = build.hips || 1;
  return {
    height: h, bulk: w, shoulders: sh, hips: hp,
    hipHeight: 0.95 * h,
    ankleHeight: 0.08 * h,
    thigh: 0.42 * h,
    shin: 0.42 * h,
    upperArm: 0.285 * h,
    forearm: 0.25 * h,
    hand: 0.165 * h,
    hipX: 0.088 * hp * (0.7 + 0.3 * w),
    hipY: -0.03 * h,
    spineY: 0.075 * h,
    spineZ: -0.01 * h,
    neckY: 0.465 * h,
    neckZ: -0.012 * h,
    shoulderX: 0.178 * sh * (0.62 + 0.38 * w),
    shoulderY: 0.395 * h,
    shoulderZ: -0.02 * h,
    toeReach: 0.13 * h,
    legLength: 0.84 * h,
  };
}

/** A zeroed pose with the hands' IK poles pointing down and out (a natural elbow). */
export function createPose() {
  const pose = new Float32Array(POSE_SIZE);
  pose[POSE.L_POLE_X] = 0.5; pose[POSE.L_POLE_Y] = -0.6; pose[POSE.L_POLE_Z] = -0.5;
  pose[POSE.R_POLE_X] = -0.5; pose[POSE.R_POLE_Y] = -0.6; pose[POSE.R_POLE_Z] = -0.5;
  return pose;
}

/** The matrices one character's solve writes into, plus a few numbers the renderer reads. */
export function createBodyFrames() {
  const frames = [];
  for (let i = 0; i < FRAME_COUNT; i += 1) frames.push(new THREE.Matrix4());
  frames.skirtSpread = 0;
  frames.skirtLift = 0;
  frames.solvedFrame = -1;
  return frames;
}

/**
 * Place every part. `base` is the body frame (feet on the ground, facing the heading; or a vehicle
 * seat); `rootOverride`, when given, is the pelvis world matrix itself (a tumbling ragdoll).
 * `aimDir` (world, unit) turns the hands toward a weapon's line of fire by pose[AIM_HAND];
 * `supportGrip` (a point in the right hand's frame, or null) is where the left hand holds a long gun,
 * reached by pose[SUPPORT_GRIP].
 */
export function solveSkeleton(rig, pose, base, rootOverride, frames, aimDir, supportGrip) {
  const pelvis = frames[FRAME.PELVIS];
  if (rootOverride) {
    pelvis.copy(rootOverride);
  } else {
    _euler.set(pose[POSE.ROOT_PITCH], pose[POSE.ROOT_YAW], -pose[POSE.ROOT_ROLL], 'YXZ');
    _local.makeRotationFromEuler(_euler);
    _local.elements[12] = pose[POSE.ROOT_X];
    _local.elements[13] = rig.hipHeight + pose[POSE.ROOT_Y];
    _local.elements[14] = pose[POSE.ROOT_Z];
    pelvis.multiplyMatrices(base, _local);
  }
  setJoint(frames[FRAME.CHEST], pelvis, 0, rig.spineY, rig.spineZ,
    pose[POSE.SPINE_PITCH], pose[POSE.SPINE_YAW], -pose[POSE.SPINE_ROLL], 'YXZ');
  setJoint(frames[FRAME.HEAD], frames[FRAME.CHEST], 0, rig.neckY, rig.neckZ,
    pose[POSE.NECK_PITCH], pose[POSE.NECK_YAW], -pose[POSE.NECK_ROLL], 'YXZ');

  _pelvisInverse.copy(pelvis).invert();
  const swingL = solveLeg(rig, pose, 0, base, frames, rootOverride !== null);
  const swingR = solveLeg(rig, pose, 1, base, frames, rootOverride !== null);
  solveArm(rig, pose, 1, base, frames, aimDir, null);
  if (supportGrip && pose[POSE.SUPPORT_GRIP] > 0.001) {
    _support.copy(supportGrip).applyMatrix4(frames[FRAME.HAND_R]);
    solveArm(rig, pose, 0, base, frames, aimDir, _support);
  } else {
    solveArm(rig, pose, 0, base, frames, aimDir, null);
  }

  // The skirt of a robe or dress hangs from the hips and follows the thighs.
  const average = (swingL + swingR) * 0.5;
  const lift = clampNumber(average, -0.4, 1.7);
  setJoint(frames[FRAME.SKIRT], pelvis, 0, 0.07 * rig.height, 0, -lift * 0.85, 0, 0, 'XYZ');
  frames.skirtSpread = Math.abs(swingL - swingR);
  frames.skirtLift = lift;
}

/** Thigh, shin and foot of one side; returns the final hip swing (for the skirt). */
function solveLeg(rig, pose, side, base, frames, ragdoll) {
  const s = SIDE_SIGN[side];
  const g = LEG_BASE[side];
  const f = FOOT_IK_BASE[side];
  let swing = pose[g];
  let abd = pose[g + 1];
  const twist = pose[g + 2];
  let knee = pose[g + 3];
  let ankle = pose[g + 4];
  const weight = ragdoll ? 0 : pose[f];
  if (weight > 0.001) {
    // Target ankle position: body frame -> world -> pelvis frame, relative to the hip joint.
    _target.set(pose[f + 1], pose[f + 2], pose[f + 3]).applyMatrix4(base).applyMatrix4(_pelvisInverse);
    const dx = _target.x - s * rig.hipX;
    const dy = _target.y - rig.hipY;
    const dz = _target.z;
    const abdIK = Math.atan2(dx * s, -dy);
    const down = Math.sqrt(dx * dx + dy * dy);
    const a = rig.thigh;
    const b = rig.shin;
    let reach = Math.sqrt(down * down + dz * dz);
    reach = clampNumber(reach, Math.abs(a - b) + 0.02, (a + b) * 0.9995);
    const kneeIK = Math.PI - Math.acos(clampNumber((a * a + b * b - reach * reach) / (2 * a * b), -1, 1));
    const toward = Math.atan2(dz, down);
    const offset = Math.acos(clampNumber((a * a + reach * reach - b * b) / (2 * a * reach), -1, 1));
    const swingIK = toward + offset;
    const ankleIK = pose[f + 4] + (-pose[POSE.ROOT_PITCH] + swingIK - kneeIK);
    swing += (swingIK - swing) * weight;
    abd += (abdIK - abd) * weight;
    knee += (kneeIK - knee) * weight;
    ankle += (ankleIK - ankle) * weight;
  }
  const thigh = frames[side ? FRAME.THIGH_R : FRAME.THIGH_L];
  const shin = frames[side ? FRAME.SHIN_R : FRAME.SHIN_L];
  const foot = frames[side ? FRAME.FOOT_R : FRAME.FOOT_L];
  setJoint(thigh, frames[FRAME.PELVIS], s * rig.hipX, rig.hipY, 0, -swing, s * twist, s * abd, 'ZXY');
  setJoint(shin, thigh, 0, -rig.thigh, 0, knee, 0, 0, 'XYZ');
  setJoint(foot, shin, 0, -rig.shin, 0, ankle, 0, 0, 'XYZ');
  return swing;
}

/**
 * Upper arm, forearm and hand of one side: joint angles, then IK toward the hand target, and for the
 * left hand optionally on to `supportWorld` (the foregrip of a long gun).
 */
function solveArm(rig, pose, side, base, frames, aimDir, supportWorld) {
  const s = SIDE_SIGN[side];
  const a = ARM_BASE[side];
  const upper = frames[side ? FRAME.UPPER_ARM_R : FRAME.UPPER_ARM_L];
  const fore = frames[side ? FRAME.FOREARM_R : FRAME.FOREARM_L];
  const hand = frames[side ? FRAME.HAND_R : FRAME.HAND_L];
  setJoint(upper, frames[FRAME.CHEST], s * rig.shoulderX, rig.shoulderY, rig.shoulderZ,
    -pose[a], s * pose[a + 2], s * pose[a + 1], 'ZXY');
  setJoint(fore, upper, 0, -rig.upperArm, 0, -pose[a + 3], 0, 0, 'XYZ');
  setJoint(hand, fore, 0, -rig.forearm, 0, -pose[a + 4], 0, 0, 'XYZ');

  const k = HAND_IK_BASE[side];
  const grip = supportWorld ? Math.min(1, pose[POSE.SUPPORT_GRIP]) : 0;
  const weight = Math.max(pose[k], grip);
  if (weight > 0.001) {
    _shoulder.setFromMatrixPosition(upper);
    _wrist.setFromMatrixPosition(hand);
    if (pose[k] > 0.001) {
      _target.set(pose[k + 1], pose[k + 2], pose[k + 3]).applyMatrix4(base);
      _wrist.lerp(_target, Math.min(1, pose[k]));
    }
    if (grip > 0) _wrist.lerp(supportWorld, grip);
    const p = POLE_BASE[side];
    _pole.set(pose[p], pose[p + 1], pose[p + 2]);
    if (_pole.lengthSq() < 1e-6) _pole.set(s * 0.5, -0.6, -0.5);
    _pole.transformDirection(base);
    solveTwoBoneArm(_shoulder, _wrist, rig.upperArm, rig.forearm, _pole, upper, fore);
    setJoint(hand, fore, 0, -rig.forearm, 0, -pose[a + 4], 0, 0, 'XYZ');
  }

  // The gun hand always turns with the aim; the other hand only while it supports the gun.
  const aim = side === 1 ? pose[POSE.AIM_HAND] : pose[POSE.AIM_HAND] * Math.min(1, weight);
  if (aim > 0.001 && aimDir) {
    // Turn the hand so a held gun points down the line of fire, gun top up.
    _yAxis.copy(aimDir).negate();
    _zAxis.set(0, 1, 0).addScaledVector(_yAxis, -_yAxis.y);
    if (_zAxis.lengthSq() < 1e-6) _zAxis.set(0, 0, 1);
    _zAxis.normalize();
    _xAxis.crossVectors(_yAxis, _zAxis);
    _basis.makeBasis(_xAxis, _yAxis, _zAxis);
    _aimQuat.setFromRotationMatrix(_basis);
    _wrist.setFromMatrixPosition(hand);
    hand.decompose(_tmpPos, _handQuat, _tmpScale);
    _handQuat.slerp(_aimQuat, Math.min(1, aim));
    hand.makeRotationFromQuaternion(_handQuat);
    hand.setPosition(_wrist);
  }
}

/**
 * Two-bone IK for an arm: bend the elbow toward `pole` so the wrist reaches `wrist` (clamped to reach),
 * and write the upper-arm and forearm world frames (each part hangs along its local -Y).
 */
function solveTwoBoneArm(shoulder, wrist, upperLength, foreLength, pole, upperOut, foreOut) {
  _dir.subVectors(wrist, shoulder);
  let dist = _dir.length();
  if (dist < 1e-5) {
    _dir.set(0, -1, 0);
    dist = 1e-5;
  } else {
    _dir.multiplyScalar(1 / dist);
  }
  dist = clampNumber(dist, Math.abs(upperLength - foreLength) + 0.01, (upperLength + foreLength) * 0.9995);
  const along = (upperLength * upperLength - foreLength * foreLength + dist * dist) / (2 * dist);
  const out = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  _bend.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_bend.lengthSq() < 1e-8) _bend.set(_dir.y, -_dir.x, 0);
  _bend.normalize();
  _elbow.copy(shoulder).addScaledVector(_dir, along).addScaledVector(_bend, out);
  _reach.copy(shoulder).addScaledVector(_dir, dist);

  _yAxis.subVectors(shoulder, _elbow).normalize();
  _fore.subVectors(_reach, _elbow);
  _zAxis.copy(_fore).addScaledVector(_yAxis, -_fore.dot(_yAxis));
  if (_zAxis.lengthSq() < 1e-6) {
    _zAxis.copy(_bend).negate().addScaledVector(_yAxis, _bend.dot(_yAxis));
  }
  _zAxis.normalize();
  _xAxis.crossVectors(_yAxis, _zAxis);
  upperOut.makeBasis(_xAxis, _yAxis, _zAxis);
  upperOut.setPosition(shoulder);

  _yAxis.subVectors(_elbow, _reach).normalize();
  _zAxis.crossVectors(_xAxis, _yAxis).normalize();
  _xAxis.crossVectors(_yAxis, _zAxis);
  foreOut.makeBasis(_xAxis, _yAxis, _zAxis);
  foreOut.setPosition(_elbow);
}

/** out = parent * translate(ox, oy, oz) * rotate(euler). */
function setJoint(out, parent, ox, oy, oz, rx, ry, rz, order) {
  _euler.set(rx, ry, rz, order);
  _local.makeRotationFromEuler(_euler);
  _local.elements[12] = ox;
  _local.elements[13] = oy;
  _local.elements[14] = oz;
  out.multiplyMatrices(parent, _local);
}

/** A point given in a part's local space, in world space. */
export function pointInFrame(frame, x, y, z, out) {
  return out.set(x, y, z).applyMatrix4(frame);
}

/** The body frame of a person standing at `pos` facing `heading`. */
export function standingBodyFrame(out, x, y, z, heading) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  out.set(
    c, 0, s, x,
    0, 1, 0, y,
    -s, 0, c, z,
    0, 0, 0, 1,
  );
  return out;
}

function clampNumber(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

const _euler = new THREE.Euler();
const _local = new THREE.Matrix4();
const _pelvisInverse = new THREE.Matrix4();
const _basis = new THREE.Matrix4();
const _target = new THREE.Vector3();
const _support = new THREE.Vector3();
const _shoulder = new THREE.Vector3();
const _wrist = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _reach = new THREE.Vector3();
const _fore = new THREE.Vector3();
const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _tmpPos = new THREE.Vector3();
const _tmpScale = new THREE.Vector3();
const _handQuat = new THREE.Quaternion();
const _aimQuat = new THREE.Quaternion();
