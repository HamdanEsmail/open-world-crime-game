// The fleet liveries of Port Sarab, painted on canvas: the PSPD patrol cars (white or graphite with a
// gulf-teal and night-blue band), the Sarab Cab (pearl with a teal roof stripe and a checker band), the
// Sarab Metro bus (teal with a cream band) and the Aurum bullion carrier (graphite with gold).
// Each is an atlas: the lower half is the side elevation, the upper half the view from above.
import * as THREE from 'three';

const NIGHT_BLUE = '#0e1b2a';
const GULF_TEAL = '#1ba39c';
const SAND_GOLD = '#e9b44c';
const CREAM = '#fff4d6';
const PEARL = '#ece5d3';
const GRAPHITE = '#2d3239';
const BULLION_GOLD = '#d9a43a';

/**
 * Paint one livery for a model and return it as a colour texture. Painted surfaces of the model sample
 * it through the projection set in vehicleShapeKit.js (see liveryUv there).
 * @param {'police'|'policeSuv'|'taxi'|'bus'|'bullion'} kind
 * @param {import('../core/gameContext.js').VehicleSpec} spec
 * @returns {THREE.CanvasTexture}
 */
export function paintLivery(kind, spec) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const atlas = createAtlasPainter(ctx, spec);
  const painter = LIVERY_PAINTERS[kind] || paintPlainWhite;
  painter(atlas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const LIVERY_PAINTERS = {
  police: paintPatrolCar,
  policeSuv: paintPatrolSuv,
  taxi: paintSarabCab,
  bus: paintMetroBus,
  bullion: paintAurumCarrier,
};

/** PSPD Interceptor: white, a night-blue sill, a broad teal band with the letters, a sand pinstripe. */
function paintPatrolCar(a) {
  a.fillSide('#f7f6f2');
  a.fillPlan('#f7f6f2');
  a.sideBand(0, 0.36, NIGHT_BLUE);
  a.sideBand(0.36, 0.62, GULF_TEAL);
  a.sideBand(0.62, 0.66, SAND_GOLD);
  a.sideText('PSPD', 0.49, 0.2, '#ffffff', 0.5);
  a.sideBand(0.67, 0.69, NIGHT_BLUE);
  a.sideEmblem(0.82, 0.075, SAND_GOLD, NIGHT_BLUE, 1.15);
  a.planText('07', -0.35, 0.55, NIGHT_BLUE);
}

/** PSPD Enforcer: graphite, a teal band with white letters, sand pinstripes. */
function paintPatrolSuv(a) {
  a.fillSide(GRAPHITE);
  a.fillPlan(GRAPHITE);
  a.sideBand(0, 0.5, '#1a1d22');
  a.sideBand(0.58, 0.9, GULF_TEAL);
  a.sideBand(0.9, 0.94, SAND_GOLD);
  a.sideBand(0.54, 0.57, SAND_GOLD);
  a.sideText('PSPD', 0.74, 0.24, '#ffffff', 0.55);
  a.sideEmblem(1.04, 0.08, SAND_GOLD, GRAPHITE, 1.3);
  a.planText('12', -0.6, 0.6, '#f4f1e8');
}

/** Sarab Cab: pearl, a teal roof stripe end to end, a teal-and-cream checker band and teal sills. */
function paintSarabCab(a) {
  a.fillSide(PEARL);
  a.fillPlan(PEARL);
  a.sideBand(0, 0.33, GULF_TEAL);
  a.sideChecker(0.6, 0.76, 0.08, GULF_TEAL, CREAM);
  a.sideText('SARAB CAB', 0.47, 0.12, GULF_TEAL, 0.62);
  a.planStripe(-0.27, 0.27, GULF_TEAL);
  a.planStripe(-0.33, -0.29, SAND_GOLD);
  a.planStripe(0.29, 0.33, SAND_GOLD);
}

/** Sarab Metro: teal body, night-blue skirt, a cream band with the name, sand pinstripe, cream roof. */
function paintMetroBus(a) {
  a.fillSide(GULF_TEAL);
  a.fillPlan('#efe7d2');
  a.sideBand(0, 0.44, NIGHT_BLUE);
  a.sideBand(0.92, 1.38, CREAM);
  a.sideBand(1.38, 1.44, SAND_GOLD);
  a.sideText('SARAB METRO', 1.15, 0.3, GULF_TEAL, 0.5);
  a.sideBand(2.86, 2.95, CREAM);
}

/** Aurum bullion carrier: dark graphite, twin gold stripes and the word AURUM in gold. */
function paintAurumCarrier(a) {
  a.fillSide('#2a2e35');
  a.fillPlan('#30353d');
  a.sideBand(0, 0.62, '#1d2025');
  a.sideBand(1.02, 1.16, BULLION_GOLD);
  a.sideBand(1.22, 1.26, BULLION_GOLD);
  a.sideText('AURUM', 1.78, 0.46, BULLION_GOLD, 0.45);
  a.sideEmblem(2.42, 0.1, BULLION_GOLD, '#2a2e35', 0);
  a.planText('A', -1.0, 1.1, BULLION_GOLD);
}

function paintPlainWhite(a) {
  a.fillSide('#ffffff');
  a.fillPlan('#ffffff');
}

/**
 * Drawing helpers in the model's own metres. Side elevation: v = 0.01 + 0.48 * y / height, and u runs
 * 0.5 -/+ 0.48 * z / (length / 2), so a livery painted symmetric about the middle reads on both sides.
 * Plan: v = 0.51 + 0.48 * (x / width + 0.5), u = 0.5 + 0.48 * z / (length / 2).
 */
function createAtlasPainter(ctx, spec) {
  const W = 1024;
  const Hpx = 512;
  const length = spec.length;
  const width = spec.width;
  const height = spec.height;
  const pxPerMetreZ = (0.96 * W) / length;
  const pxPerMetreY = (0.48 * Hpx) / height;
  const pxPerMetrePlanX = (0.48 * Hpx) / width;
  const rowOfY = (y) => (1 - (0.01 + 0.48 * Math.min(1, Math.max(0, y / height)))) * Hpx;
  const rowOfX = (x) => (1 - (0.51 + 0.48 * (x / width + 0.5))) * Hpx;
  const colOfZPlan = (z) => (0.5 + (0.96 * z) / length) * W;

  return {
    fillSide(color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, Hpx / 2, W, Hpx / 2);
    },
    fillPlan(color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, Hpx / 2);
    },
    /** A band along the whole side between heights y0 and y1 (metres). */
    sideBand(y0, y1, color) {
      const top = rowOfY(y1);
      const bottom = rowOfY(y0);
      ctx.fillStyle = color;
      ctx.fillRect(0, top, W, bottom - top);
    },
    /** Squares of `size` metres in two rows between y0 and y1. */
    sideChecker(y0, y1, size, colorA, colorB) {
      const top = rowOfY(y1);
      const bottom = rowOfY(y0);
      const rows = Math.max(1, Math.round((y1 - y0) / size));
      const rowHeight = (bottom - top) / rows;
      const cell = size * pxPerMetreZ;
      const columns = Math.ceil(W / cell);
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < columns; c += 1) {
          ctx.fillStyle = (r + c) % 2 === 0 ? colorA : colorB;
          ctx.fillRect(W / 2 + (c - columns / 2) * cell, top + r * rowHeight, cell + 1, rowHeight + 1);
        }
      }
    },
    /** Bold letters centred along the side, `size` metres tall, with real proportions. */
    sideText(text, yCentre, size, color, spacing = 0.1) {
      ctx.save();
      ctx.translate(W / 2, rowOfY(yCentre));
      ctx.scale(pxPerMetreZ / pxPerMetreY, 1);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(size * pxPerMetreY * 1.3)}px "Arial Black", Arial, sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * pxPerMetreY * spacing)}px`;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    },
    /** A round badge with a star, once each side of the middle at distance zOffset (0: in the middle). */
    sideEmblem(yCentre, radius, ring, fill, zOffset) {
      const offsets = zOffset > 0 ? [-zOffset, zOffset] : [0];
      for (const z of offsets) {
        const cx = W / 2 + z * pxPerMetreZ;
        const cy = rowOfY(yCentre);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(pxPerMetreZ / pxPerMetreY, 1);
        const r = radius * pxPerMetreY;
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ring;
        drawStar(ctx, r * 0.6, r * 0.25);
        ctx.restore();
      }
    },
    /** A stripe seen from above between x0 and x1 (metres across), the whole length. */
    planStripe(x0, x1, color) {
      const top = rowOfX(Math.max(x0, x1));
      const bottom = rowOfX(Math.min(x0, x1));
      ctx.fillStyle = color;
      ctx.fillRect(0, top, W, bottom - top);
    },
    /** Letters on the roof, read from beside the car, centred at z. */
    planText(text, zCentre, size, color) {
      ctx.save();
      ctx.translate(colOfZPlan(zCentre), rowOfX(0));
      ctx.rotate(Math.PI / 2);
      ctx.scale(pxPerMetrePlanX / pxPerMetreZ, 1);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(size * pxPerMetreZ)}px "Arial Black", Arial, sans-serif`;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    },
  };
}

/** A five-pointed star centred on the origin. */
function drawStar(ctx, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
}
