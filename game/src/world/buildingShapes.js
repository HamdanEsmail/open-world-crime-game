// The massing of Port Sarab's ordinary buildings: which shape each style of the city plan takes,
// in which district palette, and the pieces many styles share (stone podiums and glass lobbies,
// crown bands and frames, awnings, canopies, roller doors and skylit shed roofs). Towers live in
// buildingTowerShapes.js, the low-rise city in buildingLowRiseShapes.js.
import { raiseGlassTower, raiseSteppedTower, raiseOfficeSlab, raiseApartmentTower, raiseHotel, raiseNeonClub } from './buildingTowerShapes.js';
import { raiseSouk, raiseRiad, raiseWarehouse, raiseColdStore, raiseWorkshop, raiseVilla, raiseApartmentBlock, raiseBalconyBlock, raiseRetail, raiseMotel } from './buildingLowRiseShapes.js';
import { rectPoints, faceOf, insetPoints } from './buildingFootprints.js';
import { districtColor, frontDoorSideOf } from './districtArchitectureStyles.js';

/** Raise one ordinary building of the plan into its chunk's meshes (ctx from createCityArchitecture). */
export function raiseOrdinaryBuilding(ctx, building) {
  const raise = STYLE_BUILDERS[building.style];
  if (raise) raise(ctx, building);
  else raisePlainBlock(ctx, building);
}

/** Which function raises each style of the plan. */
const STYLE_BUILDERS = {
  glassTower: raiseGlassTower,
  steppedTower: raiseSteppedTower,
  officeSlab: raiseOfficeSlab,
  apartmentTower: raiseApartmentTower,
  hotel: raiseHotel,
  neonClub: raiseNeonClub,
  souk: raiseSouk,
  riad: raiseRiad,
  warehouse: raiseWarehouse,
  coldStore: raiseColdStore,
  workshop: raiseWorkshop,
  villa: raiseVilla,
  apartmentBlock: raiseApartmentBlock,
  balconyBlock: raiseBalconyBlock,
  retail: raiseRetail,
  motel: raiseMotel,
};

/**
 * A colour from one of a district's palettes (districtArchitectureStyles.js), chosen by the
 * building's plan tint and variant so neighbours differ but the district reads as one.
 * e.g. paletteColor('spires', 'glass', building).
 */
export function paletteColor(districtId, role, building, shift = 0) {
  return districtColor(districtId, role, building.tint || 0, building.variant || 0, shift);
}

/** Any style without a builder: a plain block, so the street never has a hole in it. */
export function raisePlainBlock(ctx, building) {
  const b = ctx.solid;
  b.use('plasterBlank', 0xe8dcc4);
  b.prism(rectPoints(building.x, building.z, building.w, building.d), 0, building.h, { top: 'roofGravel', topTint: 0xe0dacd });
}

/** The white stone podium a downtown tower stands on: shops all round, a glass lobby at the front. */
export function stonePodium(ctx, building, height) {
  const { x, z, w, d } = building;
  const b = ctx.solid;
  const stone = building.district === 'marina' ? 0xfbfaf6 : building.district === 'lantern' ? 0xfaf0e2 : paletteColor('spires', 'stone', building);
  const pts = rectPoints(x, z, w - 1, d - 1);
  b.use('podiumShops', stone);
  b.prism(pts, 0, height, { top: false });
  b.use('stone', stone);
  b.prism(rectPoints(x, z, w, d), height, height + 0.6, { top: 'stone', topTint: mixHex(stone, 0xd8cdb8, 0.4) });
  b.use('plain', stone);
  b.cap(rectPoints(x, z, w, d), height, false);
  const front = faceOf(x, z, w - 1, d - 1, frontDoorSideOf(building));
  lobbyFront(b, front, height, Math.min(14, front.length * 0.45));
}

/** A glass lobby on a face, with a slim canopy over the doors. */
export function lobbyFront(b, face, height, width) {
  const mid = face.length / 2;
  const ax = face.ax + face.tx * (mid - width / 2) + face.nx * 0.08;
  const az = face.az + face.tz * (mid - width / 2) + face.nz * 0.08;
  const bx = face.ax + face.tx * (mid + width / 2) + face.nx * 0.08;
  const bz = face.az + face.tz * (mid + width / 2) + face.nz * 0.08;
  b.use('lobbyGlass', 0xffffff);
  b.wall(ax, az, bx, bz, 0, Math.min(height - 0.6, 6), { u0: 0, u1: Math.max(1, Math.round(width / 12)), v0: 0, v1: Math.min(height - 0.6, 6) / 6 });
  canopyAlong(b, { ax, az, bx, bz, nx: face.nx, nz: face.nz }, Math.min(height - 1, 4.6), 2.2, 0xf4f4f0, 0.35);
}

/** A band of crown lighting just proud of an outline: it glows in `tint` after dark. */
export function crownBand(ctx, points, y, height, tint) {
  const b = ctx.solid;
  b.use('crownLights', tint);
  b.prismWalls(insetPoints(points, -0.12), y, y + height, { perimeter: true });
}

/** An open crown frame: posts at the outline's corners and a lit ring on top, sky showing through. */
export function crownFrame(ctx, points, y0, y1, tint) {
  const b = ctx.solid;
  b.use('metalPanel', mixHex(tint, 0xffffff, 0.4));
  for (const [px, pz] of points) b.box(px - 0.45, y0, pz - 0.45, px + 0.45, y1, pz + 0.45, { top: false });
  const ring = insetPoints(points, -0.3);
  b.use('crownLights', tint);
  b.prismWalls(ring, y1 - 1.6, y1, { perimeter: true });
  const back = insetPoints(points, 0.3);
  const n = back.length;
  for (let i = 0; i < n; i += 1) {
    const a = back[(i + 1) % n];
    const c = back[i];
    b.wall(a[0], a[1], c[0], c[1], y1 - 1.6, y1, { repeatU: 1 });
  }
  b.use('plain', 0xe8e8e4);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    b.quad([ring[i][0], y1, ring[i][1]], [ring[j][0], y1, ring[j][1]], [back[j][0], y1, back[j][1]], [back[i][0], y1, back[i][1]], 0, 0, 1, 0.1);
  }
}

/** A sloped striped awning (cut-out, both sides) from `start` to `end` metres along a face, hung at `y`. */
export function awning(cut, face, start, end, y, reach, color) {
  cut.use('awningStripes', color);
  const ax = face.ax + face.tx * start + face.nx * 0.05;
  const az = face.az + face.tz * start + face.nz * 0.05;
  const bx = face.ax + face.tx * end + face.nx * 0.05;
  const bz = face.az + face.tz * end + face.nz * 0.05;
  const len = end - start;
  cut.quad([ax + face.nx * reach, y - 0.7, az + face.nz * reach], [bx + face.nx * reach, y - 0.7, bz + face.nz * reach], [bx, y, bz], [ax, y, az], 0, 0, len / 2.4, 0.999);
}

/** A flat canopy along a face (shop rows, lobbies): a thin slab reaching out over the pavement. */
export function canopyAlong(b, face, y, reach, color, thickness = 0.45) {
  const x0 = Math.min(face.ax, face.bx, face.ax + face.nx * reach, face.bx + face.nx * reach);
  const x1 = Math.max(face.ax, face.bx, face.ax + face.nx * reach, face.bx + face.nx * reach);
  const z0 = Math.min(face.az, face.bz, face.az + face.nz * reach, face.bz + face.nz * reach);
  const z1 = Math.max(face.az, face.bz, face.az + face.nz * reach, face.bz + face.nz * reach);
  b.use('plain', color);
  b.slab(x0, z0, x1, z1, y, thickness);
}

/** Roller doors along a building's street front, `width` by `height` metres each. */
export function rollerDoors(ctx, building, width, height, tint) {
  const b = ctx.solid;
  const face = faceOf(building.x, building.z, building.w, building.d, frontDoorSideOf(building));
  const count = Math.max(1, Math.floor(face.length / (width * 2.2)));
  b.use('rollerDoor', tint);
  for (let i = 0; i < count; i += 1) {
    const at = face.length * (i + 0.5) / count;
    const ax = face.ax + face.tx * (at - width / 2) + face.nx * 0.06;
    const az = face.az + face.tz * (at - width / 2) + face.nz * 0.06;
    b.wall(ax, az, ax + face.tx * width, az + face.tz * width, 0, height, { fit: true });
  }
}

/** A sun-bleached membrane roof with rows of raised skylights, for the big flat sheds. */
export function skylightRoof(b, rng, x0, z0, x1, z1, y) {
  b.use('coldPanels', rng.pick([0xf4f2ec, 0xe8e4da, 0xdcd8cc, 0xf0e6d2]));
  b.cap(rectPoints((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0), y + 0.02, true);
  b.use('darkGlass', 0xc8dce4);
  const alongX = x1 - x0 >= z1 - z0;
  const rows = Math.max(1, Math.floor((alongX ? z1 - z0 : x1 - x0) / 9));
  for (let r = 0; r < rows; r += 1) {
    const t = (r + 0.5) / rows;
    const length = (alongX ? x1 - x0 : z1 - z0) * 0.7;
    if (alongX) {
      const zc = z0 + (z1 - z0) * t;
      b.box((x0 + x1) / 2 - length / 2, y, zc - 0.9, (x0 + x1) / 2 + length / 2, y + 0.5, zc + 0.9);
    } else {
      const xc = x0 + (x1 - x0) * t;
      b.box(xc - 0.9, y, (z0 + z1) / 2 - length / 2, xc + 0.9, y + 0.5, (z0 + z1) / 2 + length / 2);
    }
  }
}

/** The rectangle of a footprint with `setback` metres shaved off its `side`. */
export function shrinkFromFace(x, z, w, d, side, setback) {
  let x0 = x - w / 2;
  let x1 = x + w / 2;
  let z0 = z - d / 2;
  let z1 = z + d / 2;
  if (side === 'n') z0 += setback;
  else if (side === 's') z1 -= setback;
  else if (side === 'e') x1 -= setback;
  else x0 += setback;
  return { x0, x1, z0, z1 };
}

/** Blend two 0xRRGGBB colours. */
export function mixHex(a, b, t) {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}
