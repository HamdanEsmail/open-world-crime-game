// The rhythm of Port Sarab's streets through the day: how busy each kind of place is at every hour
// (the Spires full of office workers by day and empty at night, Lantern Row alive after dark, the
// beach by day, Old Sarab's market in the morning and the evening, almost nobody about at three in
// the morning), and who is out walking in each district at that hour.

/**
 * How busy a kind of place is at an hour of the day, 0..1. Keyframes every three hours are joined
 * by a smooth curve, so the crowd thins and gathers without steps.
 * @param {string} profile  a key of HOURLY_BUSYNESS (a district kind, or a site profile such as 'market')
 * @param {number} hour     0..24
 */
export function busynessAt(profile, hour) {
  const keys = HOURLY_BUSYNESS[profile] || HOURLY_BUSYNESS.flats;
  const h = ((hour % 24) + 24) % 24;
  const slot = h / 3;
  const i = Math.floor(slot) % 8;
  const t = slot - Math.floor(slot);
  const eased = t * t * (3 - 2 * t);
  return keys[i] + (keys[(i + 1) % 8] - keys[i]) * eased;
}

/**
 * How busy the streets are at a point right now: the district's own density times its hour curve.
 * @returns {number} 0..1.2
 */
export function streetBusynessAt(city, x, z, hour) {
  const district = city.districtAt(x, z);
  if (!district) return 0;
  return district.density * busynessAt(district.kind, hour);
}

/**
 * Pick who someone is from a district's `people` weights, shifted by the hour: suits go home at
 * night (except on Lantern Row), dock shifts thin out, tourists come out after dark on the strip.
 * @param {Object} district  game.city district {kind, people}
 * @param {{next:Function}} rng
 * @param {number} hour
 * @returns {string} archetype: 'civilian'|'tourist'|'business'|'worker'|'local'
 */
export function pickArchetype(district, rng, hour) {
  const people = district && district.people ? district.people : FALLBACK_PEOPLE;
  const night = hour >= 21 || hour < 5;
  let total = 0;
  for (let i = 0; i < ARCHETYPES.length; i += 1) {
    const name = ARCHETYPES[i];
    let w = people[name] || 0;
    if (night && district && district.kind !== 'strip') {
      if (name === 'business') w *= 0.3;
      if (name === 'tourist') w *= 0.6;
      if (name === 'worker' && district.kind !== 'docks') w *= 0.5;
    }
    if (night && district && district.kind === 'strip' && name === 'tourist') w *= 1.4;
    WEIGHTS[i] = w;
    total += w;
  }
  if (total <= 0) return 'civilian';
  let roll = rng.next() * total;
  for (let i = 0; i < ARCHETYPES.length; i += 1) {
    roll -= WEIGHTS[i];
    if (roll <= 0) return ARCHETYPES[i];
  }
  return 'civilian';
}

/** The busyness curve a district kind follows. */
export function profileOfDistrict(district) {
  return district && HOURLY_BUSYNESS[district.kind] ? district.kind : 'flats';
}

/**
 * Busyness at 00, 03, 06, 09, 12, 15, 18 and 21 o'clock for each kind of place.
 * District kinds come from the city plan; the rest are the profiles of standing-life sites.
 */
export const HOURLY_BUSYNESS = {
  downtown: [0.16, 0.04, 0.35, 1.0, 1.0, 0.9, 0.95, 0.4],
  marina: [0.3, 0.05, 0.25, 0.6, 0.75, 0.8, 1.0, 0.75],
  oldtown: [0.2, 0.04, 0.45, 1.0, 0.65, 0.6, 1.0, 0.7],
  docks: [0.35, 0.25, 0.85, 1.0, 0.9, 0.95, 0.65, 0.4],
  villas: [0.12, 0.03, 0.3, 0.55, 0.5, 0.5, 0.7, 0.35],
  strip: [0.95, 0.3, 0.1, 0.3, 0.45, 0.5, 0.8, 1.0],
  flats: [0.15, 0.03, 0.55, 0.75, 0.7, 0.75, 1.0, 0.5],
  southgate: [0.12, 0.03, 0.5, 0.8, 0.75, 0.75, 0.8, 0.35],
  beach: [0.08, 0.02, 0.25, 0.8, 1.0, 1.0, 0.7, 0.22],
  desert: [0.05, 0.02, 0.2, 0.3, 0.2, 0.25, 0.3, 0.1],
  sea: [0, 0, 0, 0, 0, 0, 0, 0],
  // Standing-life sites.
  market: [0.08, 0.0, 0.5, 1.0, 0.55, 0.5, 1.0, 0.75],
  office: [0.05, 0.0, 0.3, 0.9, 1.0, 0.7, 0.6, 0.15],
  hotel: [0.8, 0.25, 0.3, 0.6, 0.55, 0.6, 0.9, 1.0],
  shift: [0.45, 0.35, 0.9, 1.0, 0.85, 1.0, 0.7, 0.5],
  square: [0.25, 0.03, 0.35, 0.8, 0.75, 0.8, 1.0, 0.8],
  sunbathing: [0.0, 0.0, 0.15, 0.75, 1.0, 1.0, 0.55, 0.12],
  family: [0.05, 0.0, 0.2, 0.7, 0.6, 0.8, 1.0, 0.3],
};

const ARCHETYPES = ['civilian', 'tourist', 'business', 'worker', 'local'];
const WEIGHTS = [0, 0, 0, 0, 0];
const FALLBACK_PEOPLE = { civilian: 3, local: 2, tourist: 1, worker: 1, business: 1 };
