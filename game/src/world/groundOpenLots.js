// The open lots of Port Sarab, each laid out for its use: car parks with painted bays, the grand radial
// plaza and ring of reflecting pools around the Vane Spire, the giant sundial in Old Sarab, the tiled
// medallion of the Grand Souk, riad courtyards with fountains, pool decks, gardens, playgrounds, the
// Mirage Grand Hotel's forecourt loop, scrap and container yards.
import { SURFACE } from './groundSurfaceAtlas.js';
import { STREET_LEVELS } from './roadSurfaces.js';
import { subtractRects } from './groundMeshBuilder.js';

let FLOOR = STREET_LEVELS.sidewalk;
let PAINT = FLOOR + 0.012;
const TAU = Math.PI * 2;

/** Blossom colours of flower beds and bougainvillea, laid over the speckled cobble swatch. */
export const BLOSSOMS = [0xff4f9a, 0xff8a3a, 0xe84fd0, 0xffc23a, 0xff6a6a];

/** Lay one open lot of the plan by its `use`, on the block floor's height. */
export function layOpenLot(game, ground, lot, block, rng) {
  FLOOR = STREET_LEVELS.sidewalk;
  PAINT = FLOOR + 0.012;
  const design = LOT_DESIGNS[lot.use] || LOT_DESIGNS.plaza;
  design(ground, lot, rng, game, block);
}

const LOT_DESIGNS = {
  parking: (g, lot) => layCarPark(g, lot, { surface: SURFACE.ASPHALT, tint: 0xf4f2f0, line: 0xfffaf0 }),
  carLot: (g, lot) => layCarPark(g, lot, { surface: SURFACE.CONCRETE, tint: 0xf2eee6, line: 0xf2c230 }),
  truckYard: (g, lot) => layCarPark(g, lot, { surface: SURFACE.ASPHALT_BLEACHED, tint: 0xe8e2d8, line: 0xf2c230, bayWidth: 4.4, bayDepth: 15, aisle: 11 }),
  policeYard: (g, lot) => layCarPark(g, lot, { surface: SURFACE.ASPHALT, tint: 0xd8dae0, line: 0x8fb4ff }),
  plaza: layCityPlaza,
  palmCourt: layPalmCourt,
  spirePlaza: laySpirePlaza,
  poolDeck: layPoolDeck,
  courtyard: layRiadCourtyard,
  marketStalls: layMarketStalls,
  marketSquare: layGrandSoukSquare,
  sundialSquare: laySundialSquare,
  garden: layGarden,
  playground: layPlayground,
  hotelForecourt: layHotelForecourt,
  scrapYard: layScrapYard,
  containerYard: layContainerYard,
};

/** A car park: double rows of bays facing painted aisles, with direction arrows. */
function layCarPark(ground, lot, style) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, style.surface, { tint: style.tint, jitter: 0.08, cell: 30 });
  const bayWidth = style.bayWidth || 2.6;
  const bayDepth = style.bayDepth || 5.0;
  const aisle = style.aisle || 6.4;
  const alongX = lot.x1 - lot.x0 >= lot.z1 - lot.z0;
  const across0 = (alongX ? lot.z0 : lot.x0) + 1.2;
  const across1 = (alongX ? lot.z1 : lot.x1) - 1.2;
  const along0 = (alongX ? lot.x0 : lot.z0) + 2;
  const along1 = (alongX ? lot.x1 : lot.z1) - 2;
  const point = (s, c) => (alongX ? [s, c] : [c, s]);
  const bar = (s0, c0, s1, c1, width) => {
    const [ax, az] = point(s0, c0);
    const [bx, bz] = point(s1, c1);
    ground.bar('paint', ax, az, bx, bz, width, PAINT, SURFACE.PAINT, { tint: style.line, jitter: 0.03 });
  };
  const module = bayDepth * 2 + aisle;
  const modules = Math.max(1, Math.floor((across1 - across0 + 1) / (module + 1)));
  const used = modules * module + (modules - 1);
  let c = (across0 + across1) / 2 - used / 2;
  for (let m = 0; m < modules; m += 1) {
    if (across1 - across0 < module) break;
    for (const [rowStart, rowEnd] of [[c, c + bayDepth], [c + bayDepth + aisle, c + module]]) {
      const lineAt = rowStart === c ? rowEnd : rowStart;
      bar(along0, lineAt, along1, lineAt, 0.12);
      for (let s = along0; s <= along1 + 0.01; s += bayWidth) bar(s, rowStart + 0.3, s, rowEnd - 0.3, 0.12);
    }
    const mid = c + bayDepth + aisle / 2;
    for (let s = along0 + 8; s < along1 - 6; s += 22) {
      bar(s, mid, s + 2.6, mid, 0.28);
      const [hx, hz] = point(s + 2.6, mid);
      const [lx, lz] = point(s + 2.6, mid - 0.6);
      const [rx, rz] = point(s + 2.6, mid + 0.6);
      const [tx, tz] = point(s + 4.0, mid);
      ground.polygon('paint', [[lx, lz], [tx, tz], [rx, rz], [hx, hz]], PAINT, SURFACE.PAINT, { tint: style.line, jitter: 0.03 });
    }
    c += module + 1;
  }
}

/** A downtown plaza: pale granite, a dark stone medallion and a round fountain at its heart. */
function layCityPlaza(ground, lot, rng) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.GRANITE, { tint: 0xf8f6f2, jitter: 0.05, cell: 30 });
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  const reach = Math.min(lot.x1 - lot.x0, lot.z1 - lot.z0) / 2 - 2;
  if (reach < 8) return;
  ground.ring('paint', cx, cz, reach * 0.62, reach * 0.62 + 0.9, 0, TAU, PAINT, SURFACE.DARK_STONE, { tint: 0xffffff });
  ground.ring('paint', cx, cz, reach * 0.62 + 1.3, reach * 0.62 + 1.6, 0, TAU, PAINT, SURFACE.PAINT, { tint: 0xe6b450 });
  for (let k = 0; k < 8; k += 1) {
    const angle = (k / 8) * TAU + TAU / 16;
    ground.bar('paint', cx + Math.sin(angle) * (reach * 0.3), cz + Math.cos(angle) * (reach * 0.3), cx + Math.sin(angle) * (reach * 0.6), cz + Math.cos(angle) * (reach * 0.6), 0.6, PAINT + 0.002, SURFACE.DARK_STONE, { tint: 0xffffff });
  }
  layFountain(ground, cx, cz, Math.min(6, reach * 0.28), rng);
}

/** A palm court: warm stone with square planting pits in a grid. */
function layPalmCourt(ground, lot) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.PAVERS, { tint: 0xfff0dc, scale: 1.6, jitter: 0.05, cell: 30 });
  const pitch = 10;
  for (let x = lot.x0 + 6; x <= lot.x1 - 6; x += pitch) {
    for (let z = lot.z0 + 6; z <= lot.z1 - 6; z += pitch) {
      ground.rect('paint', x - 1.4, z - 1.4, x + 1.4, z + 1.4, PAINT, SURFACE.KERB, { tint: 0xf2eee8, jitter: 0.03 });
      ground.rect('paint', x - 1.05, z - 1.05, x + 1.05, z + 1.05, PAINT + 0.003, SURFACE.EARTH, { tint: 0xe8d8c4, jitter: 0.06 });
    }
  }
}

/**
 * The plaza of the Vane Spire: pale granite cut by sixteen dark stone rays, rings of dark stone and
 * gold, and a ring of eight raised reflecting pools around the tower, broken by walkways.
 */
function laySpirePlaza(ground, lot) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.GRANITE, { tint: 0xfbf9f6, scale: 1.25, jitter: 0.04, cell: 24 });
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  const reach = Math.min(lot.x1 - lot.x0, lot.z1 - lot.z0) / 2 - 1.5;
  for (let k = 0; k < 16; k += 1) {
    const angle = (k / 16) * TAU;
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);
    const toEdge = Math.min(
      dx > 0.001 ? (lot.x1 - 1.5 - cx) / dx : dx < -0.001 ? (lot.x0 + 1.5 - cx) / dx : 1e9,
      dz > 0.001 ? (lot.z1 - 1.5 - cz) / dz : dz < -0.001 ? (lot.z0 + 1.5 - cz) / dz : 1e9,
    );
    const width = k % 2 === 0 ? 1.4 : 0.7;
    ground.bar('paint', cx + dx * 45, cz + dz * 45, cx + dx * toEdge, cz + dz * toEdge, width, PAINT, SURFACE.DARK_STONE, { tint: 0xffffff, jitter: 0.03 });
  }
  const rings = [[45, 46.4, SURFACE.DARK_STONE, 0xffffff], [47, 47.5, SURFACE.PAINT, 0xe8b850], [66, 67.4, SURFACE.DARK_STONE, 0xffffff], [68, 68.5, SURFACE.PAINT, 0xe8b850]];
  for (const [r0, r1, surface, tint] of rings) {
    if (r1 < reach) ground.ring('paint', cx, cz, r0, r1, 0, TAU, PAINT + 0.003, surface, { tint, step: 4 });
  }
  const gap = 0.2;
  for (let k = 0; k < 8; k += 1) {
    const a0 = (k / 8) * TAU + gap;
    const a1 = ((k + 1) / 8) * TAU - gap;
    layRaisedPool(ground, cx, cz, 52, 61, a0, a1);
  }
}

/** One curved reflecting pool standing 45 cm proud of the plaza, with a stone rim all round. */
function layRaisedPool(ground, cx, cz, r0, r1, a0, a1) {
  const top = FLOOR + 0.45;
  const water = FLOOR + 0.36;
  const rim = 0.45;
  ground.ring('base', cx, cz, r0 + rim, r1 - rim, a0 + rim / r0, a1 - rim / r0, water, SURFACE.POOL, { tint: 0x9ad8f0, jitter: 0.04, step: 3, polar: true });
  ground.ring('solid', cx, cz, r0, r0 + rim, a0, a1, top, SURFACE.KERB, { tint: 0xfaf6ee, step: 3 });
  ground.ring('solid', cx, cz, r1 - rim, r1, a0, a1, top, SURFACE.KERB, { tint: 0xfaf6ee, step: 3 });
  for (const angle of [a0, a1]) {
    const inner = angle === a0 ? a0 : a1 - rim / r0;
    const outer = angle === a0 ? a0 + rim / r0 : a1;
    ground.ring('solid', cx, cz, r0 + rim, r1 - rim, inner, outer, top, SURFACE.KERB, { tint: 0xfaf6ee, step: 3 });
  }
  arcFaces(ground, cx, cz, r1, a0, a1, FLOOR - 0.02, top, true, SURFACE.KERB, 0xe8e2d8);
  arcFaces(ground, cx, cz, r0, a0, a1, FLOOR - 0.02, top, false, SURFACE.KERB, 0xe8e2d8);
  arcFaces(ground, cx, cz, r1 - rim, a0, a1, water - 0.05, top, false, SURFACE.POOL, 0xc8f0ff);
  arcFaces(ground, cx, cz, r0 + rim, a0, a1, water - 0.05, top, true, SURFACE.POOL, 0xc8f0ff);
  for (const [angle, sign] of [[a0, -1], [a1, 1]]) {
    const x0 = cx + Math.sin(angle) * r0;
    const z0 = cz + Math.cos(angle) * r0;
    const x1 = cx + Math.sin(angle) * r1;
    const z1 = cz + Math.cos(angle) * r1;
    const nx = Math.cos(angle) * sign;
    const nz = -Math.sin(angle) * sign;
    faceToward(ground, x0, z0, x1, z1, FLOOR - 0.02, top, nx, nz, SURFACE.KERB, 0xe8e2d8);
  }
}

/** The square of the Sundial Tower: the tower is the gnomon, its dial laid in granite, dark stone and gold. */
function laySundialSquare(ground, lot) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.COBBLES, { tint: 0xfff0dc, jitter: 0.08, cell: 24 });
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  const radius = 44;
  ground.ring('paint', cx, cz, 8.6, radius, 0, TAU, PAINT, SURFACE.GRANITE, { tint: 0xfff8ec, step: 4 });
  ground.ring('paint', cx, cz, radius, radius + 1.6, 0, TAU, PAINT, SURFACE.DARK_STONE, { tint: 0xffffff, step: 4 });
  ground.ring('paint', cx, cz, radius - 6, radius - 5.5, 0, TAU, PAINT + 0.003, SURFACE.PAINT, { tint: 0xe2b048, step: 4 });
  const latitude = Math.sin((25 * Math.PI) / 180);
  for (let hour = 6; hour <= 18; hour += 1) {
    const h = ((hour - 12) * 15 * Math.PI) / 180;
    const angle = Math.atan2(latitude * Math.sin(h), Math.cos(h));
    const dx = Math.sin(angle);
    const dz = -Math.cos(angle);
    const noon = hour === 12;
    ground.bar('paint', cx + dx * 10, cz + dz * 10, cx + dx * (radius - 7), cz + dz * (radius - 7), noon ? 1.2 : 0.6, PAINT + 0.006, SURFACE.DARK_STONE, { tint: 0xffffff });
    const plaque = noon ? 1.6 : 1.0;
    const px = cx + dx * (radius - 2.8);
    const pz = cz + dz * (radius - 2.8);
    ground.polygon('paint', [[px - plaque * dz, pz + plaque * dx], [px + plaque * dx, pz + plaque * dz], [px + plaque * dz, pz - plaque * dx], [px - plaque * dx, pz - plaque * dz]], PAINT + 0.006, SURFACE.PAINT, { tint: 0xe8b84c });
  }
}

/** The square at the heart of the Grand Souk: a great tiled star medallion, a fountain, tiled paths to the halls. */
function layGrandSoukSquare(ground, lot, rng) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.COBBLES, { tint: 0xfff4e4, jitter: 0.08, cell: 24 });
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  ground.bar('paint', lot.x0 + 1, cz, lot.x1 - 1, cz, 4, PAINT, SURFACE.ZELLIGE, { tint: 0xffffff });
  ground.bar('paint', cx, lot.z0 + 1, cx, lot.z1 - 1, 4, PAINT, SURFACE.ZELLIGE, { tint: 0xffffff });
  const octagon = (radius) => {
    const points = [];
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * TAU + TAU / 16;
      points.push([cx + Math.sin(angle) * radius, cz + Math.cos(angle) * radius]);
    }
    return points;
  };
  ground.polygon('paint', octagon(23), PAINT + 0.003, SURFACE.DARK_STONE, { tint: 0xffffff });
  ground.polygon('paint', octagon(21.6), PAINT + 0.006, SURFACE.ZELLIGE, { tint: 0xffffff });
  layFountain(ground, cx, cz, 5, rng);
}

/** A riad courtyard: tiled floor, an octagonal fountain, four orange-tree beds. */
function layRiadCourtyard(ground, lot, rng) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.ZELLIGE, { tint: 0xffffff, jitter: 0.04, cell: 30 });
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  layFountain(ground, cx, cz, Math.min(3, Math.min(w, d) * 0.15), rng, 8);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx = cx + sx * w * 0.27;
    const bz = cz + sz * d * 0.27;
    if (Math.min(w, d) < 14) break;
    ground.box('solid', bx - 1.4, bz - 1.4, bx + 1.4, bz + 1.4, FLOOR, FLOOR + 0.4, SURFACE.EARTH, SURFACE.KERB, { topTint: 0xd8b890, sideTint: 0xf0e0c8, jitter: 0.05 });
  }
}

/** A market lot of Old Sarab: worn cobbles with a tiled runner down the middle of the stalls. */
function layMarketStalls(ground, lot) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.COBBLES, { tint: 0xffecd8, jitter: 0.1, cell: 24 });
  const alongX = lot.x1 - lot.x0 >= lot.z1 - lot.z0;
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  if (alongX) ground.bar('paint', lot.x0 + 1, cz, lot.x1 - 1, cz, 3, PAINT, SURFACE.ZELLIGE, { tint: 0xfff4ec });
  else ground.bar('paint', cx, lot.z0 + 1, cx, lot.z1 - 1, 3, PAINT, SURFACE.ZELLIGE, { tint: 0xfff4ec });
}

/** A pool deck: teak boards round a long turquoise pool with a granite coping, and a round spa. */
function layPoolDeck(ground, lot, rng) {
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  const alongX = w >= d;
  const pw = (alongX ? w * 0.62 : w * 0.42);
  const pd = (alongX ? d * 0.42 : d * 0.62);
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  const pool = { x0: cx - pw / 2, z0: cz - pd / 2, x1: cx + pw / 2, z1: cz + pd / 2 };
  for (const piece of subtractRects(lot, [pool])) {
    ground.rect('base', piece.x0, piece.z0, piece.x1, piece.z1, FLOOR, SURFACE.DECKING, { tint: 0xfff2e4, jitter: 0.06, cell: 20, rotate: !alongX });
  }
  layPool(ground, pool.x0, pool.z0, pool.x1, pool.z1, FLOOR, rng);
  const spaX = alongX ? pool.x1 + Math.min(5, (lot.x1 - pool.x1) / 2) : cx;
  const spaZ = alongX ? cz : pool.z1 + Math.min(5, (lot.z1 - pool.z1) / 2);
  if ((alongX ? lot.x1 - pool.x1 : lot.z1 - pool.z1) > 7) layFountain(ground, spaX, spaZ, 2.4, rng, 12, true);
}

/** A walled garden: lawn, gravel paths in a cross, a round lily pond and flowering raised beds. */
function layGarden(ground, lot, rng) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.LAWN, { tint: 0xf0fce8, jitter: 0.12, cell: 12 });
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  ground.bar('paint', lot.x0 + 1, cz, lot.x1 - 1, cz, 2.4, PAINT, SURFACE.EARTH, { tint: 0xfff0e0 });
  ground.bar('paint', cx, lot.z0 + 1, cx, lot.z1 - 1, 2.4, PAINT + 0.003, SURFACE.EARTH, { tint: 0xfff0e0 });
  layFountain(ground, cx, cz, 3.5, rng, 14, true);
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx = cx + sx * w * 0.25;
    const bz = cz + sz * d * 0.25;
    const hw = Math.min(4, w * 0.1);
    const hd = Math.min(2.4, d * 0.08);
    ground.box('solid', bx - hw, bz - hd, bx + hw, bz + hd, FLOOR, FLOOR + 0.45, SURFACE.COBBLES, SURFACE.KERB, { topTint: rng.pick(BLOSSOMS), sideTint: 0xf4e8d8, jitter: 0.12 });
  }
}

/** A playground: concrete with bright rubber safety pads and a timber-edged sandpit. */
function layPlayground(ground, lot, rng) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.CONCRETE, { tint: 0xf6f2ea, scale: 0.5, jitter: 0.06, cell: 24 });
  const colours = [0x2fb8a8, 0xf07050, 0xf8c840, 0x5a8ef0];
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  for (let k = 0; k < 4; k += 1) {
    const r = Math.min(w, d) * rng.range(0.1, 0.16);
    const px = lot.x0 + w * (k % 2 === 0 ? 0.28 : 0.72);
    const pz = lot.z0 + d * (k < 2 ? 0.3 : 0.7);
    ground.ring('paint', px, pz, 0, r, 0, TAU, PAINT + k * 0.002, SURFACE.PAINT, { tint: colours[k], step: 2 });
  }
  const sx = lot.x0 + w * 0.5;
  const sz = lot.z0 + d * 0.5;
  ground.rect('paint', sx - 3, sz - 3, sx + 3, sz + 3, PAINT, SURFACE.SAND, { tint: 0xf4dcb0 });
  ground.box('solid', sx - 3.3, sz - 3.3, sx + 3.3, sz - 3, FLOOR, FLOOR + 0.3, SURFACE.DECKING, SURFACE.DECKING, { tint: 0xfff0e0 });
  ground.box('solid', sx - 3.3, sz + 3, sx + 3.3, sz + 3.3, FLOOR, FLOOR + 0.3, SURFACE.DECKING, SURFACE.DECKING, { tint: 0xfff0e0 });
}

/** The forecourt of the Mirage Grand Hotel: a pale stone drive looping round a fountain island, a coral carpet to the door. */
function layHotelForecourt(ground, lot, rng) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.DARK_STONE, { tint: 0xffffff, jitter: 0.03, cell: 24 });
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2 + 4;
  const outer = Math.min(24, (lot.z1 - lot.z0) / 2 - 2);
  const inner = outer - 9;
  ground.ring('paint', cx, cz, inner, outer, 0, TAU, PAINT, SURFACE.GRANITE, { tint: 0xfff6ea, step: 3 });
  ground.ring('paint', cx, cz, outer, outer + 0.4, 0, TAU, PAINT, SURFACE.PAINT, { tint: 0xe8b850, step: 3 });
  ground.bar('paint', cx, lot.z0, cx, cz - outer, 5, PAINT, SURFACE.PAINT, { tint: 0xd8583a });
  ground.ring('solid', cx, cz, 0, inner, 0, TAU, FLOOR + 0.5, SURFACE.LAWN, { tint: 0xf0ffe8, step: 3 });
  ground.cylinderWall('solid', cx, cz, inner, FLOOR - 0.02, FLOOR + 0.5, SURFACE.KERB, { tint: 0xf6efe4, segments: 28 });
  layFountain(ground, cx, cz, Math.min(6, inner * 0.5), rng, 20, false, FLOOR + 0.5);
}

/** Haddad Motors' scrap yard: packed dirt, oil stains and tyre tracks. */
function layScrapYard(ground, lot, rng) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.DIRT, { tint: 0xeedcc4, jitter: 0.12, cell: 18 });
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  for (let k = 0; k < 10; k += 1) {
    const r = rng.range(1.2, 3.5);
    const px = lot.x0 + rng.range(r + 1, w - r - 1);
    const pz = lot.z0 + rng.range(r + 1, d - r - 1);
    ground.ring('paint', px, pz, 0, r, 0, TAU, PAINT - 0.006, SURFACE.ASPHALT, { tint: 0x8a8680, step: 2 });
  }
}

/** A container yard: concrete with a yellow border line and painted stacking lanes. */
function layContainerYard(ground, lot, rng) {
  ground.rect('base', lot.x0, lot.z0, lot.x1, lot.z1, FLOOR, SURFACE.CONCRETE, { tint: 0xd4d2ce, jitter: 0.1, cell: 24 });
  const inset = 3;
  const yellow = { tint: 0xf2c230, jitter: 0.03 };
  ground.bar('paint', lot.x0 + inset, lot.z0 + inset, lot.x1 - inset, lot.z0 + inset, 0.2, PAINT, SURFACE.PAINT, yellow);
  ground.bar('paint', lot.x0 + inset, lot.z1 - inset, lot.x1 - inset, lot.z1 - inset, 0.2, PAINT, SURFACE.PAINT, yellow);
  ground.bar('paint', lot.x0 + inset, lot.z0 + inset, lot.x0 + inset, lot.z1 - inset, 0.2, PAINT, SURFACE.PAINT, yellow);
  ground.bar('paint', lot.x1 - inset, lot.z0 + inset, lot.x1 - inset, lot.z1 - inset, 0.2, PAINT, SURFACE.PAINT, yellow);
  for (let k = 0; k < 6; k += 1) {
    const r = rng.range(1, 2.6);
    const px = lot.x0 + rng.range(r + 4, lot.x1 - lot.x0 - r - 4);
    const pz = lot.z0 + rng.range(r + 4, lot.z1 - lot.z0 - r - 4);
    ground.ring('paint', px, pz, 0, r, 0, TAU, PAINT - 0.006, SURFACE.CONCRETE, { tint: 0xb8b4ae, step: 2 });
  }
}

/**
 * A swimming pool sunk into the floor between (x0, z0) and (x1, z1): turquoise water, tiled walls and a
 * pale stone coping. The floor around it must leave the pool's rectangle open.
 */
export function layPool(ground, x0, z0, x1, z1, floorY) {
  const water = floorY - 0.16;
  ground.rect('base', x0, z0, x1, z1, water, SURFACE.POOL, { tint: 0xe8ffff, jitter: 0.05, cell: 8 });
  const walls = { surface: SURFACE.POOL, tint: 0xd0f4ff };
  faceToward(ground, x0, z0, x1, z0, water - 0.02, floorY, 0, 1, walls.surface, walls.tint);
  faceToward(ground, x0, z1, x1, z1, water - 0.02, floorY, 0, -1, walls.surface, walls.tint);
  faceToward(ground, x0, z0, x0, z1, water - 0.02, floorY, 1, 0, walls.surface, walls.tint);
  faceToward(ground, x1, z0, x1, z1, water - 0.02, floorY, -1, 0, walls.surface, walls.tint);
  const c = 0.45;
  const y = floorY + 0.014;
  const coping = { tint: 0xfaf6f0, jitter: 0.03 };
  ground.rect('paint', x0 - c, z0 - c, x1 + c, z0, y, SURFACE.KERB, coping);
  ground.rect('paint', x0 - c, z1, x1 + c, z1 + c, y, SURFACE.KERB, coping);
  ground.rect('paint', x0 - c, z0, x0, z1, y, SURFACE.KERB, { ...coping, rotate: true });
  ground.rect('paint', x1, z0, x1 + c, z1, y, SURFACE.KERB, { ...coping, rotate: true });
}

/**
 * A round fountain basin: a stone rim, water inside and a tiered column in the middle (or a plain spa
 * pool when `plain`). `base` is the height it stands on.
 */
function layFountain(ground, cx, cz, radius, rng, segments = 18, plain = false, base = FLOOR) {
  const rimTop = base + 0.5;
  const water = base + 0.4;
  ground.cylinderWall('solid', cx, cz, radius, base - 0.02, rimTop, SURFACE.KERB, { tint: 0xf6efe4, segments });
  ground.ring('solid', cx, cz, radius - 0.4, radius, 0, TAU, rimTop, SURFACE.KERB, { tint: 0xfdf8f0, step: (TAU * radius) / segments });
  ground.cylinderWall('solid', cx, cz, radius - 0.4, water - 0.05, rimTop, SURFACE.POOL, { tint: 0xd8f6ff, segments, inward: true });
  ground.ring('base', cx, cz, 0, radius - 0.4, 0, TAU, water, SURFACE.POOL, { tint: 0xdcfcff, step: (TAU * radius) / segments });
  if (plain || radius < 2) return;
  const column = Math.max(0.4, radius * 0.12);
  ground.box('solid', cx - column, cz - column, cx + column, cz + column, water, water + 1.3, SURFACE.KERB, SURFACE.KERB, { tint: 0xf6efe4 });
  ground.cylinderWall('solid', cx, cz, radius * 0.38, water + 1.0, water + 1.3, SURFACE.KERB, { tint: 0xf6efe4, segments: 10 });
  ground.ring('solid', cx, cz, 0, radius * 0.38, 0, TAU, water + 1.25, SURFACE.POOL, { tint: 0xdcfcff, step: 1 });
}

/** Vertical faces along an arc between two angles, facing outward (or inward). */
function arcFaces(ground, cx, cz, radius, a0, a1, y0, y1, outward, surface, tint) {
  const segments = Math.max(2, Math.ceil(((a1 - a0) * radius) / 3));
  for (let i = 0; i < segments; i += 1) {
    const p = a0 + ((a1 - a0) * i) / segments;
    const q = a0 + ((a1 - a0) * (i + 1)) / segments;
    const x0 = cx + Math.sin(p) * radius;
    const z0 = cz + Math.cos(p) * radius;
    const x1 = cx + Math.sin(q) * radius;
    const z1 = cz + Math.cos(q) * radius;
    const mx = (x0 + x1) / 2 - cx;
    const mz = (z0 + z1) / 2 - cz;
    faceToward(ground, x0, z0, x1, z1, y0, y1, outward ? mx : -mx, outward ? mz : -mz, surface, tint, 'solid');
  }
}

/** A vertical face between two points facing (nx, nz). */
function faceToward(ground, x0, z0, x1, z1, bottom, top, nx, nz, surface, tint, layer = 'base') {
  const fx = z1 - z0;
  const fz = -(x1 - x0);
  const options = { tint, jitter: 0.03, shadeBottom: 0.8 };
  if (fx * nx + fz * nz >= 0) ground.face(layer, x0, z0, x1, z1, bottom, top, bottom, top, surface, options);
  else ground.face(layer, x1, z1, x0, z0, bottom, top, bottom, top, surface, options);
}
