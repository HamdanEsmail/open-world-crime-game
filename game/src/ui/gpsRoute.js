// The GPS of KHAMSIN: finds the way along Port Sarab's roads to whichever marker asks for a route
// (a job's next stop, a contact, the player's own waypoint) and keeps it fresh twice a second.
// The minimap and the city map draw it as a thick coral-magenta line with a glow.

/** Colours of the route line: the bright core and its soft glow. */
export const ROUTE_COLOR = '#ff4f7b';
export const ROUTE_GLOW = 'rgba(255, 79, 123, 0.32)';
export const ROUTE_EDGE = 'rgba(40, 6, 18, 0.55)';

/**
 * Create the route keeper. `route` is a list of {x, z} from the player to the target,
 * `distance` its length in metres along the roads.
 */
export function createGpsRoute(game) {
  const gps = {
    route: [],
    distance: 0,
    target: null,
    update,
    refresh,
    clear,
  };
  let nextSearchAt = 0;
  let lastMarkerId = null;
  let lastTargetX = 0;
  let lastTargetZ = 0;
  let suffix = [];

  /** Re-plan at most twice a second, at once when the target changes; keep the start glued to the player. */
  function update() {
    const marker = game.markers && game.markers.routeTarget ? game.markers.routeTarget() : null;
    if (!marker) {
      if (gps.route.length) clear();
      return;
    }
    const target = game.markers.positionOf(marker);
    const from = playerPosition(game);
    if (!target || !from || !game.roads || !game.roads.findRoute) return;
    const now = performance.now();
    const moved = Math.abs(target.x - lastTargetX) + Math.abs(target.z - lastTargetZ) > 12;
    if (marker.id !== lastMarkerId || moved || now >= nextSearchAt) {
      plan(marker, from, target);
      nextSearchAt = now + 500;
    }
    if (gps.route.length > 1) {
      gps.route[0].x = from.x;
      gps.route[0].z = from.z;
      const next = gps.route[1];
      gps.distance = Math.hypot(next.x - from.x, next.z - from.z) + (suffix[1] || 0);
    }
  }

  /** Plan right now (the city map calls this after dropping a waypoint while the game is paused). */
  function refresh() {
    nextSearchAt = 0;
    lastMarkerId = null;
    update();
  }

  function plan(marker, from, target) {
    const found = game.roads.findRoute(from.x, from.z, target.x, target.z);
    const route = [{ x: from.x, z: from.z }];
    for (const point of found) route.push({ x: point.x, z: point.z });
    // Lengths from each point to the end, so the distance can follow the player cheaply between plans.
    suffix = new Array(route.length).fill(0);
    for (let i = route.length - 2; i >= 0; i -= 1) {
      suffix[i] = suffix[i + 1] + Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z);
    }
    gps.route = route;
    gps.distance = suffix[0];
    gps.target = marker;
    lastMarkerId = marker.id;
    lastTargetX = target.x;
    lastTargetZ = target.z;
  }

  function clear() {
    gps.route = [];
    gps.distance = 0;
    gps.target = null;
    lastMarkerId = null;
    suffix = [];
  }

  return gps;
}

/**
 * Stroke the route in world coordinates under the caller's transform: glow, dark edge, bright core.
 * `metresPerPixel` turns the wanted pixel widths into world widths.
 */
export function strokeRoute(ctx, route, metresPerPixel, corePixels = 4) {
  if (!route || route.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  traceRoute(ctx, route);
  ctx.strokeStyle = ROUTE_GLOW;
  ctx.lineWidth = (corePixels + 7) * metresPerPixel;
  ctx.stroke();
  ctx.strokeStyle = ROUTE_EDGE;
  ctx.lineWidth = (corePixels + 2) * metresPerPixel;
  ctx.stroke();
  ctx.strokeStyle = ROUTE_COLOR;
  ctx.lineWidth = corePixels * metresPerPixel;
  ctx.stroke();
  ctx.restore();
}

function traceRoute(ctx, route) {
  ctx.beginPath();
  ctx.moveTo(route[0].x, route[0].z);
  for (let i = 1; i < route.length; i += 1) ctx.lineTo(route[i].x, route[i].z);
}

/** Where the player is: on foot or at the wheel. */
export function playerPosition(game) {
  const player = game.player;
  if (!player) return null;
  if (player.vehicle && player.vehicle.pos) return player.vehicle.pos;
  if (player.pos) return player.pos;
  return player.character ? player.character.pos : null;
}
