// The five street races of Port Sarab, laid on the city's real roads: the Corniche Sprint along the
// seafront with a hairpin at Dockside, the three-lap Spires Circuit round the Vane Spire, the Dockside
// Dash across the quay and over the Quay Leap, the Wadi Circuit Rally over desert highway, dirt track
// and two jumps, and the flat-out Dune Highway Run. Each has its grid, checkpoints and rival cars;
// names, laps and entry fees come from the activity rules.
import { STREET_RACES } from './activityRules.js';

/**
 * @typedef {Object} RaceCheckpoint
 * @property {number} x @property {number} z
 * @property {number} r       pass radius, metres
 * @property {boolean} [jump] a stunt ramp's foot: drivers line up straight onto it
 * @property {number} [cornerWidth] room the drivers have to swing through this turn, metres
 */

/**
 * @typedef {Object} RaceRoute
 * @property {string} id @property {string} placeId @property {string} name @property {string} blurb
 * @property {number} laps @property {number} entry  entry fee, dollars
 * @property {string[]} rivals  vehicle models of the rivals @property {string} proRival  the model added on a harder repeat
 * @property {{x:number, z:number, heading:number}} grid  centre of the front row
 * @property {RaceCheckpoint[]} points  one lap; the last point is the finish (or lap) line
 * @property {'city'|'desert'} terrain
 */

/** Build the five routes. Pure data: the same every time. @returns {RaceRoute[]} */
export function buildStreetRaceRoutes() {
  const routes = [cornicheSprint(), spiresCircuit(), docksideDash(), wadiCircuitRally(), duneHighwayRun()];
  for (const route of routes) {
    const rules = STREET_RACES.find((race) => race.id === route.id);
    if (rules) Object.assign(route, { name: rules.name, laps: rules.laps, entry: rules.entry });
  }
  return routes;
}

/** East along the Corniche's seafront lanes, a hairpin in the Dockside Avenue junction, and back west. */
function cornicheSprint() {
  const east = -694.5;
  const west = -705.5;
  return {
    id: 'corniche', placeId: 'race_corniche', terrain: 'city',
    blurb: 'Flat out along the seafront, a hairpin at Dockside Avenue, and back to Falcon Avenue.',
    rivals: ['kestrel_sirocco', 'kestrel_corniche', 'varda_meridian', 'kestrel_sirocco'], proRival: 'zephyr_mirage',
    grid: { x: -490, z: east, heading: Math.PI / 2 },
    points: [
      cp(-200, east, 13),
      cp(40, east, 14),
      cp(330, east, 13),
      cp(600, -691, 12, { cornerWidth: 26 }),
      cp(688, -700, 10, { cornerWidth: 8 }),
      cp(620, -709, 12),
      cp(330, west, 13),
      cp(40, west, 14),
      cp(-240, west, 13),
      cp(-530, west, 16),
    ],
  };
}

/** Three laps of the Spires: Al Noor Boulevard, up Vane Boulevard past the Spire, Sail Street, Saffron Street. */
function spiresCircuit() {
  return {
    id: 'spires', placeId: 'race_spires', terrain: 'city',
    blurb: 'Three tight laps among the glass towers, right round the foot of the Vane Spire.',
    rivals: ['dromo_sandpiper', 'varda_meridian', 'kestrel_sirocco', 'kestrel_corniche'], proRival: 'zephyr_mirage',
    grid: { x: 128, z: -125.5, heading: -Math.PI / 2 },
    points: [
      cp(47, -127, 15, { cornerWidth: 11 }),
      cp(45.5, -300, 15),
      cp(46, -494, 13, { cornerWidth: 7 }),
      cp(234, -498, 12, { cornerWidth: 6 }),
      cp(238.25, -300, 12),
      cp(238, -127, 12, { cornerWidth: 8 }),
      cp(128, -125.5, 14),
    ],
  };
}

/** Up Dockside Avenue, across the Corniche onto the quay, over the Quay Leap, down the East Ring Road. */
function docksideDash() {
  return {
    id: 'docks', placeId: 'race_docks', terrain: 'city',
    blurb: 'Through Mina Docks, along the quay under the gantry cranes and over the Quay Leap.',
    rivals: ['oryx_nomad', 'varda_meridian', 'oryx_summit', 'kestrel_corniche'], proRival: 'kestrel_sirocco',
    grid: { x: 812, z: -125.5, heading: -Math.PI / 2 },
    points: [
      cp(686, -127, 15, { cornerWidth: 11 }),
      cp(685.5, -300, 14),
      cp(685.5, -500, 14),
      cp(685, -700, 16),
      cp(700, -775, 14, { cornerWidth: 20 }),
      cp(860, -812, 14),
      cp(980, -842, 10),
      cp(1010, -842, 8, { jump: true }),
      cp(1085, -832, 18, { cornerWidth: 24 }),
      cp(1115, -760, 14, { cornerWidth: 18 }),
      cp(1114.5, -690, 16),
      cp(1114.5, -500, 14),
      cp(1114, -306, 15, { cornerWidth: 8 }),
      cp(926, -301.75, 15),
    ],
  };
}

/** One lap of the desert: Wadi Road, the Parkway, the Gate Jump, the Falcon Launch on the dirt track, home past the Wadi Flyer. */
function wadiCircuitRally() {
  const wadiNorth = [-640, 1060, -560, 820];
  const highwayToTrack = [60, 1040, 300, 1270];
  const trackEast = [300, 1270, -60, 1560];
  const trackFalcon = [-60, 1560, -420, 1640];
  const trackMid = [-420, 1640, -760, 1500];
  const trackWest = [-760, 1500, -980, 1250];
  const wadiHome = [-980, 1250, -640, 1060];
  return {
    id: 'dunes', placeId: 'race_dunes', terrain: 'desert',
    blurb: 'Desert highway, dirt track and two big jumps: the Gate Jump and the Falcon Launch.',
    rivals: ['dune_jackal', 'oryx_nomad', 'dune_jackal', 'oryx_summit'], proRival: 'dune_jackal',
    grid: gridOn(wadiNorth, 0.12, 4.5),
    points: [
      cpOn(wadiNorth, 0.6, 4.5, 13),
      cp(-556, 825, 16, { cornerWidth: 12 }),
      cp(-300, 825.5, 14),
      cp(40, 826, 16, { cornerWidth: 11 }),
      cp(41, 930, 12),
      cp(40, 979, 6, { jump: true }),
      cpOn(highwayToTrack, 0.05, 0, 16, { cornerWidth: 18 }),
      cpOn(highwayToTrack, 0.6, 0, 14),
      cp(300, 1270, 16, { cornerWidth: 14 }),
      cpOn(trackEast, 0.5, 0, 12),
      cp(-60, 1560, 13, { cornerWidth: 12 }),
      cp(-220.7, 1599.7, 9),
      cp(-250, 1606, 6, { jump: true }),
      cpOn(trackFalcon, 0.85, 0, 14),
      cp(-420, 1640, 14, { cornerWidth: 14 }),
      cpOn(trackMid, 0.5, 0, 12),
      cp(-760, 1500, 13, { cornerWidth: 12 }),
      cpOn(trackWest, 0.5, 0, 12),
      cp(-980, 1250, 16, { cornerWidth: 13 }),
      cpOn(wadiHome, 0.37, -8, 9),
      cpOn(wadiHome, 0.51, -8, 9),
      cpOn(wadiHome, 0.66, 0, 16),
    ],
  };
}

/** Two laps of the Dune Highway loop and the Dune Parkway, flat out the whole way. */
function duneHighwayRun() {
  const gateLeg = [40, 820, 60, 1040];
  const westLeg = [60, 1040, 300, 1270];
  const hopLeg = [300, 1270, 700, 1390];
  const airfieldLeg = [700, 1390, 1060, 1230];
  const eastLeg = [1060, 1230, 1120, 820];
  return {
    id: 'highway', placeId: 'race_highway', terrain: 'desert',
    blurb: 'Two laps of the highway loop through the dunes. Top speed or nothing.',
    rivals: ['zephyr_mirage', 'kestrel_sirocco', 'kestrel_corniche', 'kestrel_sirocco'], proRival: 'zephyr_mirage',
    grid: gridOn(gateLeg, 0.636, 4.5),
    points: [
      cpOn(gateLeg, 0.97, 4.5, 14, { cornerWidth: 30 }),
      cpOn(westLeg, 0.55, 4.5, 14),
      cp(300, 1270, 16, { cornerWidth: 30 }),
      cpOn(hopLeg, 0.42, -7.5, 12),
      cpOn(hopLeg, 0.7, -7.5, 12),
      cp(700, 1390, 16, { cornerWidth: 30 }),
      cpOn(airfieldLeg, 0.5, 4.5, 14),
      cp(1060, 1230, 16, { cornerWidth: 30 }),
      cpOn(eastLeg, 0.5, 4.5, 14),
      cp(1116, 826, 18, { cornerWidth: 12 }),
      cp(680, 814.5, 14),
      cp(300, 814.5, 14),
      cp(44, 816, 16, { cornerWidth: 11 }),
      cpOn(gateLeg, 0.636, 4.5, 16),
    ],
  };
}

/** A checkpoint at a point. */
function cp(x, z, r, extra) {
  return { x, z, r, jump: false, cornerWidth: 0, ...extra };
}

/**
 * A checkpoint on the road segment [ax, az, bx, bz], `t` of the way along it, `lateral` metres to the
 * right of the line (right-hand traffic: +4.5 sits between the two lanes going a to b).
 */
function cpOn(segment, t, lateral, r, extra) {
  const p = pointOn(segment, t, lateral);
  return cp(p.x, p.z, r, extra);
}

/** The front row of a grid on a road segment, facing along it. */
function gridOn(segment, t, lateral) {
  const p = pointOn(segment, t, lateral);
  return { x: p.x, z: p.z, heading: Math.atan2(segment[2] - segment[0], segment[3] - segment[1]) };
}

function pointOn(segment, t, lateral) {
  const [ax, az, bx, bz] = segment;
  const length = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / length;
  const uz = (bz - az) / length;
  // Right of travel is (-uz, ux): facing +Z, the right hand points to -X.
  return { x: ax + (bx - ax) * t - uz * lateral, z: az + (bz - az) * t + ux * lateral };
}

/** The grid slots behind the front row: two abreast, rows eight metres apart. Writes into `out`. */
export function gridSlot(grid, index, out) {
  const row = Math.floor(index / 2);
  const side = index % 2 === 0 ? -1 : 1;
  const fx = Math.sin(grid.heading);
  const fz = Math.cos(grid.heading);
  const rx = -fz;
  const rz = fx;
  out.x = grid.x - fx * row * 8 + rx * side * 1.9;
  out.z = grid.z - fz * row * 8 + rz * side * 1.9;
  out.heading = grid.heading;
  return out;
}
