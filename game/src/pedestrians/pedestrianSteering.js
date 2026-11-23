// How a pedestrian is steered. The people of Port Sarab are moved only by writing their intent: a
// direction with a pace (walk, run or sprint) scaled to the speed they want, or standing still facing
// a heading with a gesture. Also feels ahead for lamp posts, palms, stalls and walls so people step
// round them instead of grinding into them.

/**
 * Walk, run or sprint toward a point at about `speed` m/s. Returns the distance left.
 * @param {Object} character
 * @param {number} x @param {number} z  where to go
 * @param {number} speed  m/s wanted
 * @param {{walk:number, run:number, sprint:number}} speeds  the character system's pace speeds
 */
export function moveToward(character, x, z, speed, speeds) {
  const dx = x - character.pos.x;
  const dz = z - character.pos.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance < 0.05) {
    standStill(character, null, character.intent.gesture);
    return distance;
  }
  // Ease in over the last metre so people arrive instead of overshooting.
  const eased = distance < 1 ? speed * Math.max(0.35, distance) : speed;
  moveAlong(character, dx / distance, dz / distance, eased, speeds);
  return distance;
}

/** Move along a unit direction at about `speed` m/s (the pace is chosen from the speed). */
export function moveAlong(character, dirX, dirZ, speed, speeds) {
  const intent = character.intent;
  let pace = 'walk';
  let top = speeds.walk;
  if (speed > speeds.walk * 1.02) {
    pace = 'run';
    top = speeds.run;
  }
  if (speed > speeds.run * 1.02) {
    pace = 'sprint';
    top = speeds.sprint;
  }
  const scale = speed <= 0 ? 0 : Math.min(1, speed / top);
  intent.pace = pace;
  intent.moveX = dirX * scale;
  intent.moveZ = dirZ * scale;
  intent.faceYaw = null;
  intent.crouch = false;
  intent.aim = false;
  intent.fire = false;
  intent.jump = false;
}

/** Stand still, turning to face `faceYaw` (null keeps the heading), with a gesture or none. */
export function standStill(character, faceYaw, gesture) {
  const intent = character.intent;
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.pace = 'walk';
  intent.faceYaw = faceYaw;
  intent.gesture = gesture || null;
  intent.crouch = false;
  intent.aim = false;
  intent.fire = false;
  intent.jump = false;
}

/** Let go of everything: no movement, no gesture, no aim (for people the character system is tumbling). */
export function releaseIntent(character) {
  const intent = character.intent;
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.faceYaw = null;
  intent.gesture = null;
  intent.crouch = false;
  intent.aim = false;
  intent.fire = false;
  intent.jump = false;
}

/** The heading that looks from (ax, az) toward (bx, bz). */
export function headingToward(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

/**
 * The nearest static obstacle across a walking line: from (x, z) along the unit direction for
 * `reach` metres, anything whose footprint comes within `bodyRadius` of the line at body height.
 * Fills `out` {along, latMin, latMax, collider} (lateral is measured to the right of travel) and
 * returns it, or returns null when the way is clear.
 */
export function findObstacleAhead(colliders, x, z, dirX, dirZ, reach, bodyRadius, out) {
  if (!colliders) return null;
  const rightX = -dirZ;
  const rightZ = dirX;
  const midX = x + dirX * reach * 0.5;
  const midZ = z + dirZ * reach * 0.5;
  colliders.query(midX, midZ, reach * 0.5 + bodyRadius + 1, NEARBY);
  let best = null;
  let bestAlong = reach;
  for (let i = 0; i < NEARBY.length; i += 1) {
    const c = NEARBY[i];
    if (c.y1 < 0.3 || c.y0 > 1.7) continue;
    let along;
    let latMin;
    let latMax;
    if (c.type === 'post') {
      const rx = c.x - x;
      const rz = c.z - z;
      along = rx * dirX + rz * dirZ - c.radius;
      const lat = rx * rightX + rz * rightZ;
      latMin = lat - c.radius;
      latMax = lat + c.radius;
    } else {
      along = Infinity;
      latMin = Infinity;
      latMax = -Infinity;
      for (let k = 0; k < 4; k += 1) {
        const cx = (k & 1 ? c.maxX : c.minX) - x;
        const cz = (k & 2 ? c.maxZ : c.minZ) - z;
        const a = cx * dirX + cz * dirZ;
        const l = cx * rightX + cz * rightZ;
        if (a < along) along = a;
        if (l < latMin) latMin = l;
        if (l > latMax) latMax = l;
      }
      // Standing beside a wall and walking along it is fine; only walls across the way count.
      if (along < 0 && x >= c.minX - bodyRadius && x <= c.maxX + bodyRadius && z >= c.minZ - bodyRadius && z <= c.maxZ + bodyRadius) {
        along = 0;
      }
    }
    if (latMax < -bodyRadius || latMin > bodyRadius) continue;
    if (along < -0.2 || along >= bestAlong) continue;
    if (c.type !== 'post' && along <= 0 && !movingInto(c, x, z, dirX, dirZ)) continue;
    bestAlong = along;
    best = c;
    out.along = along;
    out.latMin = latMin;
    out.latMax = latMax;
    out.collider = c;
  }
  return best ? out : null;
}

/**
 * Pick a clear heading near the wanted unit direction: straight on if nothing is in the way within
 * `reach`, else the smallest swing left or right that is clear. Writes the direction to out {x, z}.
 * Returns false when every swing is blocked (out then holds the wanted direction).
 */
export function chooseClearHeading(colliders, x, z, dirX, dirZ, reach, out) {
  for (let i = 0; i < SWINGS.length; i += 1) {
    const a = SWINGS[i];
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tx = dirX * c + dirZ * s;
    const tz = -dirX * s + dirZ * c;
    if (!findObstacleAhead(colliders, x, z, tx, tz, reach, 0.4, SCRATCH)) {
      out.x = tx;
      out.z = tz;
      return true;
    }
  }
  out.x = dirX;
  out.z = dirZ;
  return false;
}

/** True when a free spot of `radius` around (x, z) touches no static collider at body height. */
export function isSpotFree(colliders, x, z, radius) {
  if (!colliders) return true;
  colliders.query(x, z, radius + 0.5, NEARBY);
  for (let i = 0; i < NEARBY.length; i += 1) {
    const c = NEARBY[i];
    if (c.y1 < 0.3 || c.y0 > 1.8) continue;
    if (c.type === 'post') {
      const dx = x - c.x;
      const dz = z - c.z;
      const reach = radius + c.radius;
      if (dx * dx + dz * dz < reach * reach) return false;
    } else if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) {
      return false;
    }
  }
  return true;
}

/** Inside a box (grown by the body), is the walker heading deeper in rather than out? */
function movingInto(c, x, z, dirX, dirZ) {
  const left = x - c.minX;
  const right = c.maxX - x;
  const near = z - c.minZ;
  const far = c.maxZ - z;
  const least = Math.min(Math.abs(left), Math.abs(right), Math.abs(near), Math.abs(far));
  let nx = 0;
  let nz = 0;
  if (least === Math.abs(left)) nx = -1;
  else if (least === Math.abs(right)) nx = 1;
  else if (least === Math.abs(near)) nz = -1;
  else nz = 1;
  return dirX * nx + dirZ * nz < -0.2;
}

const NEARBY = [];
const SCRATCH = { along: 0, latMin: 0, latMax: 0, collider: null };
const SWINGS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.9, -1.9];
