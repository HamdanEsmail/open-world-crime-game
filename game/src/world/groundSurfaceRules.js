// The rules of Port Sarab's ground: the paving of each district, the paint of each road, the zebra
// crossings, the colour of dune and beach sand, and how finely the terrain is cut at each distance.

/** Block floor and sidewalk paving of a district: [swatch name, tint, swatch scale] for each. */
export function pavingForDistrict(kind) {
  return DISTRICT_PAVING[kind] || DISTRICT_PAVING.southgate;
}

/** Lane paint of a city road kind: offsets from the centre line and dash lengths, metres. */
export function roadMarkingsForKind(kind) {
  return ROAD_PAINT[kind] || ROAD_PAINT.street;
}

/** Zebra bars across a road `width` metres wide: count, pitch and bar width. */
export function crosswalkStripesAcross(width) {
  const pitch = 1.5;
  return { count: Math.floor((width - 1) / pitch), pitch, bar: 0.8 };
}

/** Dune sand weights: hollow-to-slope blend, pale crests, warm glow on west (sunset) flanks. */
export function duneColourForSlope(convex, height, westFacing) {
  const lift = smooth(0, 13, height);
  return {
    slope: smooth(-0.55, 0.25, convex * 0.8 + lift * 0.3),
    crest: smooth(0.25, 0.9, convex) * lift * 0.55,
    glow: Math.min(0.45, Math.max(0, westFacing) * 2.2),
  };
}

/** How wet the beach is at a height above the sea: 1 at the waterline, dry 40 cm up. */
export function beachWetnessNearWater(heightAboveSea) {
  return 1 - smooth(0.04, 0.4, heightAboveSea);
}

/** Terrain cell size (m) for a 64 m tile: fine at shoulders and quays, coarse in open dunes and beyond. */
export function terrainCellSizeAtDistance(place) {
  if (place.outsideWorld > 300) return 64;
  if (place.outsideWorld > 0) return 32;
  if (place.quayEdge || place.roadEdge < 16) return 8;
  if (place.roadEdge < 30 || place.cityGap < 60 || place.nearLandmark) return 16;
  return place.crestError() > 0.75 ? 16 : 32;
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Paving by district kind: floor (between buildings) and walk (sidewalks). */
export const DISTRICT_PAVING = {
  downtown: { floor: ['GRANITE', 0xf6f4f0, 1], walk: ['PAVERS', 0xf6f4f2, 1] },
  marina: { floor: ['GRANITE', 0xfff6e8, 0.55], walk: ['PAVERS', 0xfff6e6, 1] },
  oldtown: { floor: ['COBBLES', 0xfff2e2, 1], walk: ['PAVERS', 0xf8dcb8, 1.2] },
  docks: { floor: ['CONCRETE', 0xdcdad6, 1], walk: ['CONCRETE', 0xe2e0dc, 0.375] },
  villas: { floor: ['PAVERS', 0xfff4e4, 1.3], walk: ['PAVERS', 0xfff0dc, 1] },
  strip: { floor: ['DARK_STONE', 0xffffff, 1], walk: ['PAVERS', 0xe8d8d4, 1] },
  flats: { floor: ['CONCRETE', 0xf4f0e8, 0.5], walk: ['CONCRETE', 0xf0ece4, 0.375] },
  southgate: { floor: ['ASPHALT_BLEACHED', 0xece6dc, 1], walk: ['CONCRETE', 0xe8e2d8, 0.375] },
};

/** City road paint: street centre dashes and bay line; boulevard dividers, edge, bus or cycle lane. */
const ROAD_PAINT = {
  street: { centre: [3, 5], bayLine: 4.75, bays: 7.5 },
  boulevard: { divider: [3.5, 3.5, 8.5], edge: 7.05, busLane: [11.1, 3.4], cycleLane: [11.5, 2.1] },
};

/** What stands on the waterfront. */
export const SHORE_STRUCTURES = ['marina promenade', 'timber piers', 'breakwaters', 'Crescent Light', 'Mina Docks quay', 'gantry cranes', 'MV Amber Star', 'container stacks', 'moored yachts'];

/** What stands in the Amber Dunes. */
export const DESERT_LANDMARKS = ['Falcon Rock', 'Port Sarab Gate', 'Dune FM mast', 'Rusted Dhow', 'Sarab Airfield', 'Hangar 2', 'Ain Zahra Oasis', 'Wadi Circuit paddock', 'Sunfield Solar Array'];
