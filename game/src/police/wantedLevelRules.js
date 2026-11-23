// The rules of the PSPD: what each crime costs, how heat buys stars, which crimes need a witness,
// how long a search lasts, how many units come, and when officers may shoot, arrest, ram or PIT.

/** Heat a crime adds; context.severity scales it (a rammed police car counts 3.5 times). */
export function heatForCrime(crimeType, context) {
  const base = CRIME_HEAT[crimeType] !== undefined ? CRIME_HEAT[crimeType] : 5;
  return base * (context && context.severity > 0 ? context.severity : 1);
}

/** Stars (0..5) a heat total is worth. */
export function starsForHeat(heat) {
  let stars = 0;
  while (stars < 5 && heat >= STAR_THRESHOLDS[stars + 1]) stars += 1;
  return stars;
}

/** Killing an officer is never under three stars. */
export function minimumStarsForCrime(crimeType) {
  return crimeType === 'officerKilled' ? 3 : 0;
}

/** Petty crimes count only when seen; loud or grave ones always reach dispatch. */
export function crimeNeedsWitness(crimeType) {
  return !ALWAYS_REPORTED.includes(crimeType);
}

export function crimeAgainstPolice(crimeType) {
  return crimeType === 'officerAssault' || crimeType === 'officerKilled';
}

export function searchSecondsForStars(stars, secondsPerStar) {
  return stars * (secondsPerStar || 9);
}

/** Cut loose by his handler: one star more from one star up. */
export function starsAfterCutLoose(stars, cutLoose) {
  return cutLoose && stars >= 1 ? Math.min(5, stars + 1) : stars;
}

/** [cars, Enforcers among them, seconds between arrivals, spawn distance min, max]. */
export function policeUnitsForStars(stars, playerDriving) {
  return stars === 1 && playerDriving ? [2, 0, 3, 110, 180] : RESPONSE[Math.max(0, Math.min(5, stars))];
}

/** Fire: from three stars always; at two at an armed or violent man on foot; at one at a threat. */
export function officersShootAtStars(stars, s) {
  if (stars >= 3) return true;
  if (stars === 2) return s.onFoot ? s.armed || s.violent : s.violent;
  return stars === 1 && (s.violent || (s.armed && s.aiming));
}

/** Cuffs at one or two stars, on foot or in a car all but stopped. */
export function mayArrestPlayer(stars, playerSpeed, onFoot) {
  return stars >= 1 && stars <= 2 && (onFoot || playerSpeed < 2);
}

/** Calm enough to cuff: at one star not aiming, at two unarmed. */
export function suspectIsCalm(stars, s) {
  return !s.violent && (stars === 1 ? !(s.armed && s.aiming) : !s.armed);
}

export function rammingAllowed(stars) {
  return stars >= 3;
}

export function pitManoeuvreAllowed(stars, speed) {
  return stars >= 3 && speed > 10;
}

/** By stars, better for tactical officers, worse at a fast target. */
export function officerAccuracy(stars, tactical, targetSpeed) {
  const a = (ACCURACY[Math.min(5, stars)] + (tactical ? 0.1 : 0)) * (1 - Math.min(0.45, targetSpeed / 40));
  return Math.max(0.05, Math.min(0.9, a));
}

export const CRIME_HEAT = {
  carTheft: 10, carjacking: 14, policeCarTheft: 40, hitAndRun: 14, vehicleRamming: 4, assault: 8, gunfire: 10,
  murder: 30, officerAssault: 28, officerKilled: 70, propertyDamage: 2, explosion: 35, robbery: 20, trespass: 6,
};
export const STAR_THRESHOLDS = [0, 10, 32, 65, 115, 185];
const ALWAYS_REPORTED = ['gunfire', 'explosion', 'murder', 'officerAssault', 'officerKilled', 'robbery', 'policeCarTheft'];
const ACCURACY = [0, 0.24, 0.32, 0.42, 0.5, 0.58];
const RESPONSE = [[0, 0, 3, 110, 180], [1, 0, 3, 110, 180], [3, 0, 2.4, 110, 210], [4, 2, 2, 100, 200], [6, 3, 1.5, 100, 210], [7, 5, 1.2, 100, 210]];
