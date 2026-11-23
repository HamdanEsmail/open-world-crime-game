// Turns a vehicle from the catalogue into the numbers its handling runs on: where the weight sits,
// how it resists turning, the tyre curves, springs, dampers and anti-roll bars, the steering lock,
// the engine, gears and brakes. A twitchy rear-drive coupe, a planted all-wheel-drive super car, a
// soft long-travel dune buggy and a ponderous city bus all come out of these few figures.

export const GRAVITY = 9.81;

/** Tyre curve shape (Pacejka C): grip rises steeply, peaks, then falls to about 76% in a full slide. */
export const TYRE_SHAPE = 1.45;
const TYRE_PEAK_INPUT = Math.tan(Math.PI / (2 * TYRE_SHAPE));

const profileCache = new Map();

/**
 * The handling profile of a catalogue spec, built once and shared by every vehicle of that model.
 * @param {import('../core/gameContext.js').VehicleSpec} spec
 */
export function handlingProfileFor(spec) {
  let profile = profileCache.get(spec);
  if (!profile) {
    profile = buildHandlingProfile(spec);
    profileCache.set(spec, profile);
  }
  return profile;
}

/**
 * Derive every physical constant of one model from its catalogue figures.
 * @param {import('../core/gameContext.js').VehicleSpec} spec
 */
export function buildHandlingProfile(spec) {
  const className = spec.className || 'sedan';
  const mass = positive(spec.mass, 1400);
  const length = positive(spec.length, 4.5);
  const width = positive(spec.width, 1.85);
  const height = positive(spec.height, 1.45);
  const wheelbase = positive(spec.wheelbase, length * 0.6);
  const track = positive(spec.track, width * 0.85);
  const wheelRadius = positive(spec.wheelRadius, 0.33);
  const drive = spec.drive === 'fwd' || spec.drive === 'awd' ? spec.drive : 'rwd';
  const offroad = clamp01(spec.offroad === undefined ? 0.3 : spec.offroad);
  const heavy = mass > 4000;
  const topSpeed = positive(spec.topSpeed, 45);
  const acceleration = positive(spec.acceleration, 5);
  const grip = positive(spec.grip, 1);

  // Where the weight sits: nose-heavy front-drivers, a buggy with its engine behind the seats,
  // a bus with its engine over the rear axle.
  let frontWeight = drive === 'fwd' ? 0.6 : drive === 'awd' ? 0.52 : 0.53;
  if (className === 'buggy') frontWeight = 0.42;
  else if (className === 'bus') frontWeight = 0.44;
  else if (className === 'truck' || className === 'armored') frontWeight = 0.56;
  const cgToFront = wheelbase * (1 - frontWeight);
  const cgToRear = wheelbase * frontWeight;
  const cgHeight = 0.1 + 0.32 * height;

  // Springs: static sag sets the ride frequency (about 1.4 Hz on a road car, softer and longer on
  // the off-roaders); the wheel leaves the ground when the spring has given back all its sag.
  const sag = 0.085 + 0.11 * offroad + (heavy ? 0.02 : 0);
  const dampingRatio = className === 'buggy' ? 0.3 : heavy ? 0.5 : 0.4;
  const frontLoad = (mass * GRAVITY * frontWeight) / 2;
  const rearLoad = (mass * GRAVITY * (1 - frontWeight)) / 2;
  const frontSpring = frontLoad / sag;
  const rearSpring = rearLoad / sag;
  const frontDamper = 2 * dampingRatio * Math.sqrt(frontSpring * (frontLoad / GRAVITY));
  const rearDamper = 2 * dampingRatio * Math.sqrt(rearSpring * (rearLoad / GRAVITY));
  // Anti-roll bars decide which end gives up first. Every car is set up to run wide at the limit
  // (stable when the driver lifts off); a front-driver more so, a sports car less.
  const lively = className === 'sports' || className === 'classic' || className === 'buggy';
  const frontBar = frontSpring * (drive === 'fwd' ? 1.1 : lively ? 0.7 : 0.8);
  const rearBar = rearSpring * (drive === 'fwd' ? 0.3 : lively ? 0.5 : 0.4);

  const gearCount = className === 'super' ? 7 : className === 'sports' || className === 'police' ? 6
    : heavy ? 6 : className === 'buggy' ? 5 : 5;
  const gearTop = new Float64Array(gearCount + 1);
  for (let g = 1; g <= gearCount; g += 1) gearTop[g] = topSpeed * 1.05 * Math.pow(g / gearCount, 0.72);

  // Aerodynamic drag at top speed is a share of the engine's pull; the engine is sized to beat it.
  const dragAtTop = Math.min(0.32 * acceleration, 3.0);

  const peakSlip = className === 'buggy' ? 0.13 : heavy ? 0.1 : 0.11;
  const tyreStiffness = TYRE_PEAK_INPUT / peakSlip;

  return {
    spec,
    className,
    mass,
    invMass: 1 / mass,
    length,
    width,
    height,
    halfLength: length / 2,
    halfWidth: width / 2,
    wheelbase,
    track,
    halfTrack: track / 2,
    wheelRadius,
    drive,
    offroad,
    heavy,
    frontWeight,
    cgToFront,
    cgToRear,
    /** How far the centre of mass sits ahead of the middle between the axles. */
    cgOffset: wheelbase / 2 - cgToFront,
    cgHeight,
    yawInertia: (mass * (length * length + width * width)) / 12 * 0.9,
    pitchInertia: (mass * (length * length + height * height)) / 12,
    rollInertia: (mass * (width * width + height * height)) / 12,
    /** Collisions spin cars a little more readily than the tyres alone would allow. */
    collisionYawInertia: (mass * (length * length + width * width)) / 12 * 0.7,

    staticLoad: [frontLoad, frontLoad, rearLoad, rearLoad],
    springRate: [frontSpring, frontSpring, rearSpring, rearSpring],
    damperRate: [frontDamper, frontDamper, rearDamper, rearDamper],
    frontBar,
    rearBar,
    sag,
    /** Compression past the static ride height before the bump stop. */
    bumpTravel: sag * 1.15,
    /** The hard limit: the body never sinks further onto the wheel than this. */
    maxCompression: sag * 1.15 + 0.06,

    maxSteer: clamp(0.64 - 0.045 * (wheelbase - 2.4), 0.42, 0.62),
    steerRate: className === 'bus' || className === 'truck' ? 3.2 : 4.6,
    steerReturnRate: 7,
    /** How much the front wheels turn themselves toward the slide (help for keyboard drivers). */
    counterSteer: className === 'buggy' ? 0.7 : 0.6,

    grip: grip * 1.05,
    /** The rear tyres hold on a touch longer than the fronts, so lifting off never spins the car. */
    rearGrip: lively ? 1.04 : 1.08,
    peakSlip,
    tyreStiffnessFront: tyreStiffness,
    tyreStiffnessRear: tyreStiffness,
    loadSensitivity: 0.12,
    sandGrip: 0.7 + 0.28 * offroad,
    sandDrag: 1 - offroad,

    driveFront: drive === 'fwd' ? 1 : drive === 'awd' ? 0.42 : 0,
    driveRear: drive === 'fwd' ? 0 : drive === 'awd' ? 0.58 : 1,
    /** First gear pulls harder than the average figure: rear-drivers light up their tyres. */
    launchBoost: drive === 'rwd' ? (heavy ? 1.05 : 1.25) : drive === 'awd' ? 1.12 : 1.08,
    /**
     * How far past their grip the driven tyres may be pushed with the pedal floored (part throttle
     * always stays just inside it): a rear-driver in first or second lets its tail go, a
     * front-driver washes wide, an all-wheel-drive car simply hooks up.
     */
    powerSlideLimit: drive === 'rwd'
      ? (heavy ? 0.98 : className === 'sports' || className === 'classic' || className === 'buggy' ? 1.25 : className === 'van' ? 1.04 : 1.12)
      : drive === 'fwd' ? 1.12 : 1.0,
    acceleration,
    topSpeed,
    dragCoefficient: (mass * dragAtTop) / (topSpeed * topSpeed),
    rollingResistance: heavy ? 0.016 : 0.012,
    engineBraking: heavy ? 0.9 : 0.75,
    braking: positive(spec.braking, 10),
    brakeFront: 0.62,
    reverseTop: Math.min(13, topSpeed * 0.32),
    reverseAccel: acceleration * 0.6,
    gearCount,
    gearTop,
    shiftTime: heavy ? 0.38 : className === 'super' ? 0.09 : 0.16,
    idleRpm: 0.18,
  };
}

function positive(value, fallback) {
  return typeof value === 'number' && value > 0 && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
