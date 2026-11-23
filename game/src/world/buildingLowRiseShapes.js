// The low-rise city: Old Sarab's thick plaster souks and courtyard riads with battlements, arched
// doors, awnings and wind towers; the steel sheds of Mina Docks; the white villas of Jasmine
// Heights; Al Wadi's everyday apartment blocks bristling with tanks and dishes; and Southgate's
// shop rows, workshops and motels under faded signs.
import { rectPoints, faceOf } from './buildingGeometryBuilder.js';
import { windTower, roofDome, waterTanks, satelliteDishes, airConUnits, solarPanels, pergola, plantRoom, roofPlanters } from './rooftopDetails.js';
import { hangWallSign, raiseRooftopSign } from './neonSigns.js';
import { paletteColor, mixHex, awning, canopyAlong, rollerDoors, skylightRoof, shrinkFromFace } from './buildingShapes.js';
import { architectureForDistrict, storeysForHeight, frontDoorSideOf } from './districtArchitectureStyles.js';

/** An Old Sarab souk house: two plaster volumes, shop arches and doors on the street, battlements. */
export function raiseSouk(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const tint = paletteColor('oldsarab', 'plaster', building);
  const along = frontDoorSideOf(building) === 'n' || frontDoorSideOf(building) === 's';
  const split = 0.55 + rng.next() * 0.2;
  const lowH = h >= 8 ? Math.max(4.5, h - 3.4) : h;
  const parts = along
    ? [[x - w / 2, x - w / 2 + w * split, h], [x - w / 2 + w * split, x + w / 2, lowH]]
    : [[z - d / 2, z - d / 2 + d * split, h], [z - d / 2 + d * split, z + d / 2, lowH]];
  if (rng.chance(0.5)) {
    parts[0][2] = lowH;
    parts[1][2] = h;
  }
  parts.forEach(([a0, a1, ph], i) => {
    const box = along ? [a0, z - d / 2, a1, z + d / 2] : [x - w / 2, a0, x + w / 2, a1];
    oldTownBlock(ctx, box, ph, frontDoorSideOf(building), i === 0 ? tint : mixHex(tint, 0xfff4e0, 0.25));
  });
  const tall = parts[0][2] >= parts[1][2] ? parts[0] : parts[1];
  const box = along ? [tall[0], z - d / 2, tall[1], z + d / 2] : [x - w / 2, tall[0], x + w / 2, tall[1]];
  dressOldRoof(ctx, building, box, tall[2], tint);
  streetDoorsAndAwning(ctx, building, tint);
}

/** A riad: four plaster wings around an open courtyard with a tree and a fountain. */
export function raiseRiad(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const tint = paletteColor('oldsarab', 'plaster', building, 3);
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const wingX = Math.max(6, w * 0.28);
  const wingZ = Math.max(6, d * 0.28);
  const lower = Math.max(4.5, h - 3.4);
  const frontLow = frontDoorSideOf(building);
  const wings = {
    n: [x0, z0, x1, z0 + wingZ],
    s: [x0, z1 - wingZ, x1, z1],
    w: [x0, z0 + wingZ, x0 + wingX, z1 - wingZ],
    e: [x1 - wingX, z0 + wingZ, x1, z1 - wingZ],
  };
  for (const side of ['n', 's', 'e', 'w']) {
    const wh = side === frontLow ? lower : h;
    oldTownBlock(ctx, wings[side], wh, side === frontLow ? frontDoorSideOf(building) : null, side === frontLow ? mixHex(tint, 0xfff4e0, 0.2) : tint);
  }
  // The courtyard: paving, an arcade's shade, a fountain and a tree.
  const b = ctx.solid;
  const cx0 = x0 + wingX;
  const cx1 = x1 - wingX;
  const cz0 = z0 + wingZ;
  const cz1 = z1 - wingZ;
  b.use('stone', 0xf0e2c6);
  b.cap(rectPoints((cx0 + cx1) / 2, (cz0 + cz1) / 2, cx1 - cx0, cz1 - cz0), 0.05, true);
  b.use('tiledDome', 0x58b8b0);
  b.cylinder((cx0 + cx1) / 2, (cz0 + cz1) / 2, 1.3, 0, 0.6, 8);
  b.use('plain', 0x8a5a34);
  const tx = cx0 + (cx1 - cx0) * 0.28;
  const tz = cz0 + (cz1 - cz0) * 0.3;
  b.box(tx - 0.2, 0, tz - 0.2, tx + 0.2, 3.2, tz + 0.2);
  b.use('greenery', 0x6a9a3e);
  b.dome(tx, tz, 2.6, 2.6, 2.4, 8, 3);
  if (building.windTower) windTower(ctx, x0 + 2.4, z0 + 2.4, h - 0.9, 3, 6 + rng.next() * 2, tint);
  waterTanks(b, rng, x1 - wingX + 0.5, z1 - wingZ + 0.5, x1 - 0.8, z1 - 0.8, (frontLow === 's' || frontLow === 'e') ? lower - 0.9 : h - 0.9, 1);
  streetDoorsAndAwning(ctx, building, tint);
}

/** A Mina Docks warehouse: corrugated steel, a shallow pitched roof, roller doors on the yard side. */
export function raiseWarehouse(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const wall = paletteColor('docks', 'steel', building);
  const roof = mixHex(paletteColor('docks', 'steel', building, 3), 0xb8bcc0, 0.5);
  const alongX = w >= d;
  const span = alongX ? d : w;
  const rise = Math.min(4, span * 0.1);
  const eave = h - rise;
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  b.use('corrugated', wall);
  b.box(x0, 0, z0, x1, eave, z1, { top: false });
  b.use('corrugated', roof);
  b.gableRoof(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, eave, rise, alongX, { endTile: 'corrugated', endTint: wall });
  // Roof lights and vents along the ridge, a yellow gutter line along the eaves.
  b.use('darkGlass', 0xb8d0d8);
  for (let k = 0; k < 3; k += 1) {
    const t0 = 0.15 + k * 0.27;
    const t1 = t0 + 0.12;
    if (alongX) b.quad([x0 + w * t0, eave + rise * 0.35 + 0.05, z + span * 0.3], [x0 + w * t1, eave + rise * 0.35 + 0.05, z + span * 0.3], [x0 + w * t1, eave + rise * 0.75 + 0.05, z + span * 0.1], [x0 + w * t0, eave + rise * 0.75 + 0.05, z + span * 0.1], 0, 0, 1, 1);
    else b.quad([x + span * 0.3, eave + rise * 0.35 + 0.05, z1 - d * t0], [x + span * 0.3, eave + rise * 0.35 + 0.05, z1 - d * t1], [x + span * 0.1, eave + rise * 0.75 + 0.05, z1 - d * t1], [x + span * 0.1, eave + rise * 0.75 + 0.05, z1 - d * t0], 0, 0, 1, 1);
  }
  b.use('metalPanel', 0xb8bcc0);
  for (let k = 1; k < 4; k += 1) {
    const t = k / 4;
    const vx = alongX ? x0 + w * t : x;
    const vz = alongX ? z : z0 + d * t;
    b.cylinder(vx, vz, 0.6, h - 0.3, h + 1.2, 6);
  }
  b.use('hazard', 0xffffff);
  b.box(x0 - 0.1, eave - 0.6, z0 - 0.1, x1 + 0.1, eave - 0.2, z1 + 0.1, { top: false });
  rollerDoors(ctx, building, 5, 5.5, 0xd9dde0);
  // A company name on a long side.
  const sign = ctx.nextSign('docks');
  if (sign && rng.chance(0.6)) {
    const side = alongX ? (frontDoorSideOf(building) === 'n' ? 's' : 'n') : (frontDoorSideOf(building) === 'e' ? 'w' : 'e');
    const face = faceOf(x, z, w, d, side);
    const sw = Math.min(face.length * 0.5, 24);
    hangWallSign(b, face, sign, eave - sw / 7 - 1.2, sw, sw / 7, face.length / 2, 0.08);
  }
  ctx.beacon(x, h + 1.4, z, 0xffb030, 1.4, 0);
}

/** A cold store: white insulated panels, a dock canopy over its doors, chillers on the roof. */
export function raiseColdStore(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const stripe = rng.pick([0x1f6f9a, 0x1ba39c, 0x3f6688]);
  const setback = 3;
  const inner = shrinkFromFace(x, z, w, d, frontDoorSideOf(building), setback);
  b.use('coldPanels', 0xf6f7f5);
  b.box(inner.x0, 0, inner.z0, inner.x1, h - 1.6, inner.z1, { top: false });
  b.use('plain', stripe);
  b.box(inner.x0, h - 1.6, inner.z0, inner.x1, h, inner.z1, { top: 'roofGravel', topTint: 0xd8d6d0 });
  // The loading canopy spanning the setback, and the dock doors beneath it.
  const dock = faceOf((inner.x0 + inner.x1) / 2, (inner.z0 + inner.z1) / 2, inner.x1 - inner.x0, inner.z1 - inner.z0, frontDoorSideOf(building));
  b.use('metalPanel', 0xe8eaea);
  const cx0 = Math.min(dock.ax, dock.bx, dock.ax + dock.nx * setback, dock.bx + dock.nx * setback);
  const cx1 = Math.max(dock.ax, dock.bx, dock.ax + dock.nx * setback, dock.bx + dock.nx * setback);
  const cz0 = Math.min(dock.az, dock.bz, dock.az + dock.nz * setback, dock.bz + dock.nz * setback);
  const cz1 = Math.max(dock.az, dock.bz, dock.az + dock.nz * setback, dock.bz + dock.nz * setback);
  b.slab(cx0, cz0, cx1, cz1, 5, 0.5);
  b.use('concrete', 0xc8c4bc);
  b.slab(cx0, cz0, cx1, cz1, 0, 1.1);
  const doors = Math.max(2, Math.floor(dock.length / 9));
  b.use('rollerDoor', 0xdfe6ea);
  for (let i = 0; i < doors; i += 1) {
    const at = dock.length * (i + 0.5) / doors;
    const ax = dock.ax + dock.tx * (at - 1.8) + dock.nx * 0.06;
    const az = dock.az + dock.tz * (at - 1.8) + dock.nz * 0.06;
    b.wall(ax, az, ax + dock.tx * 3.6, az + dock.tz * 3.6, 1.1, 4.7, { fit: true });
  }
  for (let k = 0; k < Math.max(2, Math.floor((inner.x1 - inner.x0) / 16)); k += 1) {
    const px = inner.x0 + 5 + k * 14;
    plantRoom(b, px, (inner.z0 + inner.z1) / 2, 6, 3, h, 2.2, 0xe4e6e6);
    b.use('metalPanel', 0x6a7074);
    b.cylinder(px - 1.5, (inner.z0 + inner.z1) / 2, 1.1, h + 2.2, h + 2.5, 8);
    b.cylinder(px + 1.5, (inner.z0 + inner.z1) / 2, 1.1, h + 2.2, h + 2.5, 8);
  }
}

/** A workshop: a saw-tooth steel shed at the docks, a low roller-door garage in Southgate. */
export function raiseWorkshop(ctx, building) {
  if (building.district !== 'docks') {
    raiseSouthgateWorkshop(ctx, building);
    return;
  }
  const { x, z, w, d, h } = building;
  const b = ctx.solid;
  const wall = paletteColor('docks', 'steel', building, 1);
  const alongX = w >= d;
  const teeth = Math.max(3, Math.round((alongX ? w : d) / 14));
  const toothH = Math.min(3.5, h * 0.3);
  const eave = h - toothH;
  const x0 = x - w / 2;
  const z0 = z - d / 2;
  b.use('corrugated', wall);
  b.box(x0, 0, z0, x + w / 2, eave, z + d / 2, { top: false });
  // Each tooth: a glazed north light and a steel slope falling south.
  for (let k = 0; k < teeth; k += 1) {
    if (alongX) {
      const a = x0 + (w / teeth) * k;
      const c = a + w / teeth;
      b.use('glassRibbon', 0x9ab8c0);
      b.wall(c, z0, a, z0, eave, h, { repeatU: 1 });
      b.wall(c, z0, c, z + d / 2, eave, eave + 0.01);
      b.use('corrugated', mixHex(wall, 0xc8ccd0, 0.5));
      b.quad([a, h, z0], [a, eave, z + d / 2], [c, eave, z + d / 2], [c, h, z0], 0, 0, d / 8, 1);
      b.use('corrugated', wall);
      b.triangle([a, eave, z0], [a, eave, z + d / 2], [a, h, z0], 0, 0, d / 8, 0, 0, toothH / 8);
      b.triangle([c, eave, z + d / 2], [c, eave, z0], [c, h, z0], 0, 0, d / 8, 0, d / 8, toothH / 8);
    } else {
      const a = z0 + (d / teeth) * k;
      const c = a + d / teeth;
      b.use('glassRibbon', 0x9ab8c0);
      b.wall(x0, a, x0, c, eave, h, { repeatU: 1 });
      b.use('corrugated', mixHex(wall, 0xc8ccd0, 0.5));
      b.quad([x0, h, c], [x + w / 2, eave, c], [x + w / 2, eave, a], [x0, h, a], 0, 0, w / 8, 1);
      b.use('corrugated', wall);
      b.triangle([x0, eave, a], [x + w / 2, eave, a], [x0, h, a], 0, 0, w / 8, 0, 0, toothH / 8);
      b.triangle([x + w / 2, eave, c], [x0, eave, c], [x0, h, c], 0, 0, w / 8, 0, w / 8, toothH / 8);
    }
  }
  rollerDoors(ctx, building, 4.5, 5, 0x4f9a9a);
}

/** A Jasmine Heights villa: a two-storey white block, a one-storey wing with a pergola terrace. */
export function raiseVilla(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const white = paletteColor('jasmine', 'white', building);
  const alongX = w >= d;
  const mainShare = 0.55 + rng.next() * 0.15;
  const wingH = 3.6;
  const mainFirst = rng.chance(0.5);
  const x0 = x - w / 2;
  const z0 = z - d / 2;
  const len = alongX ? w : d;
  const cut = len * (mainFirst ? mainShare : 1 - mainShare);
  const boxes = alongX
    ? [[x0, z0, x0 + cut, z + d / 2], [x0 + cut, z0 + d * 0.12, x + w / 2, z + d / 2 - d * 0.12]]
    : [[x0, z0, x + w / 2, z0 + cut], [x0 + w * 0.12, z0 + cut, x + w / 2 - w * 0.12, z + d / 2]];
  const mainBox = mainFirst ? boxes[0] : boxes[1];
  const wingBox = mainFirst ? boxes[1] : boxes[0];
  const mainH = Math.max(6.5, h);
  const terracotta = building.variant % 3 === 0;
  const wallTop = terracotta ? mainH - 2 : mainH;
  villaBlock(b, mainBox, wallTop, frontDoorSideOf(building), white, terracotta);
  if (terracotta) {
    b.use('terracotta', rng.pick([0xffffff, 0xf4e0d0, 0xffeedd]));
    const [a0, c0, a1, c1] = mainBox;
    b.pyramid((a0 + a1) / 2, (c0 + c1) / 2, a1 - a0 + 0.8, c1 - c0 + 0.8, wallTop, 2, { ridge: Math.abs((a1 - a0) - (c1 - c0)) * 0.9 });
  } else {
    villaParapet(b, mainBox, wallTop, white);
    solarPanels(b, mainBox[0] + 1.5, mainBox[1] + 1.5, Math.min(mainBox[2] - 1.5, mainBox[0] + 9), Math.min(mainBox[3] - 1.5, mainBox[1] + 6), wallTop - 0.9);
  }
  villaBlock(b, wingBox, wingH, frontDoorSideOf(building), mixHex(white, 0xf0e6d4, 0.3), false);
  villaParapet(b, wingBox, wingH, white);
  const [w0, v0, w1, v1] = wingBox;
  pergola(ctx, w0 + 1, v0 + 1, Math.min(w1 - 1, w0 + 8), Math.min(v1 - 1, v0 + 7), wingH - 0.9, 2.5);
  roofPlanters(b, rng, w0 + 1, v1 - 2.2, w1 - 1, v1 - 1, wingH - 0.9);
  // Bougainvillea spilling down a corner of the street front.
  const face = faceOf((mainBox[0] + mainBox[2]) / 2, (mainBox[1] + mainBox[3]) / 2, mainBox[2] - mainBox[0], mainBox[3] - mainBox[1], frontDoorSideOf(building));
  const at = rng.chance(0.5) ? 2.5 : face.length - 2.5;
  const bx = face.ax + face.tx * at + face.nx * 0.35;
  const bz = face.az + face.tz * at + face.nz * 0.35;
  b.use('greenery', rng.pick([0xff4a9c, 0xf0367e, 0xff6ab8, 0xe850aa]));
  for (let k = 0; k < 3; k += 1) {
    const along = (k - 1) * 1.3;
    const px = bx + face.tx * along;
    const pz = bz + face.tz * along;
    const top = wallTop + 0.4 - k * 0.9;
    b.dome(px, pz, 1.3 - k * 0.15, top - 1.6, 1.8, 6, 2);
  }
}

/** An Al Wadi apartment block: render, shops on the street, and a roof crowded with tanks and dishes. */
export function raiseApartmentBlock(ctx, building) {
  flatsBlock(ctx, building, false);
}

/** An Al Wadi balcony block: the same, with a balcony slab at every floor front and back. */
export function raiseBalconyBlock(ctx, building) {
  flatsBlock(ctx, building, true);
}

/** A Southgate shop row: glass fronts under a canopy, a raised false front with a faded sign. */
export function raiseRetail(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const tint = paletteColor('southgate', 'paint', building);
  const bodyH = Math.min(h, 4.5 + (h > 8 ? 3.4 : 0));
  const inner = shrinkFromFace(x, z, w, d, frontDoorSideOf(building), 2.5);
  b.use('concrete', tint);
  b.box(inner.x0, 0, inner.z0, inner.x1, bodyH, inner.z1, { top: false, skip: frontDoorSideOf(building) });
  skylightRoof(b, rng, inner.x0, inner.z0, inner.x1, inner.z1, bodyH);
  const face = faceOf((inner.x0 + inner.x1) / 2, (inner.z0 + inner.z1) / 2, inner.x1 - inner.x0, inner.z1 - inner.z0, frontDoorSideOf(building));
  b.use('shopStrip', mixHex(tint, 0xffffff, 0.3));
  b.wall(face.ax, face.az, face.bx, face.bz, 0, 4.5);
  b.use('plasterBlank', tint);
  if (bodyH > 4.5) b.wall(face.ax, face.az, face.bx, face.bz, 4.5, bodyH);
  // False front rising above the roof, and its sign.
  const parapet = 1.8;
  b.wall(face.ax, face.az, face.bx, face.bz, bodyH, bodyH + parapet);
  b.wall(face.bx - face.nx * 0.3, face.bz - face.nz * 0.3, face.ax - face.nx * 0.3, face.az - face.nz * 0.3, bodyH, bodyH + parapet);
  const sign = rng.chance(0.55) ? rng.pick(['alWahaTyres', 'sunstopMarket']) : null;
  if (sign) hangWallSign(b, face, sign, bodyH + 0.1, Math.min(face.length * 0.7, 14), Math.min(face.length * 0.7, 14) / 7);
  canopyAlong(b, face, 3.7, 2.4, rng.pick([0xe4572e, 0x1ba39c, 0xe9b44c, 0x2f6fa8, 0xf4f0e6]));
  airConUnits(b, rng, inner.x0 + 1, inner.z0 + 1, inner.x1 - 1, inner.z1 - 1, bodyH, 3 + rng.int(0, 3));
}

/** A Southgate motel: two floors of rooms on a gallery facing the lot, and a tall pole sign. */
export function raiseMotel(ctx, building) {
  const { x, z, w, d } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const tint = paletteColor('southgate', 'paint', building, 2);
  const inner = shrinkFromFace(x, z, w, d, frontDoorSideOf(building), 2.6);
  const top = 6.6;
  b.use('plasterBlank', tint);
  b.box(inner.x0, 0, inner.z0, inner.x1, top, inner.z1, { top: 'roofGravel', topTint: 0xd8d2c4, skip: frontDoorSideOf(building) });
  const face = faceOf((inner.x0 + inner.x1) / 2, (inner.z0 + inner.z1) / 2, inner.x1 - inner.x0, inner.z1 - inner.z0, frontDoorSideOf(building));
  b.use('motelDoors', mixHex(tint, 0xffffff, 0.4));
  b.wall(face.ax, face.az, face.bx, face.bz, 0, 3.2);
  b.wall(face.ax, face.az, face.bx, face.bz, 3.3, 6.5, { vBase: 3.3 });
  b.use('plain', 0xf4efe4);
  b.wall(face.ax, face.az, face.bx, face.bz, 3.2, 3.3);
  b.wall(face.ax, face.az, face.bx, face.bz, 6.5, top);
  // The gallery: a walkway slab, its railing, posts down to the ground, a roof edge above.
  const gx0 = Math.min(face.ax, face.bx, face.ax + face.nx * 2.4, face.bx + face.nx * 2.4);
  const gx1 = Math.max(face.ax, face.bx, face.ax + face.nx * 2.4, face.bx + face.nx * 2.4);
  const gz0 = Math.min(face.az, face.bz, face.az + face.nz * 2.4, face.bz + face.nz * 2.4);
  const gz1 = Math.max(face.az, face.bz, face.az + face.nz * 2.4, face.bz + face.nz * 2.4);
  b.use('plain', 0xf0ebe0);
  b.slab(gx0, gz0, gx1, gz1, 3.0, 0.3);
  b.slab(gx0, gz0, gx1, gz1, top, 0.25);
  b.use('balconyRail', rng.pick([0x9cd4cc, 0xf6c8b0, 0xffffff]));
  const rx = face.nx * 2.35;
  const rz = face.nz * 2.35;
  b.panel(face.ax + rx, face.az + rz, face.bx + rx, face.bz + rz, 3.3, 4.4, { doubleSided: true });
  b.use('plain', 0xf0ebe0);
  const posts = Math.max(2, Math.round(face.length / 6));
  for (let i = 0; i <= posts; i += 1) {
    const px = face.ax + face.tx * face.length * (i / posts) + face.nx * 2.2;
    const pz = face.az + face.tz * face.length * (i / posts) + face.nz * 2.2;
    b.box(px - 0.15, 0, pz - 0.15, px + 0.15, top, pz + 0.15, { top: false });
  }
  // The pole sign at the corner nearest the street.
  const sign = rng.pick(['sandpiperMotel', 'desertRose']);
  const px = face.ax + face.tx * 1.2 + face.nx * 2.2;
  const pz = face.az + face.tz * 1.2 + face.nz * 2.2;
  b.use('metalPanel', 0x8a8f94);
  b.box(px - 0.25, 0, pz - 0.25, px + 0.25, 11, pz + 0.25, { top: false });
  raiseRooftopSign(b, { ...face, nx: face.nx, nz: face.nz }, sign, px + face.tx * 3.6, pz + face.tz * 3.6, 8.2, 8, 1.4, 0.3, 0xf2c014);
  satelliteDishes(b, rng, inner.x0 + 2, inner.z0 + 2, inner.x1 - 2, inner.z1 - 2, top, 1);
  airConUnits(b, rng, inner.x0 + 1, inner.z0 + 1, inner.x1 - 1, inner.z1 - 1, top, 4);
}

// ---- shared low-rise pieces -----------------------------------------------------------------

/**
 * One plaster volume of the old town on [x0, z0, x1, z1], `height` tall: arches on its street
 * side (`front`), small windows above, a band of beam ends and a crenellated parapet.
 */
function oldTownBlock(ctx, [x0, z0, x1, z1], height, front, tint) {
  const b = ctx.solid;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  const ground = Math.min(3.8, height);
  const wallTop = height - 0.9;
  for (const side of ['n', 's', 'e', 'w']) {
    const f = faceOf(cx, cz, w, d, side);
    b.use(side === front ? 'plasterArches' : 'plasterWindows', tint);
    b.wall(f.ax, f.az, f.bx, f.bz, 0, Math.min(ground, wallTop), { vBase: 0 });
    if (wallTop > ground) {
      b.use('plasterWindows', tint);
      b.wall(f.ax, f.az, f.bx, f.bz, ground, wallTop, { vBase: ground });
    }
    if (side === front || side === 'w' || side === 'e') {
      b.use('beamEnds', tint);
      b.wall(f.ax + f.nx * 0.04, f.az + f.nz * 0.04, f.bx + f.nx * 0.04, f.bz + f.nz * 0.04, wallTop - 0.75, wallTop - 0.15);
    }
  }
  b.use('plain', mixHex(tint, 0xffffff, 0.45));
  b.cap(rectPoints(cx, cz, w, d), wallTop, true);
  const cut = ctx.cutout;
  cut.use('crenellation', tint);
  for (const side of ['n', 's', 'e', 'w']) {
    const f = faceOf(cx, cz, w - 0.3, d - 0.3, side);
    cut.wall(f.ax, f.az, f.bx, f.bz, wallTop, height);
  }
}

/** The roof of an old town house: a dome, a wind tower, tanks, a stair hut. */
function dressOldRoof(ctx, building, [x0, z0, x1, z1], height, tint) {
  const b = ctx.solid;
  const rng = ctx.rng;
  const roof = height - 0.9;
  if (building.windTower) {
    const corner = rng.int(0, 3);
    const wx = corner % 2 === 0 ? x0 + 2.4 : x1 - 2.4;
    const wz = corner < 2 ? z0 + 2.4 : z1 - 2.4;
    windTower(ctx, wx, wz, roof, 2.6 + rng.next() * 0.8, 5.5 + rng.next() * 2.5, tint);
  }
  if (building.variant % 4 === 0) roofDome(b, (x0 + x1) / 2, (z0 + z1) / 2, roof, Math.min(x1 - x0, z1 - z0) * 0.18, mixHex(tint, 0xffffff, 0.35), building.variant === 4);
  b.use('plasterBlank', mixHex(tint, 0xffffff, 0.2));
  const hx = rng.chance(0.5) ? x0 + 3.5 : x1 - 3.5;
  const hz = rng.chance(0.5) ? z0 + 3 : z1 - 3;
  if (!building.windTower || rng.chance(0.4)) b.box(hx - 1.6, roof, hz - 1.3, hx + 1.6, roof + 2.4, hz + 1.3, { top: 'plain', topTint: 0xf4ecdc });
  waterTanks(b, rng, x0 + 1, z0 + 1, x1 - 1, z0 + 4, roof, rng.int(0, 2));
  if (rng.chance(0.4)) satelliteDishes(b, rng, x0 + 2, z1 - 4, x1 - 2, z1 - 2, roof, 1);
}

/** Painted doors in the street front's arches and a striped awning above the shop doors. */
function streetDoorsAndAwning(ctx, building, tint) {
  const { x, z, w, d } = building;
  const rng = ctx.rng;
  const face = faceOf(x, z, w, d, frontDoorSideOf(building));
  const repeats = Math.max(1, Math.round(face.length / 9));
  const bay = face.length / (repeats * 3);
  const cut = ctx.cutout;
  const doors = 1 + rng.int(0, 1);
  for (let k = 0; k < doors; k += 1) {
    const slot = rng.int(0, repeats * 3 - 1);
    const at = (slot + 0.5) * bay;
    const half = bay * 0.36;
    const ax = face.ax + face.tx * (at - half) + face.nx * 0.05;
    const az = face.az + face.tz * (at - half) + face.nz * 0.05;
    const doorColors = architectureForDistrict('oldsarab').doors;
    cut.use('doorArch', doorColors[(building.variant + k * 3 + Math.floor(building.tint * 6)) % doorColors.length]);
    cut.wall(ax, az, ax + face.tx * half * 2, az + face.tz * half * 2, 0, 3.1, { fit: true });
  }
  if (rng.chance(0.7)) {
    const color = rng.pick([0xe4572e, 0x1ba39c, 0xe9b44c, 0x2f6fa8, 0x6a994e, 0xc44536]);
    const start = face.length * (0.1 + rng.next() * 0.2);
    const end = face.length * (0.6 + rng.next() * 0.3);
    awning(cut, face, start, end, 3.5, 1.7, color);
  }
}

/** A Southgate garage workshop: block walls, roller doors, a painted band and a flat roof. */
function raiseSouthgateWorkshop(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const tint = paletteColor('southgate', 'paint', building, 1);
  const top = Math.min(h, 6.5);
  b.use('concrete', tint);
  b.box(x - w / 2, 0, z - d / 2, x + w / 2, top, z + d / 2, { top: false });
  skylightRoof(b, rng, x - w / 2, z - d / 2, x + w / 2, z + d / 2, top);
  const face = faceOf(x, z, w, d, frontDoorSideOf(building));
  b.use('plain', rng.pick([0xc0392b, 0x2f6fa8, 0x1ba39c, 0xe9b44c]));
  b.wall(face.ax + face.nx * 0.05, face.az + face.nz * 0.05, face.bx + face.nx * 0.05, face.bz + face.nz * 0.05, top - 1.2, top - 0.4);
  rollerDoors(ctx, building, 4, 4.2, rng.pick([0xdfe2e4, 0x9cc4bc, 0xe8d4a0]));
  airConUnits(b, rng, x - w / 2 + 1, z - d / 2 + 1, x + w / 2 - 1, z + d / 2 - 1, top, 2);
  if (rng.chance(0.5)) satelliteDishes(b, rng, x - w / 2 + 2, z - d / 2 + 2, x + w / 2 - 2, z + d / 2 - 2, top, 1);
}

/** A white villa volume: arcade and windows on the street side, windows elsewhere. */
function villaBlock(b, [x0, z0, x1, z1], height, front, white, pitched) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  for (const side of ['n', 's', 'e', 'w']) {
    const f = faceOf(cx, cz, w, d, side);
    b.use(side === front ? 'villaArcade' : 'villaWindows', white);
    b.wall(f.ax, f.az, f.bx, f.bz, 0, Math.min(3.4, height), { vBase: 0 });
    if (height > 3.4) {
      b.use('villaWindows', white);
      b.wall(f.ax, f.az, f.bx, f.bz, 3.4, height, { vBase: 3.4 });
    }
  }
  b.use('plain', white);
  if (pitched) b.cap(rectPoints(cx, cz, w, d), height, true);
}

/** A villa's flat roof behind a low parapet with a coping. */
function villaParapet(b, [x0, z0, x1, z1], height, white) {
  b.use('plain', white);
  const pts = rectPoints((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  b.prismWalls(pts, height, height + 0.01);
  b.use('roofGravel', 0xf0ebe0);
  b.cap(pts, height - 0.9, true);
  b.use('plain', white);
  const n = pts.length;
  const inner = pts.map(([px, pz]) => [px + Math.sign((x0 + x1) / 2 - px) * 0.3, pz + Math.sign((z0 + z1) / 2 - pz) * 0.3]);
  for (let i = 0; i < n; i += 1) {
    const a = inner[(i + 1) % n];
    const c = inner[i];
    b.wall(a[0], a[1], c[0], c[1], height - 0.9, height);
    const j = (i + 1) % n;
    b.quad([pts[i][0], height, pts[i][1]], [pts[j][0], height, pts[j][1]], [inner[j][0], height, inner[j][1]], [inner[i][0], height, inner[i][1]], 0, 0, 1, 0.1);
  }
}

/** The shared body of Al Wadi's flats, with or without balcony slabs. */
function flatsBlock(ctx, building, balconies) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const tint = paletteColor('wadi', 'render', building);
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const shopH = 4.5;
  const top = h - 1;
  const deep = balconies ? 1.2 : 0;
  const frontAxisZ = frontDoorSideOf(building) === 'n' || frontDoorSideOf(building) === 's';
  for (const side of ['n', 's', 'e', 'w']) {
    const balconySide = balconies && ((frontAxisZ && (side === 'n' || side === 's')) || (!frontAxisZ && (side === 'e' || side === 'w')));
    const f = faceOf(x, z, w - (balconySide && !frontAxisZ ? 2 * deep : 0), d - (balconySide && frontAxisZ ? 2 * deep : 0), side);
    b.use(side === frontDoorSideOf(building) ? 'shopStrip' : 'flatsWindows', side === frontDoorSideOf(building) ? mixHex(tint, 0xffffff, 0.35) : tint);
    b.wall(f.ax, f.az, f.bx, f.bz, 0, shopH, { vBase: side === frontDoorSideOf(building) ? 0 : -1.9 });
    b.use(balconySide ? 'flatsBalconies' : 'flatsWindows', tint);
    b.wall(f.ax, f.az, f.bx, f.bz, shopH, top, { vBase: shopH });
    b.use('plain', mixHex(tint, 0xffffff, 0.5));
    b.wall(f.ax, f.az, f.bx, f.bz, top, h);
    if (balconySide) {
      const storeys = storeysForHeight(top - shopH, 3.2);
      for (let k = 1; k <= storeys; k += 1) {
        const y = shopH + k * 3.2 - 0.2;
        const sx0 = Math.min(f.ax, f.bx, f.ax + f.nx * deep, f.bx + f.nx * deep);
        const sx1 = Math.max(f.ax, f.bx, f.ax + f.nx * deep, f.bx + f.nx * deep);
        const sz0 = Math.min(f.az, f.bz, f.az + f.nz * deep, f.bz + f.nz * deep);
        const sz1 = Math.max(f.az, f.bz, f.az + f.nz * deep, f.bz + f.nz * deep);
        b.slab(sx0, sz0, sx1, sz1, y - 3.2 + 0.2, 0.25, { top: 'plain' });
      }
    }
  }
  if (balconies) {
    const inner = frontAxisZ ? rectPoints(x, z, w, d - 2 * deep) : rectPoints(x, z, w - 2 * deep, d);
    b.use('roofGravel', 0xd8d0c0);
    b.cap(inner, h - 0.9, true);
  } else {
    b.use('roofGravel', 0xd8d0c0);
    b.cap(rectPoints(x, z, w, d), h - 0.9, true);
  }
  // Roof clutter: a stair hut, tanks, dishes, AC boxes and sometimes solar panels.
  const roof = h - 0.9;
  b.use('concrete', mixHex(tint, 0xffffff, 0.3));
  const hx = rng.chance(0.5) ? x0 + 4 : x1 - 4;
  b.box(hx - 2, roof, z - 2.5, hx + 2, roof + 2.8, z + 2.5, { top: 'roofGravel' });
  waterTanks(b, rng, x0 + 1.5, z0 + 1.5, x1 - 1.5, z0 + 5, roof, 2 + rng.int(0, 3));
  satelliteDishes(b, rng, x0 + 2, z1 - 5, x1 - 2, z1 - 2, roof, 1 + rng.int(0, 3));
  airConUnits(b, rng, x0 + 1.5, z + 2, x1 - 1.5, z1 - 2, roof, 2 + rng.int(0, 3));
  if (rng.chance(0.3) && w > 20) solarPanels(b, x - 6, z - 3, x + 6, z + 3, roof);
}
