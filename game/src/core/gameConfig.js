// Tuning constants for KHAMSIN: Port Sarab, shared through game.config. One place to change how
// big the world is, how many cars and people are alive at once, and how the day runs.

export const GAME_TITLE = 'KHAMSIN';
export const GAME_SUBTITLE = 'Port Sarab';
export const SAVE_VERSION = 1;

export const gameConfig = {
  title: GAME_TITLE,
  subtitle: GAME_SUBTITLE,
  worldSeed: 'port-sarab-1',

  /** Metres. X runs west (-) to east (+); Z runs north (-, the sea) to south (+, the dunes); Y is up. */
  world: {
    minX: -1900, maxX: 1900, minZ: -1500, maxZ: 2000,
    seaLevel: -1.0,
    gravity: 9.81,
  },

  /**
   * In-game clock: a day at daytime pace would last this many real seconds (two minutes an hour); the
   * hours of darkness pass three times faster. The title screen sits at golden hour and a new game
   * starts a little before it, so the first minutes of play are the city at its best.
   */
  dayLengthSeconds: 2880,
  nightClockRate: 3,
  startHour: 17.2,
  newGameHour: 16.5,

  /** How many simulated things may be alive around the player (kept low for integrated graphics). */
  population: {
    trafficVehicles: 26,
    parkedVehicles: 16,
    pedestrians: 44,
    spawnRadius: 240,
    despawnRadius: 300,
    minSpawnDistance: 70,
  },

  render: {
    fieldOfView: 60,
    near: 0.3,
    far: 4200,
    maxPixelRatio: 1.25,
    shadowMapSize: 2048,
    shadowDistance: 110,
  },

  player: {
    walkSpeed: 2.0,
    runSpeed: 4.6,
    sprintSpeed: 7.4,
    jumpSpeed: 4.6,
    maxHealth: 100,
    maxArmor: 100,
  },

  wanted: {
    maxStars: 5,
    /** Seconds out of sight before the search ends, per star. */
    evadeSecondsPerStar: 9,
  },

  /** Colours of the art direction: sand gold, gulf teal, coral, night blue, cream. */
  palette: {
    sand: 0xe9b44c,
    teal: 0x1ba39c,
    coral: 0xe4572e,
    night: 0x0e1b2a,
    cream: 0xfff4d6,
    asphalt: 0x3a3d45,
    police: 0x2f6bff,
  },
};
