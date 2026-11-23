// The cars, trucks and police units of Port Sarab: fifteen invented models with their own names,
// handling figures, prices and paint, and where in the city each one turns up in traffic.

/** Every model on Port Sarab's roads. @type {import('../core/gameContext.js').VehicleSpec[]} */
export const VEHICLE_CATALOG = listPortSarabVehicles();

/** The fifteen vehicles: compact, sedan, taxi, sports, super, classic, SUV, pickup, van, truck, bus, buggy, two police units and the bullion carrier. */
function listPortSarabVehicles() {
  const WHITE = 0xf4f1e8;
  const SILVER = 0xb9c0c7;
  const GRAPHITE = 0x3b4048;
  const BLACK = 0x16181c;
  const SAND = 0xd9b77a;
  const TEAL = 0x1ba39c;
  const CORAL = 0xe4572e;
  const WINE = 0x7a1f2b;
  const NAVY = 0x1e3a6e;
  const SKY = 0x4d9de0;
  const SAFFRON = 0xf2a81d;
  const OLIVE = 0x6b7a3a;
  const PEARL = 0xe9e2d0;
  const LIME = 0x9bd13a;
  const VIOLET = 0x6a3fa0;
  return [
  {
    id: 'dromo_sandpiper', name: 'Dromo Sandpiper', className: 'compact',
    mass: 1050, length: 3.9, width: 1.7, height: 1.5, wheelbase: 2.45, track: 1.46, wheelRadius: 0.3,
    topSpeed: 41, acceleration: 5.2, braking: 11, grip: 0.98, drive: 'fwd', offroad: 0.3,
    health: 700, seats: 4, value: 9000,
    colors: [WHITE, SKY, CORAL, SAFFRON, SILVER, LIME],
    traffic: { downtown: 3, marina: 2, oldtown: 4, docks: 1, villas: 2, strip: 3, flats: 5, desert: 1 },
  },
  {
    id: 'varda_meridian', name: 'Varda Meridian', className: 'sedan',
    mass: 1450, length: 4.75, width: 1.85, height: 1.45, wheelbase: 2.8, track: 1.58, wheelRadius: 0.33,
    topSpeed: 50, acceleration: 5.8, braking: 11.5, grip: 1.02, drive: 'rwd', offroad: 0.25,
    health: 850, seats: 4, value: 24000,
    colors: [WHITE, SILVER, GRAPHITE, BLACK, NAVY, PEARL, WINE],
    traffic: { downtown: 5, marina: 4, oldtown: 3, docks: 1, villas: 4, strip: 4, flats: 4, desert: 1 },
  },
  {
    id: 'sarab_cab', name: 'Sarab Cab', className: 'taxi',
    mass: 1480, length: 4.75, width: 1.85, height: 1.5, wheelbase: 2.8, track: 1.58, wheelRadius: 0.33,
    topSpeed: 48, acceleration: 5.5, braking: 11.5, grip: 1.0, drive: 'rwd', offroad: 0.25,
    health: 850, seats: 4, value: 18000,
    colors: [PEARL],
    traffic: { downtown: 4, marina: 3, oldtown: 3, docks: 0, villas: 1, strip: 4, flats: 2, desert: 0 },
  },
  {
    id: 'kestrel_sirocco', name: 'Kestrel Sirocco GT', className: 'sports',
    mass: 1380, length: 4.5, width: 1.9, height: 1.28, wheelbase: 2.6, track: 1.62, wheelRadius: 0.34,
    topSpeed: 68, acceleration: 8.6, braking: 13.5, grip: 1.18, drive: 'rwd', offroad: 0.12,
    health: 780, seats: 2, value: 96000,
    colors: [CORAL, SAFFRON, TEAL, BLACK, WHITE, VIOLET],
    traffic: { downtown: 2, marina: 3, oldtown: 0, docks: 0, villas: 2, strip: 3, flats: 0, desert: 1 },
  },
  {
    id: 'zephyr_mirage', name: 'Zephyr Mirage S', className: 'super',
    mass: 1320, length: 4.55, width: 2.0, height: 1.14, wheelbase: 2.65, track: 1.7, wheelRadius: 0.35,
    topSpeed: 84, acceleration: 11.5, braking: 15, grip: 1.32, drive: 'awd', offroad: 0.08,
    health: 760, seats: 2, value: 420000,
    colors: [SAFFRON, LIME, WHITE, TEAL, VIOLET, CORAL],
    traffic: { downtown: 1, marina: 2, oldtown: 0, docks: 0, villas: 1, strip: 2, flats: 0, desert: 0 },
  },
  {
    id: 'kestrel_corniche', name: "Kestrel Corniche '72", className: 'classic',
    mass: 1600, length: 5.1, width: 1.95, height: 1.35, wheelbase: 3.0, track: 1.6, wheelRadius: 0.35,
    topSpeed: 52, acceleration: 6.2, braking: 9.5, grip: 0.92, drive: 'rwd', offroad: 0.15,
    health: 820, seats: 4, value: 64000,
    colors: [TEAL, WINE, PEARL, SKY, SAFFRON],
    traffic: { downtown: 1, marina: 2, oldtown: 1, docks: 0, villas: 2, strip: 2, flats: 0, desert: 0 },
  },
  {
    id: 'oryx_summit', name: 'Oryx Summit', className: 'suv',
    mass: 2300, length: 5.0, width: 2.0, height: 1.85, wheelbase: 2.95, track: 1.68, wheelRadius: 0.4,
    topSpeed: 52, acceleration: 6.0, braking: 10.5, grip: 0.96, drive: 'awd', offroad: 0.85,
    health: 1100, seats: 4, value: 78000,
    colors: [WHITE, BLACK, GRAPHITE, PEARL, SAND, NAVY],
    traffic: { downtown: 3, marina: 3, oldtown: 1, docks: 1, villas: 5, strip: 3, flats: 2, desert: 3 },
  },
  {
    id: 'oryx_nomad', name: 'Oryx Nomad', className: 'pickup',
    mass: 2050, length: 5.3, width: 1.95, height: 1.8, wheelbase: 3.2, track: 1.64, wheelRadius: 0.4,
    topSpeed: 46, acceleration: 5.4, braking: 10, grip: 0.92, drive: 'awd', offroad: 0.9,
    health: 1050, seats: 2, value: 34000,
    colors: [WHITE, SAND, OLIVE, GRAPHITE, CORAL, SKY],
    traffic: { downtown: 1, marina: 1, oldtown: 3, docks: 4, villas: 1, strip: 1, flats: 3, desert: 5 },
  },
  {
    id: 'sahel_caravan', name: 'Sahel Caravan', className: 'van',
    mass: 2100, length: 5.2, width: 2.0, height: 2.2, wheelbase: 3.2, track: 1.7, wheelRadius: 0.36,
    topSpeed: 40, acceleration: 4.2, braking: 9.5, grip: 0.88, drive: 'rwd', offroad: 0.3,
    health: 1000, seats: 2, value: 21000,
    colors: [WHITE, SILVER, SAND, SKY, TEAL],
    traffic: { downtown: 2, marina: 1, oldtown: 3, docks: 4, villas: 1, strip: 2, flats: 3, desert: 1 },
  },
  {
    id: 'sahel_hauler', name: 'Sahel Hauler', className: 'truck',
    mass: 6500, length: 7.6, width: 2.4, height: 3.2, wheelbase: 4.6, track: 1.95, wheelRadius: 0.48,
    topSpeed: 32, acceleration: 2.8, braking: 8, grip: 0.82, drive: 'rwd', offroad: 0.35,
    health: 1600, seats: 2, value: 52000,
    colors: [WHITE, SAFFRON, NAVY, CORAL, OLIVE],
    traffic: { downtown: 0, marina: 0, oldtown: 1, docks: 5, villas: 0, strip: 0, flats: 1, desert: 2 },
  },
  {
    id: 'sarab_metro_bus', name: 'Sarab Metro Bus', className: 'bus',
    mass: 11000, length: 11.2, width: 2.55, height: 3.1, wheelbase: 5.9, track: 2.1, wheelRadius: 0.5,
    topSpeed: 27, acceleration: 2.2, braking: 7.5, grip: 0.8, drive: 'rwd', offroad: 0.1,
    health: 2200, seats: 2, value: 120000,
    colors: [TEAL],
    traffic: { downtown: 1, marina: 1, oldtown: 1, docks: 0, villas: 0, strip: 1, flats: 1, desert: 0 },
  },
  {
    id: 'dune_jackal', name: 'Dune Jackal', className: 'buggy',
    mass: 720, length: 3.3, width: 1.75, height: 1.5, wheelbase: 2.3, track: 1.5, wheelRadius: 0.38,
    topSpeed: 46, acceleration: 8.2, braking: 11, grip: 1.05, drive: 'rwd', offroad: 1.0,
    health: 600, seats: 2, value: 16000,
    colors: [SAFFRON, CORAL, LIME, TEAL],
    traffic: { downtown: 0, marina: 0, oldtown: 0, docks: 0, villas: 0, strip: 0, flats: 0, desert: 3 },
  },
  {
    id: 'pspd_interceptor', name: 'PSPD Interceptor', className: 'police',
    mass: 1650, length: 4.85, width: 1.9, height: 1.48, wheelbase: 2.85, track: 1.6, wheelRadius: 0.34,
    topSpeed: 66, acceleration: 8.4, braking: 13.5, grip: 1.16, drive: 'awd', offroad: 0.4,
    health: 1100, seats: 4, value: 0,
    colors: [WHITE],
    traffic: {},
  },
  {
    id: 'pspd_enforcer', name: 'PSPD Enforcer', className: 'policeSuv',
    mass: 2600, length: 5.1, width: 2.05, height: 1.95, wheelbase: 3.0, track: 1.72, wheelRadius: 0.42,
    topSpeed: 58, acceleration: 7.0, braking: 11.5, grip: 1.04, drive: 'awd', offroad: 0.9,
    health: 1700, seats: 4, value: 0,
    colors: [GRAPHITE],
    traffic: {},
  },
  {
    id: 'aurum_bullion', name: 'Aurum Bullion Carrier', className: 'armored',
    mass: 7800, length: 6.6, width: 2.4, height: 2.9, wheelbase: 3.9, track: 1.95, wheelRadius: 0.48,
    topSpeed: 34, acceleration: 3.0, braking: 8.5, grip: 0.86, drive: 'rwd', offroad: 0.3,
    health: 3200, seats: 2, value: 0,
    colors: [0x2b2f36],
    traffic: {},
  },
  ];
}

/** Look a spec up by id. */
export function vehicleSpecById(id) {
  for (let i = 0; i < VEHICLE_CATALOG.length; i += 1) if (VEHICLE_CATALOG[i].id === id) return VEHICLE_CATALOG[i];
  return null;
}

/** The civilian models that may spawn in a district kind, with their weights (parallel arrays). */
export function trafficMixFor(districtKind) {
  const specs = [];
  const weights = [];
  for (const spec of VEHICLE_CATALOG) {
    const weight = spec.traffic[districtKind] || 0;
    if (weight > 0) {
      specs.push(spec);
      weights.push(weight);
    }
  }
  return { specs, weights };
}
