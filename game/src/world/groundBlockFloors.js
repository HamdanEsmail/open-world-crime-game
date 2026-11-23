// The floor inside every block of Port Sarab, between and under its buildings: pale granite with dark
// inlaid bands in The Spires, light stone and boardwalks in Marina Crescent, worn cobbles and packed
// earth in Old Sarab, oil-stained concrete in Mina Docks, lawns, pools and white garden walls in
// Jasmine Heights, gold-inlaid dark stone on Lantern Row, plain concrete in Al Wadi, cracked tarmac in
// Southgate. Each open lot gets its own design from groundOpenLots.js.
import { SURFACE } from './groundSurfaceAtlas.js';
import { STREET_LEVELS } from './roadSurfaces.js';
import { layOpenLot, layPool, BLOSSOMS } from './groundOpenLots.js';
import { subtractRects } from './groundMeshBuilder.js';
import { pavingForDistrict } from './groundSurfaceRules.js';

let FLOOR = STREET_LEVELS.sidewalk;
let PAINT = FLOOR + 0.012;

/** Lay every block's floor, its open lots, the villa gardens and the garden walls. */
export function buildBlockFloors(game, ground) {
  FLOOR = STREET_LEVELS.sidewalk;
  PAINT = FLOOR + 0.012;
  const city = game.city;
  const rng = game.rng.fork('block-floors');
  const lotsByBlock = new Map();
  for (const lot of city.openLots) {
    if (!lotsByBlock.has(lot.block)) lotsByBlock.set(lot.block, []);
    lotsByBlock.get(lot.block).push(lot);
  }
  const gardensByBlock = collectVillaGardens(city);
  for (const block of city.blocks) {
    const district = city.districtById[block.district];
    const lots = lotsByBlock.get(block.id) || [];
    const gardens = gardensByBlock.get(block.id) || [];
    const fullLot = lots.some((lot) => lot.x0 <= block.lot.x0 + 0.01 && lot.x1 >= block.lot.x1 - 0.01 && lot.z0 <= block.lot.z0 + 0.01 && lot.z1 >= block.lot.z1 - 0.01);
    if (!fullLot) {
      const pieces = subtractRects(block.lot, [...lots, ...gardens]);
      for (const piece of pieces) layDistrictPaving(ground, piece, district);
      layDistrictAccents(ground, block, district, pieces, rng);
    }
    for (const lot of lots) layOpenLot(game, ground, lot, block, rng);
    for (const garden of gardens) layVillaGarden(ground, garden, rng);
  }
  for (const wall of city.walls) layGardenWall(ground, wall);
}

/** The base paving of a district over one rectangle of a block. */
function layDistrictPaving(ground, r, district) {
  const [swatch, tint, scale] = pavingForDistrict(district.kind).floor;
  const rough = swatch === 'COBBLES' || swatch === 'CONCRETE' || swatch === 'ASPHALT_BLEACHED';
  ground.rect('base', r.x0, r.z0, r.x1, r.z1, FLOOR, SURFACE[swatch], { tint, scale, jitter: rough ? 0.1 : 0.05, cell: 45 });
}

/** The details that make each district's floor its own: inlays, boardwalks, earth patches, stains, hatching. */
function layDistrictAccents(ground, block, district, pieces, rng) {
  const lot = block.lot;
  if (district.kind === 'downtown') {
    // Dark stone bands inlaid in a grid across the granite, aligned with the block.
    for (const piece of pieces) {
      for (let x = lot.x0 + 16; x < lot.x1 - 4; x += 30) {
        if (x > piece.x0 + 0.6 && x < piece.x1 - 0.6) ground.rect('paint', x - 0.35, piece.z0, x + 0.35, piece.z1, PAINT, SURFACE.DARK_STONE, { tint: 0xffffff, jitter: 0.03, cell: 60 });
      }
      for (let z = lot.z0 + 16; z < lot.z1 - 4; z += 30) {
        if (z > piece.z0 + 0.6 && z < piece.z1 - 0.6) ground.rect('paint', piece.x0, z - 0.35, piece.x1, z + 0.35, PAINT + 0.003, SURFACE.DARK_STONE, { tint: 0xffffff, jitter: 0.03, cell: 60 });
      }
    }
  } else if (district.kind === 'marina') {
    // A teak boardwalk along the block's seaward (north) edge.
    for (const piece of pieces) {
      if (piece.z0 > lot.z0 + 0.01) continue;
      ground.rect('paint', piece.x0, piece.z0, piece.x1, Math.min(piece.z1, piece.z0 + 4), PAINT, SURFACE.DECKING, { tint: 0xfff4e8, jitter: 0.08, cell: 30 });
    }
  } else if (district.kind === 'oldtown') {
    // Patches of packed earth where the cobbles have worn away.
    for (const piece of pieces) {
      const count = Math.floor(((piece.x1 - piece.x0) * (piece.z1 - piece.z0)) / 1100);
      for (let k = 0; k < count; k += 1) blot(ground, piece, rng, SURFACE.EARTH, 0xffeedd, 2.5, 6);
    }
  } else if (district.kind === 'docks') {
    for (const piece of pieces) {
      const count = Math.floor(((piece.x1 - piece.x0) * (piece.z1 - piece.z0)) / 1400);
      for (let k = 0; k < count; k += 1) blot(ground, piece, rng, SURFACE.CONCRETE, 0xb8b4ae, 1.5, 4);
      hatchEdge(ground, piece, rng);
    }
  } else if (district.kind === 'southgate' || district.kind === 'flats') {
    for (const piece of pieces) {
      const count = Math.floor(((piece.x1 - piece.x0) * (piece.z1 - piece.z0)) / 2600);
      for (let k = 0; k < count; k += 1) blot(ground, piece, rng, SURFACE.DIRT, 0xfff2e0, 1.5, 5);
    }
  }
}

/** An irregular blob of another surface inside a rectangle: a worn patch, an oil stain, drifted sand. */
function blot(ground, piece, rng, surface, tint, minRadius, maxRadius) {
  const radius = rng.range(minRadius, maxRadius);
  if (piece.x1 - piece.x0 < radius * 2.4 || piece.z1 - piece.z0 < radius * 2.4) return;
  const cx = rng.range(piece.x0 + radius * 1.2, piece.x1 - radius * 1.2);
  const cz = rng.range(piece.z0 + radius * 1.2, piece.z1 - radius * 1.2);
  const points = [];
  const sides = 7;
  const stretch = rng.range(0.6, 1.4);
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const r = radius * rng.range(0.75, 1.1);
    points.push([cx + Math.sin(angle) * r * stretch, cz + Math.cos(angle) * r / stretch]);
  }
  ground.polygon('paint', points, FLOOR + 0.004, surface, { tint, jitter: 0.06 });
}

/** Yellow-and-dark hatching along one edge of a docks floor, where forklifts must not park. */
function hatchEdge(ground, piece, rng) {
  if (!rng.chance(0.5) || piece.x1 - piece.x0 < 20) return;
  const z0 = rng.chance(0.5) ? piece.z0 + 1 : piece.z1 - 3;
  ground.rect('paint', piece.x0 + 2, z0, piece.x1 - 2, z0 + 0.12, PAINT, SURFACE.PAINT, { tint: 0xf2c230, jitter: 0.03 });
  ground.rect('paint', piece.x0 + 2, z0 + 1.88, piece.x1 - 2, z0 + 2, PAINT, SURFACE.PAINT, { tint: 0xf2c230, jitter: 0.03 });
  for (let x = piece.x0 + 3; x < piece.x1 - 3.5; x += 2.2) {
    ground.polygon('paint', [[x, z0 + 0.22], [x + 0.45, z0 + 0.22], [x + 1.45, z0 + 1.78], [x + 1.0, z0 + 1.78]], PAINT, SURFACE.PAINT, { tint: 0xf2c230, jitter: 0.03 });
  }
}

/**
 * The garden plot of each walled villa: the rectangle its walls enclose, open on the street side.
 * Returns Map(block id -> [{x0, z0, x1, z1, building, front}]).
 */
function collectVillaGardens(city) {
  const byBuilding = new Map();
  for (const wall of city.walls) {
    let box = byBuilding.get(wall.building);
    if (!box) {
      box = { x0: wall.minX, z0: wall.minZ, x1: wall.maxX, z1: wall.maxZ };
      byBuilding.set(wall.building, box);
    } else {
      box.x0 = Math.min(box.x0, wall.minX);
      box.z0 = Math.min(box.z0, wall.minZ);
      box.x1 = Math.max(box.x1, wall.maxX);
      box.z1 = Math.max(box.z1, wall.maxZ);
    }
  }
  const byBlock = new Map();
  for (const [id, box] of byBuilding) {
    const building = city.buildings[id];
    if (!building) continue;
    const garden = { ...box, building, front: building.front };
    if (!byBlock.has(building.block)) byBlock.set(building.block, []);
    byBlock.get(building.block).push(garden);
  }
  return byBlock;
}

/** A villa garden: lawn, a paved path from the gate to the door, flower borders and often a pool. */
function layVillaGarden(ground, garden, rng) {
  const b = garden.building;
  const bx0 = b.x - b.w / 2;
  const bx1 = b.x + b.w / 2;
  const bz0 = b.z - b.d / 2;
  const bz1 = b.z + b.d / 2;
  const front = garden.front;
  const pool = planVillaPool(garden, bx0, bz0, bx1, bz1, rng);
  const deck = pool ? { x0: pool.x0 - 1.8, z0: pool.z0 - 1.8, x1: pool.x1 + 1.8, z1: pool.z1 + 1.8 } : null;
  for (const piece of subtractRects(garden, deck ? [deck] : [])) {
    ground.rect('base', piece.x0, piece.z0, piece.x1, piece.z1, FLOOR, SURFACE.LAWN, { tint: 0xf4fff0, jitter: 0.12, cell: 22 });
  }
  if (pool) {
    for (const piece of subtractRects(deck, [pool])) {
      ground.rect('base', piece.x0, piece.z0, piece.x1, piece.z1, FLOOR, SURFACE.DECKING, { tint: 0xfff6ec, jitter: 0.06, rotate: !pool.alongX });
    }
    layPool(ground, pool.x0, pool.z0, pool.x1, pool.z1, FLOOR);
  }
  const path = 1.8;
  if (front === 's' || front === 'n') {
    const za = front === 's' ? bz1 : garden.z0;
    const zb = front === 's' ? garden.z1 : bz0;
    if (zb - za > 0.5) ground.rect('paint', b.x - path / 2, za, b.x + path / 2, zb, PAINT, SURFACE.PAVERS, { tint: 0xfff0dc, jitter: 0.04 });
  } else {
    const xa = front === 'e' ? bx1 : garden.x0;
    const xb = front === 'e' ? garden.x1 : bx0;
    if (xb - xa > 0.5) ground.rect('paint', xa, b.z - path / 2, xb, b.z + path / 2, PAINT, SURFACE.PAVERS, { tint: 0xfff0dc, jitter: 0.04, rotate: true });
  }
  // Bougainvillea along the inside of the back wall.
  const bloom = rng.pick(BLOSSOMS);
  const back = { n: 's', s: 'n', e: 'w', w: 'e' }[front] || 'n';
  const depth = 1.1;
  const box = back === 'n' ? [garden.x0 + 0.5, garden.z0 + 0.5, garden.x1 - 0.5, garden.z0 + 0.5 + depth]
    : back === 's' ? [garden.x0 + 0.5, garden.z1 - 0.5 - depth, garden.x1 - 0.5, garden.z1 - 0.5]
      : back === 'w' ? [garden.x0 + 0.5, garden.z0 + 0.5, garden.x0 + 0.5 + depth, garden.z1 - 0.5]
        : [garden.x1 - 0.5 - depth, garden.z0 + 0.5, garden.x1 - 0.5, garden.z1 - 0.5];
  ground.box('solid', box[0], box[1], box[2], box[3], FLOOR, FLOOR + 0.9, SURFACE.COBBLES, SURFACE.LAWN, { topTint: bloom, sideTint: 0xc8e8b0, jitter: 0.14, shadeBottom: 0.65 });
}

/** Where a villa's pool goes: in the deepest strip of garden away from the street, or nowhere. */
function planVillaPool(garden, bx0, bz0, bx1, bz1, rng) {
  const strips = [
    { side: 'n', x0: garden.x0, x1: garden.x1, z0: garden.z0, z1: bz0 },
    { side: 's', x0: garden.x0, x1: garden.x1, z0: bz1, z1: garden.z1 },
    { side: 'w', x0: garden.x0, x1: bx0, z0: garden.z0, z1: garden.z1 },
    { side: 'e', x0: bx1, x1: garden.x1, z0: garden.z0, z1: garden.z1 },
  ].filter((s) => s.side !== garden.front).map((s) => ({ ...s, depth: s.side === 'n' || s.side === 's' ? s.z1 - s.z0 : s.x1 - s.x0 }));
  strips.sort((p, q) => q.depth - p.depth);
  const best = strips[0];
  if (!best || best.depth < 8 || !rng.chance(0.75)) return null;
  const alongX = best.side === 'n' || best.side === 's';
  const length = Math.min(14, (alongX ? best.x1 - best.x0 : best.z1 - best.z0) - 6);
  const width = Math.min(5.5, best.depth - 4.4);
  if (length < 6 || width < 3) return null;
  const cx = (best.x0 + best.x1) / 2;
  const cz = (best.z0 + best.z1) / 2;
  const hw = alongX ? length / 2 : width / 2;
  const hd = alongX ? width / 2 : length / 2;
  return { x0: cx - hw, z0: cz - hd, x1: cx + hw, z1: cz + hd, alongX };
}

/** A low white rendered garden wall with a cream stone coping. */
function layGardenWall(ground, wall) {
  const h = wall.h;
  ground.box('solid', wall.minX, wall.minZ, wall.maxX, wall.maxZ, 0, h - 0.1, SURFACE.PAINT, SURFACE.PAINT, { tint: 0xfff8ee, jitter: 0.04, shadeBottom: 0.8 });
  ground.box('solid', wall.minX - 0.08, wall.minZ - 0.08, wall.maxX + 0.08, wall.maxZ + 0.08, h - 0.1, h, SURFACE.KERB, SURFACE.KERB, { tint: 0xf2dcc0, jitter: 0.03 });
}
