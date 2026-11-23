// Finding cover in a Port Sarab street fight: a wall, a container or a building's corner that hides a
// fighter from their target at crouching height with a step to the side to lean out and shoot from, or
// a parked car to crouch behind and stand up over. Walls come from the static colliders; a car counts
// when a traced round from the target would stop in its bodywork.
import * as THREE from 'three';

/** Rings (m) sampled around the fighter, and spots per ring: far enough to reach a wide street's walls. */
const RINGS = [3.5, 7.5, 12];
const SPOTS_PER_RING = 8;
/** Heights above the ground of a crouching head and of a standing shooter's eyes. */
const CROUCH_HEIGHT = 0.95;
const STAND_HEIGHT = 1.45;
/** How far a lean-out spot sits beside the cover spot (m). */
const PEEK_STEP = 1.3;
/** Parked cars within this distance (m) are considered, and the gap kept from their bodywork. */
const CAR_SEARCH = 14;
const CAR_GAP = 0.75;

/** A search is done in this many steps, one a frame: a ring of wall spots each, then the parked cars. */
export const COVER_SEARCH_STEPS = RINGS.length + 1;

/**
 * Look for cover for a fighter standing at (fromX, fromZ) against a target whose chest is `target`
 * ({x, y, z}), preferring spots at the weapon's fighting distance `band` = [near, far].
 * `tools` = {grid, ballistics, trace, skip: the target character} lets parked cars count. Fills `out`
 * {x, z, peekX, peekZ, vehicle} (vehicle is the car hidden behind, or null); true when found.
 */
export function findCover(game, tools, fromX, fromZ, target, band, seed, out) {
  let best = Infinity;
  for (let step = 0; step < COVER_SEARCH_STEPS; step += 1) best = searchCoverStep(game, tools, step, fromX, fromZ, target, band, seed, out, best);
  return best < Infinity;
}

/**
 * One step of a cover search (step 0..COVER_SEARCH_STEPS-1). `bestScore` is the best found so far
 * (Infinity at the start); writes a better spot into `out` and returns the new best score.
 */
export function searchCoverStep(game, tools, step, fromX, fromZ, target, band, seed, out, bestScore) {
  if (!game.colliders) return bestScore;
  if (step < RINGS.length) return findWallCover(game, step, fromX, fromZ, target, band, seed, out, bestScore);
  if (tools && tools.grid) return findCarCover(game, tools, fromX, fromZ, target, band, out, bestScore);
  return bestScore;
}

/** Is a cover spot still hidden from the target's chest (behind its wall, or still behind its car)? */
export function coverStillHides(game, tools, x, z, target, vehicle) {
  if (!game.colliders) return false;
  const ground = game.terrain ? game.terrain.heightAt(x, z) : 0;
  if (vehicle) {
    if (vehicle.despawned || vehicle.exploded || Math.abs(vehicle.speed || 0) > 1) return false;
    const reach = Math.hypot(vehicle.pos.x - x, vehicle.pos.z - z);
    if (reach > vehicle.spec.length * 0.5 + CAR_GAP + 1.5) return false;
    return carBlocks(tools, target, x, ground + CROUCH_HEIGHT, z, vehicle);
  }
  _spot.set(x, ground + CROUCH_HEIGHT, z);
  return !game.colliders.lineOfSight(target, _spot);
}

/** Wall cover: sample one ring around the fighter. Returns the better of `bestScore` and its own. */
function findWallCover(game, ring, fromX, fromZ, target, band, seed, out, bestScore) {
  const colliders = game.colliders;
  const terrain = game.terrain;
  const middle = (band[0] + band[1]) * 0.5;
  for (let k = 0; k < SPOTS_PER_RING; k += 1) {
    const angle = seed + (k + ring * 0.5) * ((Math.PI * 2) / SPOTS_PER_RING);
    const x = fromX + Math.sin(angle) * RINGS[ring];
    const z = fromZ + Math.cos(angle) * RINGS[ring];
    const toTargetX = target.x - x;
    const toTargetZ = target.z - z;
    const targetDistance = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ);
    if (!inFightingRange(targetDistance, band)) continue;
    const score = RINGS[ring] + Math.abs(targetDistance - middle) * 0.45;
    if (score >= bestScore) continue;
    if (!isStandable(game, x, z, 0.45)) continue;
    if (!touchesSomething(game, x, z, 1.9)) continue;
    const ground = terrain ? terrain.heightAt(x, z) : 0;
    _spot.set(x, ground + CROUCH_HEIGHT, z);
    if (colliders.lineOfSight(target, _spot)) continue;
    // A place beside it to lean out from, or else stand up over low cover.
    const inv = 1 / (targetDistance || 1);
    const sideX = -toTargetZ * inv;
    const sideZ = toTargetX * inv;
    let peekX = NaN;
    let peekZ = NaN;
    for (let side = -1; side <= 1 && Number.isNaN(peekX); side += 2) {
      const px = x + sideX * PEEK_STEP * side;
      const pz = z + sideZ * PEEK_STEP * side;
      if (!isStandable(game, px, pz, 0.4)) continue;
      _spot.set(px, ground + STAND_HEIGHT, pz);
      if (!colliders.lineOfSight(target, _spot)) continue;
      peekX = px;
      peekZ = pz;
    }
    if (Number.isNaN(peekX)) {
      _spot.set(x, ground + STAND_HEIGHT + 0.25, z);
      if (!colliders.lineOfSight(target, _spot)) continue;
      peekX = x;
      peekZ = z;
    }
    out.x = x;
    out.z = z;
    out.peekX = peekX;
    out.peekZ = peekZ;
    out.vehicle = null;
    bestScore = score;
  }
  return bestScore;
}

/**
 * Car cover: the far side of a parked car from the target, where a traced round would stop in the car.
 * Standing up there must give a clear shot over the roof (or a step past its end must). Returns the
 * better of `bestScore` and its own best.
 */
function findCarCover(game, tools, fromX, fromZ, target, band, out, bestScore) {
  const middle = (band[0] + band[1]) * 0.5;
  tools.grid.gatherNear(fromX, fromZ, CAR_SEARCH, _cars, tools.grid.VEHICLES);
  for (let i = 0; i < _cars.length; i += 1) {
    const car = _cars[i];
    if (!car || !car.spec || car.despawned || car.onFire || Math.abs(car.speed || 0) > 1) continue;
    let awayX = car.pos.x - target.x;
    let awayZ = car.pos.z - target.z;
    const awayLength = Math.sqrt(awayX * awayX + awayZ * awayZ) || 1;
    awayX /= awayLength;
    awayZ /= awayLength;
    // How far the bodywork reaches along that direction.
    const s = Math.sin(car.heading);
    const c = Math.cos(car.heading);
    const along = Math.abs(awayX * s + awayZ * c);
    const across = Math.abs(awayX * c - awayZ * s);
    const extent = along * car.spec.length * 0.5 + across * car.spec.width * 0.5;
    const x = car.pos.x + awayX * (extent + CAR_GAP);
    const z = car.pos.z + awayZ * (extent + CAR_GAP);
    const travel = Math.hypot(x - fromX, z - fromZ);
    const targetDistance = Math.hypot(target.x - x, target.z - z);
    if (!inFightingRange(targetDistance, band)) continue;
    const score = travel + Math.abs(targetDistance - middle) * 0.45 - 1.5;
    if (score >= bestScore || !isStandable(game, x, z, 0.4)) continue;
    const ground = game.terrain ? game.terrain.heightAt(x, z) : 0;
    if (!carBlocks(tools, target, x, ground + CROUCH_HEIGHT, z, car)) continue;
    let peekX = x;
    let peekZ = z;
    if (!clearShot(game, tools, target, x, ground + STAND_HEIGHT + 0.2, z)) {
      // A van or a truck: step out past its end instead.
      const step = car.spec.length * 0.5 + 0.9;
      const ex = x + s * step;
      const ez = z + c * step;
      if (!isStandable(game, ex, ez, 0.4) || !clearShot(game, tools, target, ex, ground + STAND_HEIGHT, ez)) continue;
      peekX = ex;
      peekZ = ez;
    }
    out.x = x;
    out.z = z;
    out.peekX = peekX;
    out.peekZ = peekZ;
    out.vehicle = car;
    bestScore = score;
  }
  _cars.length = 0;
  return bestScore;
}

/**
 * Would a round from the target's chest to (x, y, z) stop in `car`? (tools.skip is the target itself,
 * so the trace does not start inside their own body or car.)
 */
function carBlocks(tools, target, x, y, z, car) {
  const dx = x - target.x;
  const dy = y - target.y;
  const dz = z - target.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const trace = tools.ballistics.traceShot(tools.skip, target.x, target.y, target.z, dx / distance, dy / distance, dz / distance, distance, tools.trace);
  return trace.kind === 'vehicle' && trace.target === car;
}

/** Nothing static or parked between the target's chest and (x, y, z)? */
function clearShot(game, tools, target, x, y, z) {
  const dx = x - target.x;
  const dy = y - target.y;
  const dz = z - target.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const trace = tools.ballistics.traceShot(tools.skip, target.x, target.y, target.z, dx / distance, dy / distance, dz / distance, distance - 0.3, tools.trace);
  return trace.kind !== 'world' && trace.kind !== 'vehicle';
}

/** Cover worth taking sits within reach of the target for the weapon in hand. */
function inFightingRange(targetDistance, band) {
  return targetDistance >= Math.max(3, band[0] * 0.6) && targetDistance <= band[1] * 1.6 + 6;
}

/** No static collider overlaps a circle of `radius` at (x, z), and it is not in the sea. */
export function isStandable(game, x, z, radius) {
  if (game.terrain && game.terrain.isWater && game.terrain.isWater(x, z)) return false;
  game.colliders.query(x, z, radius, _nearby);
  for (let i = 0; i < _nearby.length; i += 1) {
    const c = _nearby[i];
    if (c.y0 > 1.6) continue;
    if (c.type === 'post') {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.radius + radius) * (c.radius + radius)) return false;
    } else {
      const nx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
      const nz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
      const dx = x - nx;
      const dz = z - nz;
      if (dx * dx + dz * dz < radius * radius) return false;
    }
  }
  return true;
}

function touchesSomething(game, x, z, radius) {
  game.colliders.query(x, z, radius, _nearby);
  for (let i = 0; i < _nearby.length; i += 1) if (_nearby[i].y1 > 0.9) return true;
  return false;
}

const _spot = new THREE.Vector3();
const _nearby = [];
const _cars = [];
