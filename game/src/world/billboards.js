// Billboards of Port Sarab: big double-sided roadside boards on steel legs along Dune Parkway, the
// desert highways and the back lots of Southgate, tall pole signs at the car lots, and advert banners
// in the bus shelters, all printed from one atlas of invented brands and lit after dark.
import { createShapeBuilder, createPrintedPanelGeometry, rgb } from './propShapes.js';
import { createPropRecord } from './propInstancing.js';
import { ADVERTS, paintAdvertAtlas } from './billboardArt.js';

const BOARD_W = 12;
const BOARD_H = 3;
const BOARD_Y = 7.8;
const TOTEM_W = 5;
const TOTEM_H = 1.25;
const TOTEM_Y = 8.3;
const STEEL = rgb(0x4a4f56);
const FRAME = rgb(0xeee6d4);

/**
 * Paint the advert atlas and make the board kinds. place() puts up the roadside boards; other systems
 * add banners with addAdvert(); finish() makes the sets.
 */
export function createBillboards(game, kit) {
  const rng = kit.rng('billboards');
  const city = game.city;
  const map = kit.map;
  const atlas = paintAdvertAtlas(game.renderer);
  const faceMaterial = kit.materials.createPrintedFaceMaterial(atlas.texture, 0.75);
  const boards = [];
  const totems = [];
  const faces = [];
  let lastAd = -1;

  /** An advert face: centre (x, y, z), facing `yaw`, w x h metres, advert index (or a fresh pick). */
  function addAdvert(x, y, z, yaw, w, h, index = pickAdvert(), range = 1500) {
    const record = createPropRecord({ kind: 'advert', x, y, z, yaw, sx: w, sy: h, sz: 1, range, footprint: 0, attrs: { uvRect: atlas.slots[index % atlas.slots.length] } });
    faces.push(record);
    return record;
  }

  /** A big two-legged board facing `yaw` (both faces printed), its legs on the ground. */
  function addBoard(x, z, yaw, options = {}) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const legX = 3.8;
    if (!map.isFree(x + legX * cos, z - legX * sin, 1.2) || !map.isFree(x - legX * cos, z + legX * sin, 1.2) || !map.isFree(x, z, 2.5)) return null;
    map.take(x, z, BOARD_W / 2 + 0.5);
    const y = Math.min(kit.ground(x + legX * cos, z - legX * sin), kit.ground(x - legX * cos, z + legX * sin));
    const record = createPropRecord({ kind: 'billboard', x, y, z, yaw, range: options.range || 1500, footprint: 0.4 });
    for (const side of [-1, 1]) {
      const lx = side * legX;
      kit.addCollider(record, { type: 'post', x: x + lx * cos, z: z - lx * sin, radius: 0.35, y0: y - 0.5, y1: y + BOARD_Y + 2, kind: 'signpost' });
    }
    const front = addAdvert(x + 0.17 * sin, y + BOARD_Y, z + 0.17 * cos, yaw, BOARD_W, BOARD_H, options.ad, options.range);
    const back = addAdvert(x - 0.17 * sin, y + BOARD_Y, z - 0.17 * cos, yaw + Math.PI, BOARD_W, BOARD_H, undefined, options.range);
    record.linked = [front, back];
    kit.addGlows(record, [{ x: x + 1.3 * sin, y: y + BOARD_Y + 2.2, z: z + 1.3 * cos, color: 0xf4f0ff, size: 5.5 }]);
    boards.push(record);
    return record;
  }

  /** A tall pole sign (car lots, roadside diners). */
  function addTotem(x, z, yaw, ad) {
    if (!map.claim(x, z, 1.0)) return null;
    const y = kit.ground(x, z);
    const record = createPropRecord({ kind: 'totemSign', x, y, z, yaw, range: 900, footprint: 0.35 });
    kit.addCollider(record, { type: 'post', x, z, radius: 0.32, y0: y, y1: y + TOTEM_Y + 1, kind: 'signpost' });
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    record.linked = [
      addAdvert(x + 0.17 * sin, y + TOTEM_Y, z + 0.17 * cos, yaw, TOTEM_W, TOTEM_H, ad, 900),
      addAdvert(x - 0.17 * sin, y + TOTEM_Y, z - 0.17 * cos, yaw + Math.PI, TOTEM_W, TOTEM_H, ad, 900),
    ];
    totems.push(record);
    return record;
  }

  /** The roadside boards: Southgate lots, along Dune Parkway, by the desert highways and at the gate. */
  function place() {
    for (const lot of city.openLots) {
      if (lot.district !== 'southgate') continue;
      if (lot.use !== 'parking' && lot.use !== 'carLot' && lot.use !== 'truckYard') continue;
      const block = city.blocks[lot.block];
      if (!block) continue;
      const spot = lotFrontage(lot, block.lot);
      if (!spot) continue;
      if (lot.use === 'carLot') addTotem(spot.cornerX, spot.cornerZ, spot.yaw, rng.pick([1, 12, 8]));
      else if (rng.chance(0.65)) addBoard(spot.x, spot.z, spot.yaw + rng.range(-0.15, 0.15), { range: 1100 });
    }
    const parkway = city.streets[city.streets.length - 1];
    const setback = city.roadKinds[parkway.kind].width / 2 + map.sidewalk + 10;
    for (let x = city.urban.minX + 60; x < city.urban.maxX - 40; x += rng.range(120, 170)) {
      addBoard(x, parkway.z + setback, Math.PI + rng.sign() * rng.range(0.25, 0.45));
    }
    for (const road of city.desertRoads) {
      if (road.kind !== 'highway') continue;
      const half = city.roadKinds[road.kind].width / 2;
      let side = 1;
      for (let i = 0; i < road.points.length - 1; i += 1) {
        const [ax, az] = road.points[i];
        const [bx, bz] = road.points[i + 1];
        const length = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / length;
        const dz = (bz - az) / length;
        for (let s = 90; s < length - 60; s += rng.range(240, 330)) {
          side = -side;
          const off = half + 13;
          const x = ax + dx * s - dz * side * off;
          const z = az + dz * s + dx * side * off;
          const facing = Math.atan2(-dx, -dz) + side * 0.45;
          addBoard(x, z, facing);
        }
      }
    }
  }

  /** Where a lot meets its road: the middle of that edge (3 m in) and a front corner, facing out. */
  function lotFrontage(lot, blockLot) {
    const inset = 3;
    switch (lot.front) {
      case 'n': if (lot.z0 - blockLot.z0 > 2) return null;
        return { x: (lot.x0 + lot.x1) / 2, z: lot.z0 + inset, yaw: Math.PI, cornerX: lot.x0 + inset, cornerZ: lot.z0 + inset };
      case 's': if (blockLot.z1 - lot.z1 > 2) return null;
        return { x: (lot.x0 + lot.x1) / 2, z: lot.z1 - inset, yaw: 0, cornerX: lot.x1 - inset, cornerZ: lot.z1 - inset };
      case 'w': if (lot.x0 - blockLot.x0 > 2) return null;
        return { x: lot.x0 + inset, z: (lot.z0 + lot.z1) / 2, yaw: -Math.PI / 2, cornerX: lot.x0 + inset, cornerZ: lot.z1 - inset };
      case 'e': if (blockLot.x1 - lot.x1 > 2) return null;
        return { x: lot.x1 - inset, z: (lot.z0 + lot.z1) / 2, yaw: Math.PI / 2, cornerX: lot.x1 - inset, cornerZ: lot.z0 + inset };
      default: return null;
    }
  }

  /** A different advert from the last one put up. */
  function pickAdvert() {
    let index = rng.int(0, ADVERTS.length - 1);
    if (index === lastAd) index = (index + 1) % ADVERTS.length;
    lastAd = index;
    return index;
  }

  function finish() {
    kit.addSet({ name: 'billboard', geometry: buildRoadsideBillboard(), material: kit.materials.prop, records: boards, maxRange: 1500, castShadow: true });
    kit.addSet({ name: 'totemSign', geometry: buildTotemSign(), material: kit.materials.prop, records: totems, maxRange: 900 });
    kit.addSet({ name: 'advert', geometry: createPrintedPanelGeometry(), material: faceMaterial, records: faces, maxRange: 1500, attributes: [{ name: 'uvRect', size: 4 }] });
  }

  return { atlas, boards, totems, faces, addAdvert, addBoard, addTotem, place, finish, adverts: ADVERTS };
}

/** A 12 x 3 m double-sided board on two steel legs with a catwalk and three lamps over each face. */
export function buildRoadsideBillboard() {
  const b = createShapeBuilder();
  for (const side of [-1, 1]) {
    b.box(0.4, BOARD_Y + 0.6, 0.4, { x: side * 3.8, y: (BOARD_Y - 0.6) / 2, color: STEEL });
    b.box(0.6, 0.5, 0.6, { x: side * 3.8, y: -0.1, color: rgb(0xa89e8c) });
  }
  b.box(BOARD_W + 0.5, BOARD_H + 0.5, 0.3, { y: BOARD_Y, color: FRAME });
  b.box(BOARD_W, 0.08, 1.0, { y: BOARD_Y - BOARD_H / 2 - 0.45, z: 0.55, color: STEEL });
  b.box(BOARD_W, 0.4, 0.04, { y: BOARD_Y - BOARD_H / 2 - 0.25, z: 1.05, color: STEEL });
  for (const x of [-4, 0, 4]) {
    b.box(0.06, 0.06, 1.1, { x, y: BOARD_Y + BOARD_H / 2 + 0.35, z: 0.55, color: STEEL });
    b.box(0.5, 0.16, 0.24, { x, y: BOARD_Y + BOARD_H / 2 + 0.3, z: 1.1, rx: 0.5, color: STEEL });
    b.box(0.42, 0.03, 0.18, { x, y: BOARD_Y + BOARD_H / 2 + 0.22, z: 1.12, rx: 0.5, color: [1, 0.96, 0.86], glow: 1 });
  }
  return b.build();
}

/** A tall pole sign with a 5 x 1.25 m panel. */
export function buildTotemSign() {
  const b = createShapeBuilder();
  b.cylinder(0.26, 0.32, TOTEM_Y, 8, { y: TOTEM_Y / 2 - 0.3, color: STEEL });
  b.box(TOTEM_W + 0.4, TOTEM_H + 0.4, 0.3, { y: TOTEM_Y, color: FRAME });
  b.box(TOTEM_W + 0.6, 0.18, 0.4, { y: TOTEM_Y + TOTEM_H / 2 + 0.28, color: rgb(0xe4572e) });
  return b.build();
}
