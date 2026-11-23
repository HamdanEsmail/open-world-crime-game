// The rules of a Port Sarab gunfight in one place: damage over range, headshots, spread, aim assist,
// fists and the bat, blasts, how well the AI shoots and when it hides, falls back or runs.

/** Damage a bullet (or pellet) still carries after `distance` metres. */
export function damageAtRange(weapon, distance) {
  if (distance <= weapon.falloffStart || weapon.range <= weapon.falloffStart) return weapon.damage;
  const t = Math.min(1, (distance - weapon.falloffStart) / (weapon.range - weapon.falloffStart));
  return weapon.damage * (1 - t * (1 - weapon.falloffEnd));
}

/** x2 for a hit above 1.5 m on a standing 1.78 m person (scaled). */
export function headshotMultiplier(hitHeight, bodyHeight) {
  return hitHeight > bodyHeight * HEAD_SHARE ? 2 : 1;
}

/** The cone (rad) a round strays in: hip fire, a poor shot, running, sustained fire. */
export function shotSpread(weapon, bloom, runShare, hipFire, crouched, accuracy) {
  let spread = weapon.spread * (hipFire ? 1.8 : 1) * (1 + (1 - accuracy) * 3) + weapon.moveSpread * runShare;
  if (crouched) spread *= 0.75;
  return spread + bloom;
}

/** Extra spread from a car window, more at speed. */
export function driveBySpread(speed) {
  return 0.02 + Math.min(1, Math.abs(speed) / 40) * 0.03;
}

/** The spread sustained fire has built after one more shot. */
export function bloomAfterShot(weapon, bloom) {
  return Math.min(weapon.maxBloom, bloom + weapon.bloomPerShot);
}

/** Aim-assist cone half-angle (rad) at `distance`: wider up close. */
export function aimAssistCone(distance, baseCone) {
  return Math.max(baseCone, Math.atan(1.1 / distance));
}

/** Share of the way a shot `angleOff` rad off a target bends to it: a nudge, not a snap. */
export function aimAssistBend(angleOff, weapon) {
  return angleOff <= weapon.assist ? 1 : weapon.assist / angleOff;
}

/** A blow: 'jab', 'cross', 'kick' (the chain; the kick floors) or 'bat' (always floors). */
export function meleeBlow(move) {
  return BLOWS[move] || BLOWS.jab;
}

/** 0..1 strength of a blast `distance` m from its centre: full in the inner third. */
export function blastStrength(distance, radius) {
  const u = Math.min(1, Math.max(0, (distance / radius - 0.3) / 0.7));
  return 1 - u * u * (3 - 2 * u);
}

/** A blast's damage to a person: less with distance, little behind a wall. */
export function blastDamageAtDistance(damage, distance, radius, covered) {
  return damage * blastStrength(distance, radius) * (covered ? 0.15 : 1);
}

/** Chance an AI round hits: aim, range, a fast, driving or crouched target, moving, burst. */
export function aiHitChance(accuracy, distance, weapon, targetSpeed, driving, crouched, moving, burstShots) {
  let p = (0.08 + 0.55 * accuracy) * Math.min(1, Math.max(0.12, 1 - (distance - 8) / (weapon.range * 0.9)));
  if (targetSpeed > 5.5) p *= 0.55;
  else if (targetSpeed > 2.5) p *= 0.75;
  if (driving) p *= 0.75;
  if (crouched) p *= 0.8;
  if (moving) p *= 0.7;
  if (weapon.automatic) p *= Math.max(0.6, 1 - burstShots * 0.06);
  if (weapon.id === 'marksman') p *= 1.15;
  return Math.min(0.92, p);
}

/** Seconds an AI waits after first seeing its target. */
export function aiReactionSeconds(accuracy) {
  return 0.22 + (1 - accuracy) * 0.55;
}

/** Seek cover: by style, badly hurt, or a guard under fire. */
export function enemyTakesCover(style, healthShare, underFire) {
  return style === 'cover' || isBadlyHurt(healthShare) || (underFire && style === 'guard');
}

/** Under about a third of their health a fighter falls back. */
export function isBadlyHurt(healthShare) {
  return healthShare < 0.35;
}

/** Nerve a hit costs. */
export function nerveLost(loss, maxHealth) {
  return (loss / (maxHealth || 100)) * 0.9;
}

/** Nerve under a fifth: the fighter runs (bravery 0 never does). */
export function nerveBreaks(morale, bravery) {
  return bravery > 0 && morale < 0.2;
}

/** [near, far] metres an AI keeps from its target with a weapon (null: fists). */
export function fightingDistance(weapon) {
  return FIGHTING_DISTANCE[weapon ? weapon.id : 'fists'] || FIGHTING_DISTANCE.pistol;
}

const HEAD_SHARE = 1.5 / 1.78;
const blow = (damage, reach, combo, knockDown) => ({ damage, reach, combo, knockDown });
const BLOWS = { jab: blow(9, 1.3, 1, false), cross: blow(9, 1.3, 2, false), kick: blow(13.5, 1.45, 3, true), bat: blow(26, 2, 1, true) };
const FIGHTING_DISTANCE = { fists: [0, 1], bat: [0, 1.5], pistol: [7, 20], smg: [5, 15], shotgun: [2.5, 8], rifle: [12, 32], marksman: [26, 60] };
