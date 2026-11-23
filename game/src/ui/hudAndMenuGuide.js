// KHAMSIN's interface at a glance: the rules its HUD and menus live by, and what each piece shows.
// Pure functions only; the HUD and menu files call these, so each rule is decided in one place.

/** '$12,450' (a loss: '-$300'). */
export function formatMoney(amount) {
  const v = Math.round(Number(amount) || 0);
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** The 24-hour clock from a fractional hour: 17.4 -> '17:24'. */
export function formatClock(hour) {
  const h = (((Number(hour) || 0) % 24) + 24) % 24;
  const m = Math.floor((h % 1) * 60);
  return `${h < 10 ? '0' : ''}${Math.floor(h)}:${m < 10 ? '0' : ''}${m}`;
}

/** How many of the five wanted stars are lit. */
export function wantedStarsShown(level, maxStars = 5) {
  return Math.max(0, Math.min(maxStars, Math.round(level || 0)));
}

/** How lit stars behave: 'pursuit' flashes red and blue, 'search' blinks, 'clear' hides them. */
export function wantedStarsMode(lit, state) {
  return lit === 0 ? 'clear' : state || 'pursuit';
}

/** Metres the minimap sees: wider in a car, wider still with speed (m/s). */
export function minimapZoomForSpeed(speed, inVehicle) {
  return (inVehicle ? 175 : 135) + (Math.min(Math.abs(speed) || 0, 45) / 45) * 170;
}

/** The blip a marker gets: its icon override, else its kind, else a side-job diamond. */
export function blipStyleForMarker(marker, styles) {
  if (marker.icon && styles[marker.icon]) return marker.icon;
  return styles[marker.kind] ? marker.kind : 'activity';
}

/** The dial's top mark for a car: top speed plus 8%, rounded up to 40 km/h. */
export function speedometerScaleFor(topSpeed) {
  return Math.max(120, Math.ceil(((topSpeed || 60) * 3.6 * 1.08) / 40) * 40);
}

/** Needle angle in degrees: -135 at rest, +135 at the top mark. */
export function speedometerAngleFor(kmh, maxKmh) {
  return -135 + Math.min(1, Math.max(0, kmh / maxKmh)) * 270;
}

/** Where the Cover meter's star sits, % along the bar: past the middle leans to the badge. */
export function coverMeterBalance(crewTrust, badge) {
  return 50 + (badge - crewTrust) / 2;
}

/** The step shown large: the first unfinished required one, else the first unfinished one. */
export function currentObjectiveIndex(objectives) {
  let open = -1;
  for (let i = 0; i < objectives.length; i += 1) {
    if (objectives[i].done) continue;
    if (!objectives[i].optional) return i;
    if (open < 0) open = i;
  }
  return open;
}

/** Each HUD piece and what it shows. */
export const HUD_PIECES = {
  minimap: 'GPS route, jobs, shops, PSPD and their sight',
  vitals: 'Health and armour arcs',
  wantedStars: 'Five stars, red-blue in a pursuit',
  cashAndRep: 'Cash and REP rank',
  clock: 'Time, sun, moon or sandstorm',
  jobCard: 'Job, objective, steps, timer, distance',
  coverMeter: 'Crew trust against the badge',
  weapon: 'Weapon and ammo',
  speedometer: 'km/h, gear, damage, car',
  messages: 'Toasts, subtitles, district, radio',
  reticle: 'Crosshair, hits, damage glow',
};

/** Each screen of the menus. */
export const MENU_SCREENS = {
  mainMenu: 'Title over the live city',
  pause: 'Resume, Map, Jobs, Stats, Save, Load, Quit',
  cityMap: 'Pan, zoom, legend, waypoint',
  shop: 'Guns, resprays, food',
  weaponWheel: 'Hold Tab, time slows',
  saves: 'Autosave and three slots',
  controls: 'Every key',
  settings: 'Volume, mouse, quality',
  stats: 'The wheelman\'s record',
  results: 'JOB DONE, JOB BLOWN, IN CUFFS, LIGHTS OUT',
};
