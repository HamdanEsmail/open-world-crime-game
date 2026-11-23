// The animator of every Port Sarab person: each frame it picks the base pose for what the body is
// doing (on foot, seated, climbing in or out of a car, tumbling, lying, getting up, swimming), layers
// the upper body over it (gun carry, aiming, the melee combo, hands up, talking, phoning, waving),
// adds recoil kicks, hit flinches and blinks, and cross-fades over a fifth of a second whenever the
// body changes what it is doing, so nothing ever pops.
import { POSE, POSE_SIZE, createPose, standingBodyFrame } from './characterRig.js';
import { createGaitState, poseLocomotion } from './characterLocomotion.js';
import {
  MELEE_MOVES, MELEE_COMBO, poseAim, poseCarry, poseMelee, poseSeated, poseBoarding, poseGesture,
  poseSwim, poseGetUp,
} from './characterActionPoses.js';
import { WEAPON_SHAPES } from './characterPartShapes.js';
import { blendSecondsInto } from './characterAnimationRules.js';

/** Per-person animation memory. */
export function createAnimationState(seed) {
  return {
    mode: 'foot', modeTime: 0, snapshot: createPose(), blendT: 1, blendDuration: 0.2,
    gait: createGaitState(seed),
    aimW: 0, carryW: 0, gestureW: 0, gesture: null, gestureTime: 0, fullW: 0, fullGesture: null,
    kick: 0, recentFire: 0,
    flinchPitch: 0, flinchPitchV: 0, flinchRoll: 0, flinchRollV: 0, flinchYaw: 0, flinchYawV: 0,
    meleeMove: null, meleeTime: 0, meleeIndex: 0, meleeQueued: false, meleeStruck: false, comboTimer: 0,
    lastFire: false, blinkTimer: 1 + seed * 4, blink: 0, swimTime: 0, stumble: 0, stumbleX: 0, stumbleZ: 0,
    seatLook: 0, seatLookTarget: 0, seatLookTimer: 2 + seed * 3, seed,
    fx: { aimX: 0, aimY: 0, aimZ: 1 },
  };
}

/**
 * Pose one person for this frame: fills body.pose, body.aimDir and body.base (for the on-foot modes),
 * and starts and lands melee moves. `ctx` gives {config, onStrike(character, move), onFootstep(character, side)}.
 */
export function animateCharacter(character, body, dt, ctx) {
  const anim = body.anim;
  const mode = body.mode;
  if (mode !== anim.mode) {
    anim.snapshot.set(body.pose);
    anim.blendT = 0;
    anim.blendDuration = blendSecondsInto(mode);
    anim.mode = mode;
    anim.modeTime = 0;
  }
  anim.modeTime += dt;
  updateBlinkAndFlinch(anim, dt);
  anim.kick *= Math.exp(-13 * dt);
  anim.recentFire = Math.max(0, anim.recentFire - dt);
  const target = _target;
  const rig = body.rig;
  const fx = anim.fx;
  fx.aimX = 0; fx.aimY = 0; fx.aimZ = 1;
  body.supportGrip = null;

  if (mode === 'foot') {
    standingBodyFrame(body.base, character.pos.x, character.pos.y, character.pos.z, character.heading);
    poseOnFoot(character, body, target, dt, ctx);
  } else if (mode === 'seated') {
    const vehicle = character.vehicle;
    const driver = character.seat === 0;
    const controls = vehicle && vehicle.controls;
    const steer = controls ? controls.steer || 0 : 0;
    const speed = vehicle ? vehicle.speed || 0 : 0;
    const yawRate = vehicle ? vehicle.yawRate || 0 : 0;
    const sway = clamp(-yawRate * speed * 0.011, -0.26, 0.26);
    const brake = controls ? clamp((controls.brake || 0) * Math.abs(speed) * 0.012, 0, 0.2) : 0;
    anim.seatLookTimer -= dt;
    if (anim.seatLookTimer <= 0) {
      anim.seatLookTimer = 2.5 + Math.random() * 4;
      anim.seatLookTarget = driver ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 1.4;
    }
    anim.seatLook = damp(anim.seatLook, anim.seatLookTarget, 3, dt);
    poseSeated(target, rig, driver, steer, body.wheel, sway, brake, anim.seatLook);
    if (character.alive === false) slumpInSeat(target);
  } else if (mode === 'boarding' || mode === 'unboarding') {
    const boarding = body.boarding;
    const u = boarding ? boarding.poseU : 1;
    poseSeated(_seated, rig, (boarding ? boarding.seat : character.seat) === 0, 0, body.wheel, 0, 0, 0);
    standingPose(_standing, body, rig, dt, ctx);
    poseBoarding(target, rig, u, boarding ? boarding.doorSide : 1, _standing, _seated);
  } else if (mode === 'ragdoll' || mode === 'lying') {
    standingBodyFrame(body.base, character.pos.x, character.pos.y, character.pos.z, character.heading);
    target.set(body.ragdollPose);
  } else if (mode === 'getUp') {
    standingBodyFrame(body.base, character.pos.x, character.pos.y, character.pos.z, character.heading);
    const getUp = body.getUp;
    poseGetUp(target, rig, getUp ? clamp(getUp.t / getUp.duration, 0, 1) : 1, getUp ? getUp.faceUp : false);
  } else if (mode === 'swim') {
    standingBodyFrame(body.base, character.pos.x, character.pos.y, character.pos.z, character.heading);
    anim.swimTime += dt;
    const speed = Math.sqrt(character.vel.x * character.vel.x + character.vel.z * character.vel.z);
    poseSwim(target, rig, anim.swimTime, speed);
  }

  // Hit reactions: the torso snaps away from the blow and springs back.
  target[POSE.SPINE_PITCH] += anim.flinchPitch;
  target[POSE.SPINE_ROLL] += anim.flinchRoll;
  target[POSE.SPINE_YAW] += anim.flinchYaw;
  target[POSE.NECK_PITCH] += anim.flinchPitch * 0.8;
  target[POSE.NECK_ROLL] += anim.flinchRoll * 0.6;
  target[POSE.EYES_CLOSED] = character.alive === false || anim.blink > 0 ? 1 : 0;

  // Cross-fade from where the body was when the mode changed.
  const pose = body.pose;
  if (anim.blendT < anim.blendDuration) {
    anim.blendT += dt;
    const t = smooth(anim.blendT / anim.blendDuration);
    const from = anim.snapshot;
    for (let i = 0; i < POSE_SIZE; i += 1) pose[i] = from[i] + (target[i] - from[i]) * t;
  } else {
    pose.set(target);
  }

  // The world direction a held weapon points along.
  const sinH = Math.sin(character.heading);
  const cosH = Math.cos(character.heading);
  body.aimDir.set(fx.aimX * cosH + fx.aimZ * sinH, fx.aimY, -fx.aimX * sinH + fx.aimZ * cosH).normalize();
  const shape = body.weaponClass ? WEAPON_SHAPES[body.weaponClass] : null;
  if (shape && pose[POSE.SUPPORT_GRIP] > 0.001) {
    body.supportPoint.set(shape.support[0], shape.support[1], shape.support[2]);
    // weapon frame -> hand frame (barrel along -Y, gun top along +Z, grip dropped into the fist)
    const x = body.supportPoint.x;
    const y = body.supportPoint.y;
    const z = body.supportPoint.z;
    body.supportPoint.set(x, -z - 0.075, y);
    body.supportGrip = body.supportPoint;
  }
}

/** The on-foot pose: gait, then gun carry, aim, melee and gestures over it. */
function poseOnFoot(character, body, target, dt, ctx) {
  const anim = body.anim;
  const rig = body.rig;
  const intent = character.intent;
  const motion = body.motion;
  const config = ctx.config;
  const fx = anim.fx;
  _motionInput.vx = character.vel.x;
  _motionInput.vz = character.vel.z;
  _motionInput.vy = character.vel.y;
  _motionInput.heading = character.heading;
  _motionInput.yawRate = motion.yawRate;
  _motionInput.grounded = character.grounded;
  _motionInput.crouch = motion.crouching;
  _motionInput.turnLead = motion.turnLead;
  _motionInput.walkSpeed = config.walkSpeed;
  _motionInput.runSpeed = config.runSpeed;
  _motionInput.sprintSpeed = config.sprintSpeed;
  _motionInput.windup = motion.windup;
  _motionInput.landingSpeed = motion.landingSpeed;
  const strike = poseLocomotion(target, anim.gait, rig, _motionInput, dt);
  if (strike >= 0 && ctx.onFootstep) ctx.onFootstep(character, strike);

  const weaponClass = body.weaponClass;
  const fighting = !weaponClass || weaponClass === 'bat';
  const canAct = character.state !== 'stumble' && character.alive !== false;

  // Melee: a fire press starts the combo; presses during a move queue the next one.
  const firePressed = intent.fire && !anim.lastFire;
  anim.lastFire = !!intent.fire;
  anim.comboTimer = Math.max(0, anim.comboTimer - dt);
  if (fighting && canAct && firePressed && character.grounded) {
    if (anim.meleeMove) anim.meleeQueued = true;
    else startMelee(anim, weaponClass, false);
  }
  if (anim.meleeMove) {
    anim.meleeTime += dt;
    const spec = MELEE_MOVES[anim.meleeMove];
    if (!anim.meleeStruck && anim.meleeTime >= spec.strike) {
      anim.meleeStruck = true;
      if (ctx.onStrike) ctx.onStrike(character, anim.meleeMove);
    }
    if (anim.meleeTime >= spec.duration) {
      const queued = anim.meleeQueued;
      anim.meleeMove = null;
      anim.meleeQueued = false;
      anim.comboTimer = 0.45;
      if (queued && canAct) startMelee(anim, weaponClass, true);
    }
  }
  if (!fighting && intent.fire) anim.recentFire = 0.6;

  const aiming = canAct && !anim.meleeMove && (intent.aim || anim.recentFire > 0);
  anim.aimW = damp(anim.aimW, aiming ? 1 : 0, aiming ? 14 : 8, dt);
  anim.carryW = damp(anim.carryW, weaponClass && !anim.meleeMove ? 1 : 0, 10, dt);

  if (anim.carryW > 0.01) {
    _layer.set(target);
    poseCarry(_layer, rig, weaponClass, fx);
    mixInto(target, _layer, anim.carryW);
  }
  if (anim.aimW > 0.01) {
    _layer.set(target);
    const yaw = wrapAngle((intent.aimYaw || 0) - character.heading);
    const still = clamp(1 - anim.gait.speed / 0.8, 0, 1) * (1 - anim.gait.stride * 0.8);
    poseAim(_layer, rig, weaponClass, clamp(yaw, -1.2, 1.2), clamp(intent.aimPitch || 0, -1.0, 1.0), anim.kick, fx, still);
    mixInto(target, _layer, anim.aimW);
  }
  if (anim.meleeMove) {
    _layer.set(target);
    poseMelee(_layer, rig, anim.meleeMove, anim.meleeTime, fx);
    const spec = MELEE_MOVES[anim.meleeMove];
    const fade = Math.min(1, anim.meleeTime / 0.06, (spec.duration - anim.meleeTime) / 0.1 + (anim.meleeQueued ? 1 : 0));
    mixInto(target, _layer, clamp(fade, 0, 1));
  }

  // Gestures: hands up, talking, phoning and waving ride on the gait; cower, sit and lean take the whole body.
  const gesture = canAct && !anim.meleeMove ? intent.gesture : null;
  const full = gesture === 'cower' || gesture === 'sit' || gesture === 'lean';
  if (gesture && gesture !== anim.gesture && !full) {
    anim.gesture = gesture;
    anim.gestureTime = 0;
  }
  if (full && gesture !== anim.fullGesture) {
    anim.fullGesture = gesture;
    anim.gestureTime = 0;
  }
  anim.gestureTime += dt;
  anim.gestureW = damp(anim.gestureW, gesture && !full ? 1 : 0, 7, dt);
  anim.fullW = damp(anim.fullW, full ? 1 : 0, 5, dt);
  if (anim.gestureW < 0.01 && !(gesture && !full)) anim.gesture = null;
  if (anim.fullW < 0.01 && !full) anim.fullGesture = null;
  if (anim.gesture && anim.gestureW > 0.01) {
    _layer.set(target);
    poseGesture(_layer, rig, anim.gesture, anim.gestureTime, anim.seed * 10);
    mixInto(target, _layer, anim.gestureW);
  }
  if (anim.fullGesture && anim.fullW > 0.01) {
    _layer.set(target);
    poseGesture(_layer, rig, anim.fullGesture, anim.gestureTime, anim.seed * 10);
    mixInto(target, _layer, anim.fullW);
  }

  // Stumbling after a shove: arms thrown out for balance, the torso pitched with the push.
  if (anim.stumble > 0.01) {
    const s = anim.stumble;
    const t = anim.modeTime * 13;
    target[POSE.SPINE_PITCH] += anim.stumbleZ * 0.45 * s;
    target[POSE.SPINE_ROLL] += anim.stumbleX * 0.4 * s;
    target[POSE.L_ABD] += (0.9 + 0.3 * Math.sin(t)) * s;
    target[POSE.R_ABD] += (0.9 + 0.3 * Math.sin(t + 2)) * s;
    target[POSE.L_SWING] += 0.5 * Math.sin(t * 0.8) * s;
    target[POSE.R_SWING] += 0.5 * Math.sin(t * 0.8 + 3) * s;
    target[POSE.L_HAND_IK] *= 1 - s;
    target[POSE.R_HAND_IK] *= 1 - s;
  }
}

/** The pose a person stands in at a car door (used as the start of climbing in). */
function standingPose(out, body, rig, dt, ctx) {
  _standInput.vx = 0; _standInput.vz = 0; _standInput.vy = 0;
  _standInput.heading = 0; _standInput.yawRate = 0; _standInput.grounded = true;
  _standInput.crouch = false; _standInput.turnLead = 0;
  _standInput.walkSpeed = ctx.config.walkSpeed; _standInput.runSpeed = ctx.config.runSpeed;
  _standInput.sprintSpeed = ctx.config.sprintSpeed; _standInput.windup = 0; _standInput.landingSpeed = 0;
  poseLocomotion(out, body.anim.gait, rig, _standInput, dt);
}

function startMelee(anim, weaponClass, chained) {
  if (weaponClass === 'bat') {
    anim.meleeMove = 'bat';
  } else {
    anim.meleeIndex = chained || anim.comboTimer > 0 ? (anim.meleeIndex + 1) % MELEE_COMBO.length : 0;
    anim.meleeMove = MELEE_COMBO[anim.meleeIndex];
  }
  anim.meleeTime = 0;
  anim.meleeStruck = false;
  anim.meleeQueued = false;
}

/** Kick the flinch springs: dir is the blow's direction in the body frame (x left, z forward). */
export function flinch(anim, dirX, dirZ, strength) {
  const s = clamp(strength, 0, 1.4);
  anim.flinchPitchV += dirZ * 7 * s;
  anim.flinchRollV += dirX * 6 * s;
  anim.flinchYawV += (Math.random() - 0.5) * 5 * s;
}

/** Add a recoil kick from a shot just fired. */
export function recoil(anim, amount) {
  anim.kick = Math.min(1.2, anim.kick + amount);
  anim.recentFire = 0.6;
}

/** Start a stagger: the shove direction in the body frame and how hard (0..1). */
export function stagger(anim, dirX, dirZ, strength) {
  anim.stumble = clamp(strength, 0, 1);
  anim.stumbleX = dirX;
  anim.stumbleZ = dirZ;
}

function updateBlinkAndFlinch(anim, dt) {
  anim.blinkTimer -= dt;
  if (anim.blinkTimer <= 0) {
    anim.blink = 0.13;
    anim.blinkTimer = 2 + Math.random() * 4;
  }
  anim.blink = Math.max(0, anim.blink - dt);
  const k = 170;
  const d = 13;
  const step = Math.min(dt, 1 / 30);
  anim.flinchPitchV += (-k * anim.flinchPitch - d * anim.flinchPitchV) * step;
  anim.flinchPitch += anim.flinchPitchV * step;
  anim.flinchRollV += (-k * anim.flinchRoll - d * anim.flinchRollV) * step;
  anim.flinchRoll += anim.flinchRollV * step;
  anim.flinchYawV += (-k * anim.flinchYaw - d * anim.flinchYawV) * step;
  anim.flinchYaw += anim.flinchYawV * step;
  anim.stumble = Math.max(0, anim.stumble - dt * 1.3);
}

/** A dead driver or passenger slumps against the door. */
function slumpInSeat(out) {
  out[POSE.SPINE_PITCH] = 0.45;
  out[POSE.SPINE_ROLL] = 0.3;
  out[POSE.NECK_PITCH] = 0.7;
  out[POSE.NECK_ROLL] = 0.4;
  out[POSE.L_HAND_IK] = 0;
  out[POSE.R_HAND_IK] = 0;
  out[POSE.L_SWING] = 0.3;
  out[POSE.R_SWING] = 0.3;
}

/** target = target + (layer - target) * w, over every channel. */
function mixInto(target, layer, w) {
  if (w >= 0.999) {
    target.set(layer);
    return;
  }
  for (let i = 0; i < POSE_SIZE; i += 1) target[i] += (layer[i] - target[i]) * w;
}

function wrapAngle(a) {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  else if (x < -Math.PI) x += Math.PI * 2;
  return x;
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

const _target = createPose();
const _layer = createPose();
const _seated = createPose();
const _standing = createPose();
const _motionInput = {
  vx: 0, vz: 0, vy: 0, heading: 0, yawRate: 0, grounded: true, crouch: false, turnLead: 0,
  walkSpeed: 2, runSpeed: 4.6, sprintSpeed: 7.4, windup: 0, landingSpeed: 0,
};
const _standInput = { ..._motionInput };
