// Body styles of Port Sarab's vehicles: each class's silhouette and fleet livery, and the rules
// for headlights, brake lights, PSPD strobes and damaged paint that the models and renderer follow.

/** Silhouette of a class: ride height, nose and tail taper, shoulder tuck, cabin width and lean, tyre width, rim colour. */
export function bodyStyleForClass(className) {
  const s = BODY_STYLES[className] || BODY_STYLES.sedan;
  return { rideHeight: s[0], noseTaper: s[1], tailTaper: s[2], shoulderTuck: s[3], cabinWidth: s[4], cabinLean: s[5], wheelWidth: s[6], rimColour: s[7] };
}

/** The fleet livery a model wears ('police'|'policeSuv'|'taxi'|'bus'|'bullion'), or null for plain paint. */
export function liveryForSpec(spec) {
  return LIVERY_BY_CLASS[spec?.className] || null;
}

/** Brightness 0..1 of one half ('red' or 'blue') of the PSPD light bar: double flashes over a glow, halves in turn. */
export function policeLightBarColour(time, side) {
  const p = (time * SIREN_RATE + (side === 'blue' ? 0.5 : 0)) % 1;
  if (p < 0.11 || (p >= 0.17 && p < 0.29)) return 1;
  return p < 0.17 ? 0.45 : 0.38;
}

/** Headlights burn when switched on, and on every driven vehicle once night falls. */
export function headlightsOnAtNight(night, controls) {
  return !!controls?.headlights || night > NIGHT_LIGHTS_ON;
}

/** Brake lights show while braking or holding the handbrake. */
export function brakeLightsOn(controls) {
  return (controls?.brake || 0) > 0.1 || !!controls?.handbrake;
}

/** How far the paint has turned to soot (0..0.72) at a health fraction (1 new, 0 dead). */
export function paintAfterDamage(healthFraction) {
  return smooth(0.25, 1, 1 - healthFraction) * 0.72;
}

/** How charred the whole vehicle is (0..1): a scorch near death, black once wrecked. */
export function charAfterDamage(healthFraction, wrecked) {
  return wrecked ? 1 : 0.3 * smooth(0.6, 1, 1 - healthFraction);
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const SIREN_RATE = 1.45;
const NIGHT_LIGHTS_ON = 0.5;
const LIVERY_BY_CLASS = { police: 'police', policeSuv: 'policeSuv', taxi: 'taxi', bus: 'bus', armored: 'bullion' };

// ride height m, nose taper, tail taper, shoulder tuck, cabin width, cabin lean, tyre width m, rim
const BODY_STYLES = {
  compact: [0.3, 0.1, 0.05, 0.05, 0.86, 0.16, 0.2, 0xd7dbe0],
  sedan: [0.3, 0.1, 0.07, 0.06, 0.84, 0.17, 0.23, 0xcfd4da],
  taxi: [0.3, 0.1, 0.07, 0.06, 0.84, 0.17, 0.23, 0xb9bec5],
  police: [0.3, 0.1, 0.07, 0.06, 0.84, 0.17, 0.24, 0x3d4248],
  sports: [0.24, 0.14, 0.07, 0.08, 0.8, 0.22, 0.26, 0x2b2e33],
  super: [0.2, 0.2, 0.05, 0.1, 0.72, 0.24, 0.28, 0x1f2125],
  classic: [0.3, 0.06, 0.04, 0.05, 0, 0, 0.22, 0xf2f4f7],
  suv: [0.46, 0.06, 0.04, 0.04, 0.9, 0.1, 0.27, 0xa9afb6],
  policeSuv: [0.46, 0.06, 0.04, 0.04, 0.9, 0.1, 0.28, 0x2f3338],
  pickup: [0.46, 0.06, 0, 0, 0.9, 0.1, 0.28, 0xbfc4ca],
  van: [0.38, 0.1, 0.02, 0.02, 0.97, 0.05, 0.24, 0xb7bcc2],
  truck: [0.6, 0.04, 0, 0, 0.98, 0.04, 0.3, 0xc4c8cd],
  bus: [0.4, 0.03, 0.02, 0.04, 0, 0, 0.3, 0xb9bec4],
  buggy: [0.32, 0.3, 0.08, 0.05, 0, 0, 0.38, 0xe9b44c],
  armored: [0.58, 0.05, 0, 0.07, 0, 0, 0.32, 0x3c4046],
};
