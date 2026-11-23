// The rules behind Port Sarab's effects: when tyres smoke and mark the road, how much sand a wheel throws,
// when an engine smokes, how hard a blast shakes and flashes, and how wide a mission beacon stays far off.

/** Tyre-smoke puffs per second from a wheel sliding on asphalt (0 while it grips). */
export function tyreSmokeForSlip(skid, speed) {
  const strength = skidMarkStrength(skid, speed, 'road');
  return strength > 0 ? (4 + 18 * strength) * Math.min(1, speed / 6) : 0;
}

/** How dark a wheel's mark is, 0..1 (0: none): black rubber when it slides on asphalt, ruts when it rolls in sand. */
export function skidMarkStrength(skid, speed, surface) {
  if (surface === 'sand' || surface === 'beach') return speed > 1.2 ? 0.5 + 0.5 * Math.min(1, skid + speed / 30) : 0;
  if (surface === 'water' || skid <= SKID_START || speed <= 1.5) return 0;
  return clamp((skid - SKID_START) / 0.45, 0.2, 1);
}

/** Sand puffs per second a wheel throws on the dunes: driven wheels dig rooster tails, the others a light wake. */
export function sandPlumeForWheel(speed, skid, driven, detail = 1) {
  return Math.min((driven ? speed * 1.1 + skid * 30 : speed * 0.25) * detail, 42);
}

/** How hurt an engine looks, 0..1, or -1 when it does not smoke (below 35% health, or flagged smoking). */
export function engineSmokeForDamage(healthFraction, smoking) {
  if (healthFraction < SMOKE_HEALTH) return clamp((SMOKE_HEALTH - healthFraction) / SMOKE_HEALTH, 0, 1);
  return smoking ? 0.5 : -1;
}

/** Camera shake, 0..1, for a blast of `radius` metres seen from `distance` metres (none past 12 radii). */
export function explosionShakeAtDistance(distance, radius) {
  const near = blastCloseness(distance, radius);
  return near > 0 ? Math.min(1, 0.25 + near * 0.9) : 0;
}

/** Strength of the warm white screen flash for the same blast. */
export function explosionFlashAtDistance(distance, radius) {
  const near = blastCloseness(distance, radius);
  return near > 0 ? 0.2 + near * 0.6 : 0;
}

/**
 * A beacon column's radius in metres: sized to its goal up close, never under about 8 pixels across far
 * away. `pixelScale` is metres per pixel per metre of distance.
 */
export function beaconWidthAtDistance(distance, radius, pixelScale) {
  return Math.max(clamp(radius * 0.3, 0.7, 2), distance * pixelScale * 4);
}

/** What game.effects.spawn(kind, ...) can make. */
export const EFFECT_KINDS = Object.freeze({
  dust: 'grey road dust',
  sand: 'golden sand plume, rooster tails',
  smoke: 'grey engine smoke',
  blackSmoke: 'burning-fuel smoke',
  fire: 'flames, glow and embers',
  sparks: 'streaking sparks',
  impact: 'bullet hit puff and chips',
  debris: 'thrown wreckage',
  glass: 'bursting window glass',
  splash: 'water splash and ring',
  muzzle: 'gun muzzle flash',
  tyreSmoke: 'white tyre smoke',
  blood: 'small dark hit puff',
  leaves: 'falling palm fronds',
  glowPool: 'firelight on the ground',
});

function blastCloseness(distance, radius) {
  return Math.max(0, 1 - distance / (Math.max(1, radius) * BLAST_REACH));
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

const SKID_START = 0.3;
const SMOKE_HEALTH = 0.35;
const BLAST_REACH = 12;
