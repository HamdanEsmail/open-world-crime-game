// The arsenal of Port Sarab: a cedar bat and five guns with invented names, what each one does, what
// it costs at Brass & Barrel and the reputation rank that puts it on the shelf. Every number the
// shooting, the melee, the shops and the gunfight AI use is in this file.

/**
 * @typedef {Object} WeaponSpec
 * @property {string} id            'bat'|'pistol'|'smg'|'shotgun'|'rifle'|'marksman'
 * @property {string} name          the name on the HUD and in the shop
 * @property {'bat'|'pistol'|'smg'|'shotgun'|'rifle'} model   the mesh held in the hand
 * @property {boolean} melee        swung, not fired
 * @property {number} damage        hit points per bullet (per pellet for the shotgun), or per swing
 * @property {number} fireRate      shots (or swings) per second
 * @property {number} clipSize      rounds in a full magazine (0 for the bat)
 * @property {number} reloadSeconds
 * @property {number} range         metres a bullet carries (reach for the bat)
 * @property {number} spread        radians: the cone of a carefully aimed first shot
 * @property {number} pellets       projectiles per shot
 * @property {boolean} automatic    keeps firing while the trigger is held
 * @property {number} vehicleDamage multiplier from damage to a vehicle's hit points
 * @property {number} price         dollars for the weapon
 * @property {number} ammoPrice     dollars for one box of `ammoBox` rounds
 * @property {number} ammoBox       rounds in a box of ammunition
 * @property {number} rank          reputation rank that unlocks it in shops
 * @property {boolean} oneHanded    can be fired from the driver's seat
 * @property {number} recoil        radians the camera kicks up per shot
 * @property {number} shake         camera shake per shot, 0..1
 * @property {number} bloomPerShot  radians of spread added by each shot of sustained fire
 * @property {number} maxBloom      radians: the most sustained fire can add
 * @property {number} bloomRecovery radians per second the spread settles back
 * @property {number} moveSpread    radians added when firing at a sprint
 * @property {number} falloffStart  metres before the damage starts to drop
 * @property {number} falloffEnd    share of the damage left at full range
 * @property {number} startAmmo     rounds that come with the weapon (found or bought)
 * @property {number} assist        radians the aim assist may bend a shot of this weapon
 * @property {string} description   one line for the shop
 */

/** @type {WeaponSpec[]} */
export const WEAPON_CATALOG = [
  {
    id: 'bat', name: 'Cedar Slugger', model: 'bat', melee: true,
    damage: 26, fireRate: 1.6, clipSize: 0, reloadSeconds: 0, range: 2.0, spread: 0, pellets: 1, automatic: false,
    vehicleDamage: 0.7, price: 150, ammoPrice: 0, ammoBox: 0, rank: 1, oneHanded: false,
    recoil: 0, shake: 0.2, bloomPerShot: 0, maxBloom: 0, bloomRecovery: 0, moveSpread: 0,
    falloffStart: 0, falloffEnd: 1, startAmmo: 0, assist: 0,
    description: 'Seasoned cedar from the hills. Every clean hit puts someone on the floor.',
  },
  {
    id: 'pistol', name: 'Viper 9', model: 'pistol', melee: false,
    damage: 30, fireRate: 5, clipSize: 12, reloadSeconds: 1.25, range: 80, spread: 0.008, pellets: 1, automatic: false,
    vehicleDamage: 0.8, price: 650, ammoPrice: 60, ammoBox: 24, rank: 1, oneHanded: true,
    recoil: 0.022, shake: 0.16, bloomPerShot: 0.012, maxBloom: 0.05, bloomRecovery: 0.16, moveSpread: 0.03,
    falloffStart: 30, falloffEnd: 0.6, startAmmo: 48, assist: 0.045,
    description: 'A compact nine with a quick trigger. Three or four hits stop most people.',
  },
  {
    id: 'smg', name: 'Hornet MP', model: 'smg', melee: false,
    damage: 18, fireRate: 12, clipSize: 32, reloadSeconds: 1.7, range: 60, spread: 0.02, pellets: 1, automatic: true,
    vehicleDamage: 0.75, price: 2400, ammoPrice: 120, ammoBox: 64, rank: 2, oneHanded: true,
    recoil: 0.009, shake: 0.07, bloomPerShot: 0.006, maxBloom: 0.06, bloomRecovery: 0.22, moveSpread: 0.025,
    falloffStart: 18, falloffEnd: 0.45, startAmmo: 128, assist: 0.05,
    description: 'Buzzes through a magazine in under three seconds. Fires one-handed from the wheel.',
  },
  {
    id: 'shotgun', name: 'Dust Devil 12', model: 'shotgun', melee: false,
    damage: 15, fireRate: 1.25, clipSize: 6, reloadSeconds: 2.3, range: 34, spread: 0.065, pellets: 8, automatic: false,
    vehicleDamage: 0.9, price: 3200, ammoPrice: 90, ammoBox: 12, rank: 3, oneHanded: false,
    recoil: 0.055, shake: 0.38, bloomPerShot: 0, maxBloom: 0, bloomRecovery: 0, moveSpread: 0.02,
    falloffStart: 6, falloffEnd: 0.2, startAmmo: 24, assist: 0.06,
    description: 'Eight pellets of bad news. Brutal across a room, polite across a street.',
  },
  {
    id: 'rifle', name: 'Jackal AR', model: 'rifle', melee: false,
    damage: 32, fireRate: 9, clipSize: 30, reloadSeconds: 2.05, range: 120, spread: 0.01, pellets: 1, automatic: true,
    vehicleDamage: 1.15, price: 5800, ammoPrice: 180, ammoBox: 60, rank: 4, oneHanded: false,
    recoil: 0.012, shake: 0.1, bloomPerShot: 0.005, maxBloom: 0.05, bloomRecovery: 0.2, moveSpread: 0.035,
    falloffStart: 55, falloffEnd: 0.6, startAmmo: 120, assist: 0.04,
    description: 'The desert carbine. Controllable bursts, real reach, punches through car doors.',
  },
  {
    id: 'marksman', name: 'Longsight 7', model: 'rifle', melee: false,
    damage: 110, fireRate: 0.9, clipSize: 5, reloadSeconds: 2.8, range: 240, spread: 0.0015, pellets: 1, automatic: false,
    vehicleDamage: 1.8, price: 9500, ammoPrice: 150, ammoBox: 10, rank: 5, oneHanded: false,
    recoil: 0.07, shake: 0.45, bloomPerShot: 0.03, maxBloom: 0.03, bloomRecovery: 0.05, moveSpread: 0.07,
    falloffStart: 160, falloffEnd: 0.8, startAmmo: 20, assist: 0.012,
    description: 'Bolt-action precision for long sightlines across the dunes. One hit, one story.',
  },
];

/** Bare hands: what a character fights with when weaponIndex is -1. */
export const FISTS = Object.freeze({
  id: 'fists', name: 'Fists', model: null, melee: true,
  damage: 9, fireRate: 2.4, clipSize: 0, reloadSeconds: 0, range: 1.3, spread: 0, pellets: 1, automatic: false,
  vehicleDamage: 0, price: 0, ammoPrice: 0, ammoBox: 0, rank: 0, oneHanded: false,
  recoil: 0, shake: 0.12, bloomPerShot: 0, maxBloom: 0, bloomRecovery: 0, moveSpread: 0,
  falloffStart: 0, falloffEnd: 1, startAmmo: 0, assist: 0,
  description: 'Free, quiet and always with you.',
});

const BY_ID = new Map(WEAPON_CATALOG.map((spec) => [spec.id, spec]));

/** The catalogue entry for a weapon id, or null ('fists' returns FISTS). */
export function weaponSpecById(id) {
  if (id === 'fists') return FISTS;
  return BY_ID.get(id) || null;
}

/**
 * Damage a single bullet (or pellet) of `spec` still carries after `distance` metres: full up to
 * falloffStart, then down in a straight line to falloffEnd of it at the weapon's range.
 */
export function damageAtDistance(spec, distance) {
  if (distance <= spec.falloffStart || spec.range <= spec.falloffStart) return spec.damage;
  const t = Math.min(1, (distance - spec.falloffStart) / (spec.range - spec.falloffStart));
  return spec.damage * (1 - t * (1 - spec.falloffEnd));
}

/** How far apart an AI likes to stand from its target with this weapon, in metres: [nearest, farthest]. */
export function preferredFightingDistance(spec) {
  if (!spec) return FIGHTING_DISTANCE.fists;
  return FIGHTING_DISTANCE[spec.id] || FIGHTING_DISTANCE.pistol;
}

const FIGHTING_DISTANCE = {
  fists: [0, 1.0],
  bat: [0, 1.5],
  pistol: [7, 20],
  smg: [5, 15],
  shotgun: [2.5, 8],
  rifle: [12, 32],
  marksman: [26, 60],
};
