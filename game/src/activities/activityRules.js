// How Port Sarab's side jobs pay: race purses and rival skill, taxi fares, courier pay, export prices,
// stunt jump rewards and golden falcon prizes. Pure rules; every activity calls these.

/** Purse for `place` (1..) in a race entered for `entryFee`. */
export function racePrizeForPlace(place, entryFee) {
  return Math.round((entryFee * (PURSE[place - 1] || 0)) / 50) * 50;
}

/** Reputation for `place`. */
export function raceRepForPlace(place, entryFee) {
  return place <= 3 ? Math.round(entryFee * PURSE[place - 1] / 54 + 4) : 2;
}

/** Skill of a rival in race `raceId` after the player's `wins` there. */
export function rivalSkillForRace(raceId, wins, driverSkill = 0.8) {
  const race = STREET_RACES.find((r) => r.id === raceId);
  return Math.min(1.05, driverSkill + (race ? race.edge : 0) + 0.05 * Math.min(3, wins));
}

/** Seconds a fare of `metres` allows for the quick-ride bonus. */
export function taxiBonusSeconds(metres) {
  return metres / 14 + 14;
}

/** A fare: meter by `metres`, bonus for a quick ride, tip cut by `bumps`. */
export function taxiFareForTrip(metres, seconds, bumps) {
  const meter = Math.round(20 + 0.05 * metres);
  const bonus = Math.round(Math.max(0, taxiBonusSeconds(metres) - seconds) * 1.2);
  const care = Math.max(0, 1 - 0.22 * bumps);
  const tip = Math.round(meter * 0.4 * care * care);
  return { meter, bonus, tip, total: meter + bonus + tip };
}

/** Extra for fares back to back. */
export function taxiStreakBonus(streak) {
  return streak >= 2 ? Math.min(200, 20 * (streak - 1)) : 0;
}

/** Courier pay: less up to 45% for `damage` (0..1), plus $3 a second to spare. */
export function courierPayForRun(secondsLeft, damage, basePay = 600) {
  return Math.round(basePay * (1 - 0.45 * Math.min(1, Math.max(0, damage))) + Math.max(0, secondsLeft) * 3);
}

/** Pier 9's price for a car, by street value; 0 below 45% health. */
export function exportPriceForVehicle(spec, healthFraction) {
  if (!spec || healthFraction < 0.45) return 0;
  const base = 1000 + 24 * Math.sqrt(spec.value || 0);
  return Math.round(base * Math.min(1, healthFraction) ** 1.5 / 50) * 50;
}

/** Metres a ramp of `height` must be cleared by. */
export function stuntJumpTarget(height) {
  return Math.round(18 + height * 3.5);
}

/** First landing on a ramp, by distance and air time. */
export function stuntJumpReward(metres, airSeconds) {
  return Math.round((300 + metres * 15 + airSeconds * 100) / 50) * 50;
}

/** The prize for the `found`-th falcon, or null. */
export function falconMilestoneReward(found) {
  return FALCON_MILESTONES[found] || null;
}

export const STREET_RACES = [
  { id: 'corniche', name: 'Corniche Sprint', laps: 1, entry: 200, edge: 0 },
  { id: 'spires', name: 'Spires Circuit', laps: 3, entry: 250, edge: 0.02 },
  { id: 'docks', name: 'Dockside Dash', laps: 1, entry: 250, edge: 0.02 },
  { id: 'dunes', name: 'Wadi Circuit Rally', laps: 1, entry: 300, edge: 0.04 },
  { id: 'highway', name: 'Dune Highway Run', laps: 2, entry: 400, edge: 0.06 },
];
export const FALCON_REWARD = 400;
const PURSE = [9, 3.5, 1.5];
const FALCON_MILESTONES = {
  5: { title: 'Five falcons', detail: 'Body armour', reward: 1000, rep: 40, armour: true },
  10: { title: 'Ten falcons', detail: 'A Jackal AR', reward: 2000, rep: 60, weapon: 'rifle', ammo: 120 },
  15: { title: 'Fifteen falcons', detail: 'A gift from an admirer', reward: 7500, rep: 80 },
  20: { title: 'Every golden falcon', detail: 'All twenty found', reward: 25000, rep: 300 },
};
