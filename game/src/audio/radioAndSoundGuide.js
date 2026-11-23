// Port Sarab's radio and sound at a glance: the five stations on the car radio, the 48 sounds the game
// plays, and the rules giving each car its engine voice, each police unit its siren, each gun its report.

/** The dial, in order. Four stations compose endless original music; the last listens to the police. */
export const RADIO_STATION_GUIDE = [
  { id: 'sarab_gold', name: 'Sarab Gold 98.6', frequency: '98.6 FM', host: 'Samira "Golden Hour" Qasim', tagline: 'Sunset funk for the long drive home.', style: 'synth-funk' },
  { id: 'dune_fm', name: 'Dune FM 101.1', frequency: '101.1 FM', host: 'Rafe "Sidewinder" Malouf', tagline: 'Loud enough to hear over the khamsin.', style: 'desert rock-electro' },
  { id: 'radio_khamsin', name: 'Radio Khamsin 94.3', frequency: '94.3 FM', host: 'Auntie Hala Mansour', tagline: 'Drums of the old quarter, straight to your dashboard.', style: 'hand drums, Hijaz pluck' },
  { id: 'marina_lounge', name: 'Marina Lounge 88.8', frequency: '88.8 FM', host: 'Teo Varga', tagline: 'Slow tides, soft keys, no hurry.', style: 'lo-fi keys, vinyl dust' },
  { id: 'pspd_scanner', name: 'PSPD Scanner', frequency: '460.2 MHz', host: 'Port Sarab Dispatch', tagline: 'Unit chatter from the Port Sarab Police Department.', style: 'police radio' },
];

/** Every sound id game.audio.play() knows, grouped. */
export const SOUND_EFFECT_IDS = {
  gunfire: ['gunPistol', 'gunSmg', 'gunRifle', 'gunShotgun', 'bulletImpact', 'ricochet', 'bulletWhiz'],
  fights: ['punch', 'kick', 'bodyFall', 'bodyHit'],
  wrecks: ['crash', 'glass', 'explosion', 'tyreBurst', 'metalClank', 'woodCrack', 'landingThud'],
  cars: ['horn', 'doorOpen', 'doorClose', 'engineStart', 'engineStop', 'backfire'],
  outdoors: ['splash', 'footstep', 'windGust'],
  story: ['missionStart', 'missionPassed', 'missionFailed', 'wantedUp', 'wantedClear', 'arrested', 'death', 'phoneRing', 'phonePickup'],
  interface: ['pickup', 'cash', 'reload', 'emptyClick', 'menuMove', 'menuSelect', 'menuBack', 'mapOpen', 'radioStatic', 'cameraShutter', 'save', 'notify'],
};

/** The next station; past the last the radio goes off (-1), then starts over. */
export function nextStationIndex(index, count) {
  return index + 1 >= count ? -1 : index + 1;
}

/** The previous station; from off it wraps to the last. */
export function previousStationIndex(index, count) {
  return index - 1 < -1 ? count - 1 : index - 1;
}

/** Engine voice by class: super wails, sports rasps, classic burbles, buggy buzzes, police growls. */
export function engineTimbreForVehicleClass(className) {
  return className === 'taxi' ? 'sedan' : className === 'policeSuv' ? 'police' : className || 'sedan';
}

/** Heavy diesels crank longer and rumble lower. */
export function isDieselClass(className) {
  return className === 'truck' || className === 'bus' || className === 'armored';
}

/** The sweep police unit `n` plays at its `turn`-th change, so no two units sound alike. */
export function sirenPatternForUnit(n, turn) {
  const cycle = SIREN_CYCLES[n % SIREN_CYCLES.length];
  return cycle[turn % cycle.length];
}

const SIREN_CYCLES = [['wail', 'yelp'], ['yelp', 'wail'], ['hilo', 'wail', 'yelp']];

/** A weapon's report: a shotgun's boom, an SMG's rattle, a rifle's bark, else a pistol's crack. */
export function gunSoundForWeaponModel(model) {
  const n = String(model || '').toLowerCase();
  if (/shot|scatter|pump/.test(n)) return 'gunShotgun';
  if (/smg|sub|machine|auto|spray/.test(n)) return 'gunSmg';
  if (/rifle|carbine|sniper|marksman|assault/.test(n)) return 'gunRifle';
  return 'gunPistol';
}
