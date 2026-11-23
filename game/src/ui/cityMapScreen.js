// The city map of Port Sarab, full screen: the gulf, the beach and the dunes, every district
// tinted and named, boulevards and highways labelled, landmarks, shops and jobs as icons, the
// player's arrow and the GPS route. Drag to pan, wheel to zoom, click to drop a waypoint the GPS
// will follow, right-click to clear it.
import { createCityMapPainter } from './cityMapPainter.js';
import { drawBlip, blipKindOf, drawPlayerArrow, createBlipSpriteCache, BLIP_STYLES, PLACE_BLIP_KINDS } from './mapBlipIcons.js';
import { strokeRoute, playerPosition } from './gpsRoute.js';
import { eightPointStarPath } from './hudIconLibrary.js';
import { goldRuleMarkup } from './menuListControls.js';
import { createElement, createKeyCap, setText, formatDistance } from './uiElements.js';

/**
 * Build the map in `root` (#city-map-screen).
 * @param {Object} director  close(name)
 * @returns {{name:string, open():void, close():void, handleKey(code:string):boolean, pauses:boolean, coversHud:boolean, view:Object}}
 */
export function createCityMapScreen(game, root, director) {
  root.textContent = '';
  root.classList.add('city-map');
  const base = createElement('canvas', 'city-map-base', root);
  const overlay = createElement('canvas', 'city-map-overlay', root);
  const baseCtx = base.getContext('2d');
  const ctx = overlay.getContext('2d');
  createElement('div', 'city-map-vignette', root);
  const title = createElement('div', 'city-map-title', root);
  title.innerHTML = `<div class="city-map-kicker">CITY MAP</div><div class="city-map-name">PORT SARAB</div>${goldRuleMarkup('city-map-rule')}`;
  const readout = createElement('div', 'city-map-readout', root);
  const compass = createElement('div', 'city-map-compass', root);
  compass.innerHTML = `<svg viewBox="0 0 60 60" aria-hidden="true"><path class="compass-star" d="${eightPointStarPath(30, 30, 27)}"/><path class="compass-needle" d="M30 6 L35 30 L30 27 L25 30 Z"/><text x="30" y="36" text-anchor="middle">N</text></svg>`;
  const legend = buildLegend(createElement('div', 'city-map-legend', root));
  const help = createElement('div', 'city-map-help menu-key-hints', root);
  addHint(help, ['Mouse0'], 'Drag to pan / click for a waypoint');
  addHint(help, ['Mouse2'], 'Clear waypoint');
  addHint(help, ['KeyQ', 'KeyE'], 'Zoom');
  addHint(help, ['KeyC'], 'Centre on you');
  addHint(help, ['Escape'], 'Close');
  const tooltip = createElement('div', 'city-map-tooltip', root);
  tooltip.hidden = true;

  const painter = game.city ? createCityMapPainter(game) : null;
  const blips = createBlipSpriteCache();
  const view = { centerX: 40, centerZ: 100, scale: 0.45 };
  const screen = { name: 'map', open, close, handleKey, pauses: true, coversHud: true, view };
  let width = 0;
  let height = 0;
  let ratio = 1;
  let dirty = true;
  let frame = 0;
  let pointer = { x: -1, y: -1, inside: false };
  let drag = null;

  function open() {
    root.hidden = false;
    resize();
    game.hud?.gps?.refresh?.();
    const pos = playerPosition(game);
    view.scale = Math.min(width / 2650, height / 1850);
    view.centerX = 40;
    view.centerZ = 70;
    if (pos) {
      view.centerX = clamp(pos.x * 0.3 + 40 * 0.7, -1500, 1500);
      view.centerZ = clamp(pos.z * 0.3 + 70 * 0.7, -1100, 1700);
    }
    dirty = true;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }

  function close() {
    root.hidden = true;
    cancelAnimationFrame(frame);
    drag = null;
  }

  /** Redraw the overlay every frame; the base only when the view moved. */
  function draw() {
    frame = requestAnimationFrame(draw);
    if (!width) return;
    if (dirty) paintBase();
    const now = performance.now() / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const s = view.scale * ratio;
    const ox = view.centerX - width / 2 / view.scale;
    const oz = view.centerZ - height / 2 / view.scale;
    ctx.setTransform(s, 0, 0, s, -ox * s, -oz * s);
    const route = game.hud ? game.hud.route : null;
    strokeRoute(ctx, route, 1 / s, 5 * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const toX = (x) => (x - ox) * view.scale;
    const toY = (z) => (z - oz) * view.scale;
    let hover = null;
    let hoverDistance = 16;
    const consider = (x, y, label, extra) => {
      if (!pointer.inside || !label) return;
      const d = Math.hypot(x - pointer.x, y - pointer.y);
      if (d < hoverDistance) {
        hoverDistance = d;
        hover = { label, extra };
      }
    };
    if (game.city) {
      for (const place of game.city.places) {
        if (!PLACE_BLIP_KINDS.has(place.kind)) continue;
        const x = toX(place.x);
        const y = toY(place.z);
        if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
        blips.draw(ctx, place.kind, x, y, 9, null, now);
        consider(x, y, place.name, BLIP_STYLES[place.kind]?.label);
      }
    }
    if (game.markers) {
      for (const marker of game.markers.list) {
        if (marker.hidden || marker.map === false) continue;
        const p = game.markers.positionOf(marker);
        if (!p) continue;
        const kind = blipKindOf(marker);
        const x = toX(p.x);
        const y = toY(p.z);
        if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
        blips.draw(ctx, kind, x, y, kind === 'police' || kind === 'enemy' || kind === 'friend' ? 9 : 12, marker, now);
        consider(x, y, marker.label || BLIP_STYLES[kind]?.label, BLIP_STYLES[kind]?.label);
      }
    }
    const pos = playerPosition(game);
    if (pos) {
      const x = toX(pos.x);
      const y = toY(pos.z);
      const pulse = (now * 0.8) % 1;
      ctx.beginPath();
      ctx.arc(x, y, 12 + pulse * 26, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 244, 214, ${0.7 * (1 - pulse)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      const heading = game.player.vehicle ? game.player.vehicle.heading : game.player.character ? game.player.character.heading : 0;
      drawPlayerArrow(ctx, x, y, 14, Math.PI - (heading || 0));
    }
    updateReadout(hover);
  }

  function paintBase() {
    dirty = false;
    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
    baseCtx.clearRect(0, 0, base.width, base.height);
    if (!painter) return;
    const ox = view.centerX - width / 2 / view.scale;
    const oz = view.centerZ - height / 2 / view.scale;
    painter.paintRegion(baseCtx, { scale: view.scale * ratio, originX: ox, originZ: oz }, base.width, base.height, { medians: view.scale > 0.9 });
    baseCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    painter.paintLabels(baseCtx, { scale: view.scale, originX: ox, originZ: oz }, width, height);
    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The district and street under the pointer, and the distance from the player, top right. */
  function updateReadout(hover) {
    if (!pointer.inside || !game.city) {
      setText(readout, '');
      tooltip.hidden = true;
      return;
    }
    const world = screenToWorld(pointer.x, pointer.y);
    const district = game.city.districtAt(world.x, world.z);
    const street = game.city.streetNameAt ? game.city.streetNameAt(world.x, world.z) : '';
    const pos = playerPosition(game);
    const distance = pos ? formatDistance(Math.hypot(world.x - pos.x, world.z - pos.z)) : '';
    setText(readout, `${district ? district.name.toUpperCase() : ''}${street ? `  ·  ${street}` : ''}${distance ? `  ·  ${distance}` : ''}`);
    if (hover) {
      setText(tooltip, hover.extra && hover.extra !== hover.label ? `${hover.label}  ·  ${hover.extra}` : hover.label);
      tooltip.style.transform = `translate(${Math.round(pointer.x + 16)}px, ${Math.round(pointer.y - 12)}px)`;
      tooltip.hidden = false;
    } else {
      tooltip.hidden = true;
    }
  }

  function screenToWorld(x, y) {
    return {
      x: view.centerX + (x - width / 2) / view.scale,
      z: view.centerZ + (y - height / 2) / view.scale,
    };
  }

  /** Zoom by a factor, keeping the world point under (x, y) where it is. */
  function zoomAt(factor, x = width / 2, y = height / 2) {
    const before = screenToWorld(x, y);
    view.scale = clamp(view.scale * factor, 0.16, 4.5);
    const after = screenToWorld(x, y);
    view.centerX += before.x - after.x;
    view.centerZ += before.z - after.z;
    keepInWorld();
    dirty = true;
  }

  function pan(dx, dy) {
    view.centerX -= dx / view.scale;
    view.centerZ -= dy / view.scale;
    keepInWorld();
    dirty = true;
  }

  function keepInWorld() {
    const world = game.config.world;
    view.centerX = clamp(view.centerX, world.minX, world.maxX);
    view.centerZ = clamp(view.centerZ, world.minZ, world.maxZ);
  }

  /** Drop a waypoint where the player clicked, or clear the one already there. */
  function toggleWaypoint(x, y) {
    if (!game.markers) return;
    const existing = game.markers.list.find((marker) => marker.kind === 'waypoint');
    if (existing) {
      const p = game.markers.positionOf(existing);
      const sx = (p.x - view.centerX) * view.scale + width / 2;
      const sy = (p.z - view.centerZ) * view.scale + height / 2;
      game.markers.remove(existing);
      game.audio?.play?.('menuBack');
      if (Math.hypot(sx - x, sy - y) < 22) {
        game.hud?.gps?.refresh?.();
        return;
      }
    }
    const world = screenToWorld(x, y);
    game.markers.add({ kind: 'waypoint', pos: { x: world.x, y: 0, z: world.z }, route: true, label: 'Waypoint', owner: 'waypoint', beacon: true });
    game.audio?.play?.('menuSelect');
    game.hud?.gps?.refresh?.();
  }

  function clearWaypoint() {
    if (!game.markers) return;
    for (const marker of game.markers.list.filter((m) => m.kind === 'waypoint')) game.markers.remove(marker);
    game.audio?.play?.('menuBack');
    game.hud?.gps?.refresh?.();
  }

  function handleKey(code) {
    const step = 90;
    if (code === 'Escape' || code === 'KeyM' || code === 'Backspace') {
      game.audio?.play?.('menuBack');
      director.close('map');
      return true;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') pan(step, 0);
    else if (code === 'ArrowRight' || code === 'KeyD') pan(-step, 0);
    else if (code === 'ArrowUp' || code === 'KeyW') pan(0, step);
    else if (code === 'ArrowDown' || code === 'KeyS') pan(0, -step);
    else if (code === 'KeyE' || code === 'Equal' || code === 'NumpadAdd' || code === 'PageUp') zoomAt(1.25);
    else if (code === 'KeyQ' || code === 'Minus' || code === 'NumpadSubtract' || code === 'PageDown') zoomAt(0.8);
    else if (code === 'KeyC') {
      const pos = playerPosition(game);
      if (pos) {
        view.centerX = pos.x;
        view.centerZ = pos.z;
        dirty = true;
      }
    } else if (code === 'Enter' || code === 'Space') toggleWaypoint(width / 2, height / 2);
    else return false;
    return true;
  }

  function resize() {
    width = root.clientWidth || window.innerWidth;
    height = root.clientHeight || window.innerHeight;
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    for (const canvas of [base, overlay]) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    dirty = true;
  }

  overlay.addEventListener('mousedown', (event) => {
    drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, button: event.button };
    root.classList.add('is-dragging');
  });
  window.addEventListener('mousemove', (event) => {
    const rect = overlay.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, inside: !root.hidden };
    if (!drag || root.hidden) return;
    pan(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  window.addEventListener('mouseup', (event) => {
    if (!drag || root.hidden) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    const rect = overlay.getBoundingClientRect();
    if (moved < 5) {
      if (drag.button === 2) clearWaypoint();
      else if (drag.button === 0) toggleWaypoint(event.clientX - rect.left, event.clientY - rect.top);
    }
    drag = null;
    root.classList.remove('is-dragging');
  });
  overlay.addEventListener('mouseleave', () => {
    pointer.inside = false;
  });
  overlay.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = overlay.getBoundingClientRect();
    zoomAt(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  overlay.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('resize', () => {
    if (!root.hidden) resize();
  });

  return screen;
}

/** The legend: each kind of icon with what it means, drawn by the same blip painter. */
function buildLegend(container) {
  createElement('div', 'city-map-legend-title', container, 'LEGEND');
  const grid = createElement('div', 'city-map-legend-grid', container);
  const entries = [
    ['mission', 'Story job'], ['objective', 'Objective'], ['contact', 'Crew / handler'], ['waypoint', 'Waypoint'],
    ['safehouse', 'Safehouse'], ['gunShop', 'Gun shop'], ['garage', 'Garage / respray'], ['food', 'Food stand'],
    ['hospital', 'Hospital'], ['policeStation', 'Police post'], ['raceStart', 'Race'], ['taxiDepot', 'Taxi fares'],
    ['courierDepot', 'Courier runs'], ['exportDock', 'Export crane'], ['police', 'PSPD unit'], ['you', 'You'],
  ];
  for (const [kind, label] of entries) {
    const row = createElement('div', 'city-map-legend-row', grid);
    const icon = createElement('canvas', 'city-map-legend-icon', row);
    icon.width = 44;
    icon.height = 44;
    const c = icon.getContext('2d');
    if (kind === 'you') drawPlayerArrow(c, 22, 23, 15, 0.5);
    else drawBlip(c, kind, 22, kind === 'waypoint' ? 30 : 22, 15, kind === 'contact' ? { letter: 'F', color: 0xe9b44c } : null, 0);
    createElement('span', 'city-map-legend-label', row, label);
  }
  return container;
}

function addHint(container, codes, text) {
  const hint = createElement('span', 'menu-key-hint', container);
  for (const code of codes) createKeyCap(code, hint);
  createElement('span', 'menu-key-hint-text', hint, text);
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
