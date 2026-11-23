// The massing of Port Sarab's ordinary buildings: which shape each style of the city plan takes,
// in which district palette, and the pieces many styles share (stone podiums, parapets, shop
// fronts, doors and awnings). Towers live in buildingTowerShapes.js, low-rise in buildingLowRiseShapes.js.
import { raiseGlassTower, raiseSteppedTower, raiseOfficeSlab, raiseApartmentTower, raiseHotel, raiseNeonClub } from './buildingTowerShapes.js';
import { raiseSouk, raiseRiad, raiseWarehouse, raiseColdStore, raiseWorkshop, raiseVilla, raiseApartmentBlock, raiseBalconyBlock, raiseRetail, raiseMotel } from './buildingLowRiseShapes.js';
import { rectPoints } from './buildingGeometryBuilder.js';

/** Raise one ordinary building of the plan into its chunk's meshes (ctx from createCityArchitecture). */
export function raiseOrdinaryBuilding(ctx, building) {
  const raise = STYLE_BUILDERS[building.style];
  if (raise) raise(ctx, building);
  else raisePlainBlock(ctx, building);
}

/** Which function raises each style of the plan. */
const STYLE_BUILDERS = {
  glassTower: raiseGlassTower,
  steppedTower: raiseSteppedTower,
  officeSlab: raiseOfficeSlab,
  apartmentTower: raiseApartmentTower,
  hotel: raiseHotel,
  neonClub: raiseNeonClub,
  souk: raiseSouk,
  riad: raiseRiad,
  warehouse: raiseWarehouse,
  coldStore: raiseColdStore,
  workshop: raiseWorkshop,
  villa: raiseVilla,
  apartmentBlock: raiseApartmentBlock,
  balconyBlock: raiseBalconyBlock,
  retail: raiseRetail,
  motel: raiseMotel,
};

/**
 * The district palettes: every colour a building of that district may be tinted, as sRGB hex.
 * A building picks by its plan `tint` (0..1), so neighbours differ but the district reads as one.
 */
export const DISTRICT_PALETTES = {
  spiresGlass: [0x58c4bc, 0x6fd3b0, 0xd9bd7e, 0x5fa8d8, 0xb8d4e4, 0x9fdad6, 0x3fa8b4, 0x4a8ccc],
  spiresStone: [0xf3ecdc, 0xefe2c8, 0xf6f1e6, 0xe8dcc4],
  marinaWhite: [0xffffff, 0xf4fbfa, 0xe4f4f1, 0xfaf6ee, 0xd8efec],
  marinaAccent: [0x9fd8d0, 0x7cc8c2, 0xf0e2c4, 0xb8e0e8],
  oldSarab: [0xecd0a4, 0xe4b878, 0xe2ac98, 0xf0dfbc, 0xf4e8d0, 0xe8c088, 0xdeb894, 0xead4aa],
  oldDoors: [0x1ba39c, 0xe9a21a, 0x2f6fa8, 0x8a3a2a, 0x2c8a6e, 0xd0573a],
  docksSteel: [0x8a99a6, 0x4f9a9a, 0xb4603e, 0xdcd8cc, 0x3f6688, 0xa9b4bc, 0x6c8a5a, 0xc8b490],
  villaWhite: [0xfffcf4, 0xfaf0dc, 0xf6e4d8, 0xfff6e8, 0xf2ead6],
  lanternColor: [0xf07a58, 0xd8479a, 0x8a5ad0, 0xf0c050, 0x3ac0b4, 0xf59a7a, 0xb05ac8, 0xffd27a],
  wadiRender: [0xead6b2, 0xf2c09c, 0xdcb24e, 0xd8d0a0, 0xd99a72, 0xf0e0c0, 0xe8c890, 0xcfb8a0],
  southgate: [0xdcc8a0, 0x9cc4bc, 0xd49a84, 0xecd8a0, 0xc4beb2, 0xe8d4c0, 0xb8cca8, 0xd8b890],
};

/** A colour of `palette` chosen by the building's tint and variant. */
export function paletteColor(palette, building, shift = 0) {
  const list = DISTRICT_PALETTES[palette];
  const index = Math.floor(((building.tint || 0) * list.length + (building.variant || 0) * 3 + shift)) % list.length;
  return list[(index + list.length) % list.length];
}

/** Any style without a builder: a plain block, so the street never has a hole in it. */
export function raisePlainBlock(ctx, building) {
  const b = ctx.solid;
  b.use('plasterBlank', 0xe8dcc4);
  b.prism(rectPoints(building.x, building.z, building.w, building.d), 0, building.h, { top: 'roofGravel', topTint: 0xe0dacd });
}
