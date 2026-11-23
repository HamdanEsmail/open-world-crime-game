// How the people of Port Sarab walk, run and sprint. The stride advances with the distance actually
// travelled and each foot is placed on the ground by IK, so a planted foot never slides: heel strike,
// roll, toe-off, a swing that kicks back and paws forward. The pelvis rides the legs like a pendulum,
// arms counter-swing, the torso leans into speed and banks into turns, and standing people breathe,
// shift their weight and look around. Also jumps, falls, landings, crouching, strafing and backpedalling.
import { POSE, SIDE_SIGN, ARM_BASE, LEG_BASE, FOOT_IK_BASE, HAND_IK_BASE } from './characterRig.js';
import { strideLengthAtSpeed, gaitLevelAtSpeed, leanIntoTurn } from './characterAnimationRules.js';

/** Per-person gait memory (phase, smoothed speed and lean, idle timers). */
export function createGaitState(seed = Math.random()) {
  return {
    phase: seed, stride: 0, speed: 0, prevSpeed: 0, accel: 0, level: 0,
    dirX: 0, dirZ: 1, bank: 0, crouch: 0, air: 0, airTime: 0, landing: 0, landingTime: 1,
    exertion: 0, breath: seed * 6, lookYaw: 0, lookPitch: 0, lookTargetYaw: 0, lookTargetPitch: 0,
    lookTimer: 1 + seed * 3, shift: 0, shiftTarget: 0, shiftTimer: 2 + seed * 4, windup: 0,
    footstepSide: -1,
  };
}

/**
 * Write a complete locomotion pose into `out`.
 * `m` carries the motion: {vx, vz, vy, heading, yawRate, grounded, crouch, turnLead, walkSpeed, runSpeed,
 * sprintSpeed, windup (0..1 jump anticipation)}. Returns the side (0/1) of a foot that just struck the
 * ground this frame, or -1.
 */
export function poseLocomotion(out, g, rig, m, dt) {
  const h = rig.height;
  const sinH = Math.sin(m.heading);
  const cosH = Math.cos(m.heading);
  const forward = m.vx * sinH + m.vz * cosH;
  const lateral = m.vx * cosH - m.vz * sinH;
  const speed = Math.sqrt(forward * forward + lateral * lateral);
  const safeDt = Math.max(dt, 1e-4);

  g.accel = damp(g.accel, clamp((speed - g.prevSpeed) / safeDt, -14, 14), 5, dt);
  g.prevSpeed = speed;
  g.speed = damp(g.speed, speed, 12, dt);
  if (speed > 0.25) {
    g.dirX = damp(g.dirX, lateral / speed, 10, dt);
    g.dirZ = damp(g.dirZ, forward / speed, 10, dt);
  } else {
    g.dirX = damp(g.dirX, 0, 2, dt);
    g.dirZ = damp(g.dirZ, 1, 2, dt);
  }
  const dirLength = Math.max(1e-3, Math.sqrt(g.dirX * g.dirX + g.dirZ * g.dirZ));
  const dirX = g.dirX / dirLength;
  const dirZ = g.dirZ / dirLength;
  const facingForward = Math.max(0, dirZ);

  const level = gaitLevelAtSpeed(speed, m.walkSpeed, m.runSpeed, m.sprintSpeed);
  g.level = damp(g.level, level, level > g.level ? 7 : 4, dt);
  const L = g.level;
  g.crouch = damp(g.crouch, m.crouch ? 1 : 0, 8, dt);
  g.exertion = clamp(g.exertion + (L > 2.2 ? 0.12 : L > 1.6 ? 0.03 : -0.06) * dt, 0, 1);

  // Stride: cycle length grows with speed; planted feet sweep exactly the distance travelled.
  const cycle = strideLengthAtSpeed(speed) * h * (1 - 0.3 * g.crouch);
  const turning = Math.abs(m.yawRate);
  const shuffle = speed < 0.35 && turning > 0.7 && m.grounded;
  const moving = speed > 0.12 || shuffle;
  g.stride = damp(g.stride, moving ? 1 : 0, moving ? 6 : 4.5, dt);
  let advance = (speed * dt) / cycle;
  if (shuffle) advance = Math.max(advance, 1.7 * dt);
  if (!moving && g.stride > 0.04) advance = Math.max(advance, 1.5 * dt * g.stride);
  const previousPhase = g.phase;
  g.phase = (g.phase + advance) % 1;

  // Duty factor: walkers always have a foot down; runners touch only as long as a leg can reach.
  let beta = table(DUTY, L);
  if (L > 1.2) beta = Math.min(beta, (0.84 * h) / cycle);
  beta = Math.max(beta, L < 1.2 ? 0.56 : 0.18);
  const sweep = shuffle ? 0.03 * h : beta * cycle * g.stride;
  const center = -0.03 * h * g.stride;
  const lift = table(STEP_LIFT, L) * h * g.stride * (shuffle ? 0.6 : 1) + 0.04 * g.crouch * g.stride;
  const peak = table(LIFT_PEAK, L);
  const toeOff = table(TOE_OFF, L) * facingForward * g.stride;
  const heelStrike = table(HEEL_STRIKE, L) * facingForward * g.stride;
  const spread = table(FOOT_SPREAD, L) * h + 0.05 * g.crouch;

  // Idle weight shifts and glances, kept ticking so they blend in as the person slows.
  updateIdleLife(g, dt);
  const idle = 1 - clamp(L, 0, 1);
  const shift = g.shift * idle;

  // Feet.
  let strike = -1;
  let rootCap = 9;
  let stanceDip = 0;
  let inStance = 0;
  for (let side = 0; side < 2; side += 1) {
    const s = SIDE_SIGN[side];
    const offset = side === 0 ? 0 : 0.5;
    const c = (g.phase + offset) % 1;
    const cPrev = (previousPhase + offset) % 1;
    if (moving && c < cPrev + 1e-6 && advance > 0) strike = side;
    const f = FOOT_IK_BASE[side];
    let along;
    let y = rig.ankleHeight;
    let pitch;
    let stance = false;
    if (c < beta) {
      stance = true;
      inStance += 1;
      const u = c / beta;
      along = center + sweep * (0.5 - u);
      pitch = toeOff * smoothstep(0.55, 1, u) + heelStrike * (1 - smoothstep(0, 0.2, u));
      stanceDip = Math.max(stanceDip, Math.sin(Math.PI * u));
    } else {
      const v = (c - beta) / (1 - beta);
      const tangent = -(1 - beta) * cycle * g.stride * 0.8;
      along = hermite(center - sweep * 0.5, center + sweep * 0.5, tangent, tangent, v);
      pitch = toeOff + (heelStrike - toeOff) * smoothstep(0.08, 0.85, v);
      y += lift * Math.sin(Math.PI * Math.pow(v, peak));
    }
    const raise = Math.max(0, pitch);
    y += rig.toeReach * Math.sin(raise);
    along += rig.toeReach * (1 - Math.cos(raise)) * facingForward;
    // Idle stance: feet a little apart, one a touch ahead; the relaxed leg eases forward.
    const idleZ = (side === 0 ? 0.035 : -0.02) * h + (shift * s < 0 ? 0.03 * Math.abs(shift) : 0);
    const footX = s * (rig.hipX + spread) + dirX * along;
    const footZ = dirZ * along + idleZ * idle;
    out[f] = 1;
    out[f + 1] = footX;
    out[f + 2] = y;
    out[f + 3] = footZ;
    out[f + 4] = pitch;
    // How high may the pelvis ride before this leg runs out of reach?
    const dx = footX - s * rig.hipX;
    const reach = rig.legLength * (stance ? 0.985 : 1.02);
    const horizontal = Math.min(reach * 0.98, Math.sqrt(dx * dx + footZ * footZ));
    const cap = y + Math.sqrt(reach * reach - horizontal * horizontal) - rig.hipY - rig.hipHeight;
    rootCap = Math.min(rootCap, cap);
    const g0 = LEG_BASE[side];
    out[g0 + 2] = s * (0.07 + 0.08 * idle);
  }

  // Pelvis height: base crouch for the gait, running compression and flight, capped by leg reach.
  let rootY = table(HIP_BASE, L) * h - 0.3 * h * g.crouch;
  const compress = table(COMPRESS, L) * h;
  if (L > 1.4) {
    if (inStance > 0) rootY -= compress * stanceDip;
    else {
      const flight = flightProgress(g.phase, beta);
      rootY += table(FLIGHT_LIFT, L) * h * Math.sin(Math.PI * flight);
    }
  }
  rootY -= 0.012 * Math.abs(shift);
  rootY = softMin(rootY, rootCap, 0.018);

  const swingPhase = Math.PI * 2 * g.phase;
  const pelvisYaw = table(PELVIS_YAW, L) * g.stride;
  const chestYaw = table(CHEST_YAW, L) * g.stride;
  const hipDrop = table(HIP_DROP, L) * g.stride;
  const sway = table(SWAY, L) * h * g.stride;
  out[POSE.ROOT_X] = sway * Math.sin(swingPhase) + shift * 0.035 * h;
  out[POSE.ROOT_Y] = rootY;
  out[POSE.ROOT_Z] = 0;
  out[POSE.ROOT_YAW] = -pelvisYaw * Math.cos(swingPhase) * facingForward + 0.3 * Math.atan2(dirX, Math.abs(dirZ) + 0.2) * g.stride;
  g.bank = damp(g.bank, leanIntoTurn(m.yawRate, speed), 6, dt);
  out[POSE.ROOT_ROLL] = -hipDrop * Math.sin(swingPhase) - shift * 0.05 + g.bank;
  const leanAccel = clamp(g.accel * 0.03, -0.22, 0.26);
  out[POSE.ROOT_PITCH] = table(ROOT_LEAN, L) + leanAccel * 0.6 + 0.32 * g.crouch;

  g.breath += dt * (1.6 + 2.8 * g.exertion);
  const breath = Math.sin(g.breath) * (0.012 + 0.035 * g.exertion);
  out[POSE.SPINE_PITCH] = table(SPINE_LEAN, L) + leanAccel * 0.4 - breath + 0.18 * g.crouch;
  out[POSE.SPINE_YAW] = (pelvisYaw + chestYaw) * Math.cos(swingPhase) * facingForward - out[POSE.ROOT_YAW] * 0.6;
  out[POSE.SPINE_ROLL] = -out[POSE.ROOT_ROLL] * 0.55 + shift * 0.035;

  const chestNetYaw = out[POSE.ROOT_YAW] + out[POSE.SPINE_YAW];
  out[POSE.NECK_YAW] = -chestNetYaw * 0.8 + clamp(m.turnLead * 0.55, -0.6, 0.6) + g.lookYaw * idle;
  out[POSE.NECK_PITCH] = -(out[POSE.ROOT_PITCH] + out[POSE.SPINE_PITCH]) * 0.75 + breath * 0.6 + g.lookPitch * idle + 0.05;
  out[POSE.NECK_ROLL] = -(out[POSE.ROOT_ROLL] + out[POSE.SPINE_ROLL]) * 0.7;

  // Arms counter-swing the legs, carried higher and bent harder as the pace rises.
  const armAmp = table(ARM_AMP, L) * g.stride * (0.4 + 0.6 * facingForward);
  const armOffset = table(ARM_OFFSET, L);
  const elbow = table(ELBOW, L);
  const elbowAmp = table(ELBOW_AMP, L);
  const lag = 0.035;
  const armPhase = Math.cos(Math.PI * 2 * (g.phase - lag));
  for (let side = 0; side < 2; side += 1) {
    const a = ARM_BASE[side];
    const s = SIDE_SIGN[side];
    const swing = (side === 0 ? -armAmp : armAmp) * armPhase;
    out[a] = armOffset + swing + breath * 0.3 + 0.25 * g.crouch;
    out[a + 1] = table(ARM_ABD, L) + breath * 0.25 + 0.1 * g.crouch + Math.abs(shift) * 0.03 * (s * shift < 0 ? 1 : 0);
    out[a + 2] = table(ARM_TWIST, L);
    out[a + 3] = elbow + elbowAmp * Math.max(0, swing / Math.max(0.01, armAmp)) + 0.35 * g.crouch;
    out[a + 4] = 0.08;
    out[HAND_IK_BASE[side]] = 0;
  }
  out[POSE.L_GRIP] = L > 1.5 ? 1 : 0;
  out[POSE.R_GRIP] = L > 1.5 ? 1 : 0;

  // In the air: tuck on the way up, reach for the ground on the way down, windmill a long fall.
  updateAir(out, g, rig, m, dt);
  return strike;
}

/** Jump, fall and landing layered over the gait. */
function updateAir(out, g, rig, m, dt) {
  const airborne = !m.grounded;
  if (airborne) g.airTime += dt;
  else {
    if (g.air > 0.5 && g.airTime > 0.12) {
      g.landing = clamp(Math.abs(m.landingSpeed || 4) / 7, 0.25, 1);
      g.landingTime = 0;
    }
    g.airTime = 0;
  }
  g.air = damp(g.air, airborne ? 1 : 0, airborne ? 12 : 18, dt);
  g.landingTime += dt;
  const absorb = g.landing * Math.exp(-g.landingTime * 9) * Math.sin(Math.min(1, g.landingTime * 9) * Math.PI * 0.5 + 0.6);
  const windup = m.windup || 0;
  out[POSE.ROOT_Y] -= absorb * 0.22 * rig.height + windup * 0.1 * rig.height;
  out[POSE.SPINE_PITCH] += absorb * 0.3 + windup * 0.22;
  out[POSE.ROOT_PITCH] += absorb * 0.12 + windup * 0.1;
  for (let side = 0; side < 2; side += 1) {
    const a = ARM_BASE[side];
    out[a] += absorb * 0.35 - windup * 0.5;
    out[a + 3] += absorb * 0.3;
  }
  const w = g.air;
  if (w < 0.01) return;
  const rising = m.vy > 0.5;
  const falling = clamp((g.airTime - 0.45) / 0.5, 0, 1);
  const flail = falling * Math.sin(g.airTime * 11);
  for (let side = 0; side < 2; side += 1) {
    const s = SIDE_SIGN[side];
    const leg = LEG_BASE[side];
    const f = FOOT_IK_BASE[side];
    const lead = side === 0 ? 1 : 0.45;
    const hip = rising ? 0.75 * lead : 0.35 + 0.25 * lead - 0.2 * falling;
    const knee = rising ? 1.25 * lead + 0.2 : 0.55 + 0.25 * lead - 0.2 * falling + 0.35 * flail * s;
    out[f] *= 1 - w;
    out[leg] += (hip + flail * 0.4 * s - out[leg]) * w;
    out[leg + 1] += (0.08 + 0.12 * falling - out[leg + 1]) * w;
    out[leg + 3] += (knee - out[leg + 3]) * w;
    out[leg + 4] += (0.35 - out[leg + 4]) * w;
    const a = ARM_BASE[side];
    const windmill = Math.sin(g.airTime * 8.5 + side * Math.PI);
    const swing = rising ? 0.55 - 0.25 * lead : 0.3 + 0.9 * windmill * falling;
    out[a] += (swing - out[a]) * w;
    out[a + 1] += (0.45 + 0.85 * falling + 0.2 * Math.cos(g.airTime * 8.5 + side) * falling - out[a + 1]) * w;
    out[a + 2] += (-0.6 * falling - out[a + 2]) * w;
    out[a + 3] += (0.7 + 0.35 * falling - out[a + 3]) * w;
  }
  out[POSE.ROOT_Y] += (-0.05 * rig.height - out[POSE.ROOT_Y]) * w;
  out[POSE.SPINE_PITCH] += ((rising ? 0.12 : -0.05) - out[POSE.SPINE_PITCH]) * w;
  out[POSE.NECK_PITCH] += ((rising ? -0.1 : 0.12) - out[POSE.NECK_PITCH]) * w;
}

/** Shift weight between the legs and glance about now and then. */
function updateIdleLife(g, dt) {
  g.shiftTimer -= dt;
  if (g.shiftTimer <= 0) {
    g.shiftTimer = 3 + Math.random() * 5;
    g.shiftTarget = Math.random() < 0.25 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4);
  }
  g.shift = damp(g.shift, g.shiftTarget, 1.6, dt);
  g.lookTimer -= dt;
  if (g.lookTimer <= 0) {
    g.lookTimer = 1.5 + Math.random() * 4;
    const glance = Math.random();
    g.lookTargetYaw = glance < 0.45 ? 0 : (Math.random() - 0.5) * 1.7;
    g.lookTargetPitch = (Math.random() - 0.6) * 0.25;
  }
  g.lookYaw = damp(g.lookYaw, g.lookTargetYaw, 4.5, dt);
  g.lookPitch = damp(g.lookPitch, g.lookTargetPitch, 3, dt);
}

/** 0..1 through the flight between two running steps. */
function flightProgress(phase, beta) {
  const c = phase % 0.5;
  const start = beta;
  const span = Math.max(0.01, 0.5 - beta);
  return clamp((c - start) / span, 0, 1);
}

/** Interpolate a 4-column table (standing, walk, run, sprint) at a level 0..3. */
function table(row, level) {
  const l = clamp(level, 0, 3);
  const i = Math.min(2, Math.floor(l));
  const t = l - i;
  return row[i] + (row[i + 1] - row[i]) * t;
}

function hermite(p0, p1, m0, m1, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}

function softMin(a, b, k) {
  const m = Math.min(a, b);
  return m - k * Math.log(Math.exp((m - a) / k) + Math.exp((m - b) / k));
}

function damp(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

//                        stand   walk    run     sprint
const DUTY =            [0.62,   0.6,    0.31,   0.24];
const STEP_LIFT =       [0.05,   0.1,    0.3,    0.42];
const LIFT_PEAK =       [1.0,    0.78,   0.62,   0.58];
const TOE_OFF =         [0.0,    0.55,   0.85,   0.95];
const HEEL_STRIKE =     [0.0,    -0.32,  -0.12,  0.05];
const FOOT_SPREAD =     [0.028,  0.004,  -0.014, -0.02];
const HIP_BASE =        [-0.008, -0.022, -0.06,  -0.085];
const COMPRESS =        [0.0,    0.0,    0.045,  0.055];
const FLIGHT_LIFT =     [0.0,    0.0,    0.035,  0.05];
const ROOT_LEAN =       [0.0,    0.06,   0.15,   0.25];
const SPINE_LEAN =      [0.02,   0.06,   0.12,   0.17];
const PELVIS_YAW =      [0.0,    0.1,    0.13,   0.16];
const CHEST_YAW =       [0.0,    0.08,   0.14,   0.18];
const HIP_DROP =        [0.0,    0.06,   0.04,   0.03];
const SWAY =            [0.0,    0.024,  0.01,   0.006];
const ARM_AMP =         [0.03,   0.4,    0.78,   1.02];
const ARM_OFFSET =      [0.02,   0.05,   0.2,    0.24];
const ELBOW =           [0.14,   0.24,   1.4,    1.55];
const ELBOW_AMP =       [0.0,    0.22,   0.22,   0.3];
const ARM_ABD =         [0.13,   0.13,   0.2,    0.16];
const ARM_TWIST =       [-0.12,  -0.15,  -0.38,  -0.3];
