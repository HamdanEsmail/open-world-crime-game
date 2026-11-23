// The rotating minimap of KHAMSIN, bottom-left in a gold ring: Port Sarab's streets, blocks, beach
// and gulf turned so the camera's view is up, the GPS route in coral-magenta, every marker as a
// blip (jobs, crew contacts, shops, flashing PSPD units and their vision cones), the player arrow,
// and a north star on the ring. It zooms out as the car picks up speed.
import { createCityMapPainter, MAP_COLORS } from './cityMapPainter.js';
import { drawBlip, blipKindOf, drawPlayerArrow, PLACE_BLIP_KINDS } from './mapBlipIcons.js';
import { strokeRoute, playerPosition } from './gpsRoute.js';
import { traceEightPointStar } from './hudIconLibrary.js';
import { createElement } from './uiElements.js';

/**
 * Build the minimap inside `container` (#hud-minimap). The static city is painted lazily into
 * cached tiles of TILE_METRES, so each frame only turns and blits a handful of images.
 * @returns {{update(dt:number):void, resize():void, viewRadius:number, painter:Object}}
 */
export function createMinimap(game, container, gps) {
  const canvas = createElement('canvas', 'minimap-canvas', container);
  const ctx = canvas.getContext('2d');
  const painter = game.city ? createCityMapPainter(game) : null;
  const tiles = new Map();
  const minimap = { update, resize, viewRadius: 110, painter };
  let pixelRatio = 1;
  let sizePx = 0;
  let firstFrame = true;
  let smoothedSpeed = 0;

  /** Redraw the minimap for this frame. */
  function update(dt) {
    if (!sizePx) resize();
    if (!sizePx) return;
    const pos = playerPosition(game);
    if (!pos) return;
    const now = performance.now() / 1000;
    const yaw = viewYaw(game);
    const speed = playerSpeed(game);
    smoothedSpeed += (speed - smoothedSpeed) * Math.min(1, (dt || 0.016) * 2.5);
    const inVehicle = Boolean(game.player && game.player.vehicle);
    const targetRadius = (inVehicle ? 135 : 100) + Math.min(smoothedSpeed, 45) / 45 * 150;
    minimap.viewRadius += (targetRadius - minimap.viewRadius) * Math.min(1, (dt || 0.016) * 3);

    const half = sizePx / 2;
    const ringRadius = half * RING_FRACTION;
    const scale = ringRadius / minimap.viewRadius;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const a = -scale * cos;
    const b = -scale * sin;
    const c = scale * sin;
    const d = -scale * cos;
    const e = half - (a * pos.x + c * pos.z);
    const f = half - (b * pos.x + d * pos.z);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, sizePx, sizePx);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, ringRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = MAP_COLORS.desert;
    ctx.fillRect(0, 0, sizePx, sizePx);

    ctx.setTransform(a, b, c, d, e, f);
    drawTiles(pos.x, pos.z, minimap.viewRadius * 1.05);
    drawPoliceCones(now);
    strokeRoute(ctx, gps ? gps.route : null, 1 / scale, Math.max(3, sizePx * 0.022));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawInnerShade(half, ringRadius);
    ctx.restore();

    const toScreen = (x, z, out) => {
      out.x = a * x + c * z + e;
      out.y = b * x + d * z + f;
      return out;
    };
    drawPlaceBlips(toScreen, half, ringRadius, pos);
    drawMarkerBlips(toScreen, half, ringRadius, now);
    drawPlayerArrow(ctx, half, half, sizePx * 0.05, yaw - playerHeading(game));
    drawRing(half, ringRadius, yaw);
    firstFrame = false;
  }

  /** Blit the cached tiles that cover the circle around (x, z); paint missing ones, two per frame. */
  function drawTiles(x, z, radius) {
    if (!painter) return;
    const tx0 = Math.floor((x - radius) / TILE_METRES);
    const tx1 = Math.floor((x + radius) / TILE_METRES);
    const tz0 = Math.floor((z - radius) / TILE_METRES);
    const tz1 = Math.floor((z + radius) / TILE_METRES);
    let budget = firstFrame ? 64 : 2;
    for (let tz = tz0; tz <= tz1; tz += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const key = tx * 4096 + tz;
        let tile = tiles.get(key);
        if (!tile && budget > 0) {
          tile = paintTile(tx, tz);
          tiles.set(key, tile);
          budget -= 1;
        }
        if (!tile) continue;
        tile.used = performance.now();
        ctx.drawImage(tile.canvas, tx * TILE_METRES, tz * TILE_METRES, TILE_METRES + 0.6, TILE_METRES + 0.6);
      }
    }
    if (tiles.size > MAX_TILES) forgetOldestTiles();
  }

  function paintTile(tx, tz) {
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = TILE_PIXELS;
    tileCanvas.height = TILE_PIXELS;
    const tileCtx = tileCanvas.getContext('2d');
    const view = { scale: TILE_PIXELS / TILE_METRES, originX: tx * TILE_METRES, originZ: tz * TILE_METRES };
    painter.paintRegion(tileCtx, view, TILE_PIXELS, TILE_PIXELS, { medians: true });
    return { canvas: tileCanvas, used: performance.now() };
  }

  function forgetOldestTiles() {
    const entries = [...tiles.entries()].sort((p, q) => p[1].used - q[1].used);
    for (let i = 0; i < entries.length - MAX_TILES; i += 1) tiles.delete(entries[i][0]);
  }

  /** While the player is wanted, each PSPD unit's line of sight as a faint flashing cone. */
  function drawPoliceCones(now) {
    if (!game.wanted || !(game.wanted.level > 0) || !game.markers) return;
    const flashRed = Math.floor(now * 4) % 2 === 0;
    ctx.fillStyle = flashRed ? 'rgba(255, 59, 78, 0.2)' : 'rgba(61, 123, 255, 0.22)';
    for (const marker of game.markers.list) {
      if (marker.kind !== 'police' || !marker.entity) continue;
      const entity = marker.entity;
      const p = entity.pos;
      if (!p) continue;
      const heading = entity.heading || 0;
      const length = marker.visionRange || 46;
      const spread = 0.62;
      ctx.beginPath();
      ctx.moveTo(p.x, p.z);
      for (let i = -4; i <= 4; i += 1) {
        const h = heading + (spread * i) / 4;
        ctx.lineTo(p.x + Math.sin(h) * length, p.z + Math.cos(h) * length);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawInnerShade(half, ringRadius) {
    const shade = ctx.createRadialGradient(half, half, ringRadius * 0.62, half, half, ringRadius);
    shade.addColorStop(0, 'rgba(14,27,42,0)');
    shade.addColorStop(1, 'rgba(14,27,42,0.5)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, sizePx, sizePx);
  }

  const point = { x: 0, y: 0 };

  /** Shops, safehouses, garages and the like from the city plan, when they are in range. */
  function drawPlaceBlips(toScreen, half, ringRadius, pos) {
    if (!game.city || !game.city.places || game.hud?.showPlaceBlips === false) return;
    const range = minimap.viewRadius * 1.02;
    const r = Math.max(5.5, sizePx * 0.036);
    for (const place of game.city.places) {
      if (!PLACE_BLIP_KINDS.has(place.kind)) continue;
      const dx = place.x - pos.x;
      const dz = place.z - pos.z;
      if (dx * dx + dz * dz > range * range) continue;
      toScreen(place.x, place.z, point);
      const ox = point.x - half;
      const oy = point.y - half;
      if (ox * ox + oy * oy > (ringRadius - r) * (ringRadius - r)) continue;
      drawBlip(ctx, place.kind, point.x, point.y, r, null, 0);
    }
  }

  /** Every marker of game.markers; those out of range ride the ring's edge when marker.edge is set. */
  function drawMarkerBlips(toScreen, half, ringRadius, now) {
    if (!game.markers) return;
    const list = game.markers.list;
    const base = Math.max(6, sizePx * 0.04);
    // Draw low-priority kinds first so jobs and the route target end on top.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < list.length; i += 1) {
        const marker = list[i];
        if (marker.hidden || marker.minimap === false) continue;
        const kind = blipKindOf(marker);
        const top = kind === 'mission' || kind === 'objective' || kind === 'waypoint' || marker.route;
        if ((pass === 0) === Boolean(top)) continue;
        const p = game.markers.positionOf(marker);
        if (!p) continue;
        toScreen(p.x, p.z, point);
        let ox = point.x - half;
        let oy = point.y - half;
        const dist = Math.hypot(ox, oy);
        const isDot = kind === 'police' || kind === 'enemy' || kind === 'friend';
        const r = isDot ? base * 0.95 : base;
        const limit = ringRadius - r * 0.9;
        if (dist > limit) {
          if (marker.edge === false) continue;
          ox = (ox / dist) * limit;
          oy = (oy / dist) * limit;
        }
        drawBlip(ctx, kind, half + ox, half + oy, r, marker, now);
      }
    }
  }

  /** The gold ring, a thin inner line, the compass ticks and the north star riding the ring. */
  function drawRing(half, ringRadius, yaw) {
    ctx.save();
    ctx.lineWidth = Math.max(2, sizePx * 0.016);
    ctx.strokeStyle = 'rgba(8,14,22,0.85)';
    ctx.beginPath();
    ctx.arc(half, half, ringRadius + ctx.lineWidth * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#e9b44c';
    ctx.beginPath();
    ctx.arc(half, half, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, sizePx * 0.005);
    ctx.strokeStyle = 'rgba(255,244,214,0.55)';
    ctx.beginPath();
    ctx.arc(half, half, ringRadius - sizePx * 0.016, 0, Math.PI * 2);
    ctx.stroke();
    // Ticks every 45 degrees of the compass, turned with the map.
    ctx.strokeStyle = 'rgba(14,27,42,0.9)';
    ctx.lineWidth = Math.max(1.5, sizePx * 0.008);
    for (let i = 1; i < 8; i += 1) {
      const angle = Math.PI + yaw + (i * Math.PI) / 4;
      const sx = Math.sin(angle);
      const sy = -Math.cos(angle);
      ctx.beginPath();
      ctx.moveTo(half + sx * (ringRadius - sizePx * 0.012), half + sy * (ringRadius - sizePx * 0.012));
      ctx.lineTo(half + sx * (ringRadius + sizePx * 0.012), half + sy * (ringRadius + sizePx * 0.012));
      ctx.stroke();
    }
    // North: the direction -Z on screen is (-sin yaw, cos yaw).
    const nx = half - Math.sin(yaw) * ringRadius;
    const ny = half + Math.cos(yaw) * ringRadius;
    const starRadius = sizePx * 0.062;
    traceEightPointStar(ctx, nx, ny, starRadius);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, sizePx * 0.012);
    ctx.strokeStyle = 'rgba(8,14,22,0.95)';
    ctx.stroke();
    ctx.fillStyle = '#e9b44c';
    ctx.fill();
    ctx.fillStyle = '#0e1b2a';
    ctx.font = `800 ${Math.round(starRadius * 1.05)}px "Bahnschrift", "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + starRadius * 0.06);
    ctx.restore();
  }

  /** Match the canvas to its box (on start and when the window changes size). */
  function resize() {
    const css = container.clientWidth || 0;
    if (!css) return;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    sizePx = Math.round(css * pixelRatio);
    canvas.width = sizePx;
    canvas.height = sizePx;
  }

  window.addEventListener('resize', resize);
  return minimap;
}

/** The heading the map turns to: the camera's, else the player's. */
function viewYaw(game) {
  if (game.cameraRig && typeof game.cameraRig.yaw === 'number') return game.cameraRig.yaw;
  return playerHeading(game);
}

function playerHeading(game) {
  const player = game.player;
  if (!player) return 0;
  if (player.vehicle) return player.vehicle.heading || 0;
  if (player.character) return player.character.heading || 0;
  return player.heading || 0;
}

function playerSpeed(game) {
  const player = game.player;
  if (!player) return 0;
  if (player.vehicle) return Math.abs(player.vehicle.speed || 0);
  const vel = player.character && player.character.vel;
  return vel ? Math.hypot(vel.x, vel.z) : 0;
}

const TILE_METRES = 200;
const TILE_PIXELS = 256;
const MAX_TILES = 40;
const RING_FRACTION = 0.86;
