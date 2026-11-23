// The painted foliage atlas of Port Sarab's palms and planting, drawn in code on one 1024 x 512 canvas:
// date fronds with their leaflets (a fine one for near palms, a fuller one for far ones), a fan leaf,
// a shrub clump, white blossom to be tinted, a flower bed, and the ringed and smooth barks.
import * as THREE from 'three';

const ATLAS_WIDTH = 1024;
const ATLAS_HEIGHT = 512;

/** Where each painted part sits in the foliage atlas, as UV rectangles {u0, v0, u1, v1}. */
export const FOLIAGE_REGIONS = {
  dateFrond: pixelRegion(0, 0, 256, 512),
  dateFrondFar: pixelRegion(256, 0, 256, 512),
  fanLeaf: pixelRegion(512, 0, 192, 256),
  shrub: pixelRegion(512, 256, 192, 256),
  blossom: pixelRegion(704, 0, 192, 256),
  flowerBed: pixelRegion(704, 256, 192, 256),
  barkDate: pixelRegion(898, 2, 60, 508),
  barkSmooth: pixelRegion(962, 2, 60, 508),
};

/**
 * Paint the foliage atlas (1024 x 512): date fronds near and far, a fan leaf, a shrub clump, white
 * blossom for tinting, a flower bed, and two barks. Returns a THREE.CanvasTexture.
 */
export function paintFoliageAtlas(renderer, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  paintDateFrond(ctx, 0, 0, 256, 512, rng, false);
  paintDateFrond(ctx, 256, 0, 256, 512, rng, true);
  paintFanLeaf(ctx, 512, 0, 192, 256, rng);
  paintLeafClump(ctx, 512, 256, 192, 256, rng, false);
  paintBlossom(ctx, 704, 0, 192, 256, rng);
  paintLeafClump(ctx, 704, 256, 192, 256, rng, true);
  paintDatePalmBark(ctx, 896, 0, 64, 512, rng);
  paintSmoothBark(ctx, 960, 0, 64, 512, rng);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 1);
  texture.needsUpdate = true;
  return texture;
}

/** A date frond seen flat: a pale rachis from base (bottom) to tip (top) with leaflets angled toward the tip. */
function paintDateFrond(ctx, rx, ry, w, h, rng, fat) {
  const cx = rx + w / 2;
  const baseY = ry + h - 4;
  const tipY = ry + 4;
  const span = baseY - tipY;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx + 2, ry + 2, w - 4, h - 4);
  ctx.clip();
  if (fat) {
    // A solid green body under the leaflets so the silhouette survives at a distance.
    ctx.fillStyle = 'rgb(86,128,50)';
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      ctx.lineTo(cx + (w / 2 - 22) * Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.85)), baseY - t * span);
    }
    for (let i = 24; i >= 0; i -= 1) {
      const t = i / 24;
      ctx.lineTo(cx - (w / 2 - 22) * Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.85)), baseY - t * span);
    }
    ctx.fill();
  }
  const count = fat ? 30 : 46;
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.25 + rng.next() * 0.5) / count;
      const y = baseY - t * span;
      const reachShape = t < 0.1 ? 0.3 + t * 5 : 0.97 - 0.14 * t;
      const reach = (w / 2 - 6) * reachShape * (0.88 + rng.next() * 0.12);
      const rise = reach * (fat ? 0.5 : 0.66);
      const root = fat ? 6 : 3.4;
      const green = 122 + rng.next() * 40 + t * 18;
      const red = 66 + rng.next() * 30 + t * 30;
      const blue = 38 + rng.next() * 18;
      ctx.fillStyle = `rgb(${red | 0},${green | 0},${blue | 0})`;
      const tipX = cx + side * reach;
      const tipYY = y - rise;
      ctx.beginPath();
      ctx.moveTo(cx, y - root);
      ctx.quadraticCurveTo(cx + side * reach * 0.5, y - rise * 0.62 - root, tipX, tipYY);
      ctx.quadraticCurveTo(cx + side * reach * 0.52, y - rise * 0.38 + root, cx, y + root);
      ctx.closePath();
      ctx.fill();
      if (!fat) {
        ctx.strokeStyle = `rgba(${Math.min(255, red + 50) | 0},${Math.min(255, green + 45) | 0},${(blue + 30) | 0},0.7)`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.quadraticCurveTo(cx + side * reach * 0.5, y - rise * 0.5, tipX, tipYY);
        ctx.stroke();
      }
    }
  }
  // Spines at the base of the stalk.
  ctx.strokeStyle = 'rgb(160,150,100)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i += 1) {
    const y = baseY - (i / 8) * span * 0.1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + side * 18, y - 10);
      ctx.stroke();
    }
  }
  // The rachis, broad at the base, a hair at the tip.
  ctx.fillStyle = 'rgb(206,196,122)';
  ctx.beginPath();
  ctx.moveTo(cx - (fat ? 7 : 5.5), baseY + 4);
  ctx.lineTo(cx - 1, tipY);
  ctx.lineTo(cx + 1, tipY);
  ctx.lineTo(cx + (fat ? 7 : 5.5), baseY + 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A fan leaf: pleated segments with split tips spreading from a pale joint on a short stalk. */
function paintFanLeaf(ctx, rx, ry, w, h, rng) {
  const cx = rx + w / 2;
  const cy = ry + h * 0.6;
  const radius = w * 0.47;
  const segments = 26;
  const a0 = Math.PI * 0.9;
  const a1 = Math.PI * 2.1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx + 2, ry + 2, w - 4, h - 4);
  ctx.clip();
  for (let k = 0; k < segments; k += 1) {
    const aa = a0 + ((a1 - a0) * k) / segments;
    const ab = a0 + ((a1 - a0) * (k + 1)) / segments;
    const am = (aa + ab) / 2;
    const r = radius * (0.84 + rng.next() * 0.16);
    const g = k % 2 ? 128 : 152;
    ctx.fillStyle = `rgb(${(g * 0.55) | 0},${g + ((rng.next() * 16) | 0)},${(g * 0.42) | 0})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(aa) * r * 0.92, cy + Math.sin(aa) * r * 0.92);
    ctx.lineTo(cx + Math.cos(am - 0.02) * r, cy + Math.sin(am - 0.02) * r);
    ctx.lineTo(cx + Math.cos(am) * r * 0.8, cy + Math.sin(am) * r * 0.8);
    ctx.lineTo(cx + Math.cos(am + 0.02) * r, cy + Math.sin(am + 0.02) * r);
    ctx.lineTo(cx + Math.cos(ab) * r * 0.92, cy + Math.sin(ab) * r * 0.92);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgb(150,160,92)';
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy);
  ctx.lineTo(cx + 4, cy);
  ctx.lineTo(cx + 2.5, ry + h - 3);
  ctx.lineTo(cx - 2.5, ry + h - 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgb(186,190,120)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A clump of small leaves; with `flowers`, a bed of red, pink, yellow, white and orange blooms on top. */
function paintLeafClump(ctx, rx, ry, w, h, rng, flowers) {
  const cx = rx + w / 2;
  const cy = ry + h * (flowers ? 0.62 : 0.56);
  const radiusX = w * 0.44;
  const radiusY = h * (flowers ? 0.3 : 0.4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx + 3, ry + 3, w - 6, h - 6);
  ctx.clip();
  for (let i = 0; i < 420; i += 1) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.pow(rng.next(), 0.6);
    const px = cx + Math.cos(a) * radiusX * d;
    const py = cy + Math.sin(a) * radiusY * d * (Math.sin(a) > 0 ? 0.8 : 1.05);
    const height = (cy - py) / radiusY;
    const g = 96 + height * 34 + rng.next() * 30;
    ctx.fillStyle = `rgb(${(g * 0.52) | 0},${g | 0},${(g * 0.36) | 0})`;
    ctx.beginPath();
    ctx.ellipse(px, py, 5 + rng.next() * 6, 2.5 + rng.next() * 2.5, rng.next() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  if (flowers) {
    const palette = [[226, 52, 66], [242, 112, 172], [250, 212, 64], [252, 248, 236], [244, 140, 48], [168, 92, 214]];
    for (let i = 0; i < 120; i += 1) {
      const a = rng.next() * Math.PI * 2;
      const d = Math.pow(rng.next(), 0.7);
      const px = cx + Math.cos(a) * radiusX * 0.92 * d;
      const py = cy + Math.sin(a) * radiusY * 0.85 * d - 6;
      const c = palette[(rng.next() * palette.length) | 0];
      paintFlower(ctx, px, py, 3 + rng.next() * 3, c);
    }
  }
  ctx.restore();
}

/** Pale blossom clusters (near white, so each tree's tint gives the colour) with a few gaps. */
function paintBlossom(ctx, rx, ry, w, h, rng) {
  const cx = rx + w / 2;
  const cy = ry + h * 0.55;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx + 3, ry + 3, w - 6, h - 6);
  ctx.clip();
  for (let cluster = 0; cluster < 22; cluster += 1) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.pow(rng.next(), 0.7);
    const kx = cx + Math.cos(a) * w * 0.36 * d;
    const ky = cy + Math.sin(a) * h * 0.32 * d;
    for (let i = 0; i < 9; i += 1) {
      const px = kx + (rng.next() - 0.5) * 26;
      const py = ky + (rng.next() - 0.5) * 22;
      const v = 215 + rng.next() * 40;
      paintFlower(ctx, px, py, 4 + rng.next() * 3.5, [v, v * 0.94, v * 0.97]);
    }
  }
  ctx.restore();
}

/** One five-petalled flower with a yellow eye. */
function paintFlower(ctx, x, y, size, color) {
  ctx.fillStyle = `rgb(${color[0] | 0},${color[1] | 0},${color[2] | 0})`;
  for (let p = 0; p < 5; p += 1) {
    const a = (p / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * size * 0.55, y + Math.sin(a) * size * 0.55, size * 0.55, size * 0.38, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgb(250,214,90)';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

/** The date palm's trunk: rows of crescent leaf-base scars, smoother and paler toward the ground. */
function paintDatePalmBark(ctx, rx, ry, w, h, rng) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, w, h);
  ctx.clip();
  const gradient = ctx.createLinearGradient(0, ry, 0, ry + h);
  gradient.addColorStop(0, 'rgb(122,96,66)');
  gradient.addColorStop(0.65, 'rgb(140,112,80)');
  gradient.addColorStop(1, 'rgb(168,148,120)');
  ctx.fillStyle = gradient;
  ctx.fillRect(rx, ry, w, h);
  const rows = 18;
  for (let r = 0; r < rows; r += 1) {
    const y = ry + (r + 0.5) * (h / rows);
    const smooth = r / rows > 0.68;
    for (let c = -1; c <= 3; c += 1) {
      const x = rx + (c + (r % 2) * 0.5) * (w / 2.5);
      ctx.strokeStyle = smooth ? 'rgba(98,84,66,0.55)' : 'rgb(78,58,40)';
      ctx.lineWidth = smooth ? 1.5 : 3;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 5.5, h / rows / 2.2, 0, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      if (!smooth) {
        ctx.fillStyle = `rgba(${170 + rng.next() * 20},${140 + rng.next() * 20},${100 + rng.next() * 16},0.55)`;
        ctx.beginPath();
        ctx.ellipse(x, y - 4, w / 7, h / rows / 4, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** Plain grey-brown bark with fine vertical fissures, for blossom trees and fan palm stems. */
function paintSmoothBark(ctx, rx, ry, w, h, rng) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgb(132,114,96)';
  ctx.fillRect(rx, ry, w, h);
  for (let i = 0; i < 40; i += 1) {
    const x = rx + rng.next() * w;
    const shadeValue = rng.next() < 0.5 ? 96 : 160;
    ctx.strokeStyle = `rgba(${shadeValue},${shadeValue * 0.86},${shadeValue * 0.72},0.45)`;
    ctx.lineWidth = 1 + rng.next() * 2;
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x + (rng.next() - 0.5) * 6, ry + h);
    ctx.stroke();
  }
  ctx.restore();
}

function pixelRegion(x, y, w, h) {
  return { u0: x / ATLAS_WIDTH, u1: (x + w) / ATLAS_WIDTH, v0: 1 - (y + h) / ATLAS_HEIGHT, v1: 1 - y / ATLAS_HEIGHT };
}
