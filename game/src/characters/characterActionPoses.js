// Everything a Port Sarab body does besides getting about on foot, as procedural poses: aiming a
// pistol two-handed or a rifle at the shoulder, recoil, the jab-cross-kick combo and the bat swing,
// gun carry, hands on a steering wheel that turns with the car, climbing in and out of a car, hands
// up, cowering, talking, phoning, waving, sitting, leaning on a wall, swimming, lying and getting up.
// Each function overwrites the channels it owns in a pose; times are seconds into the action.
import { POSE, SIDE_SIGN, ARM_BASE, LEG_BASE, FOOT_IK_BASE, HAND_IK_BASE, POLE_BASE } from './characterRig.js';

/** The three-hit unarmed combo and the bat swing: duration, the moment of the hit, reach and damage. */
export const MELEE_MOVES = {
  jab: { duration: 0.34, strike: 0.11, reach: 1.0, damage: 8, push: 1.2 },
  cross: { duration: 0.4, strike: 0.15, reach: 1.05, damage: 12, push: 2.0 },
  kick: { duration: 0.58, strike: 0.27, reach: 1.25, damage: 18, push: 4.6 },
  bat: { duration: 0.62, strike: 0.3, reach: 1.45, damage: 32, push: 4.0 },
};
export const MELEE_COMBO = ['jab', 'cross', 'kick'];

/**
 * Raise a weapon (or fists) to the line of fire. `yaw` and `pitch` are the aim relative to the body
 * (radians, pitch + up); `kick` 0..1 is the recoil still in the arms. Writes the aim direction (body
 * frame) into fx.aimX/Y/Z. `still` (0..1) is how still the person stands: it plants the feet in a
 * staggered stance.
 */
export function poseAim(out, rig, weaponClass, yaw, pitch, kick, fx, still = 1) {
  const h = rig.height;
  const cp = Math.cos(pitch);
  const dx = Math.sin(yaw) * cp;
  const dy = Math.sin(pitch);
  const dz = Math.cos(yaw) * cp;
  fx.aimX = dx;
  fx.aimY = dy + kick * 0.25;
  fx.aimZ = dz;
  out[POSE.SPINE_YAW] += yaw * 0.55;
  out[POSE.NECK_YAW] = yaw * 0.4;
  out[POSE.SPINE_PITCH] = -pitch * 0.3 + 0.04 - kick * 0.05;
  out[POSE.NECK_PITCH] = -pitch * 0.45 + 0.04 - kick * 0.04;
  out[POSE.SPINE_ROLL] *= 0.3;
  const shoulderY = 1.4 * h;
  const back = kick * 0.06;
  if (!weaponClass) {
    // A boxer's guard: fists up before the chin, left foot forward, knees soft, chin tucked.
    setHand(out, 0, 0.1, 1.41 * h, 0.33, 1, 0.5, -0.9, -0.2);
    setHand(out, 1, -0.11, 1.39 * h, 0.26, 1, -0.5, -0.9, -0.2);
    out[POSE.L_GRIP] = 1;
    out[POSE.R_GRIP] = 1;
    out[POSE.AIM_HAND] = 0;
    out[POSE.SUPPORT_GRIP] = 0;
    out[POSE.SPINE_PITCH] = 0.14;
    out[POSE.NECK_PITCH] = 0.02;
    out[POSE.SPINE_YAW] -= 0.22;
    out[POSE.NECK_YAW] += 0.22;
    stance(out, rig, 0.14 * still, -0.1 * still, 0.035 * still);
    return;
  }
  if (weaponClass === 'bat') {
    setHand(out, 1, -0.16, 1.32 * h, 0.16, 1, -0.7, -0.6, -0.2);
    fx.aimX = -0.35; fx.aimY = 0.75; fx.aimZ = -0.55;
    out[POSE.AIM_HAND] = 1;
    out[POSE.SUPPORT_GRIP] = 1;
    out[POSE.R_GRIP] = 1;
    out[POSE.L_GRIP] = 1;
    out[POSE.SPINE_YAW] -= 0.25;
    out[POSE.NECK_YAW] += 0.25;
    return;
  }
  const longGun = weaponClass !== 'pistol';
  if (longGun) {
    // Stock in the right shoulder, cheek on the gun, left hand on the foregrip.
    const sx = -rig.shoulderX * 0.55;
    const reach = 0.27 - back;
    setHand(out, 1, sx + dx * reach - 0.02, shoulderY - 0.07 + dy * reach + kick * 0.02, dz * reach + 0.02, 1, -0.85, -0.45, -0.2);
    out[POSE.SPINE_YAW] -= 0.28;
    out[POSE.NECK_YAW] += 0.3;
    out[POSE.NECK_ROLL] = -0.14;
    out[POSE.NECK_PITCH] += 0.1;
    out[POSE.L_POLE_X] = 0.25; out[POSE.L_POLE_Y] = -0.95; out[POSE.L_POLE_Z] = 0.1;
  } else {
    // Pistol held out two-handed at eye line.
    const reach = 0.5 - back;
    setHand(out, 1, -0.03 + dx * reach, shoulderY - 0.02 + dy * reach + kick * 0.03, dz * reach, 1, -0.55, -0.8, -0.2);
    out[POSE.L_POLE_X] = 0.6; out[POSE.L_POLE_Y] = -0.75; out[POSE.L_POLE_Z] = -0.1;
  }
  out[HAND_IK_BASE[0]] = 0;
  out[POSE.SUPPORT_GRIP] = 1;
  out[POSE.AIM_HAND] = 1;
  out[POSE.R_GRIP] = 1;
  out[POSE.L_GRIP] = 1;
  out[POSE.SPINE_PITCH] += 0.06;
  stance(out, rig, 0.1 * still, -0.08 * still, 0.02 * still);
}

/** A planted fighting or shooting stance: left foot ahead, right foot back, knees a little bent. */
function stance(out, rig, leftZ, rightZ, drop) {
  const fl = FOOT_IK_BASE[0];
  const fr = FOOT_IK_BASE[1];
  out[fl + 3] += leftZ * rig.height;
  out[fr + 3] += rightZ * rig.height;
  out[fl + 1] += 0.15 * leftZ;
  out[fr + 1] += 0.15 * rightZ;
  out[POSE.ROOT_Y] -= drop * rig.height;
}

/** Holding a weapon while not aiming: pistols hang by the leg, long guns are carried across the body. */
export function poseCarry(out, rig, weaponClass, fx) {
  const h = rig.height;
  if (!weaponClass || weaponClass === 'pistol' || weaponClass === 'bat') {
    const a = ARM_BASE[1];
    out[a] *= 0.5;
    out[a + 3] = Math.max(out[a + 3], 0.3);
    out[POSE.R_GRIP] = 1;
    return;
  }
  setHand(out, 1, -0.17, 1.0 * h, 0.16, 1, -0.6, -0.7, -0.3);
  fx.aimX = 0.32; fx.aimY = -0.42; fx.aimZ = 0.85;
  out[POSE.AIM_HAND] = 1;
  out[POSE.SUPPORT_GRIP] = 1;
  out[POSE.R_GRIP] = 1;
  out[POSE.L_GRIP] = 1;
  out[POSE.L_POLE_X] = 0.5; out[POSE.L_POLE_Y] = -0.8; out[POSE.L_POLE_Z] = -0.1;
}

/**
 * One move of the melee combo at time t. Fists come from the guard and return to it; the kick
 * chambers, snaps out and replants; the bat winds up over the shoulder and sweeps across.
 */
export function poseMelee(out, rig, move, t, fx) {
  const h = rig.height;
  const spec = MELEE_MOVES[move] || MELEE_MOVES.jab;
  const u = Math.min(1, t / spec.duration);
  const hit = spec.strike / spec.duration;
  const extend = u < hit ? easeOut(u / hit) : 1 - smooth((u - hit) / (1 - hit));
  poseAim(out, rig, null, 0, 0, 0, fx, 1);
  if (move === 'jab') {
    setHand(out, 0, 0.11 - 0.06 * extend, (1.5 - 0.03 * extend) * h, 0.3 + 0.34 * extend, 1, 0.5, -0.8, -0.3);
    out[POSE.SPINE_YAW] -= 0.25 * extend;
    out[POSE.ROOT_YAW] -= 0.1 * extend;
    out[POSE.ROOT_Z] += 0.05 * extend;
  } else if (move === 'cross') {
    setHand(out, 1, -0.1 + 0.09 * extend, (1.49 - 0.04 * extend) * h, 0.24 + 0.44 * extend, 1, -0.6, -0.7, -0.3);
    out[POSE.SPINE_YAW] += 0.6 * extend;
    out[POSE.ROOT_YAW] += 0.3 * extend;
    out[POSE.NECK_YAW] -= 0.5 * extend;
    out[POSE.ROOT_Z] += 0.07 * extend;
    out[FOOT_IK_BASE[1] + 4] = 0.7 * extend;
    out[FOOT_IK_BASE[1] + 2] += 0.07 * extend;
    out[LEG_BASE[1] + 2] = -0.4 * extend;
  } else if (move === 'kick') {
    const chamber = smooth(Math.min(1, u / 0.3));
    const snap = u < 0.3 ? 0 : u < hit ? easeOut((u - 0.3) / (hit - 0.3)) : 1 - smooth((u - hit) / (1 - hit));
    const lift = u < 0.75 ? chamber : 1 - smooth((u - 0.75) / 0.25);
    const leg = LEG_BASE[1];
    const f = FOOT_IK_BASE[1];
    out[f] = 1 - lift;
    out[leg] = 1.45 * lift - 0.1 * snap;
    out[leg + 1] = 0.05;
    out[leg + 3] = 1.75 * lift * (1 - snap) + 0.1;
    out[leg + 4] = 0.6 * snap;
    out[POSE.SPINE_PITCH] = 0.1 - 0.45 * lift * (0.4 + 0.6 * snap);
    out[POSE.ROOT_PITCH] = -0.18 * lift;
    out[POSE.ROOT_Z] -= 0.06 * lift;
    out[POSE.ROOT_X] += 0.04 * lift;
    out[POSE.NECK_PITCH] = 0.25 * lift;
    setHand(out, 0, 0.3, 1.38 * h, 0.12, 1, 0.6, -0.6, -0.4);
    setHand(out, 1, -0.33, 1.3 * h, -0.05, 1, -0.6, -0.6, -0.2);
  } else {
    // Bat: wind up over the right shoulder, sweep across in front, follow through to the left.
    const wind = smooth(Math.min(1, u / 0.35));
    const sweep = u < 0.35 ? 0 : smooth(Math.min(1, (u - 0.35) / 0.25));
    const recover = u < 0.75 ? 0 : smooth((u - 0.75) / 0.25);
    const angle = -1.9 * wind + 3.3 * sweep - 1.4 * recover;
    const handAngle = angle * 0.6;
    setHand(out, 1, Math.sin(handAngle) * 0.34, (1.3 - 0.12 * sweep * (1 - recover)) * h, 0.12 + Math.cos(handAngle) * 0.2, 1, -0.6, -0.7, -0.2);
    fx.aimX = Math.sin(angle) * 0.9;
    fx.aimY = 0.6 * (1 - sweep) + 0.05;
    fx.aimZ = Math.cos(angle) * 0.9;
    out[POSE.AIM_HAND] = 1;
    out[POSE.SUPPORT_GRIP] = 1;
    out[POSE.SPINE_YAW] += angle * 0.4;
    out[POSE.ROOT_YAW] += angle * 0.15;
    out[POSE.SPINE_PITCH] = 0.12 * sweep;
  }
}

/**
 * Seated in a vehicle. Drivers hold the wheel at ten and two, turning it with `steer`; passengers rest
 * their hands. `lean` (radians, + to the left) is the sway the turn and braking put into the body.
 */
export function poseSeated(out, rig, driver, steer, wheel, leanRoll, leanPitch, look) {
  const h = rig.height;
  clearLegsIK(out);
  out[POSE.ROOT_X] = 0;
  out[POSE.ROOT_Y] = 0;
  out[POSE.ROOT_Z] = 0;
  out[POSE.ROOT_PITCH] = -0.26;
  out[POSE.ROOT_ROLL] = 0;
  out[POSE.ROOT_YAW] = 0;
  out[POSE.SPINE_PITCH] = 0.12 + leanPitch;
  out[POSE.SPINE_ROLL] = leanRoll;
  out[POSE.SPINE_YAW] = 0;
  out[POSE.NECK_PITCH] = 0.12 - leanPitch * 0.6;
  out[POSE.NECK_ROLL] = -leanRoll * 0.5;
  out[POSE.NECK_YAW] = (driver ? -steer * 0.25 : 0) + look;
  for (let side = 0; side < 2; side += 1) {
    const leg = LEG_BASE[side];
    out[leg] = 1.42;
    out[leg + 1] = 0.1;
    out[leg + 2] = SIDE_SIGN[side] * 0.06;
    out[leg + 3] = 1.25 + (side === 1 && driver ? -0.08 : 0);
    out[leg + 4] = 0.15;
  }
  const wheelY = rig.hipHeight + 0.36 * h;
  const wheelZ = 0.43 * h * (wheel ? wheel.reach : 1);
  if (driver) {
    const turn = -steer * 1.45;
    for (let side = 0; side < 2; side += 1) {
      const s = SIDE_SIGN[side];
      const angle = s * 1.05 + turn;
      const rimX = Math.sin(angle) * 0.17;
      const rimUp = Math.cos(angle) * 0.17;
      setHand(out, side, rimX, wheelY + rimUp * 0.9, wheelZ + rimUp * 0.42, 1, s * 0.6, -0.75, -0.1);
    }
    out[POSE.L_GRIP] = 1;
    out[POSE.R_GRIP] = 1;
  } else {
    setHand(out, 0, 0.13, rig.hipHeight + 0.1 * h, 0.32, 1, 0.5, -0.4, -0.6);
    setHand(out, 1, -0.13, rig.hipHeight + 0.1 * h, 0.33, 1, -0.5, -0.4, -0.6);
    out[POSE.L_GRIP] = 0;
    out[POSE.R_GRIP] = 0;
  }
  out[POSE.AIM_HAND] = 0;
  out[POSE.SUPPORT_GRIP] = 0;
}

/**
 * Climbing into a seat: reach for the door (0..0.25), duck in (0.25..0.6), settle (0.6..1). `u` is
 * 0..1 through the move; the caller blends the body frame from the door to the seat.
 * `doorSide` is +1 when the door is on the person's left hand.
 */
export function poseBoarding(out, rig, u, doorSide, standing, seated) {
  const reach = smooth(clamp(u / 0.25, 0, 1)) * (1 - smooth(clamp((u - 0.3) / 0.25, 0, 1)));
  const sit = smooth(clamp((u - 0.2) / 0.55, 0, 1));
  for (let i = 0; i < out.length; i += 1) out[i] = standing[i] + (seated[i] - standing[i]) * sit;
  const duck = Math.sin(clamp((u - 0.15) / 0.6, 0, 1) * Math.PI);
  out[POSE.SPINE_PITCH] += duck * 0.55;
  out[POSE.NECK_PITCH] += duck * 0.35;
  out[POSE.ROOT_Y] -= duck * 0.08;
  const hand = doorSide > 0 ? 0 : 1;
  const s = SIDE_SIGN[hand];
  const h = rig.height;
  const handX = s * 0.32;
  const k = HAND_IK_BASE[hand];
  const weight = reach;
  out[k] = out[k] * (1 - weight) + weight;
  out[k + 1] = out[k + 1] * (1 - weight) + handX * weight;
  out[k + 2] = out[k + 2] * (1 - weight) + 1.05 * h * weight;
  out[k + 3] = out[k + 3] * (1 - weight) + 0.42 * weight;
  const lead = doorSide > 0 ? 1 : 0;
  const leg = LEG_BASE[lead];
  const step = Math.sin(clamp((u - 0.2) / 0.4, 0, 1) * Math.PI);
  out[leg] += step * 0.6;
  out[leg + 3] += step * 0.7;
}

/** Hands up, cower, talk, phone, wave, sit (on a bench), lean (on a wall): standing gestures over the gait. */
export function poseGesture(out, rig, gesture, t, seed) {
  const h = rig.height;
  if (gesture === 'handsUp') {
    const tremble = Math.sin(t * 23 + seed) * 0.008;
    setHand(out, 0, 0.27, 1.74 * h + tremble, 0.1, 1, 0.9, -0.4, -0.1);
    setHand(out, 1, -0.27, 1.74 * h - tremble, 0.1, 1, -0.9, -0.4, -0.1);
    out[POSE.L_GRIP] = 0;
    out[POSE.R_GRIP] = 0;
    out[POSE.NECK_PITCH] = 0.12;
    out[POSE.SPINE_PITCH] = -0.04;
  } else if (gesture === 'cower') {
    // Squatting low, head ducked, both hands clasped over the head, elbows in front of the face.
    const shake = Math.sin(t * 19 + seed) * 0.01;
    out[POSE.ROOT_Y] = -0.5 * h;
    out[POSE.ROOT_PITCH] = 0.3;
    out[POSE.ROOT_Z] = -0.04;
    out[POSE.ROOT_X] = 0;
    out[POSE.SPINE_PITCH] = 0.35 + shake;
    out[POSE.NECK_PITCH] = 0.5;
    out[POSE.NECK_YAW] = 0;
    for (let side = 0; side < 2; side += 1) {
      const f = FOOT_IK_BASE[side];
      out[f] = 1;
      out[f + 1] = SIDE_SIGN[side] * 0.17;
      out[f + 2] = rig.ankleHeight + 0.02;
      out[f + 3] = 0.06;
      out[f + 4] = 0.35;
    }
    setHand(out, 0, 0.06, 0.99 * h, 0.5 * h, 1, 0.6, -0.1, 0.8);
    setHand(out, 1, -0.06, 1.0 * h, 0.49 * h, 1, -0.6, -0.1, 0.8);
    out[POSE.L_GRIP] = 0;
    out[POSE.R_GRIP] = 0;
  } else if (gesture === 'talk') {
    const a = Math.sin(t * 2.3 + seed);
    const b = Math.sin(t * 3.1 + seed * 2.1);
    setHand(out, 1, -0.17 + 0.07 * a, (1.12 + 0.07 * Math.max(0, b)) * h, 0.27 + 0.05 * b, 0.9, -0.6, -0.7, -0.3);
    setHand(out, 0, 0.16 - 0.05 * b, (1.06 + 0.05 * Math.max(0, a)) * h, 0.22 + 0.06 * a, 0.6 + 0.3 * Math.max(0, a), 0.6, -0.7, -0.3);
    out[POSE.NECK_PITCH] += 0.06 * Math.sin(t * 4.1 + seed);
    out[POSE.NECK_YAW] += 0.12 * Math.sin(t * 0.9 + seed);
    out[POSE.L_GRIP] = 0;
    out[POSE.R_GRIP] = 0;
  } else if (gesture === 'phone') {
    setHand(out, 1, -0.11, 1.6 * h, 0.06, 1, -0.7, -0.6, -0.1);
    setHand(out, 0, -0.04, 1.16 * h, 0.17, 0.85, 0.6, -0.6, -0.2);
    out[POSE.NECK_ROLL] = -0.16;
    out[POSE.NECK_PITCH] += 0.08;
    out[POSE.R_GRIP] = 1;
  } else if (gesture === 'wave') {
    const wave = Math.sin(t * 9);
    setHand(out, 1, -0.33 + 0.07 * wave, 1.74 * h, 0.1, 1, -0.9, -0.3, -0.1);
    out[POSE.R_GRIP] = 0;
    out[POSE.NECK_YAW] += 0.05 * wave;
  } else if (gesture === 'sit') {
    clearLegsIK(out);
    out[POSE.ROOT_Y] = -(rig.hipHeight - 0.46 * h);
    out[POSE.ROOT_PITCH] = -0.12;
    out[POSE.ROOT_Z] = -0.08;
    out[POSE.ROOT_X] = 0;
    out[POSE.SPINE_PITCH] = 0.18 + 0.02 * Math.sin(t * 1.4 + seed);
    for (let side = 0; side < 2; side += 1) {
      const leg = LEG_BASE[side];
      out[leg] = 1.5;
      out[leg + 1] = 0.12;
      out[leg + 3] = 1.45 + (side ? 0.15 : -0.1);
      out[leg + 4] = 0.0;
    }
    setHand(out, 0, 0.14, 0.52 * h, 0.3, 1, 0.5, -0.3, -0.6);
    setHand(out, 1, -0.14, 0.52 * h, 0.31, 1, -0.5, -0.3, -0.6);
  } else if (gesture === 'lean') {
    out[POSE.ROOT_PITCH] = -0.11;
    out[POSE.ROOT_Z] = -0.06;
    out[POSE.SPINE_PITCH] = -0.04;
    const fl = FOOT_IK_BASE[0];
    const fr = FOOT_IK_BASE[1];
    out[fl + 1] = -0.03;
    out[fl + 3] = 0.3;
    out[fl + 4] = 0.15;
    out[fr + 1] = -0.11;
    out[fr + 3] = 0.24;
    setHand(out, 0, -0.12, 1.25 * h, 0.17, 1, 0.8, -0.5, -0.2);
    setHand(out, 1, 0.12, 1.22 * h, 0.14, 1, -0.8, -0.5, -0.2);
  }
}

/** Breaststroke at the surface: body flat, head up, arms sweeping, legs frog-kicking. */
export function poseSwim(out, rig, t, speed) {
  const cycle = t * (1.1 + speed * 0.4);
  const stroke = (cycle % 1);
  const pull = Math.sin(stroke * Math.PI * 2);
  clearLegsIK(out);
  out[POSE.ROOT_Y] = 0;
  out[POSE.ROOT_PITCH] = 1.2;
  out[POSE.ROOT_X] = 0;
  out[POSE.ROOT_ROLL] = 0;
  out[POSE.SPINE_PITCH] = -0.15;
  out[POSE.NECK_PITCH] = -0.85;
  out[POSE.NECK_YAW] = 0;
  const h = rig.height;
  for (let side = 0; side < 2; side += 1) {
    const s = SIDE_SIGN[side];
    const spread = 0.5 + 0.5 * pull;
    setHand(out, side, s * (0.06 + 0.32 * spread), 1.25 * h - 0.12 * spread, 0.75 - 0.35 * spread, 1, s * 0.8, 0.2, -0.4);
    const leg = LEG_BASE[side];
    const kick = Math.max(0, -pull);
    out[leg] = 0.25 + 0.5 * kick;
    out[leg + 1] = 0.15 + 0.35 * kick;
    out[leg + 3] = 0.3 + 1.1 * kick;
    out[leg + 4] = 0.8;
  }
  out[POSE.L_GRIP] = 0;
  out[POSE.R_GRIP] = 0;
}

/** Lying still after a fall, face up or face down, limbs spread a little differently for each person. */
export function poseLying(out, rig, faceUp, seed) {
  clearLegsIK(out);
  const v = (k) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5 + 0.5;
  out[POSE.ROOT_X] = 0;
  out[POSE.ROOT_Z] = 0;
  out[POSE.ROOT_Y] = -rig.hipHeight + 0.11 * rig.height;
  out[POSE.ROOT_PITCH] = faceUp ? -Math.PI / 2 : Math.PI / 2;
  out[POSE.ROOT_ROLL] = 0;
  out[POSE.ROOT_YAW] = 0;
  out[POSE.SPINE_PITCH] = faceUp ? 0.05 : -0.08;
  out[POSE.SPINE_ROLL] = (v(1) - 0.5) * 0.2;
  out[POSE.SPINE_YAW] = 0;
  out[POSE.NECK_PITCH] = faceUp ? 0.1 : -0.25;
  out[POSE.NECK_YAW] = (v(2) < 0.5 ? -1 : 1) * (0.5 + 0.5 * v(3));
  out[POSE.NECK_ROLL] = 0;
  for (let side = 0; side < 2; side += 1) {
    const a = ARM_BASE[side];
    const raise = v(4 + side) ;
    out[a] = faceUp ? 0.15 - raise * 0.3 : -0.1 + raise * 0.2;
    out[a + 1] = 0.5 + raise * 1.1;
    out[a + 2] = faceUp ? 0.4 : -0.4;
    out[a + 3] = 0.2 + v(6 + side) * 0.9;
    out[a + 4] = 0.2;
    out[HAND_IK_BASE[side]] = 0;
    const leg = LEG_BASE[side];
    const bend = v(8 + side);
    out[leg] = faceUp ? bend * 0.5 : 0.05;
    out[leg + 1] = 0.08 + v(10 + side) * 0.25;
    out[leg + 2] = SIDE_SIGN[side] * (faceUp ? 0.45 : -0.2);
    out[leg + 3] = faceUp ? bend * 0.9 : 0.15 + bend * 0.5;
    out[leg + 4] = faceUp ? 0.5 : -0.4;
  }
  out[POSE.L_GRIP] = 0;
  out[POSE.R_GRIP] = 0;
  out[POSE.AIM_HAND] = 0;
  out[POSE.SUPPORT_GRIP] = 0;
}

/**
 * Getting back up, `u` 0..1 from lying to standing. Face down: push up on the hands, bring a knee
 * under, rise. Face up: sit up, plant a hand and a foot, rise. Feet end under the pelvis.
 */
export function poseGetUp(out, rig, u, faceUp) {
  const keys = faceUp ? GET_UP_FACE_UP : GET_UP_FACE_DOWN;
  const h = rig.height;
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const t = smooth(clamp((u - a[0]) / Math.max(1e-3, b[0] - a[0]), 0, 1));
  const k = (n) => a[n] + (b[n] - a[n]) * t;
  clearLegsIK(out);
  out[POSE.ROOT_X] = 0;
  out[POSE.ROOT_Y] = -rig.hipHeight + k(1) * h;
  out[POSE.ROOT_Z] = k(2) * h;
  out[POSE.ROOT_PITCH] = k(3);
  out[POSE.ROOT_ROLL] = 0;
  out[POSE.ROOT_YAW] = 0;
  out[POSE.SPINE_PITCH] = k(4);
  out[POSE.SPINE_ROLL] = 0;
  out[POSE.SPINE_YAW] = 0;
  out[POSE.NECK_PITCH] = k(5);
  out[POSE.NECK_YAW] = 0;
  out[POSE.NECK_ROLL] = 0;
  for (let side = 0; side < 2; side += 1) {
    const s = SIDE_SIGN[side];
    const arm = ARM_BASE[side];
    const leg = LEG_BASE[side];
    const lead = side === 0 ? 0 : 0.35;
    out[arm] = k(6);
    out[arm + 1] = 0.3 + 0.1 * s;
    out[arm + 2] = 0;
    out[arm + 3] = k(7);
    out[arm + 4] = 0.3;
    out[HAND_IK_BASE[side]] = 0;
    out[leg] = k(8) + lead * k(10);
    out[leg + 1] = 0.12;
    out[leg + 2] = s * 0.1;
    out[leg + 3] = k(9) + lead * k(10) * 1.2;
    out[leg + 4] = k(11);
    // From the crouch onward the feet are planted under the body and the knees follow.
    const f = FOOT_IK_BASE[side];
    out[f] = smooth((u - 0.52) / 0.2);
    out[f + 1] = s * (rig.hipX + 0.03);
    out[f + 2] = rig.ankleHeight;
    out[f + 3] = (side === 1 ? 0.09 * (1 - u) * 2 : -0.02) * h;
    out[f + 4] = 0;
  }
  out[POSE.AIM_HAND] = 0;
  out[POSE.SUPPORT_GRIP] = 0;
}

// [u, pelvis height, pelvis forward, root pitch, spine pitch, neck pitch, arm swing, elbow, hip swing, knee, lead-leg extra, ankle]
const GET_UP_FACE_DOWN = [
  [0.0, 0.11, 0.0, 1.57, -0.08, -0.25, 2.6, 0.3, 0.05, 0.2, 0.0, -0.4],
  [0.22, 0.32, 0.02, 1.35, -0.15, -0.5, 1.45, 0.25, 0.4, 1.4, 0.0, -0.3],
  [0.45, 0.42, 0.06, 1.05, 0.15, -0.45, 1.05, 0.15, 1.35, 2.35, -0.6, 0.6],
  [0.7, 0.62, 0.02, 0.55, 0.3, -0.2, 0.5, 0.3, 1.45, 2.2, -0.5, 0.1],
  [1.0, 0.95, 0.0, 0.0, 0.0, 0.05, 0.02, 0.15, 0.0, 0.0, 0.0, 0.0],
];
const GET_UP_FACE_UP = [
  [0.0, 0.11, 0.0, -1.57, 0.05, 0.1, 0.15, 0.4, 0.2, 0.3, 0.0, 0.5],
  [0.25, 0.14, 0.05, -0.75, 0.25, 0.4, -0.5, 0.2, 1.3, 1.9, -0.6, 0.4],
  [0.5, 0.3, 0.1, -0.05, 0.6, 0.15, -0.3, 0.4, 1.9, 2.4, -0.7, 0.3],
  [0.75, 0.6, 0.04, 0.4, 0.35, -0.1, 0.4, 0.4, 1.4, 2.1, -0.4, 0.1],
  [1.0, 0.95, 0.0, 0.0, 0.0, 0.05, 0.02, 0.15, 0.0, 0.0, 0.0, 0.0],
];

/** Point one hand at a body-frame target with an elbow pole; weight 0..1. */
export function setHand(out, side, x, y, z, weight, poleX, poleY, poleZ) {
  const k = HAND_IK_BASE[side];
  out[k] = weight;
  out[k + 1] = x;
  out[k + 2] = y;
  out[k + 3] = z;
  const p = POLE_BASE[side];
  out[p] = poleX;
  out[p + 1] = poleY;
  out[p + 2] = poleZ;
}

/** Hand the legs back to their joint angles (no foot planting). */
export function clearLegsIK(out) {
  out[FOOT_IK_BASE[0]] = 0;
  out[FOOT_IK_BASE[1]] = 0;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function smooth(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function easeOut(t) {
  const x = clamp(t, 0, 1);
  return 1 - (1 - x) * (1 - x);
}
