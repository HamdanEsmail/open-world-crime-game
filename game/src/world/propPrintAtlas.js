// The printed faces of Port Sarab's street furniture, painted once onto one canvas atlas and drawn as
// one instanced set: the teal street-name blades carrying every real street name, the woven rugs hung
// in the souk, and the painted boards of the beach kiosk and the market stalls.
import * as THREE from 'three';
import { createPrintedPanelGeometry } from './propShapes.js';
import { createPropRecord } from './propInstancing.js';

const WIDTH = 1024;
const HEIGHT = 512;
const NAME_W = 256;
const NAME_H = 32;
const RUG_W = 128;
const RUG_H = 192;
const BOARD_W = 256;
const BOARD_H = 64;

/** The painted boards of the souk and the beach: text, background and ink colours. */
export const PRINTED_BOARDS = {
  kiosk: { text: 'CORNICHE KIOSK', sub: 'cold drinks · ices · karak', bg: '#1ba39c', ink: '#fff4d6' },
  spices: { text: 'SPICES', sub: 'saffron · sumac · cumin', bg: '#e9b44c', ink: '#5a2a14' },
  fruit: { text: 'FRESH FRUIT', sub: 'dates · figs · melons', bg: '#e4572e', ink: '#fff4d6' },
  rugs: { text: 'RUGS & LAMPS', sub: 'hand woven in Old Sarab', bg: '#6a2c5e', ink: '#ffd98a' },
  copper: { text: 'COPPER & BRASS', sub: 'lanterns · trays · pots', bg: '#8a4a20', ink: '#ffe0a0' },
  sweets: { text: 'SWEETS', sub: 'kunafa · maamoul · halwa', bg: '#f39bb4', ink: '#4a1630' },
  tea: { text: 'TEA HOUSE', sub: 'mint · karak · qahwa', bg: '#2f6b4f', ink: '#fff4d6' },
  juice: { text: 'JUICE BAR', sub: 'lemon mint · mango · pomegranate', bg: '#ff9f1c', ink: '#3a1a00' },
  lifeguard: { text: 'LIFEGUARD', sub: 'swim between the flags', bg: '#d7263d', ink: '#ffffff' },
  beachclub: { text: 'SURF & SAND CLUB', sub: 'loungers · parasols · shade', bg: '#0e1b2a', ink: '#e9b44c' },
};

/**
 * Paint the atlas and collect printed faces. Faces are added with addStreetName(), addRug() and
 * addBoard() (world place, facing yaw, size), then finish() makes the instanced set.
 */
export function createPrintedFaces(game, kit, names) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const rng = kit.rng('print-atlas');
  const nameSlots = new Map();
  names.forEach((name, i) => {
    const x = (i % 2) * NAME_W;
    const y = Math.floor(i / 2) * NAME_H;
    paintStreetName(ctx, x, y, NAME_W, NAME_H, name);
    nameSlots.set(name, slotRect(x, y, NAME_W, NAME_H));
  });
  const rugSlots = [];
  for (let i = 0; i < 4; i += 1) {
    const x = 512 + i * RUG_W;
    paintRug(ctx, x, 0, RUG_W, RUG_H, rng, i);
    rugSlots.push(slotRect(x, 0, RUG_W, RUG_H));
  }
  const boardSlots = {};
  Object.keys(PRINTED_BOARDS).forEach((key, i) => {
    const x = 512 + (i % 2) * BOARD_W;
    const y = RUG_H + Math.floor(i / 2) * BOARD_H;
    paintBoard(ctx, x, y, BOARD_W, BOARD_H, PRINTED_BOARDS[key]);
    boardSlots[key] = slotRect(x, y, BOARD_W, BOARD_H);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, game.renderer ? game.renderer.capabilities.getMaxAnisotropy() : 1);
  const material = kit.materials.createPrintedFaceMaterial(texture, 0.35);
  const faces = [];

  /** One face: centre (x, y, z), facing `yaw` (its front looks along (sin yaw, cos yaw)), w x h metres. */
  function addFace(rect, x, y, z, yaw, w, h, range) {
    const record = createPropRecord({ kind: 'printedFace', x, y, z, yaw, sx: w, sy: h, sz: 1, range, footprint: 0, attrs: { uvRect: rect } });
    faces.push(record);
    return record;
  }

  return {
    texture,
    faces,
    /** A street-name blade face with `name` printed on it. */
    addStreetName: (name, x, y, z, yaw, w = 1.56, h = 0.26) => addFace(nameSlots.get(name) || nameSlots.values().next().value, x, y, z, yaw, w, h, 120),
    /** A hanging rug (pattern 0..3). */
    addRug: (index, x, y, z, yaw, w = 1.2, h = 1.8) => addFace(rugSlots[index % rugSlots.length], x, y, z, yaw, w, h, 130),
    /** A painted board from PRINTED_BOARDS. */
    addBoard: (key, x, y, z, yaw, w = 2.4, h = 0.6) => addFace(boardSlots[key] || boardSlots.kiosk, x, y, z, yaw, w, h, 180),
    finish() {
      kit.addSet({ name: 'printedFace', geometry: createPrintedPanelGeometry(), material, records: faces, maxRange: 180, attributes: [{ name: 'uvRect', size: 4 }] });
    },
  };
}

/** [u, v, width, height] of a pixel rectangle (v measured from the bottom, as UVs are). */
function slotRect(x, y, w, h) {
  return [(x + 1) / WIDTH, 1 - (y + h - 1) / HEIGHT, (w - 2) / WIDTH, (h - 2) / HEIGHT];
}

/** A teal enamel blade with a cream border and the name in bold capitals. */
function paintStreetName(ctx, x, y, w, h, name) {
  ctx.fillStyle = '#126e66';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#fff4d6';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  const text = name.toUpperCase();
  let size = 20;
  ctx.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`;
  while (ctx.measureText(text).width > w - 18 && size > 9) {
    size -= 1;
    ctx.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`;
  }
  ctx.fillStyle = '#fff4d6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
}

/** A woven rug: a field, a medallion, borders in bands and a fringe at both ends. */
function paintRug(ctx, x, y, w, h, rng, index) {
  const palettes = [
    ['#8e1b2a', '#1d2e5e', '#e9b44c', '#fff4d6'],
    ['#1d2e5e', '#b23a2a', '#f0c060', '#e8e0c8'],
    ['#2f6b4f', '#7a1f3a', '#e9b44c', '#fff4d6'],
    ['#c2552a', '#2a2240', '#1ba39c', '#ffe8b8'],
  ];
  const [field, border, accent, light] = palettes[index % palettes.length];
  ctx.save();
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x + 6, y + 10, w - 12, h - 20);
  ctx.fillStyle = accent;
  ctx.fillRect(x + 12, y + 16, w - 24, h - 32);
  ctx.fillStyle = field;
  ctx.fillRect(x + 17, y + 21, w - 34, h - 42);
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let ring = 0; ring < 3; ring += 1) {
    const s = 1 - ring * 0.3;
    ctx.fillStyle = [accent, border, light][ring];
    ctx.beginPath();
    ctx.moveTo(cx, cy - 52 * s);
    ctx.lineTo(cx + 34 * s, cy);
    ctx.lineTo(cx, cy + 52 * s);
    ctx.lineTo(cx - 34 * s, cy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = light;
  for (let i = 0; i < 6; i += 1) {
    const my = y + 30 + i * ((h - 60) / 5);
    for (const mx of [x + 26, x + w - 26]) {
      ctx.beginPath();
      ctx.moveTo(mx, my - 5);
      ctx.lineTo(mx + 4, my);
      ctx.lineTo(mx, my + 5);
      ctx.lineTo(mx - 4, my);
      ctx.fill();
    }
  }
  ctx.strokeStyle = light;
  ctx.lineWidth = 1.5;
  for (let fx = x + 8; fx < x + w - 6; fx += 4) {
    ctx.beginPath();
    ctx.moveTo(fx, y);
    ctx.lineTo(fx + (rng.next() - 0.5) * 2, y + 9);
    ctx.moveTo(fx, y + h);
    ctx.lineTo(fx + (rng.next() - 0.5) * 2, y + h - 9);
    ctx.stroke();
  }
  ctx.restore();
}

/** A painted shop board: bold name, a small line under it. */
function paintBoard(ctx, x, y, w, h, board) {
  ctx.fillStyle = board.bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = board.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = board.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 26;
  ctx.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`;
  while (ctx.measureText(board.text).width > w - 20 && size > 12) {
    size -= 1;
    ctx.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`;
  }
  ctx.fillText(board.text, x + w / 2, y + h * 0.4);
  ctx.font = '12px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(board.sub, x + w / 2, y + h * 0.78);
}
