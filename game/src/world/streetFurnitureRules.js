// Rules of Port Sarab's street furniture: palm spacing and heights, which lamp a street gets, signal
// lenses, souk colours, beach rows, how props fall when hit, and the billboard brands.

/** Metres between palms: 18 on medians and the Corniche, 24 on street kerbs. */
export function palmSpacingAlongRoad(roadKind) {
  return roadKind === 'boulevard' ? 18 : 24;
}

/** A date palm's scale where it stands (t is 0..1, seeded). */
export function palmHeightVariant(setting, t) {
  const [low, high] = PALM_SCALES[setting] || PALM_SCALES.garden;
  return low + (high - low) * t;
}

/** A sidewalk's kerb lamp; null where median lamps light the road. */
export function lampStyleForDistrict(districtId, roadKind, roadName) {
  if (roadName === 'Lantern Row' || roadName === 'The Corniche') return 'lampLantern';
  if (roadKind !== 'street') return null;
  if (districtId === 'oldsarab') return 'lampLantern';
  return districtId === 'docks' ? 'lampMast' : 'lampSingle';
}

/** Linear colour of a red, yellow or green lens while its approach shows `state`. */
export function signalLensColours(lens, state) {
  return LENS_COLOURS[lens][lens === state ? 0 : 1];
}

/** A souk awning, canopy or beach-club colour (t is 0..1). */
export function marketAwningStripes(t) {
  return AWNING_TINTS[Math.floor(t * AWNING_TINTS.length) % AWNING_TINTS.length];
}

/** The glass colour of a souk lantern (t is 0..1). */
export function soukLanternGlass(t) {
  return LANTERN_TINTS[Math.floor(t * LANTERN_TINTS.length) % LANTERN_TINTS.length];
}

/** The z of parasol row `row`, 9 m apart down the beach. */
export function beachParasolRowAt(beachTopZ, row) {
  return beachTopZ - 17 - row * 9;
}

/** How a prop goes when a car hits it: 'topple', 'fly' or 'solid' (stays). */
export function propBreaksUnderImpact(kind) {
  return STREET_PROP_KINDS[kind] || 'solid';
}

export const PALM_SCALES = {
  median: [0.98, 1.14], corniche: [1.05, 1.28], kerb: [0.8, 1.0], garden: [0.72, 0.98], grove: [0.78, 1.28],
};
export const LENS_COLOURS = {
  red: [[1, 0.07, 0.04], [0.1, 0.012, 0.01]],
  yellow: [[1, 0.52, 0.02], [0.1, 0.055, 0.006]],
  green: [[0.08, 1, 0.42], [0.007, 0.075, 0.035]],
};
export const AWNING_TINTS = [0xe4572e, 0xf2a516, 0x1ba39c, 0x3d4fa8, 0xb3243a, 0x4f9a3a, 0xe0608a];
export const LANTERN_TINTS = [0xffb347, 0xff5a3c, 0x2ec4b6, 0x9b5de5, 0xffd23f, 0x3ddc84, 0xff70a6];
export const STREET_PROP_KINDS = {
  lampDouble: 'topple', lampSingle: 'topple', lampLantern: 'topple', lampLanternDouble: 'topple', nameSign: 'topple',
  parkingMeter: 'topple', benchModern: 'fly', benchRough: 'fly', binModern: 'fly', binDrum: 'fly', hydrant: 'fly',
  newsBox: 'fly', bikeRack: 'fly', parasol: 'fly', lounger: 'fly', laneGoods: 'fly', stall: 'fly',
};
export const BILLBOARD_BRANDS = [
  ['SIROCCO SODA', 'Feel the hot wind.'], ['ORYX MOTORS', 'Built for the long road.'],
  ['DUNE FM 101.1', 'Turn it up, Port Sarab.'], ['SARAB GOLD 98.6', 'Golden oldies all night.'],
  ['ZAATAR & CO.', 'Fresh flatbread since sunrise.'], ['AURUM PRIVATE VAULTS', 'Your gold. Our silence.'],
  ['MIRAGE GRAND HOTEL', 'Stay where the sky ends.'], ['SWIFT CAMEL COURIERS', 'Over the dunes, on time.'],
  ['CHROMA BAY RESPRAY', 'New colour. No questions.'], ['BRASS & BARREL', "Protect what's yours."],
  ['VISIT THE AMBER DUNES', 'Get lost. Safely.'], ['VANE SPIRE RESIDENCES', 'Live above it all.'],
  ['HADDAD MOTORS', 'Uncle Faris fixes everything.'], ['KHAMSIN SEASON', 'Lights on. Speed down. PSPD'],
  ['SAFFRON SKEWER', 'Grilled till dawn.'], ['KARAK CORNER', 'Tea that talks back.'],
];
