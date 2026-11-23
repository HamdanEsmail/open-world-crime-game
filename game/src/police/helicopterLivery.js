// The paint scheme of the PSPD patrol helicopter Shaheen-1, drawn on a canvas: PSPD white over a
// night-blue belly, a gulf-teal band with a coral pinstripe sweeping up the tail boom, a wraparound
// tinted windscreen, door windows, the letters PSPD on both flanks and under the belly (to be read
// from the street), and the callsign on the boom. The fuselage loft maps its length to u and its
// girth to v, so everything here is painted in (along, around) coordinates.
import * as THREE from 'three';

/** Fuselage texture coordinates: u runs tail (0) to nose (1); v from FUSELAGE_V0 to 1 runs once round the body. */
export const FUSELAGE_V0 = 0.2;
/** A texel of plain white the other airframe parts use, so their vertex colour shows unchanged. */
export const PLAIN_WHITE_UV = [0.5, 0.06];

const TAU = Math.PI * 2;
const WIDTH = 1024;
const HEIGHT = 512;

const PSPD_WHITE = '#f3f0e8';
const NIGHT_BLUE = '#0e1b2a';
const GULF_TEAL = '#1ba39c';
const CORAL = '#e4572e';
const GLASS = '#11263a';
const GLASS_SHEEN = 'rgba(150, 205, 222, 0.42)';
const PANEL_LINE = 'rgba(120, 116, 108, 0.55)';

/**
 * Paint Shaheen-1's livery and return it as a colour texture.
 * Angles round the body (phi) start at the belly, rise up the left (+X) flank to the roof at PI,
 * and come down the right flank back to the belly at TAU.
 * @returns {THREE.CanvasTexture}
 */
export function paintShaheenLivery() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PSPD_WHITE;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  paintBellyAndBand(ctx);
  paintGlazing(ctx);
  paintPanelLines(ctx);
  paintFlankLettering(ctx, 'PSPD', 0.565, 1.86, 46, NIGHT_BLUE);
  paintFlankLettering(ctx, 'SHAHEEN-1', 0.25, 1.78, 22, GULF_TEAL);
  paintBellyLettering(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Night-blue belly, the teal band above it and a coral pinstripe, rising toward the tail. */
function paintBellyAndBand(ctx) {
  const edge = (u) => 1.0 + 0.42 * smooth(0.46, 0.3, u) - 0.1 * smooth(0.9, 1.0, u);
  fillBand(ctx, NIGHT_BLUE, 0, 1, () => 0, edge);
  fillBand(ctx, GULF_TEAL, 0, 1, edge, (u) => edge(u) + 0.17);
  fillBand(ctx, CORAL, 0.1, 0.92, (u) => edge(u) + 0.21, (u) => edge(u) + 0.25);
}

/** The wraparound windscreen, the chin windows and the cabin door windows. */
function paintGlazing(ctx) {
  // Windscreen: one polygon over the roof from flank to flank, its rear edge swept back at the top.
  const low = 1.3;
  ctx.fillStyle = GLASS;
  ctx.beginPath();
  for (let i = 0; i <= 24; i += 1) {
    const phi = low + ((TAU - 2 * low) * i) / 24;
    const topness = 1 - Math.abs(phi - Math.PI) / (Math.PI - low);
    ctx.lineTo(px(0.79 - 0.03 * topness), py(phi));
  }
  for (let i = 24; i >= 0; i -= 1) {
    const phi = low + ((TAU - 2 * low) * i) / 24;
    const topness = 1 - Math.abs(phi - Math.PI) / (Math.PI - low);
    ctx.lineTo(px(0.958 + 0.02 * topness), py(phi));
  }
  ctx.closePath();
  ctx.fill();
  // A pale sheen across the glass, and the frame posts.
  ctx.fillStyle = GLASS_SHEEN;
  for (const mirror of [false, true]) {
    ctx.beginPath();
    ctx.moveTo(px(0.83), py(side(1.42, mirror)));
    ctx.lineTo(px(0.86), py(side(1.42, mirror)));
    ctx.lineTo(px(0.93), py(side(2.6, mirror)));
    ctx.lineTo(px(0.9), py(side(2.6, mirror)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = PSPD_WHITE;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(px(0.765), py(Math.PI));
  ctx.lineTo(px(0.975), py(Math.PI));
  for (const mirror of [false, true]) {
    ctx.moveTo(px(0.893), py(side(low, mirror)));
    ctx.lineTo(px(0.888), py(side(2.25, mirror)));
  }
  ctx.stroke();

  for (const mirror of [false, true]) {
    roundedWindow(ctx, 0.872, 0.962, side(0.42, mirror), side(0.96, mirror));
    roundedWindow(ctx, 0.66, 0.772, side(1.4, mirror), side(2.06, mirror));
  }
}

/** Door outlines and an engine access panel, thin and grey. */
function paintPanelLines(ctx) {
  ctx.strokeStyle = PANEL_LINE;
  ctx.lineWidth = 2;
  for (const mirror of [false, true]) {
    strokeRect(ctx, 0.645, 0.785, side(1.12, mirror), side(2.16, mirror));
    strokeRect(ctx, 0.47, 0.6, side(2.3, mirror), side(2.7, mirror));
  }
}

/**
 * Lettering on both flanks at (u, phi measured on the left flank). The left flank reads nose to
 * tail when you face it, so it is mirrored; the right flank runs downward in v, so it is flipped.
 */
function paintFlankLettering(ctx, text, u, phi, size, color) {
  ctx.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(px(u), py(phi));
  ctx.scale(-1, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(px(u), py(TAU - phi));
  ctx.scale(1, -1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Big white PSPD across the belly, for anyone looking up from the street. It straddles the texture seam. */
function paintBellyLettering(ctx) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH, py(0));
  ctx.clip();
  ctx.font = '900 70px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PSPD_WHITE;
  for (const y of [py(0), py(TAU)]) {
    ctx.save();
    ctx.translate(px(0.63), y);
    ctx.scale(1.25, -1);
    ctx.fillText('PSPD', 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** Fill the region between two angle curves over a span of u, on the left flank and mirrored on the right. */
function fillBand(ctx, color, u0, u1, lower, upper) {
  ctx.fillStyle = color;
  const steps = 40;
  for (const mirror of [false, true]) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const u = u0 + ((u1 - u0) * i) / steps;
      ctx.lineTo(px(u), py(side(lower(u), mirror)));
    }
    for (let i = steps; i >= 0; i -= 1) {
      const u = u0 + ((u1 - u0) * i) / steps;
      ctx.lineTo(px(u), py(side(upper(u), mirror)));
    }
    ctx.closePath();
    ctx.fill();
  }
}

function roundedWindow(ctx, u0, u1, phiA, phiB) {
  const x0 = px(u0);
  const x1 = px(u1);
  const y0 = Math.min(py(phiA), py(phiB));
  const y1 = Math.max(py(phiA), py(phiB));
  const r = Math.min(10, (x1 - x0) / 3, (y1 - y0) / 3);
  ctx.fillStyle = GLASS;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = GLASS_SHEEN;
  ctx.fillRect(x0 + (x1 - x0) * 0.55, y0 + 3, (x1 - x0) * 0.12, y1 - y0 - 6);
}

function strokeRect(ctx, u0, u1, phiA, phiB) {
  const y0 = Math.min(py(phiA), py(phiB));
  const y1 = Math.max(py(phiA), py(phiB));
  ctx.strokeRect(px(u0), y0, px(u1) - px(u0), y1 - y0);
}

/** An angle on the left flank, or its mirror image on the right flank. */
function side(phi, mirror) {
  return mirror ? TAU - phi : phi;
}

function px(u) {
  return u * WIDTH;
}

/** Canvas y of an angle round the body: the fuselage fills v in [FUSELAGE_V0, 1], the canvas is flipped in v. */
function py(phi) {
  const v = FUSELAGE_V0 + (1 - FUSELAGE_V0) * (phi / TAU);
  return (1 - v) * HEIGHT;
}

function smooth(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
