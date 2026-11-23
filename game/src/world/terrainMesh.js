// The beach and the Amber Dunes of Port Sarab as one height-field reaching the horizon: sampled from
// game.terrain so cars ride the sand they see, fine along the desert roads and the shore, coarser out
// in the open dunes, stitched seam-free between levels of detail. Sand is shaded gold on the slopes,
// pale on the crests and cool in the hollows, pale on the beach, dark where the waves wet it, and turns
// turquoise then deep blue as the sea floor falls away under the gulf.
import * as THREE from 'three';
import { SURFACE } from './groundSurfaceAtlas.js';

const TILE = 64;
const NEAR = { x0: -2560, x1: 2560, z0: -2048, z1: 2560 };
const FAR_CELL = 512;
const FAR = { x0: -6656, x1: 6656, z0: -6144, z1: 7168 };

/**
 * Build the terrain meshes.
 * @param {Object} game
 * @param {THREE.Material} material   the ground swatch material
 * @param {{ holes: {x0,z0,x1,z1,sink,snap?}[], pads: Object[] }} options   rectangles the terrain leaves
 *        to other meshes (city floor, marina, port) and paved pads it tucks itself under (runway, aprons)
 * @returns {{ meshes: THREE.Mesh[], height: (x:number, z:number) => number, triangles: number }}
 */
export function createTerrainMesh(game, material, options) {
  const shape = createTerrainShape(game, options);
  const steps = chooseTileSteps(game, shape);
  const chunks = new Map();
  let triangles = 0;
  const nx = (NEAR.x1 - NEAR.x0) / TILE;
  const nz = (NEAR.z1 - NEAR.z0) / TILE;
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const step = steps[j * nx + i];
      if (!step) continue;
      const x0 = NEAR.x0 + i * TILE;
      const z0 = NEAR.z0 + j * TILE;
      const neighbour = (di, dj) => {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) return FAR_CELL;
        return steps[jj * nx + ii] || 0;
      };
      const name = step >= 64 ? 'outskirts' : `${x0 + TILE / 2 < 40 ? 'west' : 'east'}-${z0 + TILE / 2 < 300 ? 'north' : 'south'}`;
      triangles += addTile(chunkFor(chunks, name), shape, x0, z0, step, [neighbour(-1, 0), neighbour(1, 0), neighbour(0, -1), neighbour(0, 1)]);
    }
  }
  triangles += addFarRing(chunkFor(chunks, 'outskirts'), shape);
  const meshes = [];
  for (const [name, chunk] of chunks) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(chunk.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(chunk.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(chunk.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(chunk.uvs, 2));
    geometry.setAttribute('surfaceTile', new THREE.BufferAttribute(new Uint8Array(chunk.positions.length / 3).fill(SURFACE.SAND), 1));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(chunk.indices), 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `terrain-${name}`;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
  }
  return { meshes, triangles, height: shape.height, steps };
}

/**
 * The shape of the visible ground: game.terrain's height without the stunt ramps (their kickers are
 * drawn as props), tucked 30 cm under paved roads and pads, sunk out of sight inside the holes other
 * meshes fill, rising into tall dunes beyond the edge of the playable world; and the colour of its sand.
 */
function createTerrainShape(game, options) {
  const terrain = game.terrain;
  const city = game.city;
  const world = game.config.world;
  const seaLevel = world.seaLevel;
  const { smoothstep, fractalNoise2D, valueNoise2D, distanceToSegment2D } = game.math;
  const holes = options.holes;
  const pads = options.pads || [];
  const segments = [];
  for (const road of city.desertRoads) {
    const half = city.roadKinds[road.kind].width / 2;
    for (let i = 0; i < road.points.length - 1; i += 1) {
      segments.push({ ax: road.points[i][0], az: road.points[i][1], bx: road.points[i + 1][0], bz: road.points[i + 1][1], half });
    }
  }
  const nearRoadCells = new Set();
  for (const s of segments) {
    const length = Math.hypot(s.bx - s.ax, s.bz - s.az);
    for (let t = 0; t <= length; t += 16) {
      const x = s.ax + ((s.bx - s.ax) * t) / length;
      const z = s.az + ((s.bz - s.az) * t) / length;
      for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) nearRoadCells.add(cellKey(Math.floor(x / 32) + dx, Math.floor(z / 32) + dz));
    }
  }
  const palette = {
    dune: linearColor(0xf8d098), crest: linearColor(0xfff4c8), hollow: linearColor(0xe8b4b4), amber: linearColor(0xffb878),
    beach: linearColor(0xfff6e2), damp: linearColor(0xc4aa92), shallow: linearColor(0x9ae6dc), deep: linearColor(0x1c5e88),
    dust: linearColor(0xf6e0c0),
  };

  /** Distance from the edge of the nearest desert road (negative on it). */
  function roadEdgeDistance(x, z) {
    let best = 1e9;
    for (const s of segments) {
      const d = distanceToSegment2D(x, z, s.ax, s.az, s.bx, s.bz) - s.half;
      if (d < best) best = d;
    }
    return best;
  }

  function underPavement(x, z) {
    if (nearRoadCells.has(cellKey(Math.floor(x / 32), Math.floor(z / 32))) && roadEdgeDistance(x, z) < 0.6) return true;
    for (const p of pads) {
      if (p.r !== undefined) {
        if ((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < p.r * p.r) return true;
      } else if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return true;
    }
    return false;
  }

  /** Distance outside the playable world rectangle (0 inside). */
  function outsideWorld(x, z) {
    const dx = x < world.minX ? world.minX - x : x > world.maxX ? x - world.maxX : 0;
    const dz = z < world.minZ ? world.minZ - z : z > world.maxZ ? z - world.maxZ : 0;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** The height the mesh shows at a point. */
  function height(x, z) {
    for (let i = 0; i < holes.length; i += 1) {
      const hole = holes[i];
      if (x > hole.x0 + 0.01 && x < hole.x1 - 0.01 && z > hole.z0 + 0.01 && z < hole.z1 - 0.01) return hole.sink;
    }
    let h = terrain.baseHeightAt(x, z);
    const beyond = outsideWorld(x, z);
    if (beyond > 150 && z > city.coast.beachTopZ + 60) {
      const rise = smoothstep(150, 2400, beyond) * smoothstep(city.coast.beachTopZ + 60, city.coast.beachTopZ + 600, z);
      h += rise * (22 + 60 * fractalNoise2D(x / 900, z / 700, 3, 61));
    }
    if (underPavement(x, z)) h -= 0.3;
    return h;
  }

  const sample = { nx: 0, ny: 1, nz: 0, convex: 0 };
  /** The smooth upward normal over `e` metres, and how much the point stands proud of its surroundings. */
  function probe(x, z, h, e) {
    const hx0 = height(x - e, z);
    const hx1 = height(x + e, z);
    const hz0 = height(x, z - e);
    const hz1 = height(x, z + e);
    const dx = hx1 - hx0;
    const dz = hz1 - hz0;
    const length = Math.sqrt(dx * dx + 4 * e * e + dz * dz);
    sample.nx = -dx / length;
    sample.ny = (2 * e) / length;
    sample.nz = -dz / length;
    sample.convex = h - (hx0 + hx1 + hz0 + hz1) * 0.25;
    return sample;
  }

  const out = [0, 0, 0];
  /** The colour of the sand at a point, as linear multipliers for the sand swatch. */
  function colour(x, z, h, s) {
    const beachTop = city.coast.beachTopZ;
    if (h < seaLevel - 0.05) {
      mixInto(out, palette.shallow, palette.deep, smoothstep(0.2, 7, seaLevel - h));
      return out;
    }
    if (z < beachTop + 4) {
      const wet = 1 - smoothstep(seaLevel + 0.04, seaLevel + 0.4, h);
      mixInto(out, palette.beach, palette.damp, wet);
      const ripple = 0.96 + 0.08 * valueNoise2D(x / 23, z / 9, 71);
      out[0] *= ripple; out[1] *= ripple; out[2] *= ripple;
      return out;
    }
    const convex = Math.max(-1, Math.min(1, s.convex / 0.5));
    const lift = smoothstep(0, 13, h);
    mixInto(out, palette.hollow, palette.dune, smoothstep(-0.7, 0.9, convex * 0.7 + lift * 0.6 - 0.15));
    mixInto(out, out, palette.crest, smoothstep(0.25, 0.9, convex) * lift * 0.55);
    const west = Math.max(0, -s.nx * 0.92 - s.nz * 0.38) * 2.2;
    mixInto(out, out, palette.amber, Math.min(0.45, west));
    if (nearRoadCells.has(cellKey(Math.floor(x / 32), Math.floor(z / 32)))) {
      mixInto(out, out, palette.dust, (1 - smoothstep(4, 26, roadEdgeDistance(x, z))) * 0.5);
    }
    const vary = 0.93 + 0.12 * fractalNoise2D(x / 340, z / 260, 2, 81);
    out[0] *= vary;
    out[1] *= vary * (0.98 + 0.04 * valueNoise2D(x / 500, z / 500, 83));
    out[2] *= vary;
    return out;
  }

  return { height, probe, colour, holes, roadEdgeDistance };
}

/**
 * Pick each 64 m tile's cell size: 8 m where a desert road's shoulders or a quay edge cross it, 16 m
 * around the city, the roads, the beach and the landmarks, 32 m in the open dunes and the deep sea,
 * 64 m beyond the playable world; 0 where another mesh covers the whole tile.
 */
function chooseTileSteps(game, shape) {
  const city = game.city;
  const world = game.config.world;
  const nx = (NEAR.x1 - NEAR.x0) / TILE;
  const nz = (NEAR.z1 - NEAR.z0) / TILE;
  const steps = new Array(nx * nz).fill(0);
  const urban = city.urban;
  const landmarks = city.flatZones.map((zone) => ({ x: zone[0], z: zone[1], reach: zone[2] + 50 }));
  for (const mark of city.landmarks) if (mark.kind === 'shipwreck') landmarks.push({ x: mark.x, z: mark.z, reach: 60 });
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const x0 = NEAR.x0 + i * TILE;
      const z0 = NEAR.z0 + j * TILE;
      const x1 = x0 + TILE;
      const z1 = z0 + TILE;
      if (shape.holes.some((h) => x0 >= h.x0 && x1 <= h.x1 && z0 >= h.z0 && z1 <= h.z1)) continue;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const outside = Math.hypot(Math.max(world.minX - x1, x0 - world.maxX, 0), Math.max(world.minZ - z1, z0 - world.maxZ, 0));
      let step;
      if (outside > 300) step = 64;
      else if (outside > 0) step = 32;
      else if (shape.holes.some((h) => h.snap && x1 > h.x0 && x0 < h.x1 && z1 > h.z0 - 8 && z0 < h.z1)) step = 8;
      else {
        const roadEdge = shape.roadEdgeDistance(cx, cz) - TILE * 0.71;
        const cityGap = Math.hypot(Math.max(urban.minX - 19 - x1, x0 - urban.maxX - 19, 0), Math.max(urban.minZ - 19 - z1, z0 - urban.maxZ - 19, 0));
        const nearLandmark = landmarks.some((m) => Math.hypot(cx - m.x, cz - m.z) < m.reach + TILE * 0.71);
        if (roadEdge < 16) step = 8;
        else if (roadEdge < 56 || cityGap < 90 || nearLandmark) step = 16;
        else if (z1 < -700 && z0 > -960) step = 16;
        else step = 32;
      }
      steps[j * nx + i] = step;
    }
  }
  return steps;
}

/** Add one tile of `step` metre cells; edges facing coarser neighbours follow the neighbour's samples. */
function addTile(chunk, shape, x0, z0, step, neighbours) {
  const xs = snappedCoordinates(x0, x0 + TILE, step, SNAP_X);
  const zs = snappedCoordinates(z0, z0 + TILE, step, SNAP_Z);
  const cols = xs.length;
  const rows = zs.length;
  const [west, east, north, south] = neighbours;
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = xs[c];
      const z = zs[r];
      let h;
      if (c === 0 && west > step) h = edgeHeight(shape, x, z0, z, west, 'z');
      else if (c === cols - 1 && east > step) h = edgeHeight(shape, x, z0, z, east, 'z');
      else if (r === 0 && north > step) h = edgeHeight(shape, z, x0, x, north, 'x');
      else if (r === rows - 1 && south > step) h = edgeHeight(shape, z, x0, x, south, 'x');
      else h = shape.height(x, z);
      heights[r * cols + c] = h;
    }
  }
  const base = chunk.positions.length / 3;
  const e = Math.min(6, step * 0.6);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = xs[c];
      const z = zs[r];
      const h = heights[r * cols + c];
      const s = shape.probe(x, z, h, e);
      const col = shape.colour(x, z, h, s);
      chunk.positions.push(x, h, z);
      chunk.normals.push(s.nx, s.ny, s.nz);
      chunk.colors.push(col[0], col[1], col[2]);
      chunk.uvs.push(x / 6, z / 6);
    }
  }
  let added = 0;
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const cx = (xs[c] + xs[c + 1]) / 2;
      const cz = (zs[r] + zs[r + 1]) / 2;
      if (shape.holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) continue;
      const a = base + r * cols + c;
      const b = a + 1;
      const cc = a + cols;
      const d = cc + 1;
      const ha = heights[r * cols + c];
      const hb = heights[r * cols + c + 1];
      const hc = heights[(r + 1) * cols + c];
      const hd = heights[(r + 1) * cols + c + 1];
      if (Math.abs(ha - hd) < Math.abs(hb - hc)) chunk.indices.push(a, cc, d, a, d, b);
      else chunk.indices.push(a, cc, b, b, cc, d);
      added += 2;
    }
  }
  return added;
}

/**
 * The height along a tile edge shared with a coarser neighbour: interpolated between the neighbour's
 * own samples so the two meshes meet without cracks. `along` is the axis the edge runs along.
 */
function edgeHeight(shape, fixed, tileStart, at, coarse, along) {
  const start = coarse >= FAR_CELL ? Math.floor(at / FAR_CELL) * FAR_CELL : tileStart;
  const span = coarse >= FAR_CELL ? FAR_CELL : TILE;
  const list = snappedCoordinates(start, start + span, coarse, along === 'x' ? SNAP_X : SNAP_Z);
  let k = 0;
  while (k < list.length - 2 && list[k + 1] < at) k += 1;
  const a = list[k];
  const b = list[k + 1];
  const t = b > a ? (at - a) / (b - a) : 0;
  const ha = along === 'x' ? shape.height(a, fixed) : shape.height(fixed, a);
  const hb = along === 'x' ? shape.height(b, fixed) : shape.height(fixed, b);
  return ha + (hb - ha) * t;
}

/** Evenly spaced coordinates from a to b, with an interior one pulled onto any nearby quay or city edge. */
function snappedCoordinates(a, b, step, specials) {
  const list = [];
  for (let v = a; v <= b + 0.001; v += step) list.push(v);
  if (step > 16) return list;
  for (const s of specials) {
    if (s <= a + 0.5 || s >= b - 0.5) continue;
    let best = -1;
    let bestDistance = step * 0.5 + 0.001;
    for (let i = 1; i < list.length - 1; i += 1) {
      const d = Math.abs(list[i] - s);
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    if (best >= 0) list[best] = s;
  }
  return list;
}

/** The horizon: 512 m cells from the edge of the detailed terrain out past the far plane. */
function addFarRing(chunk, shape) {
  const xs = [];
  const zs = [];
  for (let x = FAR.x0; x <= FAR.x1; x += FAR_CELL) xs.push(x);
  for (let z = FAR.z0; z <= FAR.z1; z += FAR_CELL) zs.push(z);
  const base = chunk.positions.length / 3;
  for (const z of zs) {
    for (const x of xs) {
      const h = shape.height(x, z);
      const s = shape.probe(x, z, h, 120);
      const col = shape.colour(x, z, h, s);
      chunk.positions.push(x, h, z);
      chunk.normals.push(s.nx, s.ny, s.nz);
      chunk.colors.push(col[0], col[1], col[2]);
      chunk.uvs.push(x / 6, z / 6);
    }
  }
  let added = 0;
  const cols = xs.length;
  for (let r = 0; r < zs.length - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const cx = (xs[c] + xs[c + 1]) / 2;
      const cz = (zs[r] + zs[r + 1]) / 2;
      if (cx > NEAR.x0 && cx < NEAR.x1 && cz > NEAR.z0 && cz < NEAR.z1) continue;
      const a = base + r * cols + c;
      chunk.indices.push(a, a + cols, a + cols + 1, a, a + cols + 1, a + 1);
      added += 2;
    }
  }
  return added;
}

function chunkFor(chunks, key) {
  let chunk = chunks.get(key);
  if (!chunk) {
    chunk = { positions: [], normals: [], colors: [], uvs: [], indices: [] };
    chunks.set(key, chunk);
  }
  return chunk;
}

function cellKey(cx, cz) {
  return (cx + 4096) * 8192 + (cz + 4096);
}

function linearColor(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function mixInto(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

/** Edges of the city floor, the marina and the port that terrain cells line up with. */
const SNAP_X = [-1059, 1139, -1007, -633, 480, 1160];
const SNAP_Z = [-719, 839, -900, -862];
