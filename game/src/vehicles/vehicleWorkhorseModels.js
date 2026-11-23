// The sculpted models of Port Sarab's big and rugged vehicles: the upright Oryx Summit SUV and its PSPD
// Enforcer sibling, the Oryx Nomad pickup with an open bed, the tall Sahel Caravan van, the Sahel Hauler
// cab-and-box truck, the Sarab Metro bus, the Dune Jackal buggy and the Aurum bullion carrier.
import {
  buildLowerBody, buildCabin, headlamps, taillamps, reverseLamps, numberPlates, doorSeams, doorHandles,
  sideStrip, sideMirrors, policeLightBar, pushBar,
} from './vehicleBodyParts.js';
import { bodyStyleForClass } from './vehicleBodyStyles.js';

/** Oryx Summit: a tall, square-shouldered luxury SUV with black arch flares and roof rails. */
function buildOryxSummit(kit, spec, { roofDrop = 0 } = {}) {
  const hl = spec.length / 2;
  const roofY = spec.height - roofDrop;
  const s = spec.wheelRadius / 0.4;
  const belt = 1.18 * s;
  const style = bodyStyleForClass(spec.className);
  const { archRadius } = buildLowerBody(kit, spec, {
    clear: style.rideHeight * s, archGap: 0.07,
    upper: [[hl - 0.1, 0.4 * s], [hl, 0.6 * s, 0.1], [hl - 0.02, 0.95 * s, 0.08], [hl - 0.2, 1.08 * s, 0.14], [1.25, belt],
      [-hl + 0.25, belt + 0.04], [-hl + 0.05, belt + 0.02, 0.08], [-hl, 0.9 * s, 0.08], [-hl + 0.02, 0.55 * s, 0.08], [-hl + 0.1, 0.4 * s]],
    noseTaper: style.noseTaper, taperStart: 0.62, tailTaper: style.tailTaper, tuck: style.shoulderTuck, tuckFrom: belt - 0.18,
  });
  const roofFront = 0.55;
  const roofRear = -hl + 0.45;
  buildCabin(kit, spec, {
    outline: [[1.3, belt - 0.08], [1.25, belt + 0.01], [roofFront, roofY - 0.03, 0.16], [roofRear, roofY, 0.14], [-hl + 0.2, belt + 0.05, 0.05], [-hl + 0.25, belt - 0.06]],
    baseY: belt, roofY, width: style.cabinWidth, tumble: style.cabinLean, glass: 'wrap', roofFront, roofRear,
  });
  for (const z of [spec.wheelbase / 2, -spec.wheelbase / 2]) kit.archFlare(z, spec.wheelRadius, archRadius, { width: 0.09, standout: 0.04 });
  sideStrip(kit, -spec.wheelbase / 2 + archRadius + 0.06, spec.wheelbase / 2 - archRadius - 0.06, 0.47 * s, 0.62 * s);
  headlamps(kit, 0.52, 0.88, 0.86 * s, 0.98 * s);
  kit.decal('front', -0.5, 0.5, 0.6 * s, 0.94 * s, 'grille', { cols: 2, rows: 2, offset: 0.01 });
  for (const y of [0.7, 0.8, 0.9]) kit.decal('front', -0.5, 0.5, y * s - 0.012, y * s + 0.012, 'chrome', { cols: 2, offset: 0.013 });
  kit.decal('front', -0.62, 0.62, 0.42 * s, 0.53 * s, 'chrome', { cols: 3, offset: 0.008 });
  taillamps(kit, 0.62, 0.92, 0.9 * s, 1.12 * s, { rows: 2 });
  reverseLamps(kit, 0.62, 0.92, 0.82 * s, 0.89 * s);
  kit.decal('rear', -0.9, 0.9, 0.42 * s, 0.56 * s, 'trim', { cols: 4, offset: 0.008 });
  numberPlates(kit, 0.54 * s, 0.62 * s);
  doorSeams(kit, [1.15, -0.25, -1.45], 0.5 * s, belt - 0.04);
  doorHandles(kit, [0.0, -1.2], belt - 0.1);
  sideMirrors(kit, 1.12, belt + 0.06);
  for (const side of [1, -1]) {
    kit.tube([side * 0.74, roofY + 0.07, roofRear + 0.15], [side * 0.74, roofY + 0.07, roofFront - 0.12], 0.025, 'chrome');
    kit.box(side * 0.74, roofY + 0.035, roofRear + 0.18, 0.05, 0.07, 0.1, 'trim');
    kit.box(side * 0.74, roofY + 0.035, roofFront - 0.15, 0.05, 0.07, 0.1, 'trim');
    kit.box(side * (spec.width / 2 - 0.05), 0.44 * s, -0.05, 0.16, 0.05, spec.wheelbase - 2 * archRadius - 0.2, 'trim');
  }
}

/** PSPD Enforcer: the Summit in graphite livery with a light bar, a heavy push bar and spot lamps. */
function buildPspdEnforcer(kit, spec) {
  const hl = spec.length / 2;
  buildOryxSummit(kit, spec, { roofDrop: 0.07 });
  policeLightBar(kit, 0.0, 1.3);
  pushBar(kit, hl, 0.38, 1.0, 0.5);
  for (const side of [1, -1]) kit.box(side * 0.86, 1.36, 1.18, 0.09, 0.09, 0.12, 'chrome');
}

/** Oryx Nomad: a crew-less work pickup with an open bed, high stance and a roof lamp bar. */
function buildOryxNomad(kit, spec) {
  const hl = spec.length / 2;
  const H = spec.height;
  const W = spec.width;
  const floor = 0.92;
  const rail = 1.2;
  const style = bodyStyleForClass(spec.className);
  const { archRadius } = buildLowerBody(kit, spec, {
    clear: style.rideHeight, archGap: 0.07,
    upper: [[hl - 0.1, 0.42], [hl, 0.62, 0.1], [hl - 0.02, 0.98, 0.08], [hl - 0.2, 1.08, 0.14], [1.2, 1.16],
      [-0.64, 1.16], [-0.66, floor], [-hl + 0.06, floor], [-hl, 0.88, 0.04], [-hl, 0.55, 0.06], [-hl + 0.1, 0.42]],
    noseTaper: style.noseTaper, taperStart: 0.62, tailTaper: style.tailTaper, tuck: style.shoulderTuck, tuckFrom: 1.2,
  });
  buildCabin(kit, spec, {
    outline: [[1.25, 1.08], [1.2, 1.17], [0.5, H - 0.03, 0.14], [-0.5, H, 0.1], [-0.62, 1.17], [-0.58, 1.08]],
    baseY: 1.16, width: style.cabinWidth, tumble: style.cabinLean, glass: 'wrap', roofFront: 0.5, roofRear: -0.5,
  });
  const bedLength = hl - 0.7;
  const bedCentre = -(0.66 + hl - 0.04) / 2;
  for (const side of [1, -1]) {
    kit.profileShell([[-0.66, floor], [-0.66, rail], [-hl + 0.04, rail], [-hl + 0.04, floor]], {
      width: 0.1, bevel: 0.02, bevelSegments: 2, xOffset: side * (W / 2 - 0.06), part: 'paint',
    });
    kit.box(side * (W / 2 - 0.06), rail + 0.01, bedCentre, 0.12, 0.02, bedLength + 0.04, 'trim');
  }
  kit.box(0, (floor + rail) / 2, -hl + 0.06, W - 0.24, rail - floor, 0.06, 'paint');
  kit.decal('top', -0.82, 0.82, -hl + 0.12, -0.72, 'bedLiner', { cols: 2, rows: 2, offset: 0.006 });
  for (const z of [-1.0, -1.5, -2.0]) kit.decal('top', -0.82, 0.82, z - 0.03, z + 0.03, 'trim', { cols: 2, offset: 0.01 });
  for (const z of [spec.wheelbase / 2, -spec.wheelbase / 2]) kit.archFlare(z, spec.wheelRadius, archRadius, { width: 0.1, standout: 0.05 });
  headlamps(kit, 0.5, 0.86, 0.85, 0.98);
  kit.decal('front', -0.52, 0.52, 0.6, 0.96, 'grille', { cols: 2, rows: 2, offset: 0.01 });
  for (const x of [-0.26, 0, 0.26]) kit.decal('front', x - 0.015, x + 0.015, 0.6, 0.96, 'chrome', { cols: 1, offset: 0.013 });
  kit.box(0, 0.5, hl + 0.02, W - 0.04, 0.18, 0.2, 'trim');
  kit.box(0, 0.5, -hl - 0.03, W - 0.1, 0.12, 0.2, 'chrome');
  kit.decal('rear', W / 2 - 0.13, W / 2 - 0.02, 0.96, 1.17, 'tailLens', { cols: 1, rows: 2, offset: 0.012, lamp: 'tail', mirror: true });
  kit.decal('rear', W / 2 - 0.13, W / 2 - 0.02, 0.6, 0.68, 'reverseLens', { cols: 1, rows: 1, offset: 0.012, lamp: 'reverse', mirror: true });
  numberPlates(kit, null, 0.66);
  doorSeams(kit, [1.12, -0.55], 0.5, 1.12);
  doorHandles(kit, [-0.32], 1.04);
  sideMirrors(kit, 1.08, 1.24);
  kit.box(0, H + 0.05, 0.35, 1.2, 0.06, 0.1, 'trim');
  for (const x of [-0.42, -0.14, 0.14, 0.42]) kit.box(x, H + 0.11, 0.37, 0.16, 0.1, 0.06, 'headLens');
}

/** Sahel Caravan: a tall one-box delivery van with a short sloped nose and twin rear doors. */
function buildSahelCaravan(kit, spec) {
  const hl = spec.length / 2;
  const H = spec.height;
  const style = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: style.rideHeight,
    upper: [[hl - 0.1, 0.32], [hl, 0.5, 0.1], [hl - 0.02, 0.85, 0.08], [hl - 0.25, 1.0, 0.15], [1.75, 1.12],
      [-hl + 0.04, 1.12], [-hl, 1.08, 0.04], [-hl, 0.5, 0.06], [-hl + 0.1, 0.32]],
    noseTaper: style.noseTaper, taperStart: 0.6, tailTaper: style.tailTaper, tuck: style.shoulderTuck, tuckFrom: 1.0,
  });
  buildCabin(kit, spec, {
    outline: [[1.8, 1.04], [1.75, 1.13], [1.05, H - 0.06, 0.22], [-hl + 0.12, H, 0.12], [-hl + 0.01, H - 0.12, 0.08], [-hl + 0.01, 1.13], [-hl + 0.06, 1.04]],
    baseY: 1.12, width: style.cabinWidth, tumble: style.cabinLean, glass: 'panel', roofFront: 1.05, roofRear: -hl + 0.12,
  });
  kit.decal('left', 0.42, 1.18, 1.3, 1.9, 'glass', { cols: 2, rows: 2, offset: 0.008, mirror: true });
  kit.decal('rear', 0.08, 0.84, 1.35, 1.95, 'glass', { cols: 2, rows: 2, offset: 0.008, mirror: true });
  kit.decal('rear', -0.008, 0.008, 0.5, 2.06, 'trim', { cols: 1, rows: 3, offset: 0.01 });
  doorSeams(kit, [1.62, 0.36, -0.26, -1.45], 0.45, 1.95);
  doorHandles(kit, [0.22, -0.4], 1.06);
  sideStrip(kit, -hl + 0.1, hl - 0.4, 0.93, 1.0);
  sideStrip(kit, -1.12, 1.12, 0.39, 0.5);
  headlamps(kit, 0.5, 0.88, 0.78, 0.9);
  kit.decal('front', -0.5, 0.5, 0.55, 0.78, 'grille', { cols: 2, offset: 0.01 });
  kit.decal('front', -0.95, 0.95, 0.33, 0.5, 'trim', { cols: 4, offset: 0.008 });
  kit.decal('rear', 0.82, 0.96, 0.62, 1.1, 'tailLens', { cols: 1, rows: 3, offset: 0.012, lamp: 'tail', mirror: true });
  kit.decal('rear', 0.82, 0.96, 0.52, 0.6, 'reverseLens', { cols: 1, rows: 1, offset: 0.012, lamp: 'reverse', mirror: true });
  kit.decal('rear', -0.95, 0.95, 0.33, 0.47, 'trim', { cols: 4, offset: 0.008 });
  numberPlates(kit, 0.36, 0.56);
  sideMirrors(kit, 1.58, 1.3, { size: 1.3, part: 'trim' });
}

/** Sahel Hauler: a cab-over box truck with a wind deflector, a fuel tank and a cream cargo box. */
function buildSahelHauler(kit, spec) {
  const hl = spec.length / 2;
  const H = spec.height;
  const W = spec.width;
  const cabBack = 1.6;
  const style = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: style.rideHeight, archGap: 0.08,
    upper: [[hl - 0.08, 0.45], [hl, 0.68, 0.1], [hl - 0.02, 1.35, 0.1], [hl - 0.12, 1.42], [cabBack, 1.42], [cabBack, 0.5]],
    noseTaper: style.noseTaper, taperStart: 0.85, tailTaper: style.tailTaper, tuck: style.shoulderTuck, tuckFrom: 2,
  });
  buildCabin(kit, spec, {
    outline: [[hl - 0.06, 1.34], [hl - 0.12, 1.43], [hl - 0.3, 2.62, 0.12], [cabBack + 0.06, 2.78, 0.12], [cabBack + 0.02, 1.43], [cabBack + 0.06, 1.34]],
    baseY: 1.42, roofY: 2.78, width: style.cabinWidth, tumble: style.cabinLean, glass: 'panel', roofFront: hl - 0.3, roofRear: cabBack + 0.06,
  });
  kit.profileShell([[hl - 0.62, 2.74], [cabBack + 0.12, H - 0.06, 0.15], [cabBack + 0.06, 2.74]], { width: W * 0.92, bevel: 0.05, part: 'paint' });
  kit.profileShell([[1.5, 1.12], [1.5, H], [-hl, H], [-hl, 1.12]], {
    width: W, bevel: 0.05, bevelSegments: 2, part: 'cream', classify: (c, n) => (n.y < -0.6 ? 'under' : 'cream'),
  });
  kit.decal('left', -hl + 0.12, 1.38, 1.3, 1.62, 'paint', { cols: 4, offset: 0.006, mirror: true });
  kit.decal('left', -hl + 0.12, 1.38, 1.7, 1.76, 'paint', { cols: 4, offset: 0.006, mirror: true });
  kit.decal('rear', -0.008, 0.008, 1.2, H - 0.08, 'trim', { cols: 1, rows: 2, offset: 0.008 });
  for (const x of [0.32, -0.32]) kit.tube([x, 1.25, -hl - 0.03], [x, H - 0.15, -hl - 0.03], 0.025, 'chrome');
  kit.decal('rear', 0.82, 1.1, 1.2, 1.36, 'tailLens', { cols: 2, offset: 0.012, lamp: 'tail', mirror: true });
  kit.decal('rear', 0.6, 0.76, 1.2, 1.3, 'reverseLens', { cols: 1, offset: 0.012, lamp: 'reverse', mirror: true });
  kit.box(0, 0.8, -1.0, 0.95, 0.32, 5.0, 'under');
  for (const side of [1, -1]) {
    kit.box(side * spec.track / 2, 1.06, -spec.wheelbase / 2, 0.44, 0.05, 1.3, 'trim');
    kit.box(side * spec.track / 2, 0.55, -spec.wheelbase / 2 - 0.72, 0.42, 0.46, 0.02, 'trim');
    kit.box(side * (W / 2 - 0.08), 0.62, -0.55, 0.04, 0.1, 2.3, 'chrome');
    kit.box(side * (W / 2 - 0.1), 0.78, hl - 0.85, 0.24, 0.05, 0.4, 'trim');
  }
  kit.tube([0.85, 0.75, 0.15], [0.85, 0.75, 1.3], 0.24, 'chrome', { segments: 8 });
  kit.decal('front', -0.82, 0.82, 0.78, 1.3, 'grille', { cols: 2, rows: 2, offset: 0.01 });
  for (const y of [0.92, 1.06, 1.2]) kit.decal('front', -0.82, 0.82, y - 0.014, y + 0.014, 'chrome', { cols: 2, offset: 0.013 });
  headlamps(kit, 0.86, 1.12, 0.78, 0.94, { cols: 2 });
  kit.box(0, 0.55, hl + 0.03, W, 0.26, 0.22, 'trim');
  kit.decal('left', 2.62, 3.45, 1.78, 2.45, 'glass', { cols: 2, rows: 2, offset: 0.008, mirror: true });
  doorSeams(kit, [2.5, 3.58], 0.8, 2.5);
  doorHandles(kit, [2.78], 1.62);
  for (const x of [-0.6, 0, 0.6]) kit.box(x, 2.8, hl - 0.4, 0.12, 0.05, 0.06, 'amberLens');
  for (const side of [1, -1]) {
    kit.tube([side * (W / 2 - 0.02), 2.3, hl - 0.25], [side * (W / 2 + 0.18), 2.25, hl - 0.15], 0.02, 'trim');
    kit.box(side * (W / 2 + 0.2), 2.08, hl - 0.15, 0.06, 0.42, 0.16, 'trim');
  }
}

/** Sarab Metro bus: a long low-floor city bus with a deep window band, lit destination sign and roof pod. */
function buildSarabMetroBus(kit, spec) {
  const hl = spec.length / 2;
  const H = spec.height;
  const style = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: style.rideHeight, archGap: 0.07, bevel: 0.14,
    upper: [[hl - 0.1, 0.3], [hl, 0.5, 0.12], [hl - 0.02, 1.1, 0.1], [hl - 0.1, 2.9, 0.3], [hl - 0.3, H, 0.3],
      [-hl + 0.2, H, 0.3], [-hl, 2.9, 0.2], [-hl, 0.5, 0.12], [-hl + 0.1, 0.3]],
    noseTaper: style.noseTaper, taperStart: 0.8, tailTaper: style.tailTaper, tuck: style.shoulderTuck, tuckFrom: 2.7, tuckSpan: 0.4,
  });
  const doors = [[4.42, 5.22], [-0.62, 0.48]];
  const panes = [];
  for (let z = -5.12; z + 1.0 < 4.5; z += 1.2) panes.push([z, z + 1.08]);
  for (const [z0, z1] of panes) {
    kit.decal('left', z0, z1, 1.5, 2.72, 'glass', { cols: 1, rows: 1, offset: 0.008 });
    const blocked = doors.some(([d0, d1]) => z1 > d0 - 0.05 && z0 < d1 + 0.05);
    if (!blocked) kit.decal('right', z0, z1, 1.5, 2.72, 'glass', { cols: 1, rows: 1, offset: 0.008 });
  }
  kit.decal('left', 4.62, 5.3, 1.5, 2.72, 'glass', { cols: 1, rows: 1, offset: 0.008 });
  for (const [d0, d1] of doors) {
    kit.decal('right', d0 - 0.05, d1 + 0.05, 0.42, 2.78, 'trim', { cols: 1, rows: 2, offset: 0.005 });
    kit.decal('right', d0, (d0 + d1) / 2 - 0.02, 0.48, 2.72, 'glass', { cols: 1, rows: 2, offset: 0.009 });
    kit.decal('right', (d0 + d1) / 2 + 0.02, d1, 0.48, 2.72, 'glass', { cols: 1, rows: 2, offset: 0.009 });
  }
  kit.decal('front', -1.04, 1.04, 1.05, 2.62, 'glass', { cols: 4, rows: 4, offset: 0.01 });
  kit.decal('front', -0.85, 0.85, 2.68, 2.86, 'signLamp', { cols: 4, rows: 1, offset: 0.012, lamp: 'sign' });
  headlamps(kit, 0.8, 1.15, 0.55, 0.75, { cols: 2 });
  kit.decal('front', -0.62, 0.62, 0.42, 0.62, 'grille', { cols: 2, offset: 0.01 });
  kit.decal('front', -1.26, 1.26, 0.3, 0.41, 'trim', { cols: 4, offset: 0.008 });
  kit.decal('rear', -1.0, 1.0, 2.0, 2.8, 'glass', { cols: 2, rows: 2, offset: 0.01 });
  kit.decal('rear', -0.9, 0.9, 0.62, 1.3, 'grille', { cols: 2, rows: 2, offset: 0.01 });
  kit.decal('rear', 0.95, 1.16, 0.75, 1.25, 'tailLens', { cols: 1, rows: 2, offset: 0.012, lamp: 'tail', mirror: true });
  kit.decal('rear', 0.95, 1.16, 0.62, 0.7, 'reverseLens', { cols: 1, rows: 1, offset: 0.012, lamp: 'reverse', mirror: true });
  kit.decal('rear', -1.26, 1.26, 0.3, 0.42, 'trim', { cols: 4, offset: 0.008 });
  numberPlates(kit, null, 0.46);
  kit.profileShell([[1.6, H - 0.05], [1.5, H + 0.22, 0.1], [-1.2, H + 0.22, 0.1], [-1.3, H - 0.05]], { width: 1.7, bevel: 0.08, part: 'cream' });
  for (const side of [1, -1]) {
    kit.tube([side * 1.18, 2.62, hl - 0.12], [side * 1.42, 2.7, hl + 0.16], 0.025, 'trim');
    kit.box(side * 1.45, 2.46, hl + 0.16, 0.06, 0.42, 0.18, 'trim');
  }
}

/** Dune Jackal: an open-frame desert buggy, a narrow tub inside a roll cage on fat exposed tyres. */
function buildDuneJackal(kit, spec) {
  const hl = spec.length / 2;
  const style = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: style.rideHeight, noArches: true, bodyWidth: 1.1, bevel: 0.06,
    upper: [[hl - 0.1, 0.34], [hl, 0.48, 0.06], [hl - 0.45, 0.68, 0.1], [0.5, 0.86, 0.06], [-0.6, 0.86], [-0.72, 0.98, 0.04],
      [-hl + 0.15, 0.98, 0.05], [-hl + 0.02, 0.84, 0.05], [-hl + 0.04, 0.4], [-hl + 0.16, 0.32]],
    noseTaper: style.noseTaper, taperStart: 0.3, tailTaper: style.tailTaper, tuck: style.shoulderTuck, tuckFrom: 0.7,
  });
  kit.decal('top', -0.42, 0.42, -0.55, 0.42, 'interior', { cols: 2, rows: 2, offset: 0.006 });
  for (const side of [1, -1]) {
    kit.box(side * 0.24, 0.93, -0.15, 0.42, 0.1, 0.45, 'seat');
    kit.box(side * 0.24, 1.16, -0.44, 0.42, 0.55, 0.1, 'seat', { rx: -0.18 });
  }
  const r = 0.035;
  for (const side of [1, -1]) {
    const x = side * 0.5;
    kit.tube([x, 0.86, 0.42], [side * 0.46, 1.48, 0.12], r, 'trim');
    kit.tube([side * 0.52, 0.9, -0.62], [side * 0.48, 1.5, -0.55], r, 'trim');
    kit.tube([side * 0.46, 1.48, 0.12], [side * 0.48, 1.5, -0.55], r, 'trim');
    kit.tube([side * 0.48, 1.5, -0.55], [side * 0.42, 0.98, -1.42], r, 'trim');
    kit.tube([x, 0.86, 0.42], [side * 0.34, 0.6, hl - 0.3], r, 'trim');
    kit.tube([side * 0.62, 0.45, 0.72], [side * 0.62, 0.45, -0.8], 0.03, 'chrome');
    kit.tube([side * 0.62, 0.45, 0.72], [side * 0.5, 0.5, 0.88], 0.03, 'chrome');
    kit.tube([side * 0.62, 0.45, -0.8], [side * 0.5, 0.5, -0.95], 0.03, 'chrome');
    kit.box(side * 0.75, 2 * spec.wheelRadius + 0.06, spec.wheelbase / 2, 0.4, 0.03, 0.62, 'trim', { rx: 0.08 });
    kit.box(side * 0.75, 2 * spec.wheelRadius + 0.08, -spec.wheelbase / 2, 0.4, 0.03, 0.7, 'trim', { rx: -0.08 });
  }
  kit.tube([-0.46, 1.48, 0.12], [0.46, 1.48, 0.12], r, 'trim');
  kit.tube([-0.48, 1.5, -0.55], [0.48, 1.5, -0.55], r, 'trim');
  kit.tube([-0.48, 1.5, -0.55], [0.52, 0.9, -0.62], r, 'trim');
  kit.tube([-0.58, 0.42, hl + 0.04], [0.58, 0.42, hl + 0.04], 0.04, 'chrome');
  for (const side of [1, -1]) kit.tube([side * 0.45, 0.42, hl + 0.04], [side * 0.38, 0.58, hl - 0.25], 0.03, 'chrome');
  kit.box(0, 1.57, 0.1, 0.92, 0.07, 0.1, 'trim');
  for (const x of [-0.33, -0.11, 0.11, 0.33]) kit.box(x, 1.57, 0.16, 0.15, 0.09, 0.03, 'headLens');
  kit.lamp('head', 0.22, 1.57, 0.2, 0, 0, 1);
  kit.lamp('head', -0.22, 1.57, 0.2, 0, 0, 1);
  kit.disc('front', 0.3, 0.56, 0.07, 0.07, 'headLens', { segments: 10, offset: 0.012, mirror: true });
  kit.box(0, 1.12, -1.05, 0.72, 0.28, 0.55, 'trim');
  kit.box(0, 1.3, -1.0, 0.3, 0.1, 0.3, 'chrome');
  for (const x of [0.2, -0.2]) kit.tube([x, 1.0, -1.3], [x * 1.2, 1.08, -hl - 0.12], 0.045, 'chrome', { segments: 8 });
  kit.disc('rear', 0.4, 0.72, 0.05, 0.05, 'tailLens', { segments: 8, offset: 0.012, lamp: 'tail', mirror: true });
  kit.disc('rear', 0.25, 0.72, 0.035, 0.035, 'reverseLens', { segments: 8, offset: 0.012, lamp: 'reverse', mirror: true });
}

/** Aurum bullion carrier: an armoured slab-sided cash truck with slit windows, rivets and a roof beacon. */
function buildAurumBullion(kit, spec) {
  const hl = spec.length / 2;
  const H = spec.height;
  const W = spec.width;
  const style = bodyStyleForClass(spec.className);
  buildLowerBody(kit, spec, {
    clear: style.rideHeight, archGap: 0.08, bevel: 0.12, bevelSegments: 1,
    upper: [[hl - 0.1, 0.5], [hl, 0.7, 0.06], [hl, 1.3, 0.06], [hl - 0.18, 1.42], [2.45, 1.48], [2.05, 2.42, 0.06], [1.62, 2.48],
      [1.55, 2.48], [1.5, H - 0.02], [-hl + 0.05, H, 0.06], [-hl, H - 0.1], [-hl, 0.7, 0.06], [-hl + 0.1, 0.5]],
    noseTaper: style.noseTaper, taperStart: 0.75, tailTaper: style.tailTaper, tuck: style.shoulderTuck, tuckFrom: 1.65, tuckSpan: 1.0,
  });
  kit.decal('front', 0.06, 0.92, 1.72, 2.18, 'glass', { cols: 2, rows: 2, offset: 0.01, mirror: true });
  kit.decal('left', 1.7, 2.25, 1.95, 2.25, 'glass', { cols: 2, offset: 0.01, mirror: true });
  for (const z of [-0.75, -2.25]) kit.decal('left', z - 0.16, z + 0.16, 2.0, 2.08, 'glass', { cols: 1, offset: 0.01, mirror: true });
  doorSeams(kit, [1.45, 2.4, -0.15, -1.6], 0.72, 2.8);
  for (const y of [0.86, 2.7]) {
    for (let z = -3.05; z <= 1.3; z += 0.44) {
      const hit = kit.raycast(50, y, z, -1, 0, 0);
      if (!hit) continue;
      for (const side of [1, -1]) kit.box(side * (hit.x + 0.015), y, z, 0.04, 0.05, 0.05, 'chrome');
    }
  }
  kit.decal('rear', -0.008, 0.008, 0.72, H - 0.12, 'trim', { cols: 1, rows: 2, offset: 0.01 });
  kit.decal('rear', 0.3, 0.7, 2.2, 2.34, 'glass', { cols: 1, offset: 0.01, mirror: true });
  for (const side of [1, -1]) {
    for (const y of [1.0, 2.3]) kit.box(side * (W / 2 - 0.16), y, -hl - 0.02, 0.12, 0.1, 0.05, 'chrome');
  }
  kit.decal('rear', 0.88, 1.1, 0.8, 1.05, 'tailLens', { cols: 1, rows: 2, offset: 0.012, lamp: 'tail', mirror: true });
  kit.decal('rear', 0.88, 1.1, 0.71, 0.79, 'reverseLens', { cols: 1, offset: 0.012, lamp: 'reverse', mirror: true });
  headlamps(kit, 0.72, 1.04, 1.0, 1.16, { cols: 2 });
  kit.decal('front', -0.6, 0.6, 0.85, 1.3, 'grille', { cols: 2, rows: 2, offset: 0.01 });
  kit.box(0, 0.62, hl + 0.08, W - 0.1, 0.24, 0.2, 'trim');
  for (const x of [0.5, -0.5]) kit.box(x, 0.95, hl + 0.1, 0.1, 0.5, 0.08, 'trim');
  kit.box(0, H + 0.02, 1.0, 0.36, 0.04, 0.36, 'trim');
  kit.box(0, H + 0.11, 1.0, 0.22, 0.15, 0.22, 'amberLens');
  kit.lamp('amber', 0, H + 0.12, 1.0, 0, 1, 0);
  numberPlates(kit, null, 0.75);
  sideMirrors(kit, 2.3, 1.95, { size: 1.4, part: 'trim' });
}

/** The builders of this file by catalogue id. */
export const WORKHORSE_BUILDERS = {
  oryx_summit: buildOryxSummit,
  pspd_enforcer: buildPspdEnforcer,
  oryx_nomad: buildOryxNomad,
  sahel_caravan: buildSahelCaravan,
  sahel_hauler: buildSahelHauler,
  sarab_metro_bus: buildSarabMetroBus,
  dune_jackal: buildDuneJackal,
  aurum_bullion: buildAurumBullion,
};
