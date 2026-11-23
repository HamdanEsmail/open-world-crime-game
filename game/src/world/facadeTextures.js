// The facade atlas of Port Sarab: every curtain wall, plaster wall, roller door, balcony, roof and
// sign the city's buildings wear, painted once on canvas in code. The colour atlas carries a mask
// in its alpha (which pixels take the building's tint, which keep their own colour, which are cut
// away), and a matching glow atlas holds the lit windows, shop lights and neon of the night.
import * as THREE from 'three';
import * as paint from './facadeTilePainters.js';
import { SIGN_CATALOG, paintSignTile } from './neonSigns.js';

/** How a tile glows: not at all, as windows lit one by one at dusk, always, or always in its tint. */
export const GLOW = { none: 0, windows: 1, always: 2, tinted: 3 };

/**
 * Paint the atlas. Returns { colorTexture, glowTexture, tiles, tileList, tileRects, tileInfo }:
 * tiles[name] = { index, name, worldW, worldH, gridU, gridV, reflect, glow, cutout }, and the
 * two arrays of THREE.Vector4 (one per tile) the facade material looks the tiles up in.
 */
export function createFacadeAtlas(game) {
  const rng = game.rng.fork('facade-atlas');
  const color = makeCanvas(ATLAS_SIZE, ATLAS_SIZE);
  const mask = makeCanvas(ATLAS_SIZE, ATLAS_SIZE);
  const glow = makeCanvas(ATLAS_SIZE, ATLAS_SIZE);
  const colorCtx = color.getContext('2d');
  const maskCtx = mask.getContext('2d');
  const glowCtx = glow.getContext('2d');
  glowCtx.fillStyle = '#000';
  glowCtx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  const tiles = {};
  const tileList = [];
  const tileRects = [];
  const tileInfo = [];
  const register = (spec, rect) => {
    const entry = {
      index: tileList.length,
      name: spec.name,
      worldW: spec.worldW,
      worldH: spec.worldH,
      gridU: spec.grid ? spec.grid[0] : 0,
      gridV: spec.grid ? spec.grid[1] : 0,
      reflect: spec.reflect || 0,
      glow: spec.glow || GLOW.none,
      cutout: !!spec.cutout,
      rect,
    };
    tiles[spec.name] = entry;
    tileList.push(entry);
    tileRects.push(new THREE.Vector4(rect.x / ATLAS_SIZE, 1 - (rect.y + rect.h) / ATLAS_SIZE, rect.w / ATLAS_SIZE, rect.h / ATLAS_SIZE));
    tileInfo.push(new THREE.Vector4(entry.gridU, entry.gridV, entry.reflect, entry.glow));
    return entry;
  };

  for (const spec of FACADE_TILES) {
    const rect = cellRect(spec.cell);
    const painter = createTilePainter(rect.w, rect.h, rng.fork(spec.name));
    spec.paint(painter);
    painter.blitInto(colorCtx, maskCtx, glowCtx, rect, rect.gutter);
    register(spec, rect);
  }

  SIGN_CATALOG.forEach((sign, i) => {
    if (i >= SIGN_SLOTS) return;
    const rect = signRect(i);
    const painter = createTilePainter(rect.w, rect.h, rng.fork(`sign-${sign.id}`));
    paintSignTile(painter, sign);
    painter.blitInto(colorCtx, maskCtx, glowCtx, rect, rect.gutter);
    register({ name: `sign:${sign.id}`, worldW: 1, worldH: 1, glow: sign.glow === false ? GLOW.none : GLOW.always }, rect);
  });

  const colorTexture = combineColorAndMask(colorCtx, maskCtx);
  const glowTexture = new THREE.CanvasTexture(glow);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const anisotropy = Math.min(4, game.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  for (const texture of [colorTexture, glowTexture]) {
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }

  return { colorTexture, glowTexture, tiles, tileList, tileRects, tileInfo, size: ATLAS_SIZE, canvas: { color, mask, glow } };
}

/**
 * The tiles, row by row of 128-pixel cells (a cell with a fourth number is a quarter cell).
 * worldW x worldH is the size in metres one repeat covers: a storey is about 3.4 m, so windows
 * keep their real size on any building. grid is the windows per repeat for the night lights.
 */
const FACADE_TILES = [
  // The Spires: curtain walls, stone office grids and the street-level podium
  { name: 'glassGrid', cell: [0, 0], worldW: 12, worldH: 13.6, grid: [4, 4], reflect: 1, glow: GLOW.windows, paint: paint.glassGrid },
  { name: 'glassRibbon', cell: [1, 0], worldW: 12, worldH: 13.6, grid: [4, 4], reflect: 1, glow: GLOW.windows, paint: paint.glassRibbon },
  { name: 'glassFins', cell: [2, 0], worldW: 12, worldH: 13.6, grid: [7, 4], reflect: 1, glow: GLOW.windows, paint: paint.glassFins },
  { name: 'glassSeamless', cell: [3, 0], worldW: 12, worldH: 13.6, grid: [4, 4], reflect: 1, glow: GLOW.windows, paint: paint.glassSeamless },
  { name: 'officePunched', cell: [4, 0], worldW: 12, worldH: 13.6, grid: [4, 4], reflect: 0.8, glow: GLOW.windows, paint: paint.officePunched },
  { name: 'decoFins', cell: [5, 0], worldW: 12, worldH: 13.6, grid: [4, 4], reflect: 0.8, glow: GLOW.windows, paint: paint.decoFins },
  { name: 'podiumShops', cell: [6, 0], worldW: 12, worldH: 6, grid: [2, 1], reflect: 0.6, glow: GLOW.windows, paint: paint.podiumShops },
  { name: 'lobbyGlass', cell: [7, 0], worldW: 12, worldH: 6, reflect: 0.7, glow: GLOW.always, paint: paint.lobbyGlass },
  // Marina Crescent: deep balconies and white walls
  { name: 'balconyDeep', cell: [0, 1], worldW: 9, worldH: 6.4, grid: [3, 2], reflect: 0.7, glow: GLOW.windows, paint: paint.balconyDeep },
  { name: 'balconyRail', cell: [1, 1], worldW: 9, worldH: 1.25, reflect: 0.6, paint: paint.balconyRail },
  { name: 'apartmentWindows', cell: [2, 1], worldW: 9, worldH: 6.4, grid: [3, 2], reflect: 0.7, glow: GLOW.windows, paint: paint.apartmentWindows },
  { name: 'skyGarden', cell: [3, 1], worldW: 12, worldH: 6.8, grid: [4, 1], glow: GLOW.windows, paint: paint.skyGarden },
  // Old Sarab: plaster, arches, battlements and wind-tower slats
  { name: 'plasterWindows', cell: [4, 1], worldW: 9, worldH: 6.8, grid: [3, 2], reflect: 0.2, glow: GLOW.windows, paint: paint.plasterWindows },
  { name: 'plasterArches', cell: [5, 1], worldW: 9, worldH: 3.8, grid: [3, 1], glow: GLOW.windows, paint: paint.plasterArches },
  { name: 'plasterBlank', cell: [6, 1], worldW: 6, worldH: 6, paint: paint.plasterBlank },
  { name: 'crenellation', cell: [7, 1], worldW: 3, worldH: 1.2, cutout: true, paint: paint.crenellation },
  { name: 'windTowerSlats', cell: [0, 2], worldW: 3, worldH: 3.2, cutout: true, paint: paint.windTowerSlats },
  { name: 'doorArch', cell: [1, 2], worldW: 1.8, worldH: 3, cutout: true, paint: paint.doorArch },
  // Mina Docks and the low sheds of Southgate
  { name: 'corrugated', cell: [2, 2], worldW: 8, worldH: 8, paint: paint.corrugated },
  { name: 'rollerDoor', cell: [3, 2], worldW: 5, worldH: 5, paint: paint.rollerDoor },
  { name: 'coldPanels', cell: [4, 2], worldW: 8, worldH: 8, paint: paint.coldPanels },
  // Jasmine Heights villas
  { name: 'villaWindows', cell: [5, 2], worldW: 10, worldH: 3.4, grid: [2, 1], reflect: 0.4, glow: GLOW.windows, paint: paint.villaWindows },
  { name: 'villaArcade', cell: [6, 2], worldW: 10, worldH: 3.4, grid: [2, 1], glow: GLOW.windows, paint: paint.villaArcade },
  // Lantern Row hotels and clubs
  { name: 'hotelBalconies', cell: [7, 2], worldW: 12, worldH: 6.8, grid: [4, 2], reflect: 0.6, glow: GLOW.windows, paint: paint.hotelBalconies },
  { name: 'hotelGlass', cell: [0, 3], worldW: 12, worldH: 13.6, grid: [4, 4], reflect: 1, glow: GLOW.windows, paint: paint.hotelGlass },
  { name: 'clubPanels', cell: [1, 3], worldW: 8, worldH: 6.8, paint: paint.clubPanels },
  // Al Wadi Flats and the shop fronts
  { name: 'flatsWindows', cell: [2, 3], worldW: 9, worldH: 6.4, grid: [3, 2], reflect: 0.4, glow: GLOW.windows, paint: paint.flatsWindows },
  { name: 'flatsBalconies', cell: [3, 3], worldW: 9, worldH: 6.4, grid: [3, 2], glow: GLOW.windows, paint: paint.flatsBalconies },
  { name: 'shopStrip', cell: [4, 3], worldW: 12, worldH: 4.5, grid: [3, 1], reflect: 0.5, glow: GLOW.windows, paint: paint.shopStrip },
  { name: 'motelDoors', cell: [5, 3], worldW: 8, worldH: 3.2, grid: [2, 1], glow: GLOW.windows, paint: paint.motelDoors },
  // Landmark pieces
  { name: 'vaultLattice', cell: [6, 3], worldW: 6, worldH: 6, cutout: true, glow: GLOW.always, paint: paint.vaultLattice },
  { name: 'helipad', cell: [7, 3], worldW: 1, worldH: 1, glow: GLOW.always, paint: paint.helipad },
  { name: 'sundialFace', cell: [0, 4], worldW: 1, worldH: 1, glow: GLOW.always, paint: paint.sundialFace },
  { name: 'hospitalEmblem', cell: [1, 4], worldW: 1, worldH: 1, glow: GLOW.always, paint: paint.hospitalEmblem },
  { name: 'policeCrest', cell: [2, 4], worldW: 1, worldH: 1, glow: GLOW.always, paint: paint.policeCrest },
  { name: 'tiledDome', cell: [3, 4], worldW: 4, worldH: 4, reflect: 0.3, paint: paint.tiledDome },
  // Plain materials in quarter cells
  { name: 'plain', cell: [4, 4, 0], worldW: 4, worldH: 4, paint: paint.plain },
  { name: 'roofGravel', cell: [4, 4, 1], worldW: 8, worldH: 8, paint: paint.roofGravel },
  { name: 'stone', cell: [4, 4, 2], worldW: 7, worldH: 3.6, paint: paint.stone },
  { name: 'metalPanel', cell: [4, 4, 3], worldW: 3, worldH: 3, reflect: 0.35, paint: paint.metalPanel },
  { name: 'poolWater', cell: [5, 4, 0], worldW: 6, worldH: 6, reflect: 0.5, glow: GLOW.always, paint: paint.poolWater },
  { name: 'greenery', cell: [5, 4, 1], worldW: 3, worldH: 3, paint: paint.greenery },
  { name: 'awningStripes', cell: [5, 4, 2], worldW: 2.4, worldH: 2.4, cutout: true, paint: paint.awningStripes },
  { name: 'terracotta', cell: [5, 4, 3], worldW: 3, worldH: 3, paint: paint.terracotta },
  { name: 'neonTube', cell: [6, 4, 0], worldW: 1, worldH: 1, glow: GLOW.tinted, paint: paint.neonTube },
  { name: 'hazard', cell: [6, 4, 1], worldW: 2, worldH: 2, paint: paint.hazard },
  { name: 'crownLights', cell: [6, 4, 2], worldW: 4, worldH: 4, glow: GLOW.tinted, paint: paint.crownLights },
  { name: 'darkGlass', cell: [6, 4, 3], worldW: 6, worldH: 6, reflect: 1, paint: paint.darkGlass },
  { name: 'solarPanel', cell: [7, 4, 0], worldW: 3, worldH: 3, reflect: 0.8, paint: paint.solarPanel },
  { name: 'concrete', cell: [7, 4, 1], worldW: 4, worldH: 4, paint: paint.concrete },
  { name: 'woodSlats', cell: [7, 4, 2], worldW: 2, worldH: 2, cutout: true, paint: paint.woodSlats },
  { name: 'beamEnds', cell: [7, 4, 3], worldW: 2, worldH: 0.6, paint: paint.beamEnds },
];

const ATLAS_SIZE = 1024;
const CELL = 128;
const CELL_GUTTER = 8;
const QUARTER_GUTTER = 4;
const SIGN_TOP = 640;
const SIGN_W = 256;
const SIGN_H = 42;
const SIGN_GUTTER = 3;
const SIGN_SLOTS = 36;

/** The painted part of a 128-pixel cell (or of one of its four quarters), inside its gutter. */
function cellRect([col, row, quarter]) {
  if (quarter === undefined) {
    return { x: col * CELL + CELL_GUTTER, y: row * CELL + CELL_GUTTER, w: CELL - 2 * CELL_GUTTER, h: CELL - 2 * CELL_GUTTER, gutter: CELL_GUTTER };
  }
  const half = CELL / 2;
  const qx = col * CELL + (quarter % 2) * half;
  const qy = row * CELL + Math.floor(quarter / 2) * half;
  return { x: qx + QUARTER_GUTTER, y: qy + QUARTER_GUTTER, w: half - 2 * QUARTER_GUTTER, h: half - 2 * QUARTER_GUTTER, gutter: QUARTER_GUTTER };
}

/** The painted part of sign slot i (four slots across, nine rows down, below the cells). */
function signRect(i) {
  const col = i % 4;
  const row = Math.floor(i / 4);
  return { x: col * SIGN_W + SIGN_GUTTER, y: SIGN_TOP + row * SIGN_H + SIGN_GUTTER, w: SIGN_W - 2 * SIGN_GUTTER, h: SIGN_H - 2 * SIGN_GUTTER, gutter: SIGN_GUTTER };
}

/**
 * A small set of canvases for one tile and the brushes the painters use. Every brush stroke
 * goes to the colour canvas and, with its mode, to the mask: 'tint' (takes the building's
 * colour), 'keep' (keeps its own colour) or 'cut' (a hole, for battlements and lattices).
 */
function createTilePainter(w, h, rng) {
  const colorCanvas = makeCanvas(w, h);
  const maskCanvas = makeCanvas(w, h);
  const glowCanvas = makeCanvas(w, h);
  const c = colorCanvas.getContext('2d');
  const m = maskCanvas.getContext('2d');
  const g = glowCanvas.getContext('2d');
  m.fillStyle = MASK.tint;
  m.fillRect(0, 0, w, h);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);

  const painter = {
    w, h, rng, c, m, g,
    /** Fill the whole tile. */
    base(fill, mode = 'tint') {
      painter.rect(fill, 0, 0, w, h, mode);
    },
    /** A rectangle of colour, recorded in the mask with `mode`. */
    rect(fill, x, y, rw, rh, mode = 'tint') {
      c.fillStyle = fill;
      c.fillRect(x, y, rw, rh);
      if (mode) {
        m.fillStyle = MASK[mode];
        m.fillRect(x, y, rw, rh);
      }
    },
    /** A vertical gradient rectangle. */
    vgrad(x, y, rw, rh, top, bottom, mode = 'tint') {
      const grad = c.createLinearGradient(0, y, 0, y + rh);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      painter.rect(grad, x, y, rw, rh, mode);
    },
    /** Fill a path drawn by `trace(ctx)` in colour and mask. */
    shape(trace, fill, mode = 'tint') {
      c.beginPath();
      trace(c);
      c.fillStyle = fill;
      c.fill();
      if (mode) {
        m.beginPath();
        trace(m);
        m.fillStyle = MASK[mode];
        m.fill();
      }
    },
    /** Stroke a path in colour only (shading lines, cracks, outlines). */
    line(trace, stroke, width = 1, alpha = 1) {
      c.save();
      c.globalAlpha = alpha;
      c.beginPath();
      trace(c);
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
      c.restore();
    },
    /** Light a rectangle in the glow atlas. */
    light(fill, x, y, rw, rh) {
      g.fillStyle = fill;
      g.fillRect(x, y, rw, rh);
    },
    /** Light a rectangle with a vertical gradient (brighter ceiling, dimmer floor). */
    lightGrad(x, y, rw, rh, top, bottom) {
      const grad = g.createLinearGradient(0, y, 0, y + rh);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      g.fillStyle = grad;
      g.fillRect(x, y, rw, rh);
    },
    /** Light a path in the glow atlas, with an optional soft halo. */
    lightShape(trace, fill, blur = 0) {
      g.save();
      if (blur) {
        g.shadowColor = fill;
        g.shadowBlur = blur;
      }
      g.beginPath();
      trace(g);
      g.fillStyle = fill;
      g.fill();
      g.restore();
    },
    /** Scatter small soft spots (grime, mottling, gravel) in colour only, wrapping at the edges. */
    speckle(count, fills, minSize, maxSize, alpha) {
      c.save();
      for (let i = 0; i < count; i += 1) {
        const x = rng.next() * w;
        const y = rng.next() * h;
        const s = minSize + rng.next() * (maxSize - minSize);
        c.globalAlpha = alpha * (0.4 + 0.6 * rng.next());
        c.fillStyle = fills[Math.floor(rng.next() * fills.length)];
        for (let ox = -1; ox <= 1; ox += 1) {
          for (let oy = -1; oy <= 1; oy += 1) {
            const px = x + ox * w;
            const py = y + oy * h;
            if (px + s < 0 || px - s > w || py + s < 0 || py - s > h) continue;
            c.fillRect(px - s / 2, py - s / 2, s, s);
          }
        }
      }
      c.restore();
    },
    /** Vertical streaks running down from the top (rust, water stains), colour only. */
    streaks(count, fill, minLength, maxLength, alpha, widthMax = 3) {
      c.save();
      for (let i = 0; i < count; i += 1) {
        const x = rng.next() * w;
        const top = rng.next() * h * 0.3;
        const length = minLength + rng.next() * (maxLength - minLength);
        const sw = 1 + rng.next() * (widthMax - 1);
        const grad = c.createLinearGradient(0, top, 0, top + length);
        grad.addColorStop(0, fill);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = alpha * (0.5 + 0.5 * rng.next());
        c.fillStyle = grad;
        c.fillRect(x, top, sw, length);
      }
      c.restore();
    },
    /** Copy the tile into the atlas, wrapping it into the gutter so mipmaps stay seamless. */
    blitInto(colorCtx, maskCtx, glowCtx, rect, gutter) {
      for (const [dst, src] of [[colorCtx, colorCanvas], [maskCtx, maskCanvas], [glowCtx, glowCanvas]]) {
        dst.save();
        dst.beginPath();
        dst.rect(rect.x - gutter, rect.y - gutter, rect.w + gutter * 2, rect.h + gutter * 2);
        dst.clip();
        for (let j = -1; j <= 1; j += 1) {
          for (let i = -1; i <= 1; i += 1) dst.drawImage(src, rect.x + i * rect.w, rect.y + j * rect.h);
        }
        dst.restore();
      }
    },
  };
  return painter;
}

/**
 * Merge the colour canvas and the mask into one RGBA texture (the mask in alpha), flipped so
 * the top of the canvas is the top of each tile. Built from raw pixels so no colour is lost
 * where the mask cuts holes.
 */
function combineColorAndMask(colorCtx, maskCtx) {
  const colors = colorCtx.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE).data;
  const masks = maskCtx.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE).data;
  const data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let y = 0; y < ATLAS_SIZE; y += 1) {
    const src = y * ATLAS_SIZE * 4;
    const dst = (ATLAS_SIZE - 1 - y) * ATLAS_SIZE * 4;
    for (let x = 0; x < ATLAS_SIZE * 4; x += 4) {
      data[dst + x] = colors[src + x];
      data[dst + x + 1] = colors[src + x + 1];
      data[dst + x + 2] = colors[src + x + 2];
      data[dst + x + 3] = masks[src + x];
    }
  }
  const texture = new THREE.DataTexture(data, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Mask levels: tinted wall, own colour, hole. The facade shader reads them back from alpha. */
const MASK = { tint: '#ffffff', keep: '#a0a0a0', cut: '#000000' };
