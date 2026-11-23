// The souk of Old Sarab, the most colourful corner of Port Sarab: striped awnings stretched across the
// narrow lanes between the old walls, strings of coloured lanterns, crates, sacks and pots along the
// walls, rugs on rails, and rows of stalls in the market lots, the courtyards, around the Sundial
// Tower and filling the Grand Souk's great square. Stalls and crates break when a car ploughs through.
import { createPropRecord } from './propInstancing.js';
import {
  buildLaneAwning, buildMarketStall, buildLaneGoods, buildRugRail, buildCanopyPole, buildLanternCable,
  buildHangingLantern,
} from './marketStallModels.js';

/** Awning colours: coral, saffron, teal, indigo, pomegranate, leaf green, rose. */
const AWNING_TINTS = [0xe4572e, 0xf2a516, 0x1ba39c, 0x3d4fa8, 0xb3243a, 0x4f9a3a, 0xe0608a];
const LANTERN_TINTS = [0xffb347, 0xff5a3c, 0x2ec4b6, 0x9b5de5, 0xffd23f, 0x3ddc84, 0xff70a6];
const STALL_GOODS = ['fruit', 'spice', 'brass'];
const STALL_SIZE = { halfX: 1.55, halfZ: 1.2 };
const LANTERN_GLOW_EVERY = 3;

/**
 * Dress Old Sarab. `printed` hangs the rugs and the stall boards. Everything is placed now and the
 * sets are made at once.
 */
export function createMarketStalls(game, kit, printed) {
  const rng = kit.rng('souk');
  const city = game.city;
  const map = kit.map;
  const lists = { awning: [], stallFruit: [], stallSpice: [], stallBrass: [], laneGoods: [], rugRail: [], canopyPole: [], lanternCable: [], hangingLantern: [] };
  let lanternCount = 0;

  for (const block of city.blocks) {
    if (block.district !== 'oldsarab' || block.special) continue;
    for (const lane of findLanes(block.buildings)) dressLane(lane);
  }
  for (const lot of city.openLots) {
    if (lot.district !== 'oldsarab') continue;
    if (lot.use === 'marketStalls') fillStallLot(lot, 0.85);
    else if (lot.use === 'courtyard') fillStallLot(lot, 0.35);
    else if (lot.use === 'marketSquare') fillGrandSoukSquare(lot);
    else if (lot.use === 'sundialSquare') ringTheSundial(lot);
  }

  const prop = kit.materials.prop;
  kit.addSet({ name: 'awning', geometry: buildLaneAwning(), material: prop, records: lists.awning, maxRange: 230, castShadow: true });
  kit.addSet({ name: 'stallFruit', geometry: buildMarketStall('fruit'), material: prop, records: lists.stallFruit, maxRange: 170, castShadow: true });
  kit.addSet({ name: 'stallSpice', geometry: buildMarketStall('spice'), material: prop, records: lists.stallSpice, maxRange: 170, castShadow: true });
  kit.addSet({ name: 'stallBrass', geometry: buildMarketStall('brass'), material: prop, records: lists.stallBrass, maxRange: 170, castShadow: true });
  kit.addSet({ name: 'laneGoods', geometry: buildLaneGoods(), material: prop, records: lists.laneGoods, maxRange: 110 });
  kit.addSet({ name: 'rugRail', geometry: buildRugRail(), material: prop, records: lists.rugRail, maxRange: 130 });
  kit.addSet({ name: 'canopyPole', geometry: buildCanopyPole(), material: prop, records: lists.canopyPole, maxRange: 170 });
  kit.addSet({ name: 'lanternCable', geometry: buildLanternCable(), material: prop, records: lists.lanternCable, maxRange: 170 });
  kit.addSet({ name: 'hangingLantern', geometry: buildHangingLantern(), material: prop, records: lists.hangingLantern, maxRange: 180 });

  /** The lanes of a block: pairs of neighbouring buildings with a 2.5 to 11 m gap and a long shared side. */
  function findLanes(buildings) {
    const lanes = [];
    for (let i = 0; i < buildings.length; i += 1) {
      for (let j = i + 1; j < buildings.length; j += 1) {
        const a = bounds(buildings[i]);
        const b = bounds(buildings[j]);
        const height = Math.min(buildings[i].h, buildings[j].h);
        const left = a.x0 < b.x0 ? a : b;
        const right = left === a ? b : a;
        const gapX = right.x0 - left.x1;
        const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (gapX > 2.5 && gapX < 11 && overlapZ > 5) {
          lanes.push({ alongZ: true, center: (left.x1 + right.x0) / 2, width: gapX, from: Math.max(a.z0, b.z0) + 1, to: Math.min(a.z1, b.z1) - 1, height });
        }
        const near = a.z0 < b.z0 ? a : b;
        const far = near === a ? b : a;
        const gapZ = far.z0 - near.z1;
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        if (gapZ > 2.5 && gapZ < 11 && overlapX > 5) {
          lanes.push({ alongZ: false, center: (near.z1 + far.z0) / 2, width: gapZ, from: Math.max(a.x0, b.x0) + 1, to: Math.min(a.x1, b.x1) - 1, height });
        }
      }
    }
    return lanes;
  }

  /** Awnings and lantern strings overhead, goods and rugs against the walls. */
  function dressLane(lane) {
    const span = lane.width + 0.3;
    const yaw = lane.alongZ ? 0 : Math.PI / 2;
    const at = (along, across) => (lane.alongZ ? { x: lane.center + across, z: along } : { x: along, z: lane.center + across });
    const awningTop = Math.min(lane.height - 0.6, 4.7);
    if (awningTop > 3.3) {
      for (let along = lane.from + 2; along < lane.to - 1.5; along += rng.range(5.5, 8)) {
        if (!rng.chance(0.72)) continue;
        const p = at(along, 0);
        lists.awning.push(createPropRecord({ kind: 'awning', x: p.x, y: kit.ground(p.x, p.z) + rng.range(3.3, awningTop), z: p.z, yaw, sx: span, sy: 1, sz: 1, color: rng.pick(AWNING_TINTS), footprint: 0 }));
      }
    }
    if (lane.height > 6 && rng.chance(0.45)) {
      for (let along = lane.from + 4; along < lane.to - 3; along += rng.range(10, 15)) {
        const p = at(along, 0);
        hangLanternString(p.x, p.z, yaw, span, kit.ground(p.x, p.z) + Math.min(lane.height - 0.4, 5.4));
      }
    }
    const wallGap = 0.6;
    for (let along = lane.from + 2; along < lane.to - 2; along += rng.range(4.5, 7)) {
      const side = rng.sign();
      const across = side * (lane.width / 2 - wallGap);
      const p = at(along, across);
      const facing = lane.alongZ ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
      const roll = rng.next();
      if (roll < 0.45) placeGoods(p.x, p.z, facing);
      else if (roll < 0.62 && lane.width > 4.5) hangRugs(p.x, p.z, facing, lane);
    }
  }

  /** A string of 5 to 7 lanterns across a gap `span` wide at height `y`, centred on (x, z). */
  function hangLanternString(x, z, yaw, span, y) {
    lists.lanternCable.push(createPropRecord({ kind: 'lanternCable', x, y, z, yaw, sx: span, sy: 1, sz: 1, footprint: 0 }));
    const count = Math.max(3, Math.round(span / 1.3));
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (let i = 0; i < count; i += 1) {
      const u = (i + 0.5) / count;
      const lx = (u - 0.5) * span;
      const sagY = -0.45 * (1 - (2 * u - 1) * (2 * u - 1));
      const lantern = createPropRecord({ kind: 'hangingLantern', x: x + lx * cos, y: y + sagY, z: z - lx * sin, yaw: rng.range(0, 6.28), scale: rng.range(0.9, 1.2), color: rng.pick(LANTERN_TINTS), footprint: 0 });
      lists.hangingLantern.push(lantern);
      lanternCount += 1;
      if (lanternCount % LANTERN_GLOW_EVERY === 0) {
        kit.addGlows(lantern, [{ x: lantern.x, y: lantern.y - 0.33, z: lantern.z, color: 0xffa64a, size: 1.6, flicker: 0.12 }]);
      }
    }
  }

  /** A breakable heap of crates, sacks and pots against a wall (it lies along the wall, 3.2 m long). */
  function placeGoods(x, z, facing) {
    const alongX = Math.abs(Math.cos(facing)) > 0.5;
    const hx = alongX ? 1.7 : 0.45;
    const hz = alongX ? 0.45 : 1.7;
    for (const k of [-1, 0, 1]) {
      if (!map.isFree(x + (alongX ? k * 1.2 : 0), z + (alongX ? 0 : k * 1.2), 0.5)) return null;
    }
    for (const k of [-1, 0, 1]) map.take(x + (alongX ? k * 1.2 : 0), z + (alongX ? 0 : k * 1.2), 0.5);
    const y = kit.ground(x, z);
    const record = createPropRecord({ kind: 'laneGoods', x, y, z, yaw: facing, footprint: 0.45 });
    record.def = { fall: 'fly', height: 0.9 };
    kit.addCollider(record, { type: 'box', minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, y0: y, y1: y + 0.9, kind: 'crate', breakable: true });
    lists.laneGoods.push(record);
    return record;
  }

  /** A rail of rugs hung flat against a lane wall. */
  function hangRugs(x, z, facing, lane) {
    if (!printed || lane.height < 3.6) return;
    const back = 0.5;
    const wx = x + Math.sin(facing) * -back;
    const wz = z + Math.cos(facing) * -back;
    const y = kit.ground(wx, wz);
    const rail = createPropRecord({ kind: 'rugRail', x: wx, y, z: wz, yaw: facing, footprint: 0 });
    lists.rugRail.push(rail);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    rail.linked = [];
    for (const lx of [-1.3, 0, 1.3]) {
      if (!rng.chance(0.8)) continue;
      const rx = wx + lx * cos + 0.26 * sin;
      const rz = wz - lx * sin + 0.26 * cos;
      rail.linked.push(printed.addRug(rng.int(0, 3), rx, y + 2.0, rz, facing, 1.15, 1.75));
    }
  }

  /** One stall facing `yaw` with its canopy in `color`; a board above some of them. */
  function placeStall(x, z, yaw, color, goods = rng.pick(STALL_GOODS)) {
    const quarter = Math.abs(Math.sin(yaw)) > 0.7;
    const hx = quarter ? STALL_SIZE.halfZ : STALL_SIZE.halfX;
    const hz = quarter ? STALL_SIZE.halfX : STALL_SIZE.halfZ;
    if (!map.isFree(x - hx * 0.55, z - hz * 0.55, 0.9) || !map.isFree(x + hx * 0.55, z + hz * 0.55, 0.9)) return null;
    map.take(x, z, Math.max(hx, hz));
    const y = kit.ground(x, z);
    const kind = goods === 'fruit' ? 'stallFruit' : goods === 'spice' ? 'stallSpice' : 'stallBrass';
    const record = createPropRecord({ kind, x, y, z, yaw, color, footprint: 1.0 });
    record.def = { fall: 'fly', height: 2.6, heavy: true };
    kit.addCollider(record, { type: 'box', minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, y0: y, y1: y + 2.7, kind: 'stall', breakable: true });
    if (printed && rng.chance(0.3)) {
      const board = goods === 'fruit' ? 'fruit' : goods === 'spice' ? rng.pick(['spices', 'tea', 'sweets']) : rng.pick(['copper', 'rugs', 'juice']);
      const fx = x + Math.sin(yaw) * 1.33;
      const fz = z + Math.cos(yaw) * 1.33;
      record.linked = [printed.addBoard(board, fx, y + 2.33, fz, yaw, 2.2, 0.55)];
    }
    lists[kind].push(record);
    if (goods === 'brass') {
      kit.addGlows(record, [{ x: x + Math.cos(yaw) * 0.9 + Math.sin(yaw) * 0.6, y: y + 2.05, z: z - Math.sin(yaw) * 0.9 + Math.cos(yaw) * 0.6, color: 0xffb35c, size: 1.6, flicker: 0.1 }]);
    }
    return record;
  }

  /** Two facing rows of stalls down the long axis of a lot, an awning or two over the aisle. */
  function fillStallLot(lot, density) {
    const w = lot.x1 - lot.x0;
    const d = lot.z1 - lot.z0;
    const alongX = w >= d;
    const length = alongX ? w : d;
    const width = alongX ? d : w;
    if (width < 10) return;
    const rowOffset = Math.min(width / 2 - 1.6, 5.5);
    const center = alongX ? (lot.z0 + lot.z1) / 2 : (lot.x0 + lot.x1) / 2;
    const color = rng.pick(AWNING_TINTS);
    for (const side of [-1, 1]) {
      for (let s = 2.5; s < length - 2.5; s += 3.4) {
        if (!rng.chance(density)) continue;
        const along = (alongX ? lot.x0 : lot.z0) + s;
        const across = center + side * rowOffset;
        const x = alongX ? along : across;
        const z = alongX ? across : along;
        const yaw = alongX ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        placeStall(x, z, yaw, rng.chance(0.5) ? color : rng.pick(AWNING_TINTS));
      }
    }
    const aisle = rowOffset * 2 - 1.4;
    for (let s = 4; s < length - 4; s += rng.range(6, 9)) {
      const along = (alongX ? lot.x0 : lot.z0) + s;
      const x = alongX ? along : center;
      const z = alongX ? center : along;
      if (rng.chance(0.6)) {
        lists.awning.push(createPropRecord({ kind: 'awning', x, y: kit.ground(x, z) + 3.3, z, yaw: alongX ? Math.PI / 2 : 0, sx: aisle + 1.6, color: rng.pick(AWNING_TINTS), footprint: 0 }));
      } else {
        hangLanternString(x, z, alongX ? Math.PI / 2 : 0, aisle + 1.2, kit.ground(x, z) + 4.3);
      }
    }
  }

  /**
   * The Grand Souk: twelve rows of stalls, back to back in pairs, facing each other across aisles
   * roofed with awnings and strung with lanterns, around a clear centre where four palms stand.
   */
  function fillGrandSoukSquare(lot) {
    const cx = (lot.x0 + lot.x1) / 2;
    const cz = (lot.z0 + lot.z1) / 2;
    const rows = [];
    let z = lot.z0 + 3;
    rows.push({ z, facing: 0 });
    for (let k = 0; k < 5; k += 1) {
      z += 9;
      rows.push({ z, facing: Math.PI });
      if (z + 2.4 < lot.z1 - 2) rows.push({ z: z + 2.4, facing: 0 });
      z += 2.4;
    }
    rows.push({ z: lot.z1 - 3, facing: Math.PI });
    for (const row of rows) {
      if (row.z > lot.z1 - 2.5) continue;
      for (let x = lot.x0 + 5; x < lot.x1 - 4; x += 3.5) {
        if (Math.abs(x - cx) < 13 && Math.abs(row.z - cz) < 12) continue;
        if (!rng.chance(0.82)) continue;
        placeStall(x, row.z, row.facing, rng.pick(AWNING_TINTS));
      }
    }
    // Aisles: between each row facing south and the next row facing north.
    for (let i = 0; i < rows.length - 1; i += 1) {
      if (rows[i].facing !== 0 || rows[i + 1].facing !== Math.PI) continue;
      const z0 = rows[i].z + 1.2;
      const z1 = rows[i + 1].z - 1.2;
      const az = (z0 + z1) / 2;
      const span = z1 - z0 + 2.2;
      for (let x = lot.x0 + 6; x < lot.x1 - 5; x += 4.6) {
        if (Math.abs(x - cx) < 14 && Math.abs(az - cz) < 13) continue;
        if (rng.chance(0.7)) lists.awning.push(createPropRecord({ kind: 'awning', x, y: kit.ground(x, az) + 3.35, z: az, yaw: Math.PI / 2, sx: span, color: rng.pick(AWNING_TINTS), footprint: 0 }));
      }
      for (let x = lot.x0 + 8; x < lot.x1 - 6; x += 13) {
        if (Math.abs(x - cx) < 14 && Math.abs(az - cz) < 13) continue;
        for (const pz of [z0 - 0.05, z1 + 0.05]) {
          if (map.claim(x, pz, 0.3)) {
            const pole = createPropRecord({ kind: 'canopyPole', x, y: kit.ground(x, pz), z: pz, footprint: 0.1 });
            kit.addCollider(pole, { type: 'post', x, z: pz, radius: 0.1, y0: pole.y, y1: pole.y + 5, kind: 'pole' });
            lists.canopyPole.push(pole);
          }
        }
        hangLanternString(x, az, Math.PI / 2, z1 - z0 + 0.1, kit.ground(x, az) + 4.85);
      }
    }
    // Strings of lanterns across the open centre, pole to pole.
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = cx + sx * 12;
      const pz = cz + sz * 10;
      if (map.claim(px, pz, 0.3)) {
        const pole = createPropRecord({ kind: 'canopyPole', x: px, y: kit.ground(px, pz), z: pz, footprint: 0.1 });
        kit.addCollider(pole, { type: 'post', x: px, z: pz, radius: 0.1, y0: pole.y, y1: pole.y + 5, kind: 'pole' });
        lists.canopyPole.push(pole);
      }
    }
    const top = kit.ground(cx, cz) + 4.85;
    hangLanternString(cx, cz - 10, 0, 24, top);
    hangLanternString(cx, cz + 10, 0, 24, top);
    hangLanternString(cx - 12, cz, Math.PI / 2, 20, top);
    hangLanternString(cx + 12, cz, Math.PI / 2, 20, top);
    hangLanternString(cx, cz, Math.atan2(24, 20) + Math.PI / 2, Math.hypot(24, 20), top + 0.05);
  }

  /** A ring of stalls around the Sundial Tower, facing out to the square. */
  function ringTheSundial(lot) {
    const cx = (lot.x0 + lot.x1) / 2;
    const cz = (lot.z0 + lot.z1) / 2;
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const r = 29;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const outward = Math.atan2(Math.cos(a), Math.sin(a));
      const snapped = Math.round(outward / (Math.PI / 2)) * (Math.PI / 2);
      placeStall(x, z, snapped, AWNING_TINTS[i % AWNING_TINTS.length]);
    }
  }

  return { lists };
}

function bounds(building) {
  return { x0: building.x - building.w / 2, x1: building.x + building.w / 2, z0: building.z - building.d / 2, z1: building.z + building.d / 2 };
}
