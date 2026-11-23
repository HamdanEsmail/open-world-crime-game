// The street lamps of Port Sarab: slim double-arm lamps down the boulevard medians, single-arm lamps
// along the streets, ornate brass lanterns in Old Sarab, on Lantern Row and along the Corniche
// promenade, and tall mast lights over the docks. Every lamp registers its night glow, and all but the
// masts are breakable posts that fold when a car hits them.
import { createShapeBuilder, rgb } from './propShapes.js';
import { createPropRecord } from './propInstancing.js';
import { palmSpacingAlongRoad, lampStyleForDistrict, propBreaksUnderImpact } from './streetFurnitureRules.js';

const POLE = rgb(0xc9c6bd);
const POLE_DARK = rgb(0x8d877b);
const BRONZE = rgb(0x4a3a2a);
const BRASS = rgb(0xb08a3e);
const CONCRETE = rgb(0xb3aa98);
const GALVANISED = rgb(0x9aa0a4);
const LIGHT_PLATE = [1.0, 0.93, 0.76];
const LANTERN_GLASS = [1.0, 0.8, 0.46];

/** What each lamp kind is: how far it is drawn, its collider and fall, and where its lights sit. */
const LAMP_KINDS = {
  lampDouble: { range: 520, radius: 0.2, height: 10, footprint: 0.35, glows: [[-3.35, 9.7, 0], [3.35, 9.7, 0]], color: 0xffdcae, size: 3.4, shadow: true },
  lampSingle: { range: 420, radius: 0.16, height: 8.8, footprint: 0.3, glows: [[0, 8.45, 2.65]], color: 0xffd9a0, size: 3.1, shadow: true },
  lampLantern: { range: 320, radius: 0.18, height: 4.9, footprint: 0.3, glows: [[0, 4.2, 0]], color: 0xffb35c, size: 2.2, flicker: 0.06, shadow: false },
  lampLanternDouble: { range: 480, radius: 0.2, height: 5.2, footprint: 0.35, glows: [[-0.9, 3.85, 0], [0.9, 3.85, 0]], color: 0xffb35c, size: 2.3, flicker: 0.05, shadow: false },
  lampMast: { range: 1100, radius: 0.45, height: 21, footprint: 0.7, glows: [[0, 19.6, 0]], color: 0xfff0d8, size: 9, shadow: false },
};

/**
 * Place every lamp and make their sets. Medians get a lamp halfway between each pair of palms, so
 * palms and lamps alternate down the boulevards.
 */
export function createStreetLamps(game, kit) {
  const map = kit.map;
  const city = game.city;
  const lists = { lampDouble: [], lampSingle: [], lampLantern: [], lampLanternDouble: [], lampMast: [] };
  const point = { x: 0, z: 0, heading: 0 };

  const palmStep = palmSpacingAlongRoad('boulevard');
  for (const run of map.medianRuns) {
    const lantern = run.name === 'Lantern Row';
    const length = run.to - run.from;
    const count = Math.floor(length / palmStep);
    const start = run.from + (length - count * palmStep) / 2;
    for (let along = start + palmStep / 2; along < run.to - 2; along += palmStep * 2) {
      map.medianPoint(run, along, point);
      placeLamp(lantern ? 'lampLanternDouble' : 'lampDouble', point.x, point.z, run.alongX ? Math.PI / 2 : 0, 0.7);
    }
  }

  for (const run of map.sidewalkRuns) {
    const style = lampStyleForDistrict(run.district ? run.district.id : '', run.kind, run.name);
    if (!style) continue;
    if (run.name === 'The Corniche') {
      if (run.side < 0) lampsAlong(run, style, 13, 36, 0.9);
    } else if (run.name === 'Lantern Row') lampsAlong(run, style, run.side > 0 ? 21 : 6, 30, 0.8);
    else if (style === 'lampLantern') lampsAlong(run, style, run.side > 0 ? 15 : 3, 26, 0.7);
    else if (style === 'lampMast') {
      if (run.side > 0) lampsAlong(run, style, 20, 70, 1.6, 1.4);
    } else lampsAlong(run, style, run.side > 0 ? 18 : 2, 32, 0.65);
  }

  // Masts over the container yards and truck yards, and a row along the port quay.
  for (const lot of city.openLots) {
    if (lot.use !== 'containerYard' && lot.use !== 'truckYard') continue;
    for (const [fx, fz] of [[0, 0], [1, 1]]) {
      placeLamp('lampMast', lot.x0 + 3.5 + fx * (lot.x1 - lot.x0 - 7), lot.z0 + 3.5 + fz * (lot.z1 - lot.z0 - 7), 0, 1.5);
    }
  }
  const port = city.coast.port;
  for (let x = port.minX + 30; x < port.maxX - 20; x += 90) placeLamp('lampMast', x, city.coast.beachTopZ - 8, 0, 1.5);

  for (const kind of Object.keys(lists)) {
    const spec = LAMP_KINDS[kind];
    kit.addSet({ name: kind, geometry: LAMP_BUILDERS[kind](), material: kit.materials.prop, records: lists[kind], maxRange: spec.range, castShadow: spec.shadow });
  }

  /** Lamps every `spacing` metres along a sidewalk run, starting `phase` in, `offset` from the kerb. */
  function lampsAlong(run, kind, phase, spacing, offset, claimRadius = 0.6) {
    for (let along = run.from + phase; along <= run.to - 1; along += spacing) {
      if (map.inSpan(run, along, 1.5)) continue;
      map.runPoint(run, along, offset, point);
      placeLamp(kind, point.x, point.z, point.heading, claimRadius);
    }
  }

  /** One lamp: claims its ground, gets its collider and its glows. */
  function placeLamp(kind, x, z, yaw, claimRadius) {
    if (!map.claim(x, z, claimRadius)) return null;
    const spec = LAMP_KINDS[kind];
    const y = kit.ground(x, z);
    const record = createPropRecord({ kind, x, y, z, yaw, footprint: spec.footprint });
    const fall = propBreaksUnderImpact(kind);
    record.def = { fall, height: spec.height };
    kit.addCollider(record, { type: 'post', x, z, radius: spec.radius, y0: y, y1: y + spec.height, kind: 'lamp', breakable: fall !== 'solid' });
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    kit.addGlows(record, spec.glows.map(([lx, ly, lz]) => ({
      x: x + lx * cos + lz * sin, y: y + ly, z: z - lx * sin + lz * cos, color: spec.color, size: spec.size, flicker: spec.flicker || 0,
    })));
    lists[kind].push(record);
    return record;
  }

  return { lists, kinds: LAMP_KINDS };
}

const LAMP_BUILDERS = {
  lampDouble: buildDoubleArmLamp,
  lampSingle: buildSingleArmLamp,
  lampLantern: buildLanternLamp,
  lampLanternDouble: buildDoubleLanternLamp,
  lampMast: buildDockMastLight,
};

/** A slim pale pole with two swept arms and flat luminaires, for the boulevard medians (about 10 m). */
export function buildDoubleArmLamp() {
  const b = createShapeBuilder();
  b.cylinder(0.26, 0.32, 0.8, 6, { y: 0.15, color: CONCRETE });
  b.cylinder(0.1, 0.15, 9.2, 6, { y: 0.55 + 4.6, color: POLE, open: true });
  b.cylinder(0.16, 0.16, 0.3, 6, { y: 2.4, color: BRASS, open: true });
  for (const side of [-1, 1]) {
    b.tube([[0, 9.35, 0], [side * 1.2, 9.95, 0], [side * 3.0, 10.05, 0]], 0.065, 4, { color: POLE });
    b.box(1.15, 0.16, 0.42, { x: side * 3.35, y: 9.98, color: POLE_DARK });
    b.box(0.98, 0.04, 0.32, { x: side * 3.35, y: 9.88, color: LIGHT_PLATE, glow: 1 });
  }
  b.cone(0.13, 0.35, 6, { y: 9.92, color: POLE });
  return b.build();
}

/** A street lamp at the kerb with one arm reaching over the road (+Z is the road side), about 8.8 m. */
export function buildSingleArmLamp() {
  const b = createShapeBuilder();
  b.cylinder(0.2, 0.26, 0.7, 6, { y: 0.1, color: CONCRETE });
  b.cylinder(0.08, 0.13, 8.0, 6, { y: 0.45 + 4.0, color: POLE, open: true });
  b.tube([[0, 8.2, 0], [0, 8.7, 0.6], [0, 8.85, 1.7], [0, 8.8, 2.3]], 0.055, 4, { color: POLE });
  b.box(0.44, 0.17, 1.05, { y: 8.77, z: 2.65, color: POLE_DARK });
  b.box(0.34, 0.04, 0.88, { y: 8.67, z: 2.65, color: LIGHT_PLATE, glow: 1 });
  return b.build();
}

/** An ornate brass lantern on a slender fluted post, about 4.9 m: Old Sarab, Lantern Row and the promenade. */
export function buildLanternLamp() {
  const b = createShapeBuilder();
  b.cylinder(0.26, 0.34, 0.55, 6, { y: 0.02, color: BRONZE });
  b.cylinder(0.17, 0.24, 0.35, 6, { y: 0.45, color: BRONZE, open: true });
  b.cylinder(0.065, 0.085, 3.2, 5, { y: 2.2, color: BRONZE, open: true });
  b.cylinder(0.12, 0.1, 0.14, 6, { y: 1.3, color: BRASS, open: true });
  b.cylinder(0.1, 0.13, 0.16, 6, { y: 3.78, color: BRASS, open: true });
  addLanternHead(b, 0, 4.2, 0);
  return b.build();
}

/** Lantern Row's median lamp: a post with a curled crossbar and two lanterns hanging from it. */
export function buildDoubleLanternLamp() {
  const b = createShapeBuilder();
  b.cylinder(0.28, 0.36, 0.6, 6, { y: 0.05, color: BRONZE });
  b.cylinder(0.075, 0.1, 4.2, 5, { y: 2.45, color: BRONZE, open: true });
  b.cylinder(0.12, 0.1, 0.14, 6, { y: 1.4, color: BRASS, open: true });
  b.tube([[-1.0, 4.35, 0], [-0.55, 4.6, 0], [0, 4.55, 0], [0.55, 4.6, 0], [1.0, 4.35, 0]], 0.045, 4, { color: BRONZE });
  b.cone(0.09, 0.22, 5, { y: 4.75, color: BRASS });
  for (const side of [-1, 1]) {
    b.cylinder(0.012, 0.012, 0.25, 3, { x: side * 0.9, y: 4.25, color: BRONZE, open: true });
    addLanternHead(b, side * 0.9, 3.85, 0, 0.85);
  }
  return b.build();
}

/** A glowing six-sided lantern on a brass base under a domed cap with a finial. */
function addLanternHead(b, x, y, z, scale = 1) {
  const s = scale;
  b.cylinder(0.2 * s, 0.16 * s, 0.56 * s, 6, { x, y, z, color: LANTERN_GLASS, glow: 1, open: true });
  b.cylinder(0.15 * s, 0.2 * s, 0.07 * s, 6, { x, y: y - 0.31 * s, z, color: BRASS });
  b.cone(0.3 * s, 0.3 * s, 6, { x, y: y + 0.43 * s, z, color: BRONZE });
  b.cone(0.05 * s, 0.18 * s, 4, { x, y: y + 0.66 * s, z, color: BRASS });
}

/** A 21 m galvanised mast with four floodlights, for the docks and the port quay. */
export function buildDockMastLight() {
  const b = createShapeBuilder();
  b.cylinder(0.62, 0.72, 1.1, 6, { y: 0.3, color: CONCRETE });
  b.cylinder(0.16, 0.34, 19.2, 6, { y: 0.85 + 9.6, color: GALVANISED, open: true });
  b.box(3.0, 0.16, 0.16, { y: 20.3, color: GALVANISED });
  for (const side of [-1, 1]) {
    b.box(0.9, 0.5, 0.75, { x: side * 1.3, y: 20.0, rz: side * 0.45, color: GALVANISED });
    b.box(0.8, 0.05, 0.64, { x: side * 1.38, y: 19.74, rz: side * 0.45, color: LIGHT_PLATE, glow: 1 });
  }
  return b.build();
}
