// What things cost in Port Sarab's garages, paint shops, gun counters and food stands, and when a
// safehouse nap shakes off the police. Pure rules: the shops and safehouses call these.

/** Dollars to fix a car with `healthFraction` (0..1) of its health left. 0 when undamaged. */
export function repairPrice(healthFraction, vehicleValue) {
  if (healthFraction >= 0.995) return 0;
  const damage = 1 - Math.max(0, healthFraction);
  return Math.round((60 + damage * Math.max(8000, vehicleValue) * 0.06) / 10) * 10;
}

/** A new coat of paint; hotter cars pay the painter to keep quiet. */
export function resprayPrice(wantedStars) {
  return 200 + 300 * Math.max(0, wantedStars | 0);
}

/** Price of a garage upgrade `kind` at `level` (1..) for a car worth `vehicleValue`. */
export function upgradePrice(kind, vehicleValue, level = 1) {
  const upgrade = GARAGE_UPGRADES[kind];
  if (!upgrade) return 0;
  const step = upgrade.levels[Math.max(0, Math.min(upgrade.levels.length, level) - 1)];
  const price = upgrade.base * step.factor + Math.max(0, vehicleValue) * upgrade.valueShare;
  return Math.max(upgrade.minimum || 0, Math.round(price / 50) * 50);
}

/** The reputation rank an upgrade level needs. */
export function upgradeRank(kind, level = 1) {
  const upgrade = GARAGE_UPGRADES[kind];
  return upgrade ? upgrade.levels[Math.max(0, Math.min(upgrade.levels.length, level) - 1)].rank : 1;
}

/** True when a weapon is on the shelf for a player of `rank`. */
export function weaponUnlockedAtRank(weapon, rank) {
  return rank >= (weapon && weapon.rank ? weapon.rank : 1);
}

/** A meal at a food stand place. */
export function mealPrice(place) {
  return MEAL_PRICES[place && place.id] || 12;
}

/** Resting at a safehouse loses one or two stars, but never with an officer watching. */
export function safehouseRestClearsWanted(stars, seen) {
  return stars > 0 && stars <= 2 && !seen;
}

/** What Haddad Motors fits: per level a price factor, the rank it needs, and what it does. */
export const GARAGE_UPGRADES = {
  engine: {
    name: 'Engine tune', base: 2500, valueShare: 0.02,
    levels: [{ factor: 1, rank: 1, power: 1.12, topSpeed: 1.05 }, { factor: 2.4, rank: 3, power: 1.25, topSpeed: 1.1 }, { factor: 4.8, rank: 5, power: 1.38, topSpeed: 1.15 }],
  },
  tyres: { name: 'Rally tyres', base: 3000, valueShare: 0.01, levels: [{ factor: 1, rank: 2, grip: 1.12 }] },
  armor: {
    name: 'Armour plating', base: 4000, valueShare: 0.02,
    levels: [{ factor: 1, rank: 2, health: 1.3 }, { factor: 2.2, rank: 4, health: 1.6 }, { factor: 4, rank: 6, health: 2 }],
  },
  owned: { name: 'Make it mine', base: 1500, valueShare: 0.25, minimum: 1500, levels: [{ factor: 1, rank: 1 }] },
};

/** The paint cards at Chroma Bay Respray and Haddad Motors. */
export const RESPRAY_COLOURS = [
  { name: 'Sand Gold', color: 0xe9b44c },
  { name: 'Gulf Teal', color: 0x1ba39c },
  { name: 'Coral Sunset', color: 0xe4572e },
  { name: 'Night Blue', color: 0x1b2f4a },
  { name: 'Desert Cream', color: 0xfff4d6 },
  { name: 'Saffron', color: 0xf2a81d },
  { name: 'Graphite', color: 0x3b4048 },
  { name: 'Souk Violet', color: 0x6a3fa0 },
];

const MEAL_PRICES = { food_corniche: 10, food_souk: 12, food_lantern: 9, food_wadi: 8, food_southgate: 14 };
