// The sculpted models of Port Sarab's cars, one recipe per catalogue model: the Dromo Sandpiper hatch,
// the Varda Meridian saloon and its Sarab Cab and PSPD Interceptor siblings, the long-bonnet Kestrel
// Sirocco GT, the wedge-nosed Zephyr Mirage S and the finned Kestrel Corniche '72 convertible. Trucks,
// SUVs, the bus, the buggy and the bullion carrier live in vehicleWorkhorseModels.js.
import * as THREE from 'three';
import { createShapeKit } from './vehicleShapeKit.js';
import {
  buildLowerBody, buildCabin, headlamps, taillamps, reverseLamps, numberPlates, doorSeams, doorHandles,
  sideStrip, sideMirrors, policeLightBar, pushBar, taxiRoofSign,
} from './vehicleBodyParts.js';
import { WORKHORSE_BUILDERS } from './vehicleWorkhorseModels.js';
import { bodyStyleForClass, liveryForSpec } from './vehicleBodyStyles.js';

/**
 * Build the render model of one catalogue spec: a single baked geometry (body, glass, trim, lamps), its
 * light anchors, its livery, and how its wheels look.
 * @param {import('../core/gameContext.js').VehicleSpec} spec
 * @returns {{id:string, spec:Object, geometry:THREE.BufferGeometry, lamps:Object, livery:string|null,
 *   wheelWidth:number, rimColor:number, triangles:number}}
 */
export function buildVehicleModel(spec) {
  const kit = createShapeKit({ length: spec.length, width: spec.width, height: spec.height });
  const builder = MODEL_BUILDERS[spec.id] || CLASS_BUILDERS[spec.className] || buildVardaMeridian;
  builder(kit, spec);
  const style = bodyStyleForClass(spec.className);
  return {
    id: spec.id,
    spec,
    geometry: kit.finalize(),
    lamps: kit.lamps,
    livery: liveryForSpec(spec),
    wheelWidth: style.wheelWidth,
    rimColor: style.rimColour,
    triangles: kit.triangleCount,
  };
}

/** Dromo Sandpiper: a short, friendly city hatch with a steep tailgate. */
function buildDromoSandpiper(kit, spec) {
  const hl = spec.length / 2;
  const H = spec.height;
  const s = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: s.rideHeight,
    upper: [[hl - 0.09, 0.24], [hl, 0.42, 0.1], [hl - 0.02, 0.62, 0.08], [hl - 0.15, 0.78, 0.14], [0.85, 0.92],
      [-hl + 0.23, 0.98], [-hl + 0.03, 0.95, 0.06], [-hl, 0.6, 0.08], [-hl + 0.02, 0.4, 0.08], [-hl + 0.11, 0.24]],
    noseTaper: s.noseTaper, tailTaper: s.tailTaper, tuck: s.shoulderTuck, tuckFrom: 0.76,
  });
  buildCabin(kit, spec, {
    outline: [[0.95, 0.85], [0.85, 0.93], [0.05, H - 0.03, 0.16], [-hl + 0.6, H, 0.16], [-hl + 0.19, 1.0, 0.05], [-hl + 0.25, 0.88]],
    baseY: 0.92, width: s.cabinWidth, tumble: s.cabinLean, glass: 'wrap', roofFront: 0.05, roofRear: -hl + 0.6,
  });
  headlamps(kit, 0.42, 0.7, 0.6, 0.72);
  kit.decal('front', -0.36, 0.36, 0.46, 0.58, 'grille', { cols: 2, offset: 0.01 });
  kit.decal('front', -0.56, 0.56, 0.27, 0.37, 'trim', { cols: 3, offset: 0.008 });
  taillamps(kit, 0.5, 0.76, 0.72, 0.9, { rows: 2 });
  reverseLamps(kit, 0.36, 0.48, 0.74, 0.82);
  kit.decal('rear', -0.8, 0.8, 0.25, 0.36, 'trim', { cols: 4, offset: 0.008 });
  numberPlates(kit, 0.37, 0.5, 0.44);
  doorSeams(kit, [0.8, -0.42], 0.38, 0.9);
  doorHandles(kit, [-0.24], 0.83);
  sideStrip(kit, -0.82, 0.82, 0.31, 0.39);
  sideMirrors(kit, 0.72, 0.98);
}

/**
 * Varda Meridian: the city's everyday three-box saloon, the shape the Sarab Cab and the PSPD
 * Interceptor share.
 */
function buildVardaMeridian(kit, spec, { roofDrop = 0 } = {}) {
  const hl = spec.length / 2;
  const roofY = spec.height - roofDrop;
  const cowl = hl * 0.4;
  const roofFront = hl * 0.085;
  const roofRear = -hl * 0.32;
  const deck = -hl * 0.56;
  const s = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: s.rideHeight,
    upper: [[hl - 0.09, 0.25], [hl, 0.42, 0.1], [hl - 0.025, 0.64, 0.08], [hl - 0.17, 0.76, 0.14], [hl * 0.66, 0.85, 0.2], [cowl, 0.92],
      [deck, 0.96], [-hl + 0.09, 0.99, 0.06], [-hl, 0.8, 0.08], [-hl + 0.015, 0.42, 0.08], [-hl + 0.09, 0.25]],
    noseTaper: s.noseTaper, tailTaper: s.tailTaper, tuck: s.shoulderTuck, tuckFrom: 0.78,
  });
  buildCabin(kit, spec, {
    outline: [[cowl + 0.06, 0.85], [cowl, 0.93], [roofFront, roofY - 0.02, 0.2], [roofRear, roofY, 0.26], [deck - 0.04, 0.97], [deck + 0.03, 0.88]],
    baseY: 0.92, roofY, width: s.cabinWidth, tumble: s.cabinLean, glass: 'wrap', roofFront, roofRear,
  });
  headlamps(kit, 0.5, 0.8, 0.62, 0.72);
  kit.decal('front', -0.47, 0.47, 0.46, 0.66, 'chrome', { cols: 2, offset: 0.006 });
  kit.decal('front', -0.43, 0.43, 0.48, 0.64, 'grille', { cols: 2, offset: 0.01 });
  kit.decal('front', -0.62, 0.62, 0.27, 0.37, 'trim', { cols: 4, offset: 0.008 });
  taillamps(kit, 0.5, 0.86, 0.8, 0.93);
  reverseLamps(kit, 0.36, 0.49, 0.8, 0.88);
  kit.decal('rear', -0.35, 0.35, 0.905, 0.925, 'chrome', { cols: 2, offset: 0.01 });
  kit.decal('rear', -0.86, 0.86, 0.27, 0.36, 'trim', { cols: 4, offset: 0.008 });
  numberPlates(kit, 0.38, 0.56);
  doorSeams(kit, [cowl - 0.04, -0.05, deck + 0.38], 0.38, 0.9);
  doorHandles(kit, [0.2, -0.72], 0.83);
  sideStrip(kit, -1.35, 1.35, 0.31, 0.39);
  sideMirrors(kit, cowl - 0.12, 0.98);
}

/** Sarab Cab: the Meridian in pearl and teal with its lit roof sign. */
function buildSarabCab(kit, spec) {
  buildVardaMeridian(kit, spec, { roofDrop: 0.05 });
  taxiRoofSign(kit, -0.3);
}

/** PSPD Interceptor: the patrol saloon, with light bar, push bar and the PSPD livery. */
function buildPspdInterceptor(kit, spec) {
  const hl = spec.length / 2;
  buildVardaMeridian(kit, spec, { roofDrop: 0.06 });
  policeLightBar(kit, -0.18, 1.2);
  pushBar(kit, hl, 0.3, 0.74, 0.42);
  kit.tube([-0.3, spec.height - 0.07, -1.0], [-0.32, spec.height + 0.5, -1.1], 0.006, 'trim', { segments: 4 });
}

/** Kestrel Sirocco GT: a long-bonnet coupe, cab pushed back, fastback roof falling to a ducktail. */
function buildKestrelSirocco(kit, spec) {
  const hl = spec.length / 2;
  const H = spec.height;
  const s = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: s.rideHeight, archGap: 0.05,
    upper: [[hl - 0.08, 0.2], [hl, 0.36, 0.1], [hl - 0.03, 0.52, 0.06], [hl - 0.2, 0.62, 0.16], [1.2, 0.76, 0.35], [0.3, 0.82],
      [-1.75, 0.86], [-hl + 0.13, 0.94, 0.04], [-hl, 0.84, 0.06], [-hl + 0.01, 0.42, 0.08], [-hl + 0.1, 0.2]],
    noseTaper: s.noseTaper, taperStart: 0.5, tailTaper: s.tailTaper, tuck: s.shoulderTuck, tuckFrom: 0.62,
  });
  buildCabin(kit, spec, {
    outline: [[0.36, 0.75], [0.3, 0.83], [-0.3, H - 0.02, 0.16], [-0.72, H, 0.3], [-1.8, 0.87, 0.05], [-1.7, 0.78]],
    baseY: 0.82, width: s.cabinWidth, tumble: s.cabinLean, glass: 'wrap', roofFront: -0.3, roofRear: -0.72,
  });
  headlamps(kit, 0.5, 0.84, 0.5, 0.58);
  kit.decal('front', -0.52, 0.52, 0.25, 0.42, 'grille', { cols: 3, offset: 0.01 });
  kit.box(0, 0.17, hl - 0.1, 1.72, 0.03, 0.22, 'trim');
  kit.decal('top', 0.24, 0.42, 1.15, 1.5, 'grille', { cols: 1, rows: 2, offset: 0.006, mirror: true });
  kit.decal('left', 0.55, 0.86, 0.47, 0.6, 'grille', { cols: 2, offset: 0.008, mirror: true });
  for (const x of [0.66, 0.4]) kit.disc('rear', x, 0.73, 0.075, 0.075, 'tailLens', { offset: 0.012, lamp: x > 0.5 ? 'tail' : null, mirror: true });
  kit.disc('rear', 0.18, 0.4, 0.04, 0.04, 'reverseLens', { segments: 8, offset: 0.012, lamp: 'reverse', mirror: true });
  kit.decal('rear', -0.72, 0.72, 0.2, 0.32, 'trim', { cols: 4, offset: 0.008 });
  for (const x of [0.5, -0.5]) kit.tube([x, 0.28, -hl + 0.2], [x, 0.28, -hl - 0.05], 0.045, 'chrome', { segments: 8 });
  numberPlates(kit, null, 0.5);
  doorSeams(kit, [0.25, -0.9], 0.3, 0.8);
  doorHandles(kit, [-0.66], 0.76);
  sideMirrors(kit, 0.2, 0.88);
}

/** Zephyr Mirage S: the mid-engined wedge, a knife-low nose, side intakes, glass engine cover and a wing. */
function buildZephyrMirage(kit, spec) {
  const hl = spec.length / 2;
  const H = spec.height;
  const s = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: s.rideHeight, archGap: 0.05,
    upper: [[hl - 0.08, 0.16], [hl, 0.3, 0.06], [hl - 0.03, 0.42, 0.05], [1.5, 0.6, 0.25], [0.75, 0.74],
      [-1.6, 0.9], [-hl + 0.12, 0.97, 0.04], [-hl, 0.88, 0.05], [-hl + 0.02, 0.36, 0.06], [-hl + 0.16, 0.17]],
    noseTaper: s.noseTaper, taperStart: 0.42, tailTaper: s.tailTaper, tuck: s.shoulderTuck, tuckFrom: 0.5, tuckSpan: 0.4,
  });
  buildCabin(kit, spec, {
    outline: [[0.82, 0.67], [0.75, 0.75], [0.0, H - 0.02, 0.16], [-0.45, H, 0.24], [-1.65, 0.91, 0.05], [-1.55, 0.8]],
    baseY: 0.74, width: s.cabinWidth, tumble: s.cabinLean, glass: 'wrap', roofFront: 0, roofRear: -0.45,
  });
  headlamps(kit, 0.5, 0.86, 0.36, 0.43);
  kit.decal('front', 0.36, 0.8, 0.18, 0.31, 'grille', { cols: 2, offset: 0.01, mirror: true });
  kit.decal('front', -0.26, 0.26, 0.19, 0.3, 'grille', { cols: 2, offset: 0.01 });
  kit.box(0, 0.15, hl - 0.16, 1.5, 0.03, 0.26, 'trim');
  kit.decal('top', 0.2, 0.5, 1.05, 1.4, 'grille', { cols: 2, rows: 1, offset: 0.006, mirror: true });
  kit.decal('left', -0.88, -0.3, 0.4, 0.68, 'grille', { cols: 3, rows: 2, offset: 0.01, mirror: true });
  kit.decal('left', -0.95, -0.25, 0.7, 0.74, 'trim', { cols: 3, rows: 1, offset: 0.008, mirror: true });
  for (const z of [-0.95, -1.15, -1.35]) kit.decal('top', -0.42, 0.42, z - 0.04, z + 0.04, 'grille', { cols: 3, offset: 0.01 });
  kit.decal('rear', -0.7, 0.7, 0.5, 0.72, 'grille', { cols: 6, rows: 2, offset: 0.008 });
  kit.decal('rear', 0.04, 0.92, 0.77, 0.86, 'tailLens', { cols: 6, rows: 2, offset: 0.012, lamp: 'tail', mirror: true });
  kit.decal('rear', -0.07, 0.07, 0.52, 0.6, 'reverseLens', { cols: 1, offset: 0.014, lamp: 'reverse' });
  kit.decal('rear', -0.88, 0.88, 0.17, 0.34, 'trim', { cols: 4, offset: 0.008 });
  for (const x of [-0.5, -0.17, 0.17, 0.5]) kit.box(x, 0.25, -hl + 0.1, 0.025, 0.14, 0.26, 'trim');
  for (const x of [0.12, -0.12]) kit.tube([x, 0.42, -hl + 0.2], [x, 0.42, -hl - 0.04], 0.05, 'chrome', { segments: 8 });
  for (const side of [1, -1]) {
    kit.box(side * 0.55, 1.06, -hl + 0.3, 0.05, 0.26, 0.12, 'trim', { rx: -0.25 });
    kit.box(side * 0.94, 1.18, -hl + 0.2, 0.03, 0.14, 0.42, 'trim');
  }
  kit.profileShell([[-hl + 0.42, 1.2], [-hl + 0.3, 1.24], [-hl + 0.05, 1.23], [-hl + 0.0, 1.19], [-hl + 0.3, 1.18]], {
    width: 1.86, bevel: 0.012, bevelSegments: 1, part: 'trim', solid: false,
  });
  doorSeams(kit, [0.6, -0.26], 0.3, 0.72);
  sideMirrors(kit, 0.6, 0.8, { size: 0.9 });
}

/** Kestrel Corniche '72: a long open convertible with chrome bumpers, twin round lamps and tail fins. */
function buildKestrelCorniche(kit, spec) {
  const hl = spec.length / 2;
  const s = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: s.rideHeight,
    upper: [[hl - 0.1, 0.28], [hl, 0.45, 0.08], [hl - 0.01, 0.7, 0.06], [hl - 0.14, 0.82, 0.12], [0.6, 0.9],
      [-hl + 0.15, 0.9, 0.06], [-hl, 0.82, 0.06], [-hl + 0.01, 0.45, 0.06], [-hl + 0.1, 0.28]],
    noseTaper: s.noseTaper, tailTaper: s.tailTaper, tuck: s.shoulderTuck, tuckFrom: 0.74,
  });
  for (const side of [1, -1]) {
    kit.profileShell([[-0.9, 0.86], [-1.9, 0.98, 0.3], [-hl - 0.03, 1.1], [-hl - 0.02, 0.84]], {
      width: 0.14, bevel: 0.03, bevelSegments: 2, xOffset: side * 0.85, part: 'paint',
    });
  }
  kit.decal('top', -0.74, 0.74, -0.95, 0.5, 'interior', { cols: 2, rows: 2, offset: 0.006 });
  for (const side of [1, -1]) {
    kit.box(side * 0.36, 0.98, -0.12, 0.56, 0.14, 0.5, 'seat');
    kit.box(side * 0.36, 1.14, -0.4, 0.56, 0.42, 0.12, 'seat', { rx: -0.2 });
  }
  kit.box(0, 0.98, -0.74, 1.3, 0.14, 0.36, 'seat');
  kit.box(0, 1.1, -0.93, 1.3, 0.36, 0.1, 'seat', { rx: -0.15 });
  const wheel = new THREE.TorusGeometry(0.17, 0.018, 4, 12);
  const wheelMatrix = new THREE.Matrix4().compose(new THREE.Vector3(0.36, 1.12, 0.22), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, 0)), new THREE.Vector3(1, 1, 1));
  kit.addGeometry(wheel, (v) => v.applyMatrix4(wheelMatrix), 'trim');
  kit.box(0, 0.98, 0.45, 1.5, 0.12, 0.12, 'interior');
  kit.box(0, 1.125, 0.5, 1.52, 0.44, 0.02, 'glass', { rx: -0.45 });
  for (const side of [1, -1]) kit.tube([side * 0.78, 0.9, 0.6], [side * 0.78, 1.33, 0.4], 0.02, 'chrome');
  kit.tube([-0.78, 1.33, 0.4], [0.78, 1.33, 0.4], 0.02, 'chrome');
  for (const x of [0.7, 0.47]) {
    kit.disc('front', x, 0.67, 0.1, 0.1, 'chrome', { segments: 12, offset: 0.006, mirror: true });
    kit.disc('front', x, 0.67, 0.08, 0.08, 'headLens', { segments: 12, offset: 0.012, lamp: x > 0.6 ? 'head' : null, mirror: true });
  }
  kit.decal('front', -0.34, 0.34, 0.5, 0.74, 'chrome', { cols: 2, offset: 0.006 });
  kit.decal('front', -0.31, 0.31, 0.52, 0.72, 'grille', { cols: 2, offset: 0.01 });
  for (let i = -2; i <= 2; i += 1) kit.decal('front', i * 0.12 - 0.012, i * 0.12 + 0.012, 0.52, 0.72, 'chrome', { cols: 1, offset: 0.013 });
  kit.decal('rear', 0.79, 0.91, 0.93, 1.06, 'tailLens', { cols: 1, rows: 2, offset: 0.012, lamp: 'tail', mirror: true });
  kit.disc('rear', 0.45, 0.7, 0.04, 0.04, 'reverseLens', { segments: 8, offset: 0.012, lamp: 'reverse', mirror: true });
  kit.box(0, 0.4, hl + 0.03, spec.width - 0.06, 0.12, 0.16, 'chrome');
  kit.box(0, 0.4, -hl - 0.03, spec.width - 0.06, 0.12, 0.16, 'chrome');
  for (const side of [1, -1]) {
    kit.box(side * 0.92, 0.4, hl - 0.12, 0.1, 0.12, 0.3, 'chrome');
    kit.box(side * 0.92, 0.4, -hl + 0.12, 0.1, 0.12, 0.3, 'chrome');
  }
  kit.decal('left', -2.3, 2.25, 0.655, 0.685, 'chrome', { cols: 10, offset: 0.008, mirror: true });
  numberPlates(kit, 0.47, 0.5);
  doorSeams(kit, [0.55, -0.75], 0.38, 0.86);
  doorHandles(kit, [-0.6], 0.8);
  sideMirrors(kit, 0.42, 0.95, { size: 0.8, part: 'chrome' });
}

const MODEL_BUILDERS = {
  dromo_sandpiper: buildDromoSandpiper,
  varda_meridian: buildVardaMeridian,
  sarab_cab: buildSarabCab,
  pspd_interceptor: buildPspdInterceptor,
  kestrel_sirocco: buildKestrelSirocco,
  zephyr_mirage: buildZephyrMirage,
  kestrel_corniche: buildKestrelCorniche,
  ...WORKHORSE_BUILDERS,
};

/** Fallbacks for models added later: shaped by their class. */
const CLASS_BUILDERS = {
  compact: buildDromoSandpiper,
  sedan: buildVardaMeridian,
  taxi: buildSarabCab,
  police: buildPspdInterceptor,
  sports: buildKestrelSirocco,
  super: buildZephyrMirage,
  classic: buildKestrelCorniche,
  suv: WORKHORSE_BUILDERS.oryx_summit,
  pickup: WORKHORSE_BUILDERS.oryx_nomad,
  van: WORKHORSE_BUILDERS.sahel_caravan,
  truck: WORKHORSE_BUILDERS.sahel_hauler,
  bus: WORKHORSE_BUILDERS.sarab_metro_bus,
  buggy: WORKHORSE_BUILDERS.dune_jackal,
  policeSuv: WORKHORSE_BUILDERS.pspd_enforcer,
  armored: WORKHORSE_BUILDERS.aurum_bullion,
};
