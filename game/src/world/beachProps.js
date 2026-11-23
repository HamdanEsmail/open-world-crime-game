// The Corniche beach of Port Sarab: beach clubs with rows of parasols in alternating colours over
// pairs of loungers, a row of striped beach huts along the top of the sand, lifeguard towers by the
// water, volleyball nets and a kiosk by the pier, all on the dry sand between the promenade and the
// gulf. Parasols and loungers fly when a car tears along the beach; huts and towers stand firm.
import { createShapeBuilder, rgb } from './propShapes.js';
import { createPropRecord } from './propInstancing.js';
import { beachParasolRowAt, propBreaksUnderImpact } from './streetFurnitureRules.js';

const WHITE = rgb(0xf4f1ea);
const CREAM = rgb(0xfff4d6);
const TIMBER = rgb(0xa8784a);
const RED = rgb(0xd7263d);
const CLUB_COLOURS = [[0xe4572e, 0xfff4d6], [0x1ba39c, 0xfff4d6], [0xf2a516, 0x1ba39c], [0x3d4fa8, 0xfff4d6], [0xe0608a, 0xffd23f], [0x2f9e5a, 0xfff4d6]];
const HUT_TINTS = [0x1ba39c, 0xe4572e, 0xf2a516, 0x3d8fd1, 0xe0608a, 0x6fbf5a];
const KINDS = {
  parasol: { range: 340, shadow: true },
  lounger: { range: 190, shadow: false },
  beachHut: { range: 420, shadow: true },
  lifeguardTower: { range: 520, shadow: true },
  volleyballNet: { range: 220, shadow: false },
  beachKiosk: { range: 320, shadow: true },
};

/** Lay out the beach between x = -600 and x = 480, leaving the pier and the beach ramp clear. */
export function createBeachProps(game, kit, printed) {
  const rng = kit.rng('beach');
  const city = game.city;
  const terrain = game.terrain;
  const map = kit.map;
  const seaLevel = terrain ? terrain.seaLevel : -1;
  const top = city.coast.beachTopZ;
  const west = -600;
  const east = 480;
  const clear = [92, 236];
  const lists = {};
  for (const kind of Object.keys(KINDS)) lists[kind] = [];

  /** On the dry sand of the Corniche beach, away from the pier and the ramp. */
  const drySand = (x, z) => x > west && x < east && !(x > clear[0] && x < clear[1]) && z < top - 2 && z > city.coastZ(x) + 8
    && (!terrain || (terrain.heightAt(x, z) > seaLevel + 0.3 && terrain.surfaceAt(x, z) === 'beach'));

  placeKiosk(244, top - 8);
  for (const x of [-330, 288]) placeSolid('volleyballNet', x, top - 26, 0, 5.2, { posts: true });
  for (const x of [-470, -205, 30, 300, 445]) {
    const z = city.coastZ(x) + 13;
    if (drySand(x, z)) placeSolid('lifeguardTower', x, z, Math.PI, 2.2, { box: [1.4, 1.4], height: 4.6, color: 0xffffff });
  }
  // A row of beach huts in a few groups along the top of the sand.
  for (const start of [-575, -255, 300]) {
    for (let i = 0; i < 7; i += 1) placeSolid('beachHut', start + i * 3.6, top - 7.5, Math.PI, 1.65, { box: [1.3, 1.3], height: 3.4, color: HUT_TINTS[(i + Math.round(start)) % HUT_TINTS.length] });
  }
  // Beach clubs: stretches of parasol rows, each club in its own pair of colours.
  let x = west + 12;
  while (x < east - 15) {
    const length = rng.range(60, 110);
    const colours = rng.pick(CLUB_COLOURS);
    furnishClub(x, Math.min(east - 6, x + length), colours);
    x += length + rng.range(22, 42);
  }

  for (const kind of Object.keys(KINDS)) {
    kit.addSet({ name: kind, geometry: BEACH_BUILDERS[kind](), material: kit.materials.prop, records: lists[kind], maxRange: KINDS[kind].range, castShadow: KINDS[kind].shadow });
  }

  /** Rows of parasols every 6.5 m (staggered row to row), each shading two loungers facing the sea. */
  function furnishClub(x0, x1, colours) {
    for (let row = 0; row < 4; row += 1) {
      const z = beachParasolRowAt(top, row);
      for (let px = x0 + (row % 2) * 3.25; px < x1; px += 6.5) {
        if (!drySand(px, z) || !drySand(px, z - 2)) continue;
        if (!map.claim(px, z, 1.5)) continue;
        const y = terrain ? terrain.heightAt(px, z) : 0;
        const parasol = createPropRecord({ kind: 'parasol', x: px, y, z, yaw: rng.range(0, 1), pitch: rng.range(-0.05, 0.05), color: colours[Math.round((px - x0) / 6.5 + row) % 2], footprint: 0.15 });
        parasol.def = { fall: propBreaksUnderImpact('parasol'), height: 2.6, light: true };
        kit.addCollider(parasol, { type: 'post', x: px, z, radius: 0.12, y0: y, y1: y + 2.6, kind: 'parasol', breakable: true });
        lists.parasol.push(parasol);
        for (const side of [-1, 1]) {
          const lx = px + side * 0.85;
          const lz = z - 0.4;
          const ly = terrain ? terrain.heightAt(lx, lz) : 0;
          const lounger = createPropRecord({ kind: 'lounger', x: lx, y: ly, z: lz, yaw: Math.PI, color: colours[0], footprint: 0.32 });
          lounger.def = { fall: propBreaksUnderImpact('lounger'), height: 0.6, light: true };
          kit.addCollider(lounger, { type: 'box', minX: lx - 0.33, maxX: lx + 0.33, minZ: lz - 0.95, maxZ: lz + 0.95, y0: ly, y1: ly + 0.55, kind: 'lounger', breakable: true });
          lists.lounger.push(lounger);
        }
      }
    }
  }

  /** A solid beach structure facing `yaw` with a box or two posts for its collider. */
  function placeSolid(kind, px, pz, yaw, claim, options) {
    if (!drySand(px, pz) || !map.claim(px, pz, claim)) return null;
    const y = terrain ? terrain.heightAt(px, pz) : 0;
    const record = createPropRecord({ kind, x: px, y, z: pz, yaw, color: options.color, footprint: options.box ? Math.min(options.box[0], options.box[1]) : 0.15 });
    if (options.box) {
      kit.addCollider(record, { type: 'box', minX: px - options.box[0], maxX: px + options.box[0], minZ: pz - options.box[1], maxZ: pz + options.box[1], y0: y - 0.5, y1: y + options.height, kind });
    } else if (options.posts) {
      for (const side of [-1, 1]) kit.addCollider(record, { type: 'post', x: px + side * 4.6, z: pz, radius: 0.08, y0: y - 0.5, y1: y + 2.6, kind: 'pole' });
    }
    lists[kind].push(record);
    return record;
  }

  /** The kiosk by the pier, facing the promenade, with its painted board. */
  function placeKiosk(px, pz) {
    if (!map.claim(px, pz, 2.6)) return;
    const y = terrain ? terrain.heightAt(px, pz) : 0;
    const record = createPropRecord({ kind: 'beachKiosk', x: px, y, z: pz, yaw: 0, color: 0x1ba39c, footprint: 1.5 });
    kit.addCollider(record, { type: 'box', minX: px - 1.7, maxX: px + 1.7, minZ: pz - 1.4, maxZ: pz + 1.4, y0: y - 0.5, y1: y + 3.2, kind: 'kiosk' });
    if (printed) record.linked = [printed.addBoard('kiosk', px, y + 3.05, pz + 1.52, 0, 3.0, 0.75)];
    kit.addGlows(record, [{ x: px, y: y + 2.4, z: pz + 1.9, color: 0xfff0d0, size: 2.6 }]);
    lists.beachKiosk.push(record);
  }

  return { lists };
}

const BEACH_BUILDERS = {
  parasol: buildParasol,
  lounger: buildLounger,
  beachHut: buildBeachHut,
  lifeguardTower: buildLifeguardTower,
  volleyballNet: buildVolleyballNet,
  beachKiosk: buildBeachKiosk,
};

/** A beach parasol: a white pole and an eight-panel canopy in the copy's colour and cream. */
export function buildParasol() {
  const b = createShapeBuilder();
  b.cylinder(0.03, 0.035, 3.0, 5, { y: 1.1, color: WHITE });
  const peak = 2.75;
  const rim = 2.3;
  const radius = 1.45;
  const panels = 8;
  for (let i = 0; i < panels; i += 1) {
    const a0 = (i / panels) * Math.PI * 2;
    const a1 = ((i + 1) / panels) * Math.PI * 2;
    const tinted = i % 2 === 0;
    const vo = { color: tinted ? [1, 1, 1] : CREAM, tint: tinted ? 1 : 0, bend: 0.06 };
    const p = b.vertex(0, peak, 0, 0, 1, 0, 0.5, 1, vo);
    const c0 = b.vertex(Math.cos(a0) * radius, rim, -Math.sin(a0) * radius, Math.cos(a0) * 0.3, 1, -Math.sin(a0) * 0.3, 0, 0, vo);
    const c1 = b.vertex(Math.cos(a1) * radius, rim, -Math.sin(a1) * radius, Math.cos(a1) * 0.3, 1, -Math.sin(a1) * 0.3, 1, 0, vo);
    b.triangle(p, c0, c1);
    const under = { color: tinted ? [0.85, 0.85, 0.85] : shadeOf(CREAM, 0.85), tint: vo.tint, bend: 0.06 };
    const q = b.vertex(0, peak - 0.02, 0, 0, 1, 0, 0.5, 1, under);
    const d0 = b.vertex(Math.cos(a0) * radius, rim - 0.02, -Math.sin(a0) * radius, 0, 1, 0, 0, 0, under);
    const d1 = b.vertex(Math.cos(a1) * radius, rim - 0.02, -Math.sin(a1) * radius, 0, 1, 0, 1, 0, under);
    b.triangle(q, d1, d0);
    const flapTop = rim;
    const f0 = b.vertex(Math.cos(a0) * radius, flapTop, -Math.sin(a0) * radius, Math.cos(a0), 0, -Math.sin(a0), 0, 0, vo);
    const f1 = b.vertex(Math.cos(a1) * radius, flapTop, -Math.sin(a1) * radius, Math.cos(a1), 0, -Math.sin(a1), 1, 0, vo);
    const am = (a0 + a1) / 2;
    const f2 = b.vertex(Math.cos(am) * radius * 0.98, flapTop - 0.22, -Math.sin(am) * radius * 0.98, Math.cos(am), 0, -Math.sin(am), 0.5, 1, vo);
    b.triangle(f0, f2, f1);
    b.triangle(f0, f1, f2);
  }
  b.sphere(0.05, 5, 3, { y: peak + 0.04, color: WHITE });
  return b.build();
}

/** A sun lounger, feet toward +Z: white frame, raised back, cushion in the club colour. */
export function buildLounger() {
  const b = createShapeBuilder();
  b.box(0.62, 0.06, 1.35, { y: 0.32, z: 0.25, color: WHITE });
  b.box(0.58, 0.07, 1.3, { y: 0.38, z: 0.25, color: [1, 1, 1], tint: 1 });
  b.box(0.62, 0.06, 0.7, { y: 0.55, z: -0.68, rx: -0.55, color: WHITE });
  b.box(0.58, 0.07, 0.66, { y: 0.6, z: -0.66, rx: -0.55, color: [1, 1, 1], tint: 1 });
  for (const lx of [-0.27, 0.27]) {
    for (const lz of [-0.75, 0.82]) b.box(0.05, 0.42, 0.05, { x: lx, y: 0.1, z: lz, color: WHITE });
  }
  return b.build();
}

/** A striped beach hut with a pitched roof and a door, facing +Z. */
export function buildBeachHut() {
  const b = createShapeBuilder();
  b.box(2.5, 2.3, 2.4, { y: 0.95, color: WHITE });
  for (let i = 0; i < 6; i += 1) {
    const tinted = i % 2 === 0;
    b.box(0.42, 2.3, 0.04, { x: -1.05 + i * 0.42, y: 0.95, z: 1.21, color: tinted ? [1, 1, 1] : CREAM, tint: tinted ? 1 : 0 });
  }
  b.box(0.8, 1.7, 0.05, { y: 0.7, z: 1.25, color: TIMBER });
  for (const side of [-1, 1]) b.box(1.5, 0.08, 2.7, { x: side * 0.65, y: 2.45, rz: side * -0.55, color: [0.85, 0.85, 0.85], tint: 1 });
  b.box(2.7, 0.25, 0.6, { y: -0.1, z: 1.4, color: TIMBER });
  return b.build();
}

/** A lifeguard tower on stilts facing +Z (the sea): cabin, red roof, ramp and a red flag. */
export function buildLifeguardTower() {
  const b = createShapeBuilder();
  for (const x of [-1.0, 1.0]) for (const z of [-1.0, 1.0]) b.box(0.12, 2.6, 0.12, { x, y: 0.9, z, color: TIMBER });
  b.box(2.6, 0.14, 2.6, { y: 2.2, color: TIMBER });
  b.box(2.0, 1.5, 1.8, { y: 3.0, z: -0.2, color: WHITE });
  b.box(2.02, 0.3, 1.82, { y: 2.6, z: -0.2, color: RED });
  b.box(1.4, 0.6, 0.03, { y: 3.2, z: 0.71, color: rgb(0x2a4a5a) });
  b.cone(1.75, 0.8, 4, { y: 4.15, z: -0.2, ry: Math.PI / 4, color: RED });
  b.box(0.8, 0.08, 3.0, { y: 1.1, z: 2.2, rx: 0.78, color: TIMBER });
  b.cylinder(0.025, 0.025, 2.4, 4, { x: 1.2, y: 4.5, z: 1.1, color: WHITE });
  b.box(0.04, 0.5, 0.8, { x: 1.2, y: 5.4, z: 1.5, color: RED, bend: (x, y, z) => Math.max(0, z - 1.1) * 0.6 });
  return b.build();
}

/** A volleyball net 9 m wide between two posts. */
export function buildVolleyballNet() {
  const b = createShapeBuilder();
  for (const x of [-4.6, 4.6]) b.cylinder(0.05, 0.06, 3.1, 6, { x, y: 1.05, color: WHITE });
  b.box(9.0, 0.08, 0.03, { y: 2.43, color: WHITE });
  b.box(9.0, 0.02, 0.02, { y: 1.55, color: rgb(0x222222) });
  for (let x = -4.25; x <= 4.25; x += 0.7) b.box(0.015, 0.88, 0.015, { x, y: 1.99, color: rgb(0x2a2a2a) });
  for (const y of [1.8, 2.05, 2.28]) b.box(9.0, 0.015, 0.015, { y, color: rgb(0x2a2a2a) });
  return b.build();
}

/** The pier kiosk: a timber hut in the copy's colour, a striped awning over the counter, stools. */
export function buildBeachKiosk() {
  const b = createShapeBuilder();
  b.box(3.2, 2.6, 2.6, { y: 1.1, color: [1, 1, 1], tint: 1 });
  b.box(3.0, 1.0, 0.06, { y: 1.75, z: 1.31, color: rgb(0x2a2420) });
  b.box(3.4, 0.12, 0.7, { y: 1.05, z: 1.55, color: TIMBER });
  for (let i = 0; i < 6; i += 1) {
    const tinted = i % 2 === 0;
    b.box(0.6, 0.05, 1.4, { x: -1.5 + i * 0.6, y: 2.55, z: 1.85, rx: 0.32, color: tinted ? RED : CREAM });
  }
  b.box(3.4, 0.16, 2.8, { y: 2.48, color: WHITE });
  for (const x of [-1.0, 0, 1.0]) {
    b.cylinder(0.2, 0.2, 0.06, 8, { x, y: 0.75, z: 2.25, color: RED });
    b.cylinder(0.03, 0.03, 0.75, 4, { x, y: 0.37, z: 2.25, color: WHITE });
  }
  return b.build();
}

function shadeOf(color, k) {
  return [color[0] * k, color[1] * k, color[2] * k];
}
