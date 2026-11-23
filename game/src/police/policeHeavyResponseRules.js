// The rules of the PSPD heavy response: when Shaheen-1, its door gunner, roadblocks and spike strips
// join a chase, how high and wide the helicopter flies, and the words dispatch uses on the radio.

export function helicopterJoinsAtStars(stars) {
  return stars >= 3;
}

export function doorGunnerFiresAtStars(stars) {
  return stars >= 5;
}

export function roadblocksAtStars(stars) {
  return stars >= 3;
}

export function spikeStripsAtStars(stars) {
  return stars >= 4;
}

export function officersAtRoadblock(stars) {
  return stars >= 4 ? 3 : 2;
}

/** The height that keeps the helicopter clear of a roof. */
export function helicopterAltitudeOverRoof(roofHeight) {
  return roofHeight + ROOF_CLEARANCE;
}

/** 0 circles a slow suspect, 1 flanks a fast car from ahead. */
export function helicopterFlankShare(targetSpeed) {
  const t = Math.min(1, Math.max(0, (targetSpeed - 8) / 14));
  return t * t * (3 - 2 * t);
}

/** The searchlight aims a tenth of a second ahead of the suspect (one axis). */
export function searchlightLeadsTarget(position, velocity) {
  return position + velocity * 0.1;
}

/** Seconds until the next roadblock, given a random 0..1. */
export function secondsToNextRoadblock(random) {
  return 20 + random * 15;
}

export function roadblockGapSide(random) {
  return random < 0.5 ? 'right' : 'left';
}

/** The nearest colour word for a paint colour (0xRRGGBB). */
export function colourWordForPaint(hex) {
  let best = 'white';
  let bestDistance = Infinity;
  for (let i = 0; i < COLOUR_WORDS.length; i += 2) {
    const c = COLOUR_WORDS[i + 1];
    const mean = (((hex >> 16) & 255) + ((c >> 16) & 255)) / 2;
    const r = ((hex >> 16) & 255) - ((c >> 16) & 255);
    const g = ((hex >> 8) & 255) - ((c >> 8) & 255);
    const b = (hex & 255) - (c & 255);
    const d = (2 + mean / 256) * r * r + 4 * g * g + (2 + (255 - mean) / 256) * b * b;
    if (d < bestDistance) {
      bestDistance = d;
      best = COLOUR_WORDS[i];
    }
  }
  return best;
}

/** 'north', 'north-east' ... for a bearing (0 north, growing toward the east). */
export function compassWordForBearing(bearing) {
  return COMPASS[((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8];
}

export const ROOF_CLEARANCE = 20;
export const ROADBLOCK_NEAREST = 250;
export const ROADBLOCK_FARTHEST = 400;
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const COLOUR_WORDS = [
  'white', 0xf2f2f2, 'silver', 0xb9bdc3, 'grey', 0x6e7279, 'black', 0x1c1e22, 'red', 0xc4262a,
  'coral', 0xe4572e, 'orange', 0xf08a24, 'gold', 0xd6a732, 'yellow', 0xf1d33b, 'green', 0x2f8a3f,
  'lime', 0x9ccc3a, 'teal', 0x1ba39c, 'blue', 0x2f6bd8, 'navy', 0x1b2a4e, 'purple', 0x6c3fa0,
  'maroon', 0x6d1f2b, 'brown', 0x7a5232, 'sand-coloured', 0xd8c39a, 'pink', 0xe98aa8,
];
