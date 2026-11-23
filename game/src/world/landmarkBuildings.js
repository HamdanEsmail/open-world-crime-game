// Port Sarab's one-off landmarks: PSPD Headquarters and its motor pool, Sarab General Hospital, the
// four arcaded halls of the Grand Souk, the Sundial Tower, the crescent of the Mirage Grand Hotel,
// Haddad Motors, the Crescent Yacht Club and the Mina Customs House (the Vane Spire has its own file).
import { rectPoints, ellipsePoints, faceOf } from './buildingGeometryBuilder.js';
import { parapetRoof, plantRoom, airConUnits, helipad, antennaMast, windTower, roofDome, waterTanks } from './rooftopDetails.js';
import { hangWallSign } from './neonSigns.js';
import { raiseVaneSpire } from './landmarkVaneSpire.js';

/** The plan styles drawn here rather than by the ordinary district shapes. */
export const LANDMARK_STYLES = new Set(['vaneSpire', 'policeHQ', 'policeGarage', 'hospital', 'soukHall', 'clockTower', 'grandHotel', 'garage', 'yachtClub', 'customsHouse']);

/** Raise one landmark building of the plan. */
export function raiseLandmarkBuilding(ctx, building) {
  const raise = LANDMARK_BUILDERS[building.style];
  if (raise) raise(ctx, building);
}

const LANDMARK_BUILDERS = {
  vaneSpire: raiseVaneSpire,
  policeHQ: raisePoliceHeadquarters,
  policeGarage: raisePoliceMotorPool,
  hospital: raiseSarabGeneral,
  soukHall: raiseSoukHall,
  clockTower: raiseSundialTower,
  grandHotel: raiseMirageGrand,
  garage: raiseHaddadMotors,
  yachtClub: raiseYachtClub,
  customsHouse: raiseCustomsHouse,
};

/** PSPD Headquarters: a sand-stone civic fortress with corner towers, a night-blue band and its crest. */
function raisePoliceHeadquarters(ctx, building) {
  const { x, z, w, d, h } = building;
  const b = ctx.solid;
  const rng = ctx.rng;
  const sand = 0xf2dfb8;
  const blue = 0x2c56a8;
  const bodyH = h - 4;
  const body = rectPoints(x, z, w - 6, d - 6);
  b.use('officePunched', sand);
  b.prism(body, 0, bodyH + 1.2, { top: false });
  parapetRoof(b, body, bodyH + 1.2, 1.2, 0.5);
  // The night-blue band of the force, wrapped round the building.
  b.use('darkGlass', blue);
  b.prism(rectPoints(x, z, w - 5.2, d - 5.2), bodyH - 7, bodyH - 2.5, { top: 'plain', topTint: sand });
  // Corner towers, taller, with slit windows and battlements of light.
  const tower = 13;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = x + sx * (w / 2 - tower / 2);
    const tz = z + sz * (d / 2 - tower / 2);
    b.use('stone', sand);
    b.prism(rectPoints(tx, tz, tower, tower), 0, h, { top: 'roofGravel', topTint: 0xd8ccb4 });
    b.use('crownLights', 0x7fa8ff);
    b.prismWalls(rectPoints(tx, tz, tower + 0.2, tower + 0.2), h - 1.2, h - 0.5, { perimeter: true });
    ctx.beacon(tx + sx * (tower / 2 - 0.5), h + 0.4, tz + sz * (tower / 2 - 0.5), 0x3a6bff, 2.6, 2);
  }
  // The portico: columns, a deep canopy, the crest above, PSPD on the band.
  const front = faceOf(x, z, w - 6, d - 6, building.front);
  const span = Math.min(30, front.length * 0.4);
  b.use('stone', 0xf2e6cc);
  for (let i = 0; i <= 5; i += 1) {
    const at = front.length / 2 - span / 2 + (span * i) / 5;
    const px = front.ax + front.tx * at + front.nx * 2.2;
    const pz = front.az + front.tz * at + front.nz * 2.2;
    b.cylinder(px, pz, 0.6, 0, 9, 8);
  }
  const cx0 = Math.min(front.ax + front.tx * (front.length / 2 - span / 2 - 1), front.ax + front.tx * (front.length / 2 + span / 2 + 1));
  const cx1 = Math.max(front.ax + front.tx * (front.length / 2 - span / 2 - 1), front.ax + front.tx * (front.length / 2 + span / 2 + 1));
  const cz = front.az;
  b.use('stone', sand);
  if (front.nz !== 0) b.slab(cx0, Math.min(cz, cz + front.nz * 3), cx1, Math.max(cz, cz + front.nz * 3), 9, 1);
  b.use('lobbyGlass', 0xffffff);
  b.wall(front.ax + front.tx * (front.length / 2 - span / 2) + front.nx * 0.08, front.az + front.tz * (front.length / 2 - span / 2) + front.nz * 0.08,
    front.ax + front.tx * (front.length / 2 + span / 2) + front.nx * 0.08, front.az + front.tz * (front.length / 2 + span / 2) + front.nz * 0.08, 0, 6, { v0: 0, v1: 1 });
  b.use('policeCrest', 0xffffff);
  const crest = 7;
  const mx = front.ax + front.tx * front.length / 2 + front.nx * 0.15;
  const mz = front.az + front.tz * front.length / 2 + front.nz * 0.15;
  b.wall(mx - front.tx * crest / 2, mz - front.tz * crest / 2, mx + front.tx * crest / 2, mz + front.tz * crest / 2, 10.5, 10.5 + crest, { fit: true });
  const band = faceOf(x, z, w - 5.2, d - 5.2, building.front);
  hangWallSign(b, band, 'pspd', bodyH - 6.8, 22, 4.2, band.length * 0.27, 0.06);
  hangWallSign(b, band, 'pspd', bodyH - 6.8, 22, 4.2, band.length * 0.73, 0.06);
  // The roof: helipad, comms mast and plant.
  helipad(ctx, b, x - w * 0.18, z, 17, bodyH);
  antennaMast(ctx, b, x + w * 0.22, z - d * 0.12, bodyH, 30);
  plantRoom(b, x + w * 0.2, z + d * 0.14, 14, 8, bodyH, 3.4);
  airConUnits(b, rng, x + 4, z - d / 2 + 6, x + w / 2 - 15, z - d / 2 + 12, bodyH, 4);
}

/** PSPD Motor Pool: a sand-stone garage, blue doors, a blue band and the force's name. */
function raisePoliceMotorPool(ctx, building) {
  const { x, z, w, d, h } = building;
  const b = ctx.solid;
  b.use('stone', 0xe8cf9e);
  b.box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, { top: 'roofGravel', topTint: 0xd8ccb4 });
  b.use('darkGlass', 0x1d3360);
  b.prismWalls(rectPoints(x, z, w + 0.3, d + 0.3), h - 2.6, h - 0.6);
  const front = faceOf(x, z, w, d, building.front);
  b.use('rollerDoor', 0x8aa8d8);
  for (let i = 0; i < 3; i += 1) {
    const at = front.length * (i + 0.5) / 3;
    const ax = front.ax + front.tx * (at - 2.8) + front.nx * 0.06;
    const az = front.az + front.tz * (at - 2.8) + front.nz * 0.06;
    b.wall(ax, az, ax + front.tx * 5.6, az + front.tz * 5.6, 0, 5.4, { fit: true });
  }
  hangWallSign(b, faceOf(x, z, w + 0.3, d + 0.3, building.front), 'pspd', h - 2.5, 12, 1.8, front.length / 2, 0.06);
}

/** Sarab General Hospital: a white slab with teal ribbon windows, its emblem, helipad and ambulance bay. */
function raiseSarabGeneral(ctx, building) {
  const { x, z, w, d, h } = building;
  const b = ctx.solid;
  const rng = ctx.rng;
  const front = building.front;
  const mainD = d * 0.56;
  const back = faceOf(0, 0, 1, 1, front === 's' ? 'n' : 's');
  const mainZ = z + back.nz * (d - mainD) / 2;
  const main = rectPoints(x, mainZ, w - 2, mainD);
  b.use('glassRibbon', 0xd8f4f0);
  b.prism(main, 0, h + 1.2, { top: false });
  parapetRoof(b, main, h + 1.2, 1.2, 0.5);
  // The lower front wing with the entrance.
  const wingD = d - mainD - 1;
  const wingZ = z - back.nz * (d - wingD) / 2;
  const wingH = 14;
  const wing = rectPoints(x, wingZ, w * 0.72, wingD);
  b.use('apartmentWindows', 0xfafafa);
  b.prism(wing, 0, wingH + 1, { top: false });
  parapetRoof(b, wing, wingH + 1, 1, 0.4);
  b.use('crownLights', 0x5ff0e4);
  b.prismWalls(rectPoints(x, wingZ, w * 0.72 + 0.2, wingD + 0.2), wingH - 0.6, wingH);
  const wingFace = faceOf(x, wingZ, w * 0.72, wingD, front);
  b.use('lobbyGlass', 0xffffff);
  b.wall(wingFace.ax + wingFace.tx * 14 + wingFace.nx * 0.08, wingFace.az + wingFace.tz * 14 + wingFace.nz * 0.08,
    wingFace.bx - wingFace.tx * 14 + wingFace.nx * 0.08, wingFace.bz - wingFace.tz * 14 + wingFace.nz * 0.08, 0, 6, { v0: 0, v1: 1 });
  // Ambulance bay canopy with a teal-and-coral fascia.
  const reach = 5;
  const ax0 = Math.min(wingFace.ax, wingFace.bx) + 10;
  const ax1 = Math.max(wingFace.ax, wingFace.bx) - 10;
  const az0 = Math.min(wingFace.az, wingFace.az + wingFace.nz * reach);
  const az1 = Math.max(wingFace.az, wingFace.az + wingFace.nz * reach);
  b.use('plain', 0xf8f8f6);
  b.slab(ax0, az0, ax1, az1, 5, 0.6);
  b.use('plain', 0x1ba39c);
  b.wall(ax0, az1, ax1, az1, 5.0, 5.35);
  b.use('plain', 0xe4572e);
  b.wall(ax0, az1, ax1, az1, 5.35, 5.6);
  for (const px of [ax0 + 0.5, (ax0 + ax1) / 2, ax1 - 0.5]) b.box(px - 0.25, 0, az1 - 0.75, px + 0.25, 5, az1 - 0.25, { top: false });
  // Emblem and name on the main block, facing the street over the wing.
  const mainFace = faceOf(x, mainZ, w - 2, mainD, front);
  b.use('hospitalEmblem', 0xffffff);
  const mx = mainFace.ax + mainFace.tx * mainFace.length / 2 + mainFace.nx * 0.12;
  const mz = mainFace.az + mainFace.tz * mainFace.length / 2 + mainFace.nz * 0.12;
  b.wall(mx - mainFace.tx * 5, mz - mainFace.tz * 5, mx + mainFace.tx * 5, mz + mainFace.tz * 5, h - 11.5, h - 1.5, { fit: true });
  hangWallSign(b, wingFace, 'sarabGeneral', 8.6, 30, 4.3, wingFace.length / 2, 0.12);
  helipad(ctx, b, x - w * 0.26, mainZ, 18, h);
  plantRoom(b, x + w * 0.22, mainZ, 16, 10, h, 3.6);
  airConUnits(b, rng, x - 6, mainZ - mainD / 2 + 2, x + 10, mainZ - mainD / 2 + 7, h, 4);
  ctx.beacon(x - w * 0.26, h + 1.4, mainZ, 0x5ff0e4, 2.2, 0);
}

/** One long hall of the Grand Souk: an arcade under striped awnings, a barrel vault, wind towers. */
function raiseSoukHall(ctx, building) {
  const { x, z, w, d, h } = building;
  const b = ctx.solid;
  const cut = ctx.cutout;
  const rng = ctx.rng;
  const tint = 0xe8cfa0;
  const alongX = w >= d;
  const arcade = 2.6;
  const x0 = x - w / 2 + (building.front === 'w' ? arcade : 0);
  const x1 = x + w / 2 - (building.front === 'e' ? arcade : 0);
  const z0 = z - d / 2 + (building.front === 'n' ? arcade : 0);
  const z1 = z + d / 2 - (building.front === 's' ? arcade : 0);
  const wallTop = h - 3;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  for (const side of ['n', 's', 'e', 'w']) {
    const f = faceOf(cx, cz, x1 - x0, z1 - z0, side);
    b.use(side === building.front ? 'plasterArches' : 'plasterWindows', tint);
    b.wall(f.ax, f.az, f.bx, f.bz, 0, 3.8);
    b.use('plasterWindows', tint);
    b.wall(f.ax, f.az, f.bx, f.bz, 3.8, wallTop, { vBase: 3.8 });
  }
  b.use('plasterBlank', 0xf2e4c8);
  b.barrelVault(x0, z0, x1, z1, wallTop, 2.6, alongX, 8, { endTile: 'plasterBlank', endTint: tint });
  // Lit lanterns along the ridge.
  const len = alongX ? x1 - x0 : z1 - z0;
  const lanterns = Math.max(2, Math.round(len / 22));
  for (let i = 0; i < lanterns; i += 1) {
    const t = (i + 0.5) / lanterns;
    const lx = alongX ? x0 + (x1 - x0) * t : cx;
    const lz = alongX ? cz : z0 + (z1 - z0) * t;
    b.use('crownLights', 0xffc870);
    b.box(lx - 1, wallTop + 2.4, lz - 1, lx + 1, wallTop + 3.6, lz + 1, { top: false });
    b.use('metalPanel', 0xc9962e);
    b.pyramid(lx, lz, 2.4, 2.4, wallTop + 3.6, 1.4);
  }
  // The arcade: columns and a long striped awning over the shopfronts.
  const front = faceOf(cx, cz, x1 - x0, z1 - z0, building.front);
  b.use('plain', 0xf4e8d0);
  const posts = Math.max(3, Math.round(front.length / 5));
  for (let i = 0; i <= posts; i += 1) {
    const px = front.ax + front.tx * front.length * (i / posts) + front.nx * (arcade - 0.3);
    const pz = front.az + front.tz * front.length * (i / posts) + front.nz * (arcade - 0.3);
    b.box(px - 0.22, 0, pz - 0.22, px + 0.22, 3.6, pz + 0.22, { top: false });
  }
  const colors = [0xe4572e, 0x1ba39c, 0xe9b44c, 0x2f6fa8];
  const pieces = Math.max(2, Math.round(front.length / 14));
  for (let i = 0; i < pieces; i += 1) {
    const a = front.length * (i / pieces);
    const c = front.length * ((i + 1) / pieces) - 0.2;
    cut.use('awningStripes', colors[(i + Math.floor(rng.next() * 4)) % colors.length]);
    const ax = front.ax + front.tx * a + front.nx * 0.05;
    const az = front.az + front.tz * a + front.nz * 0.05;
    const bx = front.ax + front.tx * c + front.nx * 0.05;
    const bz = front.az + front.tz * c + front.nz * 0.05;
    cut.quad([ax + front.nx * arcade, 3.6, az + front.nz * arcade], [bx + front.nx * arcade, 3.6, bz + front.nz * arcade], [bx, 4.6, bz], [ax, 4.6, az], 0, 0, (c - a) / 2.4, 0.999);
  }
  // A gateway at the middle of the arcade with the market's name, and wind towers at the ends.
  const gate = 8;
  const gx = front.ax + front.tx * front.length / 2;
  const gz = front.az + front.tz * front.length / 2;
  b.use('plasterBlank', 0xf0dcb4);
  const g0x = Math.min(gx - front.tx * gate / 2, gx + front.tx * gate / 2 + front.nx * 0.8);
  const g1x = Math.max(gx - front.tx * gate / 2, gx + front.tx * gate / 2 + front.nx * 0.8);
  const g0z = Math.min(gz - front.tz * gate / 2, gz + front.tz * gate / 2 + front.nz * 0.8);
  const g1z = Math.max(gz - front.tz * gate / 2, gz + front.tz * gate / 2 + front.nz * 0.8);
  b.box(g0x, 0, g0z, g1x, h, g1z);
  cut.use('crenellation', 0xf0dcb4);
  cut.wall(gx - front.tx * gate / 2 + front.nx * 0.82, gz - front.tz * gate / 2 + front.nz * 0.82, gx + front.tx * gate / 2 + front.nx * 0.82, gz + front.tz * gate / 2 + front.nz * 0.82, h, h + 1.2);
  cut.use('doorArch', 0x1b6f6a);
  cut.wall(gx - front.tx * 2.4 + front.nx * 0.85, gz - front.tz * 2.4 + front.nz * 0.85, gx + front.tx * 2.4 + front.nx * 0.85, gz + front.tz * 2.4 + front.nz * 0.85, 0, 5.4, { fit: true });
  const gateFace = { ...front, ax: gx - front.tx * gate / 2 + front.nx * 0.8, az: gz - front.tz * gate / 2 + front.nz * 0.8, length: gate };
  hangWallSign(b, gateFace, 'grandSouk', 5.8, 7.4, 1.06, gate / 2, 0.06);
  for (const t of [0.06, 0.94]) {
    const px = alongX ? x0 + (x1 - x0) * t : cx;
    const pz = alongX ? cz : z0 + (z1 - z0) * t;
    windTower(ctx, px, pz, wallTop, 3, 7, tint);
  }
}

/** The Sundial Tower: a battered sand shaft, great dials on four faces, a gnomon and a lit lantern. */
function raiseSundialTower(ctx, building) {
  const { x, z, w, h } = building;
  const b = ctx.solid;
  const cut = ctx.cutout;
  const sand = 0xe8c48a;
  b.use('stone', 0xf0dcb0);
  b.box(x - w / 2, 0, z - w / 2, x + w / 2, 3, z + w / 2);
  const shaft = w - 2;
  const dialBase = h - 13;
  b.use('plasterBlank', sand);
  b.prism(rectPoints(x, z, shaft, shaft), 3, dialBase, { top: false, topScale: 0.92 });
  b.use('stone', 0xf0dcb0);
  for (const y of [14, 26]) {
    const s = shaft * (1 - 0.08 * ((y - 3) / (dialBase - 3))) + 0.5;
    b.box(x - s / 2, y, z - s / 2, x + s / 2, y + 0.8, z + s / 2);
  }
  // The dial stage, corbelled out a little, with a dial on every face.
  const stage = shaft * 0.92 + 1.6;
  b.use('plasterBlank', sand);
  b.box(x - stage / 2, dialBase, z - stage / 2, x + stage / 2, dialBase + 9, z + stage / 2, { top: 'plain', topTint: 0xf4e4c4 });
  b.use('stone', 0xf0dcb0);
  b.box(x - stage / 2 - 0.3, dialBase - 0.6, z - stage / 2 - 0.3, x + stage / 2 + 0.3, dialBase, z + stage / 2 + 0.3, { bottom: true });
  b.use('sundialFace', 0xffffff);
  for (const side of ['n', 's', 'e', 'w']) {
    const f = faceOf(x, z, stage, stage, side);
    const m = 0.6;
    b.wall(f.ax + f.tx * m + f.nx * 0.06, f.az + f.tz * m + f.nz * 0.06, f.bx - f.tx * m + f.nx * 0.06, f.bz - f.tz * m + f.nz * 0.06, dialBase + 0.6, dialBase + 0.6 + stage - 2 * m, { fit: true });
  }
  // The gnomon: a gold blade standing out of the south dial.
  b.use('metalPanel', 0xe9b44c);
  const gy = dialBase + 0.6 + (stage - 1.2) / 2;
  const gz = z + stage / 2 + 0.06;
  for (const s of [-1, 1]) {
    const gx = x + s * 0.08;
    if (s > 0) b.triangle([gx, gy, gz], [gx, gy + 3, gz], [gx, gy, gz + 3.2], 0, 0, 1, 0, 0, 1);
    else b.triangle([gx, gy, gz], [gx, gy, gz + 3.2], [gx, gy + 3, gz], 0, 0, 1, 0, 0, 1);
  }
  // The lantern: corner piers round a glowing core, a dome and a finial.
  const lantern = stage - 2;
  const ly = dialBase + 9;
  b.use('crownLights', 0xffd890);
  b.box(x - lantern / 2 + 1.2, ly, z - lantern / 2 + 1.2, x + lantern / 2 - 1.2, ly + 4, z + lantern / 2 - 1.2, { top: false });
  cut.use('windTowerSlats', sand);
  for (const side of ['n', 's', 'e', 'w']) {
    const f = faceOf(x, z, lantern, lantern, side);
    cut.wall(f.ax, f.az, f.bx, f.bz, ly, ly + 4, { u0: 0, u1: 2, v0: 0, v1: 1 });
  }
  b.use('plasterBlank', sand);
  b.box(x - lantern / 2 - 0.2, ly + 4, z - lantern / 2 - 0.2, x + lantern / 2 + 0.2, ly + 4.6, z + lantern / 2 + 0.2, { bottom: true });
  roofDome(b, x, z, ly + 4.6, lantern * 0.42, sand, true);
  ctx.beacon(x, ly + 4.6 + lantern * 0.42 * 0.75 + 1.8, z, 0xffd27a, 2.4, 0);
}

/** The Mirage Grand Hotel: a crescent of gold-framed balconies stepping up to a sunburst crown. */
function raiseMirageGrand(ctx, building) {
  const { x, z, w, d, h } = building;
  const b = ctx.solid;
  const rng = ctx.rng;
  const facing = building.front === 'n' ? -1 : 1;
  const thick = 16;
  const sag = d - thick;
  const chord = w;
  const rOuter = (chord * chord / 4 + sag * sag) / (2 * sag);
  const rInner = rOuter - thick;
  const centerZ = z - facing * (d / 2) + facing * rOuter;
  const span = Math.asin(Math.min(1, (chord / 2) / rOuter));
  const segments = 16;
  const cream = 0xf8e6c0;
  const gold = 0xe9b44c;
  const heightAt = (a) => {
    const t = Math.abs(a) / span;
    if (t < 0.2) return h - 10;
    if (t < 0.58) return h - 24;
    return h - 42;
  };
  const point = (r, a) => [x + r * Math.sin(a), centerZ - facing * r * Math.cos(a)];
  for (let s = 0; s < segments; s += 1) {
    const a0 = -span + (2 * span * s) / segments;
    const a1 = -span + (2 * span * (s + 1)) / segments;
    const top = heightAt((a0 + a1) / 2);
    const o0 = point(rOuter, a0);
    const o1 = point(rOuter, a1);
    const i0 = point(rInner, a0);
    const i1 = point(rInner, a1);
    const mid = (a0 + a1) / 2;
    const away = [Math.sin(mid), -facing * Math.cos(mid)];
    const toward = [-away[0], -away[1]];
    b.use('hotelBalconies', cream);
    orientedWall(b, o0, o1, 0, top, away, { repeatU: 1 });
    b.use('hotelGlass', 0xf6c868);
    orientedWall(b, i0, i1, 6.8, top, toward, { repeatU: 1, vBase: 6.8 });
    b.use('metalPanel', gold);
    const [g0, g1] = shiftSegment(i0, i1, toward, 0.25);
    for (let band = 6.8 + 27.2; band < top - 4; band += 27.2) orientedWall(b, g0, g1, band - 0.5, band + 0.5, toward, { repeatU: 1 });
    b.use('lobbyGlass', 0xffffff);
    orientedWall(b, i0, i1, 0, 6.8, toward, { repeatU: 1, v0: 0, v1: 1 });
    b.use('roofGravel', 0xe8e0d0);
    b.cap([o0, o1, i1, i0], top, true);
    b.use('crownLights', 0xffd27a);
    orientedWall(b, i0, i1, top - 0.8, top, toward, { repeatU: 1 });
    // Side walls where the crescent steps down, facing along the arc toward the lower part.
    const prev = s > 0 ? heightAt(a0 - 0.0001) : 0;
    const next = s < segments - 1 ? heightAt(a1 + 0.0001) : 0;
    b.use('hotelGlass', 0xf0d498);
    if (prev < top) orientedWall(b, i0, o0, prev, top, [-Math.cos(a0), -facing * Math.sin(a0)], { repeatU: 1 });
    if (next < top) orientedWall(b, i1, o1, next, top, [Math.cos(a1), facing * Math.sin(a1)], { repeatU: 1 });
  }
  // The sunburst crown: gold fins fanning above the centre.
  b.use('metalPanel', gold);
  const crownBase = h - 10;
  for (let k = -3; k <= 3; k += 1) {
    const a = k * 0.05;
    const [fx, fz] = point(rOuter - thick / 2, a);
    const fh = 14 + (3 - Math.abs(k)) * 3.5;
    b.box(fx - 0.5, crownBase, fz - 3, fx + 0.5, crownBase + fh, fz + 3);
    ctx.beacon(fx, crownBase + fh + 0.6, fz, Math.abs(k) === 0 ? 0xff2a1a : 0xffd27a, Math.abs(k) === 0 ? 4 : 2.6, Math.abs(k) === 0 ? 1 : 0);
  }
  b.use('crownLights', 0xffd27a);
  const [rx, rz] = point(rOuter - thick / 2, 0);
  b.box(rx - 12, crownBase, rz - 3.2, rx + 12, crownBase + 1.2, rz + 3.2, { top: false });
  // The porte-cochere: a round canopy on gold columns before the doors, with the hotel's name.
  const [px, pz] = point(rInner - 13, 0);
  b.use('plain', 0xfbf3e2);
  const canopy = ellipsePoints(px, pz, 13, 9, 16);
  b.prism(canopy, 6.5, 7.6, { top: 'roofGravel', topTint: 0xefe6d4 });
  b.cap(canopy, 6.5, false);
  b.use('crownLights', 0xffd27a);
  b.prismWalls(ellipsePoints(px, pz, 13.1, 9.1, 16), 6.6, 7.1, { perimeter: true });
  b.use('metalPanel', gold);
  for (const [sx, sz] of [[-8, -4], [8, -4], [-8, 4], [8, 4]]) b.cylinder(px + sx, pz + sz * facing, 0.5, 0, 6.5, 8, { top: false });
  const signFace = { ax: px - 7, az: pz + facing * 9.4, bx: px + 7, bz: pz + facing * 9.4, tx: facing, tz: 0, nx: 0, nz: facing, length: 14 };
  if (facing < 0) { signFace.ax = px + 7; signFace.bx = px - 7; }
  hangWallSign(b, signFace, 'mirageGrand', 7.7, 12, 1.75, 7, 0);
  const [sx2, sz2] = point(rInner, 0);
  const crownFace = { ax: sx2 - 11 * facing, az: sz2 + facing * 1.15, tx: facing, tz: 0, nx: 0, nz: facing, length: 22 };
  hangWallSign(b, crownFace, 'mirageGrand', h - 19, 22, 3.15, 11, 0.1);
  airConUnits(b, rng, x - w * 0.42, z - 4, x - w * 0.3, z + 4, h - 42, 3);
}

/** Move a segment `distance` metres along `dir` ([x, z]). */
function shiftSegment(p, q, dir, distance) {
  return [[p[0] + dir[0] * distance, p[1] + dir[1] * distance], [q[0] + dir[0] * distance, q[1] + dir[1] * distance]];
}

/** A wall between two ground points, wound so it faces `outward` ([x, z]). */
function orientedWall(b, p, q, y0, y1, outward, opts) {
  const dx = q[0] - p[0];
  const dz = q[1] - p[1];
  if (-dz * outward[0] + dx * outward[1] >= 0) b.wall(p[0], p[1], q[0], q[1], y0, y1, opts);
  else b.wall(q[0], q[1], p[0], p[1], y0, y1, opts);
}

/** Haddad Motors: Uncle Faris's workshop, three open bays, a hand-painted sign and a faded rally stripe. */
function raiseHaddadMotors(ctx, building) {
  const { x, z, w, d, h } = building;
  const b = ctx.solid;
  const rng = ctx.rng;
  const cream = 0xead9b4;
  const front = faceOf(x, z, w, d, building.front);
  const bays = 3;
  const bayW = 12;
  const bayH = 5.2;
  const deep = 9;
  b.use('concrete', cream);
  for (const side of ['n', 's', 'e', 'w']) {
    if (side === building.front) continue;
    const f = faceOf(x, z, w, d, side);
    b.wall(f.ax, f.az, f.bx, f.bz, 0, h);
  }
  // The front wall, open where the bays are, each bay a dark recess with a back wall and ceiling.
  const gap = (front.length - bays * bayW) / (bays + 1);
  let at = 0;
  for (let i = 0; i <= bays; i += 1) {
    const ax = front.ax + front.tx * at;
    const az = front.az + front.tz * at;
    b.use('concrete', cream);
    b.wall(ax, az, ax + front.tx * gap, az + front.tz * gap, 0, h);
    at += gap;
    if (i === bays) break;
    const bx = front.ax + front.tx * at;
    const bz = front.az + front.tz * at;
    const ex = bx + front.tx * bayW;
    const ez = bz + front.tz * bayW;
    b.wall(bx, bz, ex, ez, bayH, h);
    b.use('concrete', 0x5a5650);
    const backX = -front.nx * deep;
    const backZ = -front.nz * deep;
    b.wall(bx + backX, bz + backZ, ex + backX, ez + backZ, 0, bayH);
    b.wall(bx, bz, bx + backX, bz + backZ, 0, bayH);
    b.wall(ex + backX, ez + backZ, ex, ez, 0, bayH);
    b.use('plain', 0x6a6660);
    b.quad([bx + backX, bayH, bz + backZ], [ex + backX, bayH, ez + backZ], [ex, bayH, ez], [bx, bayH, bz], 0, 0, 1, 1);
    b.use('crownLights', 0xfff0d0);
    b.quad([bx + backX * 0.5 + front.tx * 2, bayH - 0.05, bz + backZ * 0.5 + front.tz * 2], [ex + backX * 0.5 - front.tx * 2, bayH - 0.05, ez + backZ * 0.5 - front.tz * 2], [ex + backX * 0.55 - front.tx * 2, bayH - 0.05, ez + backZ * 0.55 - front.tz * 2], [bx + backX * 0.55 + front.tx * 2, bayH - 0.05, bz + backZ * 0.55 + front.tz * 2], 0, 0, 1, 0.1);
    at += bayW;
  }
  b.use('roofGravel', 0xd8d0c0);
  b.cap(rectPoints(x, z, w, d), h, true);
  hangWallSign(b, front, 'haddadMotors', bayH + 0.4, Math.min(30, front.length * 0.55), Math.min(30, front.length * 0.55) / 7, front.length / 2, 0.08);
  // The faded rally stripe running along a side wall.
  const side = faceOf(x, z, w, d, building.front === 's' || building.front === 'n' ? 'e' : 's');
  const stripes = [0xe4572e, 0xe9b44c, 0x1ba39c];
  stripes.forEach((color, k) => {
    b.use('plain', mixHex(color, 0xead9b4, 0.25));
    const y0 = 1.4 + k * 0.9;
    const ox = side.nx * 0.06;
    const oz = side.nz * 0.06;
    const a = 3;
    const c = side.length - 3;
    b.quad([side.ax + side.tx * a + ox, y0, side.az + side.tz * a + oz], [side.ax + side.tx * c + ox, y0 + 2.2, side.az + side.tz * c + oz],
      [side.ax + side.tx * c + ox, y0 + 2.9, side.az + side.tz * c + oz], [side.ax + side.tx * a + ox, y0 + 0.7, side.az + side.tz * a + oz], 0, 0, 1, 1);
  });
  waterTanks(b, rng, x - w / 2 + 2, z - d / 2 + 2, x - w / 2 + 10, z - d / 2 + 6, h, 2);
  airConUnits(b, rng, x, z - d / 2 + 2, x + w / 2 - 2, z, h, 3);
}

/** The Crescent Yacht Club: a white pavilion on the water under three tilted sails. */
function raiseYachtClub(ctx, building) {
  const { x, z, w, d, h } = building;
  const b = ctx.solid;
  const cut = ctx.cutout;
  const bodyH = 8;
  const body = rectPoints(x, z, w - 4, d - 4);
  b.use('apartmentWindows', 0xffffff);
  b.prism(body, 0, bodyH + 1, { top: false });
  parapetRoof(b, body, bodyH + 1, 1, 0.4, 'stone', 0xefe2c8);
  const sea = faceOf(x, z, w - 4, d - 4, building.front);
  b.use('glassSeamless', 0xc8f0ec);
  b.wall(sea.ax + sea.nx * 0.08, sea.az + sea.nz * 0.08, sea.bx + sea.nx * 0.08, sea.bz + sea.nz * 0.08, 0.5, bodyH, { vBase: 0.5 });
  hangWallSign(b, faceOf(x, z, w - 4, d - 4, building.front === 'n' ? 's' : 'n'), 'yachtClub', bodyH - 2.6, 22, 2.4, (w - 4) / 2, 0.1);
  // Three sails rising from the roof: tall, narrow, bellied and leaning out over the water.
  cut.use('plain', 0xffffff);
  for (let k = 0; k < 3; k += 1) {
    const sx = x - w * 0.3 + k * w * 0.3;
    const roof = bodyH + 1;
    const tipY = h + 10 + (k % 2) * 6;
    const lean = sea.nz * 5;
    const footA = [sx - 4.5, roof, z + 3 * sea.nz * -1];
    const footB = [sx + 4.5, roof, z - 3 * sea.nz * -1];
    const belly = [sx + 0.5, roof + (tipY - roof) * 0.42, z + sea.nz * 3.2];
    const tip = [sx - 1, tipY, z + lean];
    cut.triangle(footA, footB, belly, 0, 0, 1, 0, 0.5, 0.5);
    cut.triangle(footA, belly, tip, 0, 0, 0.5, 0.5, 0, 1);
    cut.triangle(belly, footB, tip, 0.5, 0.5, 1, 0, 0, 1);
    b.use('metalPanel', 0xd8dce0);
    b.box(sx - 1.2, roof, z - 0.12, sx - 0.95, tipY + 1, z + 0.12, { top: false });
    ctx.beacon(sx - 1.1, tipY + 1.4, z, 0xff2a1a, 2.4, 1);
  }
  b.use('metalPanel', 0xe0e4e8);
  b.box(x + w / 2 - 6, bodyH + 1, z - 0.2, x + w / 2 - 5.6, h + 10, z + 0.2, { top: false });
  ctx.beacon(x + w / 2 - 5.8, h + 10.4, z, 0x7dff9a, 2.6, 1);
}

/** The Mina Customs House: an arcaded stone hall of the old port with a domed clock tower. */
function raiseCustomsHouse(ctx, building) {
  const { x, z, w, d, h } = building;
  const b = ctx.solid;
  const stone = 0xe6d2a8;
  const body = rectPoints(x, z, w - 2, d - 2);
  b.use('officePunched', stone);
  b.prism(body, 4.6, h - 2 + 1.2, { top: false, vBase: 4.6 });
  b.use('villaArcade', stone);
  b.prism(body, 0, 4.6, { top: false, repeatU: undefined });
  b.use('stone', 0xf2e4c4);
  b.prismWalls(rectPoints(x, z, w - 1.4, d - 1.4), 4.4, 5.2);
  b.prismWalls(rectPoints(x, z, w - 1.4, d - 1.4), h - 2.4, h - 1.6);
  b.use('stone', stone);
  parapetRoof(b, body, h - 2 + 1.2, 1.2, 0.5);
  ctx.cutout.use('crenellation', 0xf2e4c4);
  for (const side of ['n', 's', 'e', 'w']) {
    const f = faceOf(x, z, w - 2, d - 2, side);
    ctx.cutout.wall(f.ax, f.az, f.bx, f.bz, h - 0.8, h);
  }
  // The clock tower on the front, its dome glazed in teal.
  const front = faceOf(x, z, w - 2, d - 2, building.front);
  const tx = front.ax + front.tx * front.length / 2 - front.nx * 6;
  const tz = front.az + front.tz * front.length / 2 - front.nz * 6;
  b.use('stone', stone);
  b.box(tx - 6, 0, tz - 6, tx + 6, h + 8, tz + 6, { top: 'plain', topTint: 0xf2e4c4 });
  b.use('sundialFace', 0xffffff);
  const dial = faceOf(tx, tz, 12, 12, building.front);
  b.wall(dial.ax + dial.tx * 2 + dial.nx * 0.06, dial.az + dial.tz * 2 + dial.nz * 0.06, dial.bx - dial.tx * 2 + dial.nx * 0.06, dial.bz - dial.tz * 2 + dial.nz * 0.06, h - 2, h + 6, { fit: true });
  roofDome(b, tx, tz, h + 8, 4.6, stone, true);
  hangWallSign(b, front, 'customsHouse', 5.4, 20, 2.2, front.length * 0.22, 0.12);
  hangWallSign(b, front, 'customsHouse', 5.4, 20, 2.2, front.length * 0.78, 0.12);
}

function mixHex(a, b, t) {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}
