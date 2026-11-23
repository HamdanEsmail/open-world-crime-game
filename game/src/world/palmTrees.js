// The palms and planting of Port Sarab: rows of tall date palms down every boulevard median and both
// sides of the Corniche, leaning clusters on the beach, palm courts and plazas downtown, villa gardens
// in Jasmine Heights, the hotel forecourt, the marina promenade, a dense grove at the Ain Zahra oasis
// and a few lonely palms by the desert highway. Trunks are solid; crowns sway and cast long shadows.
import {
  paintFoliageAtlas, buildDatePalmGeometry, buildFanPalmGeometry, buildShrubGeometry,
  buildFlowerBedGeometry, buildFloweringTreeGeometry,
} from './palmModels.js';
import { createPropRecord } from './propInstancing.js';

/** How far date palms are drawn, metres: the full model up close, then a light one, then a lighter one. */
const NEAR_PALM_RANGE = 220;
const FAR_PALM_RANGE = 560;
const DISTANT_PALM_RANGE = 2400;

/** Blossom colours for the flowering trees: bougainvillea, jacaranda, oleander, frangipani, flame tree. */
const BLOSSOM_TINTS = [0xf03c9c, 0xd8329a, 0x9a6ae6, 0xb58cf0, 0xff7aa8, 0xfff2e0, 0xff7a3a];
const SHRUB_TINTS = [0xffffff, 0xe8f6d8, 0xd2e8b8, 0xf6f0c8];

/**
 * Create the planting system. It paints the foliage atlas and makes the foliage materials at once;
 * the planting itself happens in placeStreetPalms() and placeGardensAndLots(), and finish() makes
 * the instanced sets once every system has added its own (planters, courtyards).
 */
export function createPalmTrees(game, kit) {
  const rng = kit.rng('palms');
  const atlas = paintFoliageAtlas(game.renderer, kit.rng('foliage-atlas'));
  const foliage = kit.materials.createFoliageMaterials(atlas);
  const city = game.city;
  const map = kit.map;
  const lists = { datePalm: [], fanPalm: [], shrub: [], flowerBed: [], floweringTree: [] };
  const point = { x: 0, z: 0, heading: 0 };

  /** A date palm at (x, z) if the ground is free. options: scale, pitch, yaw, claim radius, check (default true). */
  function plantDatePalm(x, z, options = {}) {
    const radius = options.claim === undefined ? 0.9 : options.claim;
    if (options.check !== false && !map.claim(x, z, radius)) return null;
    const y = kit.ground(x, z);
    const record = createPropRecord({
      kind: 'datePalm', x, y, z,
      yaw: options.yaw === undefined ? rng.range(0, Math.PI * 2) : options.yaw,
      pitch: options.pitch || 0,
      scale: options.scale || rng.range(0.86, 1.18),
      color: palmTint(rng),
      footprint: 0.35,
    });
    kit.addCollider(record, { type: 'post', x, z, radius: 0.35, y0: y, y1: y + 8 * record.sy, kind: 'palm' });
    lists.datePalm.push(record);
    return record;
  }

  /** A short bushy fan palm. */
  function plantFanPalm(x, z, options = {}) {
    if (options.check !== false && !map.claim(x, z, options.claim || 1.3)) return null;
    const y = kit.ground(x, z);
    const record = createPropRecord({ kind: 'fanPalm', x, y, z, yaw: rng.range(0, Math.PI * 2), scale: options.scale || rng.range(0.85, 1.2), color: palmTint(rng), footprint: 0.5 });
    kit.addCollider(record, { type: 'post', x, z, radius: 0.5, y0: y, y1: y + 3, kind: 'palm' });
    lists.fanPalm.push(record);
    return record;
  }

  /** A low shrub (no collider: people and cars brush through). */
  function plantShrub(x, z, options = {}) {
    if (options.check !== false && !map.claim(x, z, options.claim || 0.8)) return null;
    const record = createPropRecord({ kind: 'shrub', x, y: kit.ground(x, z), z, yaw: rng.range(0, Math.PI * 2), scale: options.scale || rng.range(0.7, 1.15), color: options.color || rng.pick(SHRUB_TINTS), footprint: 0.6 });
    lists.shrub.push(record);
    return record;
  }

  /** A bed of flowers, standing on a planter (y given) or on the ground. */
  function plantFlowerBed(x, y, z, yaw, scale = 1) {
    const record = createPropRecord({ kind: 'flowerBed', x, y, z, yaw, scale, footprint: 0 });
    lists.flowerBed.push(record);
    return record;
  }

  /** A blossoming tree; its blossom takes `color` (or a random bougainvillea-to-jacaranda tint). */
  function plantFloweringTree(x, z, options = {}) {
    if (options.check !== false && !map.claim(x, z, options.claim || 1.6)) return null;
    const y = kit.ground(x, z);
    const record = createPropRecord({ kind: 'floweringTree', x, y, z, yaw: rng.range(0, Math.PI * 2), scale: options.scale || rng.range(0.85, 1.15), color: options.color || rng.pick(BLOSSOM_TINTS), footprint: 0.3 });
    kit.addCollider(record, { type: 'post', x, z, radius: 0.28, y0: y, y1: y + 3, kind: 'tree' });
    lists.floweringTree.push(record);
    return record;
  }

  /** The street palms: boulevard medians every 18 m, and both sides of the Corniche. */
  function placeStreetPalms() {
    for (const run of map.medianRuns) {
      const length = run.to - run.from;
      const count = Math.floor(length / 18);
      const start = run.from + (length - count * 18) / 2;
      for (let i = 0; i <= count; i += 1) {
        map.medianPoint(run, start + i * 18, point);
        plantDatePalm(point.x, point.z, { scale: rng.range(0.98, 1.14), claim: 0.9 });
      }
    }
    for (const run of map.sidewalkRuns) {
      if (run.name !== 'The Corniche') continue;
      const phase = run.side < 0 ? 0 : 9;
      for (let along = run.from + 4 + phase; along <= run.to - 4; along += 18) {
        if (map.inSpan(run, along, 2)) continue;
        map.runPoint(run, along, 1.2, point);
        plantDatePalm(point.x, point.z, { scale: rng.range(1.05, 1.28), claim: 0.9 });
      }
    }
    // Lantern Row and the marina streets: palms along the kerbs too.
    for (const run of map.sidewalkRuns) {
      const district = run.district ? run.district.id : '';
      const marinaStreet = district === 'marina' && run.kind === 'street';
      if (!marinaStreet && run.name !== 'Lantern Row') continue;
      for (let along = run.from + 6 + (run.side > 0 ? 12 : 0); along <= run.to - 4; along += 24) {
        if (map.inSpan(run, along, 3)) continue;
        map.runPoint(run, along, 1.1, point);
        plantDatePalm(point.x, point.z, { scale: rng.range(0.8, 1.0), claim: 1.0 });
      }
    }
    // Jasmine Heights streets: blossoming trees at the kerb.
    for (const run of map.sidewalkRuns) {
      if (!run.district || run.district.id !== 'jasmine' || run.outer) continue;
      for (let along = run.from + 8 + (run.side > 0 ? 11 : 0); along <= run.to - 4; along += 22) {
        if (map.inSpan(run, along, 3)) continue;
        map.runPoint(run, along, 1.2, point);
        plantFloweringTree(point.x, point.z, { claim: 1.1, scale: rng.range(0.8, 1.0) });
      }
    }
  }

  /** Planting off the street: open lots, villa gardens, the beach, the marina, the oasis and the desert. */
  function placeGardensAndLots() {
    for (const lot of city.openLots) plantOpenLot(lot);
    plantVillaGardens();
    plantBeachClusters();
    plantMarinaPromenade();
    plantOasisGrove();
    plantDesertRoadside();
  }

  function plantOpenLot(lot) {
    const w = lot.x1 - lot.x0;
    const d = lot.z1 - lot.z0;
    const cx = (lot.x0 + lot.x1) / 2;
    const cz = (lot.z0 + lot.z1) / 2;
    switch (lot.use) {
      case 'palmCourt':
        for (let x = lot.x0 + 5; x <= lot.x1 - 5; x += 10) {
          for (let z = lot.z0 + 5; z <= lot.z1 - 5; z += 10) {
            const k = Math.round((x - lot.x0) / 10 + (z - lot.z0) / 10);
            if (k % 3 === 2) plantFanPalm(x + rng.range(-1, 1), z + rng.range(-1, 1));
            else plantDatePalm(x + rng.range(-0.8, 0.8), z + rng.range(-0.8, 0.8), { scale: rng.range(0.85, 1.15) });
            plantShrub(x + 4.5, z + rng.range(-2, 2));
          }
        }
        break;
      case 'spirePlaza': {
        const spire = city.buildings.find((b) => b.style === 'vaneSpire');
        const sz = spire ? spire.z + spire.d / 2 : cz;
        for (let x = lot.x0 + 6; x <= lot.x1 - 6; x += 14) {
          plantDatePalm(x, lot.z0 + 6, { scale: 1.15 });
          plantDatePalm(x, lot.z1 - 6, { scale: 1.15 });
        }
        for (let z = lot.z0 + 20; z <= lot.z1 - 20; z += 14) {
          plantDatePalm(lot.x0 + 6, z, { scale: 1.15 });
          plantDatePalm(lot.x1 - 6, z, { scale: 1.15 });
        }
        for (let z = sz + 8; z <= lot.z1 - 14; z += 12) {
          plantDatePalm(cx - 11, z, { scale: 1.22 });
          plantDatePalm(cx + 11, z, { scale: 1.22 });
          plantShrub(cx - 15, z + 6);
          plantShrub(cx + 15, z + 6);
        }
        if (spire) {
          for (const [sx, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            plantFanPalm(spire.x + sx * (spire.w / 2 + 6), spire.z + sz2 * (spire.d / 2 + 6));
          }
        }
        break;
      }
      case 'plaza':
        for (const [fx, fz] of [[0.18, 0.2], [0.82, 0.2], [0.18, 0.8], [0.82, 0.8]]) {
          plantDatePalm(lot.x0 + w * fx, lot.z0 + d * fz, { scale: rng.range(1.0, 1.2) });
        }
        plantFloweringTree(cx, cz, { color: rng.pick(BLOSSOM_TINTS) });
        for (let i = 0; i < 4; i += 1) plantShrub(lot.x0 + w * rng.range(0.25, 0.75), lot.z0 + d * rng.range(0.25, 0.75));
        break;
      case 'poolDeck':
        for (const [fx, fz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          plantDatePalm(lot.x0 + 3.5 + fx * (w - 7), lot.z0 + 3.5 + fz * (d - 7), { scale: rng.range(0.9, 1.1) });
        }
        plantFanPalm(lot.x0 + w * 0.5, lot.z0 + 3);
        plantFanPalm(lot.x0 + w * 0.5, lot.z1 - 3);
        break;
      case 'garden':
        for (let i = 0; i < 10; i += 1) {
          const x = lot.x0 + rng.range(4, w - 4);
          const z = lot.z0 + rng.range(4, d - 4);
          const roll = rng.next();
          if (roll < 0.35) plantDatePalm(x, z, { scale: rng.range(0.8, 1.05) });
          else if (roll < 0.55) plantFloweringTree(x, z);
          else if (roll < 0.7) plantFanPalm(x, z);
          else plantShrub(x, z);
        }
        break;
      case 'courtyard':
        plantDatePalm(cx + rng.range(-2, 2), cz + rng.range(-2, 2), { scale: rng.range(0.8, 1.0) });
        plantShrub(cx + 4, cz - 3);
        plantShrub(cx - 4, cz + 3);
        break;
      case 'marketSquare':
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plantDatePalm(cx + sx * 7, cz + sz * 7, { scale: 1.12 });
        break;
      case 'sundialSquare':
        for (let i = 0; i < 10; i += 1) {
          const a = (i / 10) * Math.PI * 2 + 0.3;
          plantDatePalm(cx + Math.cos(a) * 20, cz + Math.sin(a) * 20, { scale: rng.range(1.0, 1.15) });
        }
        break;
      case 'hotelForecourt':
        for (let z = lot.z0 + 4; z <= lot.z1 - 4; z += 11) {
          plantDatePalm(lot.x0 + 5, z, { scale: 1.25 });
          plantDatePalm(lot.x1 - 5, z, { scale: 1.25 });
        }
        for (let x = lot.x0 + 16; x <= lot.x1 - 16; x += 12) {
          if (Math.abs(x - cx) < 14) continue;
          plantDatePalm(x, lot.z1 - 4, { scale: 1.2 });
          plantFloweringTree(x + 6, lot.z0 + 6);
        }
        break;
      case 'playground':
        plantFloweringTree(lot.x0 + 5, lot.z0 + 5, { color: 0x9a6ae6 });
        plantFloweringTree(lot.x1 - 5, lot.z1 - 5, { color: 0xff7a3a });
        plantFanPalm(lot.x1 - 5, lot.z0 + 5);
        break;
      default:
        break;
    }
  }

  /** Jasmine Heights: palms above the garden walls, bougainvillea against them, shrubs along them. */
  function plantVillaGardens() {
    const wallsByBuilding = new Map();
    for (const wall of city.walls) {
      let bounds = wallsByBuilding.get(wall.building);
      if (!bounds) {
        bounds = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
        wallsByBuilding.set(wall.building, bounds);
      }
      bounds.x0 = Math.min(bounds.x0, wall.minX);
      bounds.z0 = Math.min(bounds.z0, wall.minZ);
      bounds.x1 = Math.max(bounds.x1, wall.maxX);
      bounds.z1 = Math.max(bounds.z1, wall.maxZ);
    }
    for (const [buildingId, cell] of wallsByBuilding) {
      const villa = city.buildings[buildingId];
      if (!villa) continue;
      const vx0 = villa.x - villa.w / 2 - 2.5;
      const vx1 = villa.x + villa.w / 2 + 2.5;
      const vz0 = villa.z - villa.d / 2 - 2.5;
      const vz1 = villa.z + villa.d / 2 + 2.5;
      const inGarden = (x, z) => x > cell.x0 + 1.8 && x < cell.x1 - 1.8 && z > cell.z0 + 1.8 && z < cell.z1 - 1.8 && !(x > vx0 && x < vx1 && z > vz0 && z < vz1);
      let palms = 0;
      let trees = 0;
      for (let attempt = 0; attempt < 24 && (palms < 3 || trees < 1); attempt += 1) {
        const x = rng.range(cell.x0 + 2.2, cell.x1 - 2.2);
        const z = rng.range(cell.z0 + 2.2, cell.z1 - 2.2);
        if (!inGarden(x, z)) continue;
        if (palms < 3 && plantDatePalm(x, z, { scale: rng.range(0.72, 0.98) })) palms += 1;
        else if (trees < 1 && plantFloweringTree(x, z, { color: rng.pick([0xf03c9c, 0xd8329a, 0xff7aa8, 0x9a6ae6]) })) trees += 1;
      }
      for (let i = 0; i < 5; i += 1) {
        const edge = rng.int(0, 3);
        const x = edge < 2 ? rng.range(cell.x0 + 2, cell.x1 - 2) : edge === 2 ? cell.x0 + 1.6 : cell.x1 - 1.6;
        const z = edge >= 2 ? rng.range(cell.z0 + 2, cell.z1 - 2) : edge === 0 ? cell.z0 + 1.6 : cell.z1 - 1.6;
        if (inGarden(x, z) || (x > cell.x0 && x < cell.x1 && z > cell.z0 && z < cell.z1 && !(x > vx0 && x < vx1 && z > vz0 && z < vz1))) {
          if (rng.chance(0.3)) plantFanPalm(x, z, { scale: 0.8 });
          else plantShrub(x, z, { scale: rng.range(0.9, 1.3) });
        }
      }
    }
  }

  /** Clusters of three to five palms leaning toward the gulf along the top of the Corniche beach. */
  function plantBeachClusters() {
    const coast = city.coast;
    for (let x = -585; x <= 470; x += rng.range(48, 78)) {
      if (x > 90 && x < 240) continue;
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i += 1) {
        const px = x + rng.range(-7, 7);
        const pz = coast.beachTopZ - rng.range(3, 12);
        if (pz < city.coastZ(px) + 14) continue;
        plantDatePalm(px, pz, { yaw: Math.PI + rng.range(-0.7, 0.7), pitch: rng.range(0.07, 0.2), scale: rng.range(0.9, 1.2), claim: 1.4 });
      }
    }
  }

  /** A row of palms down the marina promenade, clear of the pier heads. */
  function plantMarinaPromenade() {
    const marina = city.coast.marina;
    for (let x = marina.minX + 10; x <= marina.maxX - 10; x += 15) {
      if (marina.piers.some((p) => Math.abs(p - x) < 7)) continue;
      plantDatePalm(x, -731, { scale: rng.range(1.0, 1.2), claim: 1.2 });
      if (rng.chance(0.5)) plantFanPalm(x + 7.5, -725, { scale: 0.8 });
    }
  }

  /** A dense, ragged grove ringing the pool at the Ain Zahra oasis. */
  function plantOasisGrove() {
    const oasis = city.landmarks.find((m) => m.kind === 'oasis');
    if (!oasis) return;
    const radius = oasis.radius || 60;
    let planted = 0;
    for (let attempt = 0; attempt < 400 && planted < 46; attempt += 1) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(radius * 0.45, radius * 0.98);
      const x = oasis.x + Math.cos(a) * r;
      const z = oasis.z + Math.sin(a) * r;
      if (plantDatePalm(x, z, { scale: rng.range(0.78, 1.28), pitch: rng.range(0, 0.12), claim: 2.6 })) planted += 1;
    }
    for (let i = 0; i < 40; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(radius * 0.42, radius * 1.05);
      if (i % 3 === 0) plantFanPalm(oasis.x + Math.cos(a) * r, oasis.z + Math.sin(a) * r);
      else plantShrub(oasis.x + Math.cos(a) * r, oasis.z + Math.sin(a) * r, { scale: rng.range(0.9, 1.4) });
    }
  }

  /** A palm-lined approach to the city gate, and the odd lonely palm out by the desert highways. */
  function plantDesertRoadside() {
    const gate = city.landmarks.find((m) => m.kind === 'gate');
    for (const road of city.desertRoads) {
      if (road.kind !== 'highway') continue;
      const half = city.roadKinds[road.kind].width / 2;
      for (let i = 0; i < road.points.length - 1; i += 1) {
        const [ax, az] = road.points[i];
        const [bx, bz] = road.points[i + 1];
        const length = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / length;
        const dz = (bz - az) / length;
        const nearGate = gate && road.name === 'Dune Highway' && i === 0;
        if (nearGate) {
          for (let s = 30; s < Math.min(length, 165); s += 14) {
            for (const side of [-1, 1]) {
              plantDatePalm(ax + dx * s - dz * side * (half + 6), az + dz * s + dx * side * (half + 6), { scale: 1.15, claim: 1.0 });
            }
          }
          continue;
        }
        for (let s = 120; s < length - 60; s += rng.range(260, 420)) {
          if (!rng.chance(0.6)) continue;
          const side = rng.sign();
          const off = half + rng.range(10, 22);
          const x = ax + dx * s - dz * side * off;
          const z = az + dz * s + dx * side * off;
          const group = rng.int(1, 3);
          for (let k = 0; k < group; k += 1) {
            plantDatePalm(x + rng.range(-4, 4), z + rng.range(-4, 4), { scale: rng.range(0.8, 1.15), pitch: rng.range(0, 0.15), claim: 1.6 });
          }
          plantShrub(x + rng.range(-5, 5), z + rng.range(-5, 5), { color: 0xd8d0a0 });
        }
      }
    }
  }

  /** Make the instanced sets: near and far date palms, fan palms, blossoming trees, shrubs, flower beds. */
  function finish() {
    kit.addSet({ name: 'datePalmNear', geometry: buildDatePalmGeometry('near'), material: foliage.material, depthMaterial: foliage.depth, records: lists.datePalm, maxRange: NEAR_PALM_RANGE, moveThreshold: 10, castShadow: true });
    kit.addSet({ name: 'datePalmFar', geometry: buildDatePalmGeometry('far'), material: foliage.material, depthMaterial: foliage.depth, records: lists.datePalm, minRange: NEAR_PALM_RANGE, maxRange: FAR_PALM_RANGE, moveThreshold: 10, castShadow: false });
    kit.addSet({ name: 'datePalmDistant', geometry: buildDatePalmGeometry('distant'), material: foliage.material, depthMaterial: foliage.depth, records: lists.datePalm, minRange: FAR_PALM_RANGE, maxRange: DISTANT_PALM_RANGE, moveThreshold: 10, castShadow: false });
    kit.addSet({ name: 'fanPalm', geometry: buildFanPalmGeometry(), material: foliage.material, depthMaterial: foliage.depth, records: lists.fanPalm, maxRange: 320, castShadow: false });
    kit.addSet({ name: 'floweringTree', geometry: buildFloweringTreeGeometry(), material: foliage.material, depthMaterial: foliage.depth, records: lists.floweringTree, maxRange: 380, castShadow: true });
    kit.addSet({ name: 'shrub', geometry: buildShrubGeometry(), material: foliage.material, records: lists.shrub, maxRange: 180 });
    kit.addSet({ name: 'flowerBed', geometry: buildFlowerBedGeometry(), material: foliage.material, records: lists.flowerBed, maxRange: 150 });
  }

  return {
    atlas,
    foliage,
    lists,
    plantDatePalm,
    plantFanPalm,
    plantShrub,
    plantFlowerBed,
    plantFloweringTree,
    placeStreetPalms,
    placeGardensAndLots,
    finish,
  };
}

/** A palm's own shade: most a fresh green, some sun-bleached yellow, a few deep blue-green. */
function palmTint(rng) {
  const roll = rng.next();
  if (roll < 0.2) return [1.08, 1.02, 0.78];
  if (roll < 0.35) return [0.86, 0.98, 0.94];
  const v = 0.94 + rng.next() * 0.1;
  return [v, v, v * 0.96];
}
