// The rules of Port Sarab's crowds: how many people are out, how fast they walk, when they cross,
// and how they answer gunfire, a pointed gun, a speeding car, a crime to report and the khamsin.

/** People wanted near the player: the crowd size x mission density x local busyness, thinned by sandstorm. */
export function crowdSizeForStreets(baseCount, density, busyness, sandstorm) {
  if (density <= 0) return 0;
  const t = clamp((sandstorm - 0.35) / 0.5, 0, 1);
  return Math.round(baseCount * density * clamp(busyness * 1.15, 0.06, 1) * (1 - 0.8 * t * t * (3 - 2 * t)));
}

/** Strolling speed in m/s for who someone is ('tourist' ambles, 'business' strides); roll is 0..1. */
export function walkingPaceFor(archetype, roll) {
  const pace = PACES[archetype] || PACES.civilian;
  return pace[0] + (pace[1] - pace[0]) * roll;
}

/** At a signal: cross only on red for the crossed traffic, seen turning red, with time to finish. */
export function mayCrossOnRed(light, secondsSinceRed, secondsToCross) {
  return light === 'red' && secondsSinceRed >= 0 && secondsSinceRed + secondsToCross <= RED_WINDOW;
}

/** Without a signal: seconds of clear road wanted before stepping off the kerb. */
export function trafficGapNeeded(secondsToCross) {
  return Math.min(6, secondsToCross * 0.6 + 1.2);
}

/** Gunfire or a blast: 'cower' on the spot or 'flee'; the timid and the close cower more. */
export function reactionToGunfire(courage, distance, closeRange, roll) {
  const cower = distance < closeRange ? 0.08 + 0.34 * (1 - courage) : 0.07 * (1 - courage);
  return roll < cower ? 'cower' : 'flee';
}

/** A gun pointed at someone close: 'handsUp', 'flee' (the bold half the time) or null when not at them. */
export function surrendersToAimedGun(courage, distance, offAngle, roll) {
  if (distance >= 10.5 || offAngle >= 0.34 + 0.6 / Math.max(1.5, distance)) return null;
  return courage > 0.82 && roll < 0.5 ? 'flee' : 'handsUp';
}

/** A car closing on someone: 'dive' from its path at the last moment, 'flee' early from one on the kerb, or null. */
export function divesFromVehicle(miss, halfWidth, secondsToImpact, onKerb, courage) {
  if (miss > halfWidth + 1.2 || secondsToImpact > (onKerb ? 1.6 : 1) * (0.8 + 0.4 * courage)) return null;
  if (onKerb && secondsToImpact > 0.9 && courage < 0.6) return 'flee';
  return miss <= halfWidth ? 'dive' : null;
}

/** Punched: the brave sometimes swing back. */
export function fightsBack(courage, roll) {
  return courage > 0.72 && roll < 0.6;
}

/** How readily a bystander phones the police about a crime `distance` m away (0: too terrified). */
export function witnessPhonesPolice(courage, fear, distance) {
  if (fear > 0.9 && courage < 0.8) return 0;
  return ((1.05 - fear * 0.8) * (0.5 + courage)) / (1 + distance / 15);
}

/** Walking hurry in a sandstorm: past 0.4 everyone heads for cover. */
export function shelterFromSandstorm(storm) {
  return storm > 0.4 ? 1.55 : 1;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Seconds after the light turns red for the crossed traffic by which a crossing should be done. */
const RED_WINDOW = 15.5;
/** Strolling speeds (m/s) by who someone is. */
const PACES = {
  civilian: [1.15, 1.6],
  tourist: [1.05, 1.35],
  business: [1.35, 1.7],
  worker: [1.25, 1.55],
  local: [1.1, 1.45],
};
