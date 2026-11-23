// The towers of Port Sarab: The Spires' glass forest (chamfered, rounded, finned, twin, set-back,
// octagonal, twisted and sky-garden towers on white stone podiums), the art-deco stepped towers and
// stone office slabs, Marina Crescent's balconied white apartment towers, and Lantern Row's hotels
// and clubs with their neon. Every tower stands inside its footprint from the city plan.
import { rectPoints, chamferPoints, roundedPoints, ellipsePoints, scalePoints, rotatePoints, insetPoints, faceOf } from './buildingGeometryBuilder.js';
import { parapetRoof, plantRoom, airConUnits, helipad, roofPool, pergola, roofPlanters, antennaMast, spireNeedle, waterTanks, satelliteDishes } from './rooftopDetails.js';
import { hangWallSign, hangBladeSign, raiseRooftopSign } from './neonSigns.js';
import { paletteColor, mixHex, stonePodium, lobbyFront, crownBand, crownFrame } from './buildingShapes.js';
import { towerCrownForVariant, snapToStoreys, storeysForHeight, frontDoorSideOf, backSideOf } from './districtArchitectureStyles.js';

/** A glass tower of The Spires (or a marina or Lantern Row one), its massing chosen by `variant`. */
export function raiseGlassTower(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const glass = glassTintOf(building);
  const podiumH = h > 70 ? 6 : 4.5;
  stonePodium(ctx, building, podiumH);
  const inset = 2 + rng.next() * 2.4;
  const bw = w - inset * 2;
  const bd = d - inset * 2;
  const y0 = podiumH + 0.6;
  const tile = GLASS_TILES[(building.variant + Math.floor((building.tint || 0) * 4)) % GLASS_TILES.length];
  const crownTint = mixHex(glass, 0xffffff, 0.55);
  b.use(tile, glass);
  const crown = towerCrownForVariant(building.variant);

  if (crown === 'taper') {
    // Chamfered corners and a crown that tapers in.
    const pts = chamferPoints(x, z, bw, bd, Math.min(bw, bd) * 0.2);
    const taper = snapToStoreys(y0 + (h - y0) * 0.8, y0);
    b.prism(pts, y0, taper, { top: false, vBase: y0 });
    b.prism(pts, taper, h, { top: false, vBase: y0, topScale: 0.6 });
    crownBand(ctx, pts, taper - 1.2, 1.2, crownTint);
    finishTowerRoof(ctx, building, scalePoints(pts, x, z, 0.6), h, { needle: h > 140 });
    corporateSign(ctx, building, x, z, bw, bd, taper - 10);
  } else if (crown === 'drum') {
    // Rounded, with a narrower drum on top and a needle.
    const pts = roundedPoints(x, z, bw, bd, Math.min(bw, bd) * 0.32, 3);
    const drum = snapToStoreys(y0 + (h - y0) * 0.86, y0);
    b.prism(pts, y0, drum, { top: 'roofGravel', vBase: y0, perimeter: true, smooth: true });
    b.use(tile, glass);
    const small = scalePoints(pts, x, z, 0.74);
    b.prism(small, drum, h, { top: false, vBase: y0, perimeter: true, smooth: true });
    crownBand(ctx, pts, drum - 1, 1, crownTint);
    finishTowerRoof(ctx, building, small, h, { needle: true, plant: false });
    corporateSign(ctx, building, x, z, bw * 0.8, bd, drum - 10);
  } else if (crown === 'wedge') {
    // Deep fins and a roof sliced at a slant.
    const pts = rectPoints(x, z, bw, bd);
    const alongX = rng.chance(0.5);
    const drop = Math.min(18, (h - y0) * 0.14);
    const low = alongX ? x - bw / 2 : z - bd / 2;
    const span = alongX ? bw : bd;
    const topY = (px, pz) => h - drop * (((alongX ? px : pz) - low) / span);
    b.prism(pts, y0, h, { topY, top: 'metalPanel', topTint: crownTint, vBase: y0 });
    towerFins(ctx, x, z, bw, bd, y0, (px, pz) => topY(px, pz) - 0.5, glass);
    const hx = alongX ? x - bw / 2 + 2 : x;
    const hz = alongX ? z : z - bd / 2 + 2;
    if (h > 90) ctx.beacon(hx, h + 0.5, hz, 0xff2a1a, 3.6, 1);
  } else if (crown === 'twin') {
    // Twin slabs of different heights joined by a dark glass core.
    const alongX = bw >= bd;
    const gap = 3.5;
    const hB = snapToStoreys(y0 + (h - y0) * (0.68 + rng.next() * 0.18), y0);
    const half = ((alongX ? bw : bd) - gap) / 2;
    const thin = (alongX ? bd : bw) * 0.86;
    const shift = (alongX ? bd : bw) * 0.07;
    const slabs = alongX
      ? [[x - gap / 2 - half / 2, z - shift, half, thin, h], [x + gap / 2 + half / 2, z + shift, half, thin, hB]]
      : [[x + shift, z - gap / 2 - half / 2, thin, half, h], [x - shift, z + gap / 2 + half / 2, thin, half, hB]];
    b.use('darkGlass', mixHex(glass, 0x223038, 0.5));
    b.box(x - (alongX ? gap / 2 + 0.5 : thin * 0.3), y0, z - (alongX ? thin * 0.3 : gap / 2 + 0.5), x + (alongX ? gap / 2 + 0.5 : thin * 0.3), hB - 3.4, z + (alongX ? thin * 0.3 : gap / 2 + 0.5));
    slabs.forEach(([sx, sz, sw, sd, sh], i) => {
      b.use(i === 0 ? tile : GLASS_TILES[(GLASS_TILES.indexOf(tile) + 1) % GLASS_TILES.length], i === 0 ? glass : mixHex(glass, 0xffffff, 0.2));
      const pts = rectPoints(sx, sz, sw, sd);
      b.prism(pts, y0, sh + 1.2, { top: false, vBase: y0 });
      parapetRoof(b, pts, sh + 1.2, 1.2, 0.4);
      finishTowerRoof(ctx, { ...building, h: sh }, insetPoints(pts, 0.4), sh, { capped: true, helipad: false });
    });
  } else if (crown === 'setback') {
    // Set back three times, a band of light at every step.
    let pts = chamferPoints(x, z, bw, bd, Math.min(bw, bd) * 0.12);
    const fractions = [0.5, 0.3, 0.2];
    let y = y0;
    let scale = 1;
    fractions.forEach((f, k) => {
      const top = k === fractions.length - 1 ? h : snapToStoreys(y + (h - y0) * f, y0);
      b.use(tile, glass);
      b.prism(pts, y, top, { top: 'roofGravel', vBase: y0 });
      crownBand(ctx, pts, top - 0.9, 0.9, crownTint);
      if (k < fractions.length - 1) roofPlanters(b, rng, x - bw * scale / 2 + 1, z - bd * scale / 2 + 1, x + bw * scale / 2 - 1, z - bd * scale / 2 + 3, top);
      y = top;
      scale *= 0.78;
      pts = scalePoints(pts, x, z, 0.78);
    });
    finishTowerRoof(ctx, building, scalePoints(pts, x, z, 1 / 0.78), h, { capped: true, needle: h > 120 });
    corporateSign(ctx, building, x, z, bw * 0.6, bd * 0.6, h - 10);
  } else if (crown === 'cone') {
    // An octagonal shaft under a metal cone and needle.
    const pts = ellipsePoints(x, z, bw / 2, bd / 2, 8, Math.PI / 8);
    const coneStart = snapToStoreys(y0 + (h - y0) * 0.87, y0);
    b.prism(pts, y0, coneStart, { top: false, vBase: y0, perimeter: true });
    crownBand(ctx, pts, coneStart - 1, 1, crownTint);
    b.use('metalPanel', crownTint);
    b.prism(pts, coneStart, h, { top: false, topScale: 0.28, perimeter: true });
    b.cap(scalePoints(pts, x, z, 0.28), h, true);
    spireNeedle(ctx, b, x, z, h, Math.max(8, h * 0.1), Math.min(bw, bd) * 0.06, crownTint);
  } else if (crown === 'twist') {
    // A stack of floor plates turning a little more at every step: the twist.
    const steps = Math.max(5, Math.min(12, Math.round((h - y0) / 15)));
    const maxTurn = 0.42;
    const sign = rng.chance(0.5) ? 1 : -1;
    const side = Math.min(bw, bd) / (Math.cos(maxTurn) + Math.sin(maxTurn));
    const ratio = Math.min(1.35, Math.max(bw, bd) / Math.min(bw, bd));
    const longX = bw >= bd;
    const base = rectPoints(x, z, longX ? Math.min(side * ratio, bw * 0.9) : side, longX ? side : Math.min(side * ratio, bd * 0.9));
    const stepH = (h - y0) / steps;
    let pts = base;
    for (let k = 0; k < steps; k += 1) {
      pts = rotatePoints(base, x, z, sign * maxTurn * (k / (steps - 1)));
      b.use(tile, glass);
      b.prism(pts, y0 + k * stepH, y0 + (k + 1) * stepH, { top: k === steps - 1 ? false : 'plain', topTint: 0xeeeeea, vBase: y0 });
    }
    crownBand(ctx, pts, h - 1, 1, crownTint);
    finishTowerRoof(ctx, building, pts, h, { helipad: true });
  } else {
    // A sky garden two thirds of the way up, and an open crown frame lit at night.
    const pts = chamferPoints(x, z, bw, bd, Math.min(bw, bd) * 0.08);
    const garden = snapToStoreys(y0 + (h - y0) * 0.58, y0);
    const frameBase = snapToStoreys(h - 9, y0);
    b.prism(pts, y0, garden, { top: false, vBase: y0 });
    b.use('greenery', 0x7aa850);
    b.cap(pts, garden, true);
    b.use('skyGarden', 0xffffff);
    b.prism(insetPoints(pts, 3), garden, garden + 6.8, { top: false, vBase: garden });
    b.use('plain', 0xf0f0ec);
    b.cap(pts, garden + 6.8, false);
    b.use(tile, glass);
    b.prism(pts, garden + 6.8, frameBase, { top: false, vBase: y0 });
    parapetRoof(b, pts, frameBase, 0.01, 0.01);
    crownFrame(ctx, pts, frameBase, h, crownTint);
    finishTowerRoof(ctx, building, insetPoints(pts, 1), frameBase, { capped: true, helipad: false });
    corporateSign(ctx, building, x, z, bw * 0.84, bd, garden - 8);
  }
}

/** An art-deco stepped tower: three or four tiers of stone piers and gold spandrels, a gilded cap. */
export function raiseSteppedTower(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const stone = paletteColor('spires', 'stone', building);
  const accent = rng.pick([0xe0c078, 0x6fd3b0, 0x58c4bc, 0xd8a868]);
  const deco = building.variant % 3 === 0;
  stonePodium(ctx, building, 6);
  const tiers = h > 140 ? 4 : 3;
  const fractions = tiers === 4 ? [0.4, 0.26, 0.2, 0.14] : [0.48, 0.3, 0.22];
  const y0 = 6.6;
  let bw = w - 3;
  let bd = d - 3;
  let cx = x;
  let cz = z;
  let y = y0;
  const shrink = 0.8;
  const towardBack = building.variant % 2 === 1;
  const back = faceOf(0, 0, 1, 1, backSideOf(building));
  for (let k = 0; k < tiers; k += 1) {
    const top = k === tiers - 1 ? h - 6 : snapToStoreys(y + (h - y0) * fractions[k], y0);
    const pts = chamferPoints(cx, cz, bw, bd, Math.min(bw, bd) * 0.1);
    b.use(deco ? 'decoFins' : 'glassFins', deco ? stone : accent);
    b.prism(pts, y, top, { top: false, vBase: y0 });
    b.use('stone', stone);
    b.prism(insetPoints(pts, -0.35), top, top + 0.9, { top: 'roofGravel', topTint: 0xe2dccf });
    if (k < tiers - 1) crownBand(ctx, pts, top + 0.9, 0.5, 0xffe2a0);
    y = top + 0.9;
    const nw = bw * shrink;
    const nd = bd * shrink;
    if (towardBack) {
      cx += back.nx * (bw - nw) / 2;
      cz += back.nz * (bd - nd) / 2;
    }
    bw = nw;
    bd = nd;
  }
  // A gilded pyramid cap and its needle.
  b.use('metalPanel', 0xe9b44c);
  b.pyramid(cx, cz, bw * 0.9, bd * 0.9, y, 6);
  spireNeedle(ctx, b, cx, cz, y + 5.5, Math.max(10, h * 0.12), 0.7, 0xf2d488);
  if (!deco) return;
  // Gold accent ribs climbing the lowest tier's corners.
  b.use('metalPanel', 0xe9b44c);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = x + sx * (w - 3) / 2 * 0.86;
    const pz = z + sz * (d - 3) / 2 * 0.86;
    b.box(px - 0.3, y0, pz - 0.3, px + 0.3, y0 + (h - y0) * fractions[0], pz + 0.3, { top: false });
  }
}

/** A stone office slab: long and thin, a solid service core at one end rising above its roof. */
export function raiseOfficeSlab(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const stone = paletteColor('spires', 'stone', building);
  const glass = glassTintOf(building);
  stonePodium(ctx, building, 6);
  const alongX = w >= d;
  const length = (alongX ? w : d) - 4;
  const depth = ((alongX ? d : w) - 4) * (0.58 + rng.next() * 0.16);
  const coreLen = Math.min(10, length * 0.18);
  const bodyLen = length - coreLen;
  const end = rng.chance(0.5) ? 1 : -1;
  const y0 = 6.6;
  const bodyC = (alongX ? x : z) - end * coreLen / 2;
  const coreC = (alongX ? x : z) + end * (length / 2 - coreLen / 2);
  const bodyW = alongX ? bodyLen : depth;
  const bodyD = alongX ? depth : bodyLen;
  const bx = alongX ? bodyC : x;
  const bz = alongX ? z : bodyC;
  const tile = building.variant % 3 === 0 ? 'officePunched' : building.variant % 3 === 1 ? 'glassRibbon' : 'glassGrid';
  b.use(tile, tile === 'officePunched' ? stone : glass);
  const pts = rectPoints(bx, bz, bodyW, bodyD);
  b.prism(pts, y0, h + 1.2, { top: false, vBase: y0 });
  parapetRoof(b, pts, h + 1.2, 1.2, 0.4);
  // The core: solid stone with a dark glass slot, standing proud of the roof.
  const cw = alongX ? coreLen : depth * 1.12;
  const cd = alongX ? depth * 1.12 : coreLen;
  const ccx = alongX ? coreC : x;
  const ccz = alongX ? z : coreC;
  b.use('decoFins', mixHex(stone, 0xffffff, 0.25));
  b.box(ccx - cw / 2, y0, ccz - cd / 2, ccx + cw / 2, h + 7, ccz + cd / 2, { top: 'roofGravel', vBase: y0 });
  // A lit seam running up the middle of the core's street face.
  b.use('crownLights', 0xffe2b0);
  const slot = faceOf(ccx, ccz, cw, cd, frontDoorSideOf(building));
  const sx = slot.ax + slot.tx * (slot.length / 2 - 0.6) + slot.nx * 0.06;
  const sz = slot.az + slot.tz * (slot.length / 2 - 0.6) + slot.nz * 0.06;
  b.wall(sx, sz, sx + slot.tx * 1.2, sz + slot.tz * 1.2, y0 + 3, h + 6, { repeatU: 1 });
  // A thin sunshade slab hovering over the roof.
  b.use('plain', 0xf2efe8);
  b.slab(bx - bodyW / 2 + 0.5, bz - bodyD / 2 + 0.5, bx + bodyW / 2 - 0.5, bz + bodyD / 2 - 0.5, h + 4.6, 0.5);
  for (const t of [0.2, 0.5, 0.8]) {
    const px = alongX ? bx - bodyW / 2 + bodyW * t : bx;
    const pz = alongX ? bz : bz - bodyD / 2 + bodyD * t;
    b.box(px - 0.3, h, pz - 0.3, px + 0.3, h + 4.6, pz + 0.3, { top: false });
  }
  plantRoom(b, bx, bz, bodyW * 0.3, bodyD * 0.4, h, 3);
  if (h > 100) {
    antennaMast(ctx, b, ccx, ccz, h + 7, 14 + rng.next() * 10);
    const sign = ctx.nextSign('spires');
    if (sign) {
      const face = faceOf(ccx, ccz, cw, cd, frontDoorSideOf(building));
      if (face.length > 9) hangWallSign(b, face, sign, h + 1.5, Math.min(face.length * 0.9, 14), Math.min(face.length * 0.9, 14) / 7);
    }
  }
}

/** A white marina apartment tower: rounded, ringed with deep balconies, a pool deck or a sail on top. */
export function raiseApartmentTower(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const white = paletteColor('marina', 'white', building);
  const rail = rng.chance(0.5) ? 0xffffff : paletteColor('marina', 'accent', building, 1);
  const outerW = w - 4;
  const outerD = d - 4;
  const deep = 1.9;
  const radius = building.variant % 3 === 0 ? 2 : Math.min(outerW, outerD) * (0.2 + rng.next() * 0.18);
  const outer = roundedPoints(x, z, outerW, outerD, radius, 3);
  const inner = insetPoints(outer, deep);
  const lobbyH = 5;
  const storey = 3.2;
  const crownH = building.variant % 2 === 0 ? 7 : 4;
  const floors = Math.max(4, storeysForHeight(h - lobbyH - crownH, storey));
  const top = lobbyH + floors * storey;
  // Lobby: glass behind white columns, under the first balcony.
  b.use('lobbyGlass', 0xffffff);
  b.prism(inner, 0, lobbyH, { top: false, perimeter: true, smooth: true });
  b.use('plain', white);
  for (let i = 0; i < outer.length; i += 2) b.box(outer[i][0] - 0.35, 0, outer[i][1] - 0.35, outer[i][0] + 0.35, lobbyH, outer[i][1] + 0.35, { top: false });
  // The body behind the balconies, then a balcony ring at every floor.
  b.use('balconyDeep', white);
  b.prism(inner, lobbyH, top, { top: false, perimeter: true, smooth: true, vBase: lobbyH });
  for (let k = 0; k < floors; k += 1) {
    const y = lobbyH + k * storey;
    b.use('plain', white);
    b.cap(outer, y, false);
    ringCap(b, outer, inner, y + 0.3);
    b.use('balconyRail', rail);
    b.prismWalls(outer, y, y + 1.25, { perimeter: true, smooth: true, vBase: y });
  }
  // Crown: a white parapet ring, then a pool deck with pergola, or a sail-shaped fin.
  b.use('apartmentWindows', white);
  const crownPts = scalePoints(inner, x, z, 0.82);
  b.prism(outer, top, top + 1.2, { top: false, perimeter: true, smooth: true });
  b.use('plain', white);
  ringCap(b, outer, inner, top + 1.2);
  b.cap(inner, top + 0.2, true);
  if (building.variant % 2 === 0) {
    b.use('apartmentWindows', white);
    b.prism(crownPts, top, top + crownH - 1, { top: 'roofGravel', perimeter: true, smooth: true, vBase: top });
    const reach = Math.min(outerW, outerD) * 0.3;
    roofPool(b, rng, x - reach, z - reach * 0.5, x + reach * 0.4, z + reach * 0.3, top + 0.2);
    pergola(ctx, x + reach * 0.5, z - reach * 0.5, x + reach, z + reach * 0.3, top + 0.2, 2.6);
  } else {
    // The sail: a tall curved white fin rising from one side of the roof.
    const alongX = outerW >= outerD;
    const len = (alongX ? outerW : outerD) * 0.62;
    const sailH = 10 + rng.next() * 10;
    b.use('plain', 0xffffff);
    const steps = 6;
    for (let k = 0; k < steps; k += 1) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const a = -len / 2 + len * t0;
      const c = -len / 2 + len * t1;
      const h0 = top + sailH * Math.sin(t0 * Math.PI * 0.5 + 0.2);
      const h1 = top + sailH * Math.sin(t1 * Math.PI * 0.5 + 0.2);
      const off = (alongX ? outerD : outerW) * 0.18;
      if (alongX) {
        b.quad([x + a, top, z - off], [x + c, top, z - off], [x + c, h1, z - off], [x + a, h0, z - off], 0, 0, 1, 1);
        b.quad([x + c, top, z - off], [x + a, top, z - off], [x + a, h0, z - off], [x + c, h1, z - off], 0, 0, 1, 1);
      } else {
        b.quad([x - off, top, z + c], [x - off, top, z + a], [x - off, h0, z + a], [x - off, h1, z + c], 0, 0, 1, 1);
        b.quad([x - off, top, z + a], [x - off, top, z + c], [x - off, h1, z + c], [x - off, h0, z + a], 0, 0, 1, 1);
      }
    }
    const tipX = alongX ? x + len / 2 : x - (outerW * 0.18);
    const tipZ = alongX ? z - outerD * 0.18 : z + len / 2;
    ctx.beacon(tipX, top + sailH * Math.sin(Math.PI * 0.5 + 0.2) + 0.4, tipZ, 0xff2a1a, 3, 1);
    roofPlanters(b, rng, x - outerW * 0.3, z + 1, x + outerW * 0.3, z + outerD * 0.3, top + 0.2);
  }
}

/** A Lantern Row hotel: a coloured balcony slab with neon edges, a blade sign and a rooftop sign. */
export function raiseHotel(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const color = paletteColor('lantern', 'color', building);
  const neon = mixHex(color, 0xffffff, 0.25);
  const sign = ctx.nextSign('lantern');
  // A two-storey lobby podium with a glass front and a canopy over the entrance.
  const podiumH = 7;
  b.use('podiumShops', 0xfaf4ea);
  b.prism(rectPoints(x, z, w - 1, d - 1), 0, podiumH, { top: 'stone', topTint: 0xefe6d6 });
  const front = faceOf(x, z, w - 1, d - 1, frontDoorSideOf(building));
  lobbyFront(b, front, podiumH, Math.min(14, front.length * 0.5));
  // The slab, its corners traced in neon.
  const bw = w - 3;
  const bd = d - 3;
  const pts = rectPoints(x, z, bw, bd);
  const top = snapToStoreys(h - 1.5, podiumH, 3.4);
  b.use(building.variant % 3 === 2 ? 'hotelGlass' : 'hotelBalconies', color);
  b.prism(pts, podiumH, top + 1.2, { top: false, vBase: podiumH });
  parapetRoof(b, pts, top + 1.2, 1.2, 0.4);
  neonEdges(b, x, z, bw, bd, podiumH, top + 1.2, neon);
  // Crown: a curved roof, a stepped penthouse or an open frame.
  const crown = building.variant % 3;
  if (crown === 0) {
    b.use('metalPanel', color);
    b.barrelVault(x - bw / 2 + 1.5, z - bd / 2 + 1.5, x + bw / 2 - 1.5, z + bd / 2 - 1.5, top, Math.min(bw, bd) * 0.22, bw > bd, 6, { endTile: 'hotelGlass', endTint: color });
  } else if (crown === 1) {
    b.use('hotelGlass', mixHex(color, 0xffffff, 0.3));
    b.box(x - bw * 0.3, top, z - bd * 0.3, x + bw * 0.3, top + 4, z + bd * 0.3, { top: 'roofGravel' });
    crownBand(ctx, rectPoints(x, z, bw * 0.6, bd * 0.6), top + 3, 0.6, neon);
  } else {
    crownFrame(ctx, insetPoints(pts, 0.5), top + 1.2, top + 6, neon);
  }
  if (sign) {
    const face = faceOf(x, z, bw, bd, frontDoorSideOf(building));
    const signW = Math.min(face.length * 0.9, 18);
    const mid = { x: face.ax + face.tx * face.length / 2 - face.nx * 3, z: face.az + face.tz * face.length / 2 - face.nz * 3 };
    if (crown !== 0) raiseRooftopSign(b, face, sign, mid.x, mid.z, top + 0.2, signW, signW / 6.5, crown === 2 ? 6.2 : 1.2);
    else hangWallSign(b, face, sign, top - 4.5, signW, signW / 7);
    const bladeH = Math.min(16, top - podiumH - 4);
    if (bladeH > 6) hangBladeSign(b, face, sign, podiumH + 2, bladeH, 2.2, face.length * (rng.chance(0.5) ? 0.12 : 0.88), color);
  }
  airConUnits(b, rng, x - bw / 2 + 1, z - bd / 2 + 1, x - bw / 2 + 5, z + bd / 2 - 1, top + 0.2, 3);
}

/** A Lantern Row club: a dark, neon-banded podium with a big sign, and often a glass tower above. */
export function raiseNeonClub(ctx, building) {
  const { x, z, w, d, h } = building;
  const rng = ctx.rng;
  const b = ctx.solid;
  const color = paletteColor('lantern', 'color', building, 2);
  const neon = mixHex(color, 0xffffff, 0.2);
  const sign = ctx.nextSign('lantern');
  const podiumH = Math.min(h, 10 + rng.next() * 3);
  const pts = rectPoints(x, z, w - 1, d - 1);
  b.use('clubPanels', color);
  b.prism(pts, 0, podiumH, { top: 'roofGravel', vBase: 0 });
  const front = faceOf(x, z, w - 1, d - 1, frontDoorSideOf(building));
  lobbyFront(b, front, 4.5, Math.min(10, front.length * 0.4));
  // Neon bands around the podium.
  for (const y of [podiumH - 0.8, podiumH - 2.2]) neonRing(b, pts, y, 0.3, neon);
  if (sign) hangWallSign(b, front, sign, 5.2, Math.min(front.length * 0.86, 20), Math.min(front.length * 0.86, 20) / 6.9, front.length / 2, 0.3);
  if (h - podiumH < 8) return;
  // The tower: coloured glass, lit edges, a crown of light.
  const bw = (w - 1) * 0.78;
  const bd = (d - 1) * 0.72;
  const tx = x;
  const tz = z - front.nz * (d - bd) * 0.12 - 0;
  const tower = rectPoints(tx - front.nx * (w - bw) * 0.12, tz, bw, bd);
  b.use('hotelGlass', mixHex(color, 0xffffff, 0.15));
  b.prism(tower, podiumH, h, { top: 'roofGravel', vBase: podiumH });
  const c = tower;
  const minX = Math.min(c[0][0], c[2][0]);
  const maxX = Math.max(c[0][0], c[2][0]);
  const minZ = Math.min(c[0][1], c[2][1]);
  const maxZ = Math.max(c[0][1], c[2][1]);
  neonEdges(b, (minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ, podiumH, h, neon);
  crownBand(ctx, tower, h - 1.5, 1.5, neon);
  if (rng.chance(0.6)) helipad(ctx, b, (minX + maxX) / 2, (minZ + maxZ) / 2, Math.min(maxX - minX, maxZ - minZ) * 0.6, h);
  else satelliteDishes(b, rng, minX + 1, minZ + 1, maxX - 1, maxZ - 1, h, 2);
}

// ---- tower pieces (podiums, lobbies, crown bands and frames are shared in buildingShapes.js) ----

/** Thin vertical fins down every face of a rectangular tower, up to a (possibly sloped) top. */
function towerFins(ctx, cx, cz, bw, bd, y0, topAt, tint) {
  const b = ctx.solid;
  b.use('metalPanel', mixHex(tint, 0xffffff, 0.5));
  const pitch = 4;
  const depth = 0.8;
  for (const side of ['n', 's', 'e', 'w']) {
    const face = faceOf(cx, cz, bw, bd, side);
    const count = Math.floor(face.length / pitch);
    const start = (face.length - (count - 1) * pitch) / 2;
    for (let i = 0; i < count; i += 1) {
      const px = face.ax + face.tx * (start + i * pitch);
      const pz = face.az + face.tz * (start + i * pitch);
      const qx = px + face.nx * depth;
      const qz = pz + face.nz * depth;
      const top = topAt(px, pz);
      b.box(Math.min(px, qx) - Math.abs(face.tx) * 0.18, y0, Math.min(pz, qz) - Math.abs(face.tz) * 0.18, Math.max(px, qx) + Math.abs(face.tx) * 0.18, top, Math.max(pz, qz) + Math.abs(face.tz) * 0.18);
    }
  }
}

/** Neon tubes up the four corners of a rectangle and around its top. */
function neonEdges(b, cx, cz, w, d, y0, y1, tint) {
  b.use('neonTube', tint);
  const s = 0.18;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = cx + sx * (w / 2 + 0.05);
    const pz = cz + sz * (d / 2 + 0.05);
    b.box(px - s, y0 + 0.5, pz - s, px + s, y1, pz + s, { top: false });
  }
  neonRing(b, rectPoints(cx, cz, w, d), y1 - 0.4, 0.3, tint);
}

/** A ring of neon tube around an outline at height y. */
function neonRing(b, points, y, size, tint) {
  b.use('neonTube', tint);
  b.prismWalls(insetPoints(points, -0.1), y, y + size, { perimeter: true });
}

/** Close a tower's roof and dress it: plant room, AC, a helipad or a needle, beacons at the corners. */
function finishTowerRoof(ctx, building, points, y, o = {}) {
  const b = ctx.solid;
  const rng = ctx.rng;
  if (!o.capped) {
    b.use('roofGravel', 0xe4dfd4);
    b.cap(points, y, true);
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [px, pz] of points) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.min(maxX - minX, maxZ - minZ);
  if (o.needle) {
    spireNeedle(ctx, b, cx, cz, y, Math.max(10, building.h * 0.14), Math.max(0.8, span * 0.05), 0xe8ecf0);
  } else if ((o.helipad ?? true) && span > 22 && rng.chance(0.4)) {
    helipad(ctx, b, cx, cz, Math.min(18, span * 0.7), y);
    return;
  } else if (building.h > 80 && rng.chance(0.5)) {
    // A crown blade: a thin wall of metal standing up from one edge of the roof, lit along its top.
    const alongX = maxX - minX >= maxZ - minZ;
    const edge = rng.chance(0.5) ? 1 : -1;
    const length = (alongX ? maxX - minX : maxZ - minZ) * 0.7;
    const bladeH = 10 + rng.next() * Math.min(18, building.h * 0.1);
    const ex = alongX ? cx : cx + edge * ((maxX - minX) / 2 - 0.8);
    const ez = alongX ? cz + edge * ((maxZ - minZ) / 2 - 0.8) : cz;
    const hx = alongX ? length / 2 : 0.4;
    const hz = alongX ? 0.4 : length / 2;
    b.use('metalPanel', 0xe4e8ec);
    b.box(ex - hx, y, ez - hz, ex + hx, y + bladeH, ez + hz, { top: false });
    b.use('crownLights', 0xfff0d0);
    b.box(ex - hx - 0.05, y + bladeH, ez - hz - 0.05, ex + hx + 0.05, y + bladeH + 0.6, ez + hz + 0.05);
    ctx.beacon(ex, y + bladeH + 1, ez, 0xff2a1a, 3, 1);
  }
  if (o.plant !== false && span > 10) {
    plantRoom(b, cx + (rng.next() - 0.5) * span * 0.2, cz + (rng.next() - 0.5) * span * 0.2, span * 0.38, span * 0.3, y, 3 + rng.next() * 1.5);
    airConUnits(b, rng, minX + 1.5, minZ + 1.5, maxX - 1.5, minZ + span * 0.3, y, 3);
    if (rng.chance(0.3)) waterTanks(b, rng, minX + 1.5, maxZ - 4, maxX - 1.5, maxZ - 1.5, y, 2);
  }
  if (building.h > 100 && !o.needle) {
    for (const [px, pz] of [[minX + 0.6, minZ + 0.6], [maxX - 0.6, maxZ - 0.6]]) ctx.beacon(px, y + 0.8, pz, 0xff2a1a, 3, 1);
  }
}

/** A corporate name high on a tall Spires tower, facing its street. */
function corporateSign(ctx, building, cx, cz, bw, bd, y) {
  if (building.district !== 'spires' || building.h < 110 || !ctx.rng.chance(0.55)) return;
  const sign = ctx.nextSign('spires');
  if (!sign) return;
  const face = faceOf(cx, cz, bw, bd, frontDoorSideOf(building));
  const width = Math.min(face.length * 0.62, 24);
  hangWallSign(ctx.solid, face, sign, y, width, width / 7, face.length / 2, 0.25);
}

/** Flat ring between an outer and an inner outline (balcony floors, parapet tops). */
function ringCap(b, outer, inner, y) {
  const n = outer.length;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    b.quad([outer[i][0], y, outer[i][1]], [outer[j][0], y, outer[j][1]], [inner[j][0], y, inner[j][1]], [inner[i][0], y, inner[i][1]], 0, 0, 1, 0.3);
  }
}

/** The glass colour of a tower, from its district's palette. */
function glassTintOf(building) {
  if (building.district === 'lantern') return paletteColor('lantern', 'color', building, 1);
  if (building.district === 'marina') return paletteColor('marina', 'accent', building);
  return paletteColor('spires', 'glass', building);
}

const GLASS_TILES = ['glassGrid', 'glassRibbon', 'glassFins', 'glassSeamless'];
