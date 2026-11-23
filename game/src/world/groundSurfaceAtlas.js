// The paving, asphalt, road paint, stone, timber, lawn, sand and pool water of Port Sarab, painted
// in code into one 1024 px canvas: sixteen seamless swatches that the ground shader repeats across
// the whole map. Every street, plaza, quay, beach and dune samples this one texture, so the ground
// of the city costs only a handful of draw calls.

/** The swatches of the atlas, by name. */
export const SURFACE = {
  ASPHALT: 0, ASPHALT_BLEACHED: 1, PAINT: 2, PAVERS: 3,
  KERB: 4, GRANITE: 5, COBBLES: 6, EARTH: 7,
  DECKING: 8, CONCRETE: 9, LAWN: 10, DARK_STONE: 11,
  SAND: 12, ZELLIGE: 13, POOL: 14, DIRT: 15,
};

/** How many metres of ground one repeat of each swatch covers. */
export const SURFACE_METRES = [4, 4, 2, 2.4, 2, 4.8, 2.4, 4, 3, 8, 3, 3, 6, 2, 3, 4];

/** Atlas geometry shared with the shader: 4 x 4 slots of 256 px, each a 240 px swatch with an 8 px wrapped gutter. */
export const ATLAS = { size: 1024, slot: 256, pad: 8, span: 240, columns: 4 };

/**
 * Paint every swatch into a new canvas and return it.
 * @returns {HTMLCanvasElement}
 */
export function paintGroundSurfaceAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS.size;
  canvas.height = ATLAS.size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(ATLAS.size, ATLAS.size);
  const swatch = new Uint8ClampedArray(ATLAS.span * ATLAS.span * 4);
  const painters = [
    paintAsphalt, paintBleachedAsphalt, paintRoadPaint, paintPavers,
    paintKerbStone, paintGraniteSlabs, paintCobbles, paintPackedEarth,
    paintDecking, paintConcrete, paintLawn, paintDarkStone,
    paintSandRipples, paintZellige, paintPoolWater, paintDirtTrack,
  ];
  const rgba = [0, 0, 0, 255];
  for (let index = 0; index < painters.length; index += 1) {
    const painter = painters[index];
    for (let py = 0; py < ATLAS.span; py += 1) {
      for (let px = 0; px < ATLAS.span; px += 1) {
        rgba[3] = 255;
        painter((px + 0.5) / ATLAS.span, (py + 0.5) / ATLAS.span, px, py, rgba);
        const o = (py * ATLAS.span + px) * 4;
        swatch[o] = rgba[0];
        swatch[o + 1] = rgba[1];
        swatch[o + 2] = rgba[2];
        swatch[o + 3] = rgba[3];
      }
    }
    copySwatchWithGutter(image.data, swatch, index);
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Copy one swatch into its slot, wrapping it into the gutter so filtering never sees a seam. */
function copySwatchWithGutter(target, swatch, index) {
  const { size, slot, pad, span, columns } = ATLAS;
  const left = (index % columns) * slot;
  const top = Math.floor(index / columns) * slot;
  for (let gy = 0; gy < slot; gy += 1) {
    const sy = (gy - pad + span * 2) % span;
    for (let gx = 0; gx < slot; gx += 1) {
      const sx = (gx - pad + span * 2) % span;
      const s = (sy * span + sx) * 4;
      const t = ((top + gy) * size + left + gx) * 4;
      target[t] = swatch[s];
      target[t + 1] = swatch[s + 1];
      target[t + 2] = swatch[s + 2];
      target[t + 3] = swatch[s + 3];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The swatches. Each painter gets the swatch coordinates (u, v in 0..1), the pixel (px, py) and
// writes 0..255 colour into rgba. Every pattern repeats exactly across the swatch edges.

/** Warm dark city asphalt: aggregate speckle, soft mottling and a few sealed hairline cracks. */
function paintAsphalt(u, v, px, py, rgba) {
  const mottle = (tileFbm(u, v, 8, 8, 3, 1) - 0.5) * 16;
  const g = pixelHash(px, py, 2);
  const speck = g > 0.972 ? 30 : g < 0.03 ? -18 : (g - 0.5) * 12;
  const cluster = tileNoise(u, v, 48, 48, 3) > 0.72 ? 7 : 0;
  const crack = Math.abs(tileFbm(u, v, 3, 3, 3, 7) - 0.5) < 0.0028 ? -9 : 0;
  const base = 86 + mottle + speck + cluster + crack;
  setRgb(rgba, base + 3, base + 2, base + 3);
}

/** Sun-bleached desert tarmac with crocodile cracking and sand dust caught in the cracks. */
function paintBleachedAsphalt(u, v, px, py, rgba) {
  const cell = tileVoronoi(u, v, 9, 9, 13);
  const edge = cell.f2 - cell.f1;
  const g = pixelHash(px, py, 4);
  const mottle = (tileFbm(u, v, 6, 6, 3, 5) - 0.5) * 20;
  let r = 104 + mottle + (g - 0.5) * 16 + (cell.id - 0.5) * 8;
  let gg = r - 2;
  let b = r - 4;
  if (edge < 0.05) {
    const t = 1 - edge / 0.05;
    r -= 34 * t; gg -= 34 * t; b -= 32 * t;
  }
  const dust = smooth(0.58, 0.8, tileFbm(u, v, 4, 4, 3, 21));
  r += (196 - r) * dust * 0.45; gg += (168 - gg) * dust * 0.45; b += (122 - b) * dust * 0.45;
  setRgb(rgba, r, gg, b);
}

/** Road paint: bright, faintly gritty, worn through in patches (alpha cut by the paint material). */
function paintRoadPaint(u, v, px, py, rgba) {
  const g = pixelHash(px, py, 6);
  const shade = 240 + (g - 0.5) * 12 - tileFbm(u, v, 10, 10, 2, 8) * 14;
  setRgb(rgba, shade, shade - 2, shade - 8);
  const wear = tileFbm(u, v, 6, 6, 4, 11);
  rgba[3] = wear > 0.66 || g > 0.992 ? 0 : 255;
}

/** Pale stone sidewalk pavers, 60 by 30 cm, laid in stretcher bond. */
function paintPavers(u, v, px, py, rgba) {
  const rows = 8;
  const row = Math.floor(v * rows);
  const shift = row % 2 ? 0.5 : 0;
  const along = u * 4 + shift;
  const col = Math.floor(along) % 4;
  const fu = along - Math.floor(along);
  const fv = v * rows - row;
  const edge = Math.min(Math.min(fu, 1 - fu) * 0.6, Math.min(fv, 1 - fv) * 0.3);
  const tone = cellHash(col, row, 5);
  const warm = cellHash(col, row, 9);
  const g = pixelHash(px, py, 7);
  let r = 226 + (tone - 0.5) * 22 + (g - 0.5) * 10;
  let gg = 214 + (tone - 0.5) * 20 + (g - 0.5) * 10 - warm * 6;
  let b = 192 + (tone - 0.5) * 18 + (g - 0.5) * 10 - warm * 12;
  if (edge < 0.011) { r = 150; gg = 140; b = 122; } else if (edge < 0.028) { r -= 14; gg -= 14; b -= 12; }
  setRgb(rgba, r, gg, b);
}

/** Speckled light granite kerb stones, a metre long each. */
function paintKerbStone(u, v, px, py, rgba) {
  const g = pixelHash(px, py, 12);
  const joint = u * 2 - Math.floor(u * 2);
  let base = 204 + (tileFbm(u, v, 4, 4, 2, 13) - 0.5) * 16;
  if (g > 0.9) base -= 58; else if (g < 0.07) base += 22;
  if (joint < 0.006 || joint > 0.994) base = 138;
  setRgb(rgba, base, base - 3, base - 9);
}

/** Large pale granite slabs with faint veining: the plazas of The Spires. */
function paintGraniteSlabs(u, v, px, py, rgba) {
  const sx = Math.floor(u * 4);
  const sy = Math.floor(v * 4);
  const fu = u * 4 - sx;
  const fv = v * 4 - sy;
  const edge = Math.min(fu, 1 - fu, fv, 1 - fv) * 1.2;
  const tone = cellHash(sx, sy, 15);
  const g = pixelHash(px, py, 16);
  const vein = Math.abs(tileFbm(u, v, 5, 5, 3, 17) - 0.5) < 0.008 ? -12 : 0;
  let base = 220 + (tone - 0.5) * 16 + (g - 0.5) * 9 + vein;
  if (edge < 0.007) base = 158; else if (edge < 0.02) base -= 8;
  setRgb(rgba, base, base - 5, base - 13);
}

/** Worn sandstone cobbles of Old Sarab, domed and set in dark grit. */
function paintCobbles(u, v, px, py, rgba) {
  const cell = tileVoronoi(u, v, 12, 12, 19);
  const gap = cell.f2 - cell.f1;
  const g = pixelHash(px, py, 20);
  if (gap < 0.1) {
    const shade = 104 + (g - 0.5) * 20;
    setRgb(rgba, shade + 14, shade, shade - 16);
    return;
  }
  const dome = 1.1 - cell.f1 * 0.45;
  const tone = 0.86 + cell.id * 0.24;
  setRgb(rgba, (204 + (g - 0.5) * 14) * dome * tone, (168 + (g - 0.5) * 12) * dome * tone, (118 + (g - 0.5) * 10) * dome * tone);
}

/** Packed ochre earth with pebbles and darker trodden patches. */
function paintPackedEarth(u, v, px, py, rgba) {
  const mottle = (tileFbm(u, v, 6, 6, 4, 23) - 0.5) * 34;
  const trodden = smooth(0.55, 0.75, tileFbm(u, v, 3, 3, 3, 24)) * -16;
  const g = pixelHash(px, py, 25);
  if (g > 0.993) { setRgb(rgba, 222, 204, 174); return; }
  const base = mottle + trodden + (g - 0.5) * 12;
  setRgb(rgba, 192 + base, 148 + base * 0.9, 100 + base * 0.7);
}

/** Teak decking: boards 15 cm wide running along u, staggered butt joints and grain. */
function paintDecking(u, v, px, py, rgba) {
  const boards = 20;
  const board = Math.floor(v * boards);
  const fv = v * boards - board;
  const joint = u * 2 + cellHash(board, 0, 27);
  const fj = joint - Math.floor(joint);
  const tone = (cellHash(board, 1, 28) - 0.5) * 26;
  const grain = (tileNoise(u, v, 3, 160, 29) - 0.5) * 22 + (tileNoise(u, v, 12, 240, 30) - 0.5) * 10;
  let r = 170 + tone + grain;
  let g = 112 + tone * 0.8 + grain * 0.8;
  let b = 68 + tone * 0.6 + grain * 0.5;
  if (fv < 0.07 || fj < 0.004) { r = 54; g = 36; b = 24; } else if (fv < 0.14 || fv > 0.93) { r -= 12; g -= 10; b -= 7; }
  setRgb(rgba, r, g, b);
}

/** Poured concrete slabs, four metres square, with expansion joints and faint stains. */
function paintConcrete(u, v, px, py, rgba) {
  const fu = u * 2 - Math.floor(u * 2);
  const fv = v * 2 - Math.floor(v * 2);
  const g = pixelHash(px, py, 31);
  const stain = smooth(0.62, 0.82, tileFbm(u, v, 3, 3, 3, 32)) * -22;
  let base = 182 + (tileFbm(u, v, 8, 8, 3, 33) - 0.5) * 18 + (g - 0.5) * 10 + stain;
  if (Math.min(fu, 1 - fu, fv, 1 - fv) < 0.004) base = 118;
  setRgb(rgba, base, base - 3, base - 9);
}

/** Watered lawn: blade speckle, clumps and a few sun-yellowed patches. */
function paintLawn(u, v, px, py, rgba) {
  const g = pixelHash(px, py, 35);
  const clump = (tileNoise(u, v, 24, 24, 36) - 0.5) * 26;
  const dry = smooth(0.6, 0.78, tileFbm(u, v, 4, 4, 3, 37));
  let r = 112 + (g - 0.5) * 26 + clump * 0.5;
  let gg = 162 + (g - 0.5) * 34 + clump;
  let b = 70 + (g - 0.5) * 14 + clump * 0.3;
  r += (150 - r) * dry * 0.5; gg += (152 - gg) * dry * 0.3; b += (70 - b) * dry * 0.4;
  setRgb(rgba, r, gg, b);
}

/** Dark polished stone of Lantern Row, veined, with gold inlay along every joint. */
function paintDarkStone(u, v, px, py, rgba) {
  const sx = Math.floor(u * 2);
  const sy = Math.floor(v * 2);
  const fu = u * 2 - sx;
  const fv = v * 2 - sy;
  const edge = Math.min(fu, 1 - fu, fv, 1 - fv) * 1.5;
  const g = pixelHash(px, py, 39);
  if (edge < 0.018) {
    const glint = 0.88 + g * 0.24;
    setRgb(rgba, 220 * glint, 172 * glint, 78 * glint);
    return;
  }
  const vein = Math.abs(tileFbm(u, v, 4, 4, 3, 40) - 0.5) < 0.01 ? 34 : 0;
  const base = 44 + (cellHash(sx, sy, 41) - 0.5) * 10 + (g - 0.5) * 6 + vein;
  setRgb(rgba, base, base + 1, base + 10);
}

/** Wind-rippled sand: asymmetric ripples a third of a metre apart, warped by the wind, and fine grain. */
function paintSandRipples(u, v, px, py, rgba) {
  const warp = tileFbm(u, v, 3, 3, 2, 43) * 3 + tileNoise(u, v, 2, 6, 44) * 1;
  const phase = u * 18 + warp;
  const f = phase - Math.floor(phase);
  const ridge = f < 0.72 ? f / 0.72 : (1 - f) / 0.28;
  const g = pixelHash(px, py, 45);
  const shade = 0.9 + ridge * 0.1 + (g - 0.5) * 0.06;
  setRgb(rgba, 240 * shade, 226 * shade, 200 * shade);
}

/** Old Sarab tilework: eight-pointed teal stars outlined in cream on terracotta. */
function paintZellige(u, v, px, py, rgba) {
  const cx = Math.floor(u * 4);
  const cy = Math.floor(v * 4);
  const p = u * 4 - cx - 0.5;
  const q = v * 4 - cy - 0.5;
  const square = Math.max(Math.abs(p), Math.abs(q));
  const diamond = (Math.abs(p) + Math.abs(q)) * 0.7071;
  const star = Math.min(square, diamond);
  const corner = Math.min(Math.abs(Math.abs(p) - 0.5) + Math.abs(Math.abs(q) - 0.5), 1);
  const g = pixelHash(px, py, 47);
  const n = (g - 0.5) * 10;
  if (Math.abs(Math.max(square, diamond) - 0.3) < 0.03 && star < 0.33) { setRgb(rgba, 242 + n, 228 + n, 196 + n); return; }
  if (Math.max(square, diamond) < 0.3) {
    if (Math.max(Math.abs(p), Math.abs(q)) < 0.06) { setRgb(rgba, 236 + n, 186 + n, 80 + n); return; }
    if ((cx + cy) % 2 === 0) setRgb(rgba, 24 + n, 142 + n, 140 + n);
    else setRgb(rgba, 36 + n, 88 + n, 152 + n);
    return;
  }
  if (corner < 0.12) { setRgb(rgba, 242 + n, 228 + n, 196 + n); return; }
  const grout = Math.min(Math.abs(p + 0.5), Math.abs(p - 0.5), Math.abs(q + 0.5), Math.abs(q - 0.5)) < 0.012;
  if (grout) { setRgb(rgba, 150, 120, 96); return; }
  setRgb(rgba, 190 + n, 96 + n, 60 + n);
}

/** Turquoise pool water over white tiles, with a bright net of caustics. */
function paintPoolWater(u, v, px, py, rgba) {
  const cell = tileVoronoi(u, v, 7, 7, 49);
  const caustic = 1 - smooth(0, 0.09, cell.f2 - cell.f1);
  const tiles = Math.min((u * 12) % 1, (v * 12) % 1) < 0.03 ? -10 : 0;
  const g = pixelHash(px, py, 50);
  const r = 44 + caustic * 150 + tiles + (g - 0.5) * 6;
  const gg = 182 + caustic * 64 + tiles + (g - 0.5) * 6;
  const b = 198 + caustic * 50 + tiles + (g - 0.5) * 6;
  setRgb(rgba, r, gg, b);
}

/** A packed-sand track surface with lengthwise wheel streaks and small stones. */
function paintDirtTrack(u, v, px, py, rgba) {
  const streak = (tileNoise(u, v, 2, 36, 52) - 0.5) * 22 + (tileNoise(u, v, 4, 90, 53) - 0.5) * 10;
  const mottle = (tileFbm(u, v, 5, 5, 3, 54) - 0.5) * 18;
  const g = pixelHash(px, py, 55);
  if (g > 0.994) { setRgb(rgba, 150, 124, 96); return; }
  const base = streak + mottle + (g - 0.5) * 12;
  setRgb(rgba, 200 + base, 162 + base * 0.9, 112 + base * 0.7);
}

// ---------------------------------------------------------------------------------------------
// Seamless noise: lattice values repeat every `periodU` x `periodV` cells across one swatch.

function setRgb(rgba, r, g, b) {
  rgba[0] = r;
  rgba[1] = g;
  rgba[2] = b;
}

function smooth(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function cellHash(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pixelHash(px, py, seed) {
  return cellHash(px + 7919, py + 104729, seed);
}

function tileNoise(u, v, periodU, periodV, seed) {
  const x = u * periodU;
  const y = v * periodV;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % periodU) + periodU) % periodU;
  const y0 = ((iy % periodV) + periodV) % periodV;
  const x1 = (x0 + 1) % periodU;
  const y1 = (y0 + 1) % periodV;
  const a = cellHash(x0, y0, seed);
  const b = cellHash(x1, y0, seed);
  const c = cellHash(x0, y1, seed);
  const d = cellHash(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function tileFbm(u, v, periodU, periodV, octaves, seed) {
  let sum = 0;
  let norm = 0;
  let amplitude = 0.5;
  let pu = periodU;
  let pv = periodV;
  for (let i = 0; i < octaves; i += 1) {
    sum += tileNoise(u, v, pu, pv, seed + i * 31) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    pu *= 2;
    pv *= 2;
  }
  return sum / norm;
}

const voronoiResult = { f1: 0, f2: 0, id: 0 };

/** Distances to the nearest and second-nearest jittered cell centres (in cell units), and the nearest cell's id. */
function tileVoronoi(u, v, periodU, periodV, seed) {
  const x = u * periodU;
  const y = v * periodV;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = ix + dx;
      const cy = iy + dy;
      const wx = ((cx % periodU) + periodU) % periodU;
      const wy = ((cy % periodV) + periodV) % periodV;
      const fx = cx + 0.15 + cellHash(wx, wy, seed) * 0.7 - x;
      const fy = cy + 0.15 + cellHash(wx, wy, seed + 1) * 0.7 - y;
      const d = Math.sqrt(fx * fx + fy * fy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = cellHash(wx, wy, seed + 2);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  voronoiResult.f1 = f1;
  voronoiResult.f2 = f2;
  voronoiResult.id = id;
  return voronoiResult;
}
