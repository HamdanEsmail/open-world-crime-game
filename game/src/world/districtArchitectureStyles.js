// The architecture of Port Sarab's districts: palettes, massing, tower crowns, storeys, night
// windows, Lantern Row's neon names and the landmarks. Pure rules the building files follow.

/** A district's palettes and massing. */
export function architectureForDistrict(id) { return DISTRICTS[id] || DISTRICTS.southgate; }

/** A palette colour by tint and variant. */
export function districtColor(id, role, tint = 0, variant = 0, shift = 0) {
  const list = architectureForDistrict(id)[role];
  return list[Math.floor(tint * list.length + variant * 3 + shift) % list.length];
}

/** A glass tower's massing and crown. */
export function towerCrownForVariant(variant) { return TOWER_CROWNS[variant % 8]; }

export function storeysForHeight(height, storey = STOREY) { return Math.floor(height / storey); }

/** A height snapped to storeys. */
export function snapToStoreys(y, base, storey = STOREY) { return base + Math.max(1, Math.round((y - base) / storey)) * storey; }

/** Share of windows lit at dusk (per building with a seed). */
export function windowsLitAtNight(night, seed) {
  const t = Math.min(1, Math.max(0, (night - 0.06) / 0.59));
  const dusk = t * t * (3 - 2 * t);
  return seed === undefined ? dusk : dusk * (LIT_FLOOR + LIT_SPREAD * ((seed * 7.31) % 1));
}

/** The street side: doors and signs. */
export function frontDoorSideOf(building) { return building.front || 's'; }

export function backSideOf(building) { return { n: 's', s: 'n', e: 'w', w: 'e' }[frontDoorSideOf(building)]; }

/** A Lantern Row neon name. */
export function signNameForLanternRow(index) { return LANTERN_ROW_NAMES[index % LANTERN_ROW_NAMES.length]; }

const STOREY = 3.4;
export const LIT_FLOOR = 0.14;
export const LIT_SPREAD = 0.36;
export const TOWER_CROWNS = 'taper drum wedge twin setback cone twist skyGarden'.split(' ');
export const LANTERN_ROW_NAMES = 'CLUB SIMOOM|HOTEL QAMAR|THE BRASS FALCON|NIGHTJAR LOUNGE|VELVET CARAVAN|HOTEL LUMEN|THE CORAL ROOM|SAFFRON SKY HOTEL|THE NEON DHOW|STARDUNE CLUB|HOTEL AZURA|OASIS NIGHTS|GOLDEN SCARAB|MOONWELL HOTEL|JINN & TONIC|KHAMSIN BAR|PALM & PEARL|CLUB FATA MORGANA'.split('|');
export const LANDMARK_BUILDINGS = { vaneSpire: 'Vane Spire', policeHQ: 'PSPD Headquarters', policeGarage: 'PSPD Motor Pool', hospital: 'Sarab General Hospital', soukHall: 'The Grand Souk', clockTower: 'Sundial Tower', grandHotel: 'Mirage Grand Hotel', garage: 'Haddad Motors', yachtClub: 'Crescent Yacht Club', customsHouse: 'Mina Customs House' };

const hex = (s) => s.split(' ').map((h) => parseInt(h, 16));
const DISTRICTS = {
  spires: { massing: 'glass towers', glass: hex('58c4bc 6fd3b0 d9bd7e 5fa8d8 b8d4e4 9fdad6 3fa8b4 4a8ccc'), stone: hex('f3ecdc efe2c8 f6f1e6 e8dcc4') },
  marina: { massing: 'balconies', white: hex('ffffff f4fbfa e4f4f1 faf6ee d8efec'), accent: hex('9fd8d0 7cc8c2 f0e2c4 b8e0e8') },
  oldsarab: { massing: 'plaster', plaster: hex('ecd0a4 e4b878 e2ac98 f0dfbc f4e8d0 e8c088 deb894 ead4aa'), doors: hex('1ba39c e9a21a 2f6fa8 8a3a2a 2c8a6e d0573a') },
  docks: { massing: 'sheds', steel: hex('8a99a6 4f9a9a b4603e dcd8cc 3f6688 a9b4bc 6c8a5a c8b490') },
  jasmine: { massing: 'villas', white: hex('fffcf4 faf0dc f6e4d8 fff6e8 f2ead6') },
  lantern: { massing: 'neon', color: hex('f07a58 d8479a 8a5ad0 f0c050 3ac0b4 f59a7a b05ac8 ffd27a') },
  wadi: { massing: 'flats', render: hex('ead6b2 f2c09c dcb24e d8d0a0 d99a72 f0e0c0 e8c890 cfb8a0') },
  southgate: { massing: 'sheds', paint: hex('dcc8a0 9cc4bc d49a84 ecd8a0 c4beb2 e8d4c0 b8cca8 d8b890') },
};
