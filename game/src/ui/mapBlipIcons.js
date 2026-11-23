// The blips of Port Sarab's maps: a gold eight-pointed star for a job, lettered discs for the
// crew and the handler, badges for safehouses, gun shops, garages, food stands, hospitals and
// police posts, flashing red-blue dots for patrol cars, a pin for the player's waypoint. Drawn on
// canvas, upright, the same on the rotating minimap, the city map and its legend.
import { traceEightPointStar } from './hudIconLibrary.js';

/**
 * Draw one blip centred on (x, y) with radius `r` pixels.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} kind     a marker kind or a city place kind (see BLIP_STYLES)
 * @param {Object} [marker] the marker, for its letter, colour and flash
 * @param {number} [now]    seconds, for blinking
 */
export function drawBlip(ctx, kind, x, y, r, marker, now = 0) {
  const style = BLIP_STYLES[kind] || BLIP_STYLES.activity;
  const color = marker && marker.color !== undefined && style.useMarkerColor ? hexColor(marker.color) : style.color;
  if (style.shape === 'star') {
    drawStarBlip(ctx, x, y, r * 1.25, color);
    return;
  }
  if (style.shape === 'dot') {
    let fill = color;
    if (kind === 'police') fill = Math.floor(now * 4) % 2 === 0 ? '#ff3b4e' : '#3d7bff';
    else if (marker && marker.flash && Math.floor(now * 3) % 2 === 0) fill = '#fff4d6';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,14,22,0.85)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    return;
  }
  if (style.shape === 'pin') {
    drawPin(ctx, x, y, r, color);
    return;
  }
  if (style.shape === 'ring') {
    const pulse = 0.5 + 0.5 * Math.sin(now * 5);
    ctx.beginPath();
    ctx.arc(x, y, r * (0.9 + pulse * 0.35), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,210,74,${0.35 + 0.4 * (1 - pulse)})`;
    ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,14,22,0.9)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    return;
  }
  // A badge: a dark disc with a coloured rim and a glyph or letter inside.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,18,28,0.92)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, r * 0.2);
  ctx.strokeStyle = color;
  ctx.stroke();
  const letter = marker && marker.letter;
  if (letter || style.glyph === 'letter') {
    ctx.fillStyle = color;
    ctx.font = `800 ${Math.round(r * 1.25)}px "Bahnschrift", "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(letter || '?').slice(0, 1).toUpperCase(), x, y + r * 0.06);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r / 10, r / 10);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  drawGlyph(ctx, style.glyph);
  ctx.restore();
}

/** The blip kind to draw for a marker (its own kind, or its icon override). */
export function blipKindOf(marker) {
  if (marker.icon && BLIP_STYLES[marker.icon]) return marker.icon;
  return BLIP_STYLES[marker.kind] ? marker.kind : 'activity';
}

/** The player's arrow, pointing up before rotation; `angle` turns it clockwise. */
export function drawPlayerArrow(ctx, x, y, size, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.72, size * 0.78);
  ctx.lineTo(0, size * 0.38);
  ctx.lineTo(-size * 0.72, size * 0.78);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.28);
  ctx.strokeStyle = 'rgba(8,14,22,0.95)';
  ctx.stroke();
  ctx.fillStyle = '#fff4d6';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size * 0.38);
  ctx.lineTo(size * 0.72, size * 0.78);
  ctx.closePath();
  ctx.fillStyle = '#e9b44c';
  ctx.fill();
  ctx.restore();
}

function drawStarBlip(ctx, x, y, r, color) {
  traceEightPointStar(ctx, x, y, r);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, r * 0.26);
  ctx.strokeStyle = 'rgba(8,14,22,0.95)';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,14,22,0.75)';
  ctx.fill();
}

function drawPin(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y - r * 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, Math.PI * 0.85, Math.PI * 2.15);
  ctx.lineTo(0, r * 1.05);
  ctx.closePath();
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.strokeStyle = 'rgba(8,14,22,0.95)';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = '#fff4d6';
  ctx.fill();
  ctx.restore();
}

/** Glyphs drawn inside a radius-10 badge centred on the origin. */
function drawGlyph(ctx, glyph) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (glyph === 'house') {
    ctx.beginPath();
    ctx.moveTo(0, -6.2);
    ctx.lineTo(6.4, -0.4);
    ctx.lineTo(4.4, -0.4);
    ctx.lineTo(4.4, 5.6);
    ctx.lineTo(-4.4, 5.6);
    ctx.lineTo(-4.4, -0.4);
    ctx.lineTo(-6.4, -0.4);
    ctx.closePath();
    ctx.fill();
  } else if (glyph === 'wrench') {
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-4.6, 4.6);
    ctx.lineTo(2, -2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(3.2, -3.2, 2.8, Math.PI * 0.95, Math.PI * 2.55);
    ctx.stroke();
  } else if (glyph === 'gun') {
    ctx.fillRect(-6, -4, 12, 3.6);
    ctx.beginPath();
    ctx.moveTo(-5.4, -0.6);
    ctx.lineTo(-1, -0.6);
    ctx.lineTo(-2.4, 5.6);
    ctx.lineTo(-6, 5.6);
    ctx.closePath();
    ctx.fill();
  } else if (glyph === 'cup') {
    ctx.beginPath();
    ctx.moveTo(-5, -2);
    ctx.lineTo(4, -2);
    ctx.lineTo(3, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(4.6, 1, 2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, -4.4);
    ctx.quadraticCurveTo(-0.6, -6, -2, -7.2);
    ctx.moveTo(1.4, -4.4);
    ctx.quadraticCurveTo(2.8, -6, 1.4, -7.2);
    ctx.stroke();
  } else if (glyph === 'cross') {
    ctx.fillRect(-1.9, -6, 3.8, 12);
    ctx.fillRect(-6, -1.9, 12, 3.8);
  } else if (glyph === 'badge') {
    ctx.beginPath();
    ctx.moveTo(0, -6.4);
    ctx.lineTo(5.6, -3.8);
    ctx.lineTo(5, 2.2);
    ctx.quadraticCurveTo(3.6, 5.4, 0, 6.6);
    ctx.quadraticCurveTo(-3.6, 5.4, -5, 2.2);
    ctx.lineTo(-5.6, -3.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(10,18,28,0.9)';
    traceEightPointStar(ctx, 0, -0.2, 2.8);
    ctx.fill();
  } else if (glyph === 'flag') {
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-4.8, 6.4);
    ctx.lineTo(-4.8, -6.2);
    ctx.stroke();
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        if ((row + col) % 2 === 0) ctx.fillRect(-4 + col * 2.5, -6 + row * 2.4, 2.5, 2.4);
      }
    }
  } else if (glyph === 'car') {
    ctx.beginPath();
    ctx.moveTo(-6.4, 3);
    ctx.lineTo(-6.4, -0.4);
    ctx.lineTo(-4.4, -4.4);
    ctx.lineTo(4.4, -4.4);
    ctx.lineTo(6.4, -0.4);
    ctx.lineTo(6.4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-5.6, 3, 2.6, 2.6);
    ctx.fillRect(3, 3, 2.6, 2.6);
  } else if (glyph === 'box') {
    ctx.fillRect(-5.4, -4.6, 10.8, 9.6);
    ctx.fillStyle = 'rgba(10,18,28,0.85)';
    ctx.fillRect(-0.8, -4.6, 1.6, 9.6);
  } else if (glyph === 'hook') {
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(6, -5);
    ctx.moveTo(1, -5);
    ctx.lineTo(1, 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.6, 2.6, 2.4, -0.2, Math.PI * 1.1);
    ctx.stroke();
  } else if (glyph === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(0, -5.8);
    ctx.lineTo(5.8, 0);
    ctx.lineTo(0, 5.8);
    ctx.lineTo(-5.8, 0);
    ctx.closePath();
    ctx.fill();
  } else if (glyph === 'plus') {
    ctx.fillRect(-1.6, -5.4, 3.2, 10.8);
    ctx.fillRect(-5.4, -1.6, 10.8, 3.2);
  } else if (glyph === 'falcon') {
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.quadraticCurveTo(-4, -6, -7, -2.6);
    ctx.quadraticCurveTo(-3.4, -2.8, -1.6, 0.8);
    ctx.lineTo(-2, 6);
    ctx.lineTo(0, 4.4);
    ctx.lineTo(2, 6);
    ctx.lineTo(1.6, 0.8);
    ctx.quadraticCurveTo(3.4, -2.8, 7, -2.6);
    ctx.quadraticCurveTo(4, -6, 0, -3);
    ctx.closePath();
    ctx.fill();
  } else if (glyph === 'door') {
    ctx.beginPath();
    ctx.moveTo(-4, 6);
    ctx.lineTo(-4, -2);
    ctx.arc(0, -2, 4, Math.PI, 0);
    ctx.lineTo(4, 6);
    ctx.closePath();
    ctx.fill();
  } else if (glyph === 'skull') {
    ctx.beginPath();
    ctx.arc(0, -1, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-3, 3, 6, 3.4);
    ctx.fillStyle = 'rgba(10,18,28,0.95)';
    ctx.beginPath();
    ctx.arc(-2.1, -1, 1.4, 0, Math.PI * 2);
    ctx.moveTo(3.5, -1);
    ctx.arc(2.1, -1, 1.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hexColor(value) {
  if (typeof value === 'string') return value;
  return `#${(0x1000000 | (value & 0xffffff)).toString(16).slice(1)}`;
}

/**
 * How each kind of blip looks. Marker kinds come first, then the kinds of city places
 * (the city map and minimap also show the shops and safehouses of game.city.places).
 */
export const BLIP_STYLES = {
  mission: { shape: 'star', color: '#e9b44c', label: 'Job' },
  objective: { shape: 'ring', color: '#ffd24a', label: 'Objective' },
  contact: { shape: 'badge', glyph: 'letter', color: '#e9b44c', useMarkerColor: true, label: 'Crew contact' },
  shop: { shape: 'badge', glyph: 'cup', color: '#f39c4a', label: 'Shop' },
  garage: { shape: 'badge', glyph: 'wrench', color: '#6aa7ff', label: 'Garage / respray' },
  safehouse: { shape: 'badge', glyph: 'house', color: '#3fd07f', label: 'Safehouse' },
  police: { shape: 'dot', color: '#3d7bff', label: 'PSPD unit' },
  enemy: { shape: 'dot', color: '#ff3b3b', label: 'Hostile' },
  friend: { shape: 'dot', color: '#35d3c0', label: 'Crew' },
  race: { shape: 'badge', glyph: 'flag', color: '#d78bff', label: 'Race' },
  activity: { shape: 'badge', glyph: 'diamond', color: '#1ba39c', label: 'Side job' },
  pickup: { shape: 'badge', glyph: 'plus', color: '#4ee08a', label: 'Pickup' },
  vehicle: { shape: 'badge', glyph: 'car', color: '#9fd0ff', useMarkerColor: true, label: 'Vehicle' },
  hospital: { shape: 'badge', glyph: 'cross', color: '#ff5a5a', label: 'Hospital' },
  waypoint: { shape: 'pin', color: '#ff4f8b', label: 'Waypoint' },
  target: { shape: 'badge', glyph: 'skull', color: '#ff4a3d', label: 'Target' },
  gunShop: { shape: 'badge', glyph: 'gun', color: '#ff6a3d', label: 'Gun shop' },
  food: { shape: 'badge', glyph: 'cup', color: '#f6a04d', label: 'Food stand' },
  policeStation: { shape: 'badge', glyph: 'badge', color: '#4d86ff', label: 'Police post' },
  taxiDepot: { shape: 'badge', glyph: 'car', color: '#f5c400', label: 'Taxi fares' },
  courierDepot: { shape: 'badge', glyph: 'box', color: '#d8b07a', label: 'Courier runs' },
  exportDock: { shape: 'badge', glyph: 'hook', color: '#2fc2b8', label: 'Export crane' },
  raceStart: { shape: 'badge', glyph: 'flag', color: '#d78bff', label: 'Race' },
  landmarkDoor: { shape: 'badge', glyph: 'door', color: '#e9b44c', label: 'Vane Spire' },
  collectible: { shape: 'badge', glyph: 'falcon', color: '#ffd700', label: 'Golden falcon' },
};

/** City place kinds the maps show as standing icons (collectibles stay hidden: they are a hunt). */
export const PLACE_BLIP_KINDS = new Set([
  'safehouse', 'gunShop', 'garage', 'food', 'hospital', 'policeStation', 'taxiDepot', 'courierDepot', 'exportDock', 'raceStart', 'landmarkDoor',
]);
