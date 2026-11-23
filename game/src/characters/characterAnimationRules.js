// The rules Port Sarab bodies move by: state, stride, lean, car-hit launch, get-up time, falls and
// armour. Pure functions the character files call.

/** The state other systems read, from a body summary {mode, alive, seat, grounded, speed...}. */
export function animationStateFor(s) {
  if (!s.alive) return s.mode === 'ragdoll' ? 'ragdoll' : 'dead';
  const fixed = MODE_STATE[s.mode];
  if (fixed) return fixed === 'seat' ? (s.seat === 0 ? 'driving' : 'passenger') : fixed;
  if (s.boarding) return 'enterVehicle';
  if (s.stumbling) return 'stumble';
  if (!s.grounded) return s.vy > 0.5 ? 'jump' : 'fall';
  if (s.melee) return 'melee';
  if (s.aiming) return 'aim';
  if (GESTURE_STATE[s.gesture]) return GESTURE_STATE[s.gesture];
  if (s.crouching) return 'crouch';
  return s.speed < 0.3 ? 'idle' : s.speed < 3.3 ? 'walk' : s.speed < 6 ? 'run' : 'sprint';
}

/** Metres of one stride (two steps) at a speed. */
export function strideLengthAtSpeed(speed) {
  if (speed < 2) return 0.72 + 0.37 * speed;
  if (speed < 4.6) return 1.46 + (speed - 2) * 0.6;
  return 3.02 + (speed - 4.6) * 0.4;
}

/** 0 stand, 1 walk, 2 run, 3 sprint (continuous). */
export function gaitLevelAtSpeed(speed, walk, run, sprint) {
  if (speed <= 0.1) return 0;
  if (speed <= walk) return (speed - 0.1) / (walk - 0.1);
  if (speed <= run) return 1 + (speed - walk) / (run - walk);
  return Math.min(3, 2 + (speed - run) / (sprint - run));
}

/** Cross-fade seconds into a mode. */
export function blendSecondsInto(mode) {
  return BLEND_SECONDS[mode] || 0.2;
}

/** Bank into a turn (radians, + left). */
export function leanIntoTurn(yawRate, speed) {
  return Math.max(-0.32, Math.min(0.32, yawRate * speed * 0.045));
}

/** A car hit at `speed`: share of car speed taken, lift, flip or topple, harm. */
export function ragdollLaunchFromHit(speed, out) {
  const fast = speed >= 4.5;
  out.carry = fast ? 0.82 : 0.7;
  out.lift = fast ? 1.1 + Math.min(speed, 30) * 0.17 : 0.8;
  out.swept = fast;
  out.harm = speed < 5 ? Math.max(0, (speed - 3) * 5) : Math.pow(speed - 4, 1.55) * 2.3;
  return out;
}

/** Spin of a launched body (rad/s). */
export function tumbleSpin(speed, swept) {
  return swept ? Math.min(9, 1.5 + speed * 0.42) : Math.min(5, 1.2 + speed * 0.6);
}

/** Shoves under 3 m/s only stagger. */
export function staggersOnly(speed) {
  return speed < 3;
}

/** Seconds lying before getting up. */
export function secondsUntilGetUp(roll) {
  return 2 + roll * 2;
}

/** Landing damage: none below 9.5 m/s. */
export function fallDamageFromImpact(impact) {
  return impact > 9.5 ? (impact - 9.5) * 11 : 0;
}

/** Damage armour soaks (not falls or fire). */
export function armourSoaks(armor, amount, kind) {
  return kind === 'fall' || kind === 'fire' ? 0 : Math.min(armor, amount);
}

export const CHARACTER_STATES = ['idle', 'walk', 'run', 'sprint', 'crouch', 'jump', 'fall', 'aim', 'melee', 'stumble', 'swim',
  'enterVehicle', 'driving', 'passenger', 'exitVehicle', 'ragdoll', 'getUp', 'dead', 'handsUp', 'cower', 'sit', 'talk'];
export const CHARACTER_ARCHETYPES = ['civilian', 'tourist', 'business', 'worker', 'local', 'officer', 'swat', 'gang', 'crew', 'player'];
const MODE_STATE = { ragdoll: 'ragdoll', lying: 'ragdoll', getUp: 'getUp', swim: 'swim', seated: 'seat', boarding: 'enterVehicle', unboarding: 'exitVehicle' };
const GESTURE_STATE = { handsUp: 'handsUp', cower: 'cower', sit: 'sit', talk: 'talk', phone: 'talk' };
const BLEND_SECONDS = { foot: 0.22, seated: 0.2, boarding: 0.15, unboarding: 0.12, ragdoll: 0.08, lying: 0.35, getUp: 0.25, swim: 0.35 };
