// The flight of a bullet through Port Sarab: from the muzzle along its line to the first thing it
// meets. People are upright capsules (low and wide once they are on the ground), vehicles are boxes
// turned to their heading where a round through the glass may find the driver, and the city's walls,
// containers, palms and the ground stop everything (game.colliders.raycast).
import * as THREE from 'three';
import { headshotMultiplier } from './combatRules.js';

/** Radius (m) of a standing person, and of the low shape of someone lying down. */
export const PERSON_RADIUS = 0.35;
const DOWN_RADIUS = 0.75;
const DOWN_HEIGHT = 0.45;
/** Height of the chest above the feet, as a share of a person's height. */
const CHEST_SHARE = 1.28 / 1.78;
/** Chance that a round through a car's windows hits whoever sits at the wheel. */
const CABIN_HIT_CHANCE = 0.35;

/**
 * @typedef {Object} ShotTrace  What a traced shot hit (a reused object: read it before the next trace).
 * @property {'character'|'vehicle'|'world'|null} kind
 * @property {Object|null} target   the Character or Vehicle hit
 * @property {number} distance      metres from the origin
 * @property {number} x @property {number} y @property {number} z   the hit point (or the end of the range)
 * @property {number} nx @property {number} ny @property {number} nz  surface normal at the hit
 * @property {boolean} headshot
 * @property {number} damageScale   what the round's damage is multiplied by (2 for a headshot)
 * @property {boolean} throughGlass  a vehicle's occupant was hit through its windows
 * @property {Object|null} vehicle  the vehicle the round passed into, when it hit an occupant
 */

/** Build the tracer of shots. `grid` is the combat target grid. */
export function createBallistics(game, grid) {
  const candidates = [];
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  /** @type {ShotTrace} */
  const defaultTrace = makeTrace();

  /**
   * Follow a shot from (ox, oy, oz) along the unit direction (dx, dy, dz) for up to `range` metres.
   * Skips `shooter` and the vehicle it sits in (and that vehicle's other occupants).
   * @returns {ShotTrace}
   */
  function traceShot(shooter, ox, oy, oz, dx, dy, dz, range, out = defaultTrace) {
    out.kind = null;
    out.target = null;
    out.vehicle = null;
    out.headshot = false;
    out.damageScale = 1;
    out.throughGlass = false;
    out.distance = range;
    out.nx = -dx;
    out.ny = -dy;
    out.nz = -dz;
    let best = range;

    // The static city first: nothing beyond a wall can be hit.
    const colliders = game.colliders;
    if (colliders && colliders.raycast) {
      origin.set(ox, oy, oz);
      direction.set(dx, dy, dz);
      const hit = colliders.raycast(origin, direction, range);
      if (hit && hit.distance < best) {
        best = hit.distance;
        out.kind = 'world';
        out.target = hit.collider || null;
        out.nx = hit.normal.x;
        out.ny = hit.normal.y;
        out.nz = hit.normal.z;
      }
    }

    const ownVehicle = shooter && shooter.vehicle ? shooter.vehicle : null;
    grid.gatherAlongRay(ox, oz, dx, dz, best + 1, candidates, grid.BOTH);
    for (let i = 0; i < candidates.length; i += 1) {
      const entity = candidates[i];
      if (entity === shooter || entity === ownVehicle) continue;
      if (entity.spec) {
        const t = rayVehicle(entity, ox, oy, oz, dx, dy, dz, best, out);
        if (t < best) {
          best = t;
          resolveCabinHit(entity, ox, oy, oz, dx, dy, dz, t, shooter, out);
        }
      } else if (entity.intent) {
        if (entity.vehicle || entity.alive === false || entity.despawned) continue;
        const t = rayPerson(entity, ox, oy, oz, dx, dy, dz, best, out);
        if (t < best) {
          best = t;
          out.kind = 'character';
          out.target = entity;
          out.vehicle = null;
          out.throughGlass = false;
          const standing = !isDown(entity) && !(entity.intent && entity.intent.crouch);
          out.damageScale = standing ? headshotMultiplier(oy + dy * t - entity.pos.y, heightOf(entity)) : 1;
          out.headshot = out.damageScale > 1;
        }
      }
    }
    candidates.length = 0;

    out.distance = best;
    out.x = ox + dx * best;
    out.y = oy + dy * best;
    out.z = oz + dz * best;
    return out;
  }

  /**
   * A round that strikes a car's body above the doors may go through the glass into whoever sits
   * inside (never the shooter's own crew).
   */
  function resolveCabinHit(vehicle, ox, oy, oz, dx, dy, dz, t, shooter, out) {
    out.kind = 'vehicle';
    out.target = vehicle;
    out.vehicle = null;
    out.headshot = false;
    out.damageScale = 1;
    out.throughGlass = false;
    const spec = vehicle.spec;
    const localY = oy + dy * t - vehicle.pos.y;
    if (localY < spec.height * 0.55) return;
    const s = Math.sin(vehicle.heading);
    const c = Math.cos(vehicle.heading);
    const rx = ox + dx * t - vehicle.pos.x;
    const rz = oz + dz * t - vehicle.pos.z;
    const along = rx * s + rz * c;
    if (along > spec.length * 0.28 || along < -spec.length * 0.32) return;
    const occupant = pickOccupant(vehicle);
    if (!occupant || occupant === shooter || occupant.alive === false) return;
    if (Math.random() > CABIN_HIT_CHANCE) return;
    out.kind = 'character';
    out.target = occupant;
    out.vehicle = vehicle;
    out.throughGlass = true;
  }

  /** The chest of a person (or the middle of the car they ride in), for aiming. */
  function chestPoint(character, out) {
    if (character.vehicle && character.vehicle.pos) {
      const v = character.vehicle;
      return out.set(v.pos.x, v.pos.y + (v.spec ? v.spec.height * 0.62 : 1), v.pos.z);
    }
    const h = isDown(character) ? 0.3 : heightOf(character) * (character.intent && character.intent.crouch ? 0.5 : CHEST_SHARE);
    return out.set(character.pos.x, character.pos.y + h, character.pos.z);
  }

  return { traceShot, chestPoint, isDown, heightOf, trace: defaultTrace, makeTrace };
}

/** A fresh trace record (for callers that keep two traces at once). */
function makeTrace() {
  return {
    kind: null, target: null, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0,
    headshot: false, damageScale: 1, throughGlass: false, vehicle: null,
  };
}

/** True when a person is on the ground (ragdolled, getting up, or dead). */
export function isDown(character) {
  const state = character.state;
  return state === 'ragdoll' || state === 'getUp' || state === 'dead';
}

/** A person's height in metres, from their build. */
export function heightOf(character) {
  const build = character.look && character.look.build;
  return 1.78 * (build && build.height ? build.height : 1);
}

/**
 * Distance along the ray to a person's capsule (a vertical cylinder from the feet to the top of the
 * head, lower and wider when they are down), or Infinity. Writes the surface normal into `out`.
 */
function rayPerson(person, ox, oy, oz, dx, dy, dz, maxT, out) {
  const down = isDown(person);
  const crouch = !down && person.intent && person.intent.crouch;
  const radius = down ? DOWN_RADIUS : PERSON_RADIUS;
  const y0 = person.pos.y;
  const y1 = y0 + (down ? DOWN_HEIGHT : heightOf(person) * (crouch ? 0.68 : 1));
  const fx = ox - person.pos.x;
  const fz = oz - person.pos.z;
  const a = dx * dx + dz * dz;
  const b = fx * dx + fz * dz;
  const c = fx * fx + fz * fz - radius * radius;
  let t0;
  let t1;
  if (a < 1e-9) {
    if (c > 0) return Infinity;
    t0 = -Infinity;
    t1 = Infinity;
  } else {
    const disc = b * b - a * c;
    if (disc < 0) return Infinity;
    const root = Math.sqrt(disc);
    t0 = (-b - root) / a;
    t1 = (-b + root) / a;
  }
  let ty0;
  let ty1;
  if (Math.abs(dy) < 1e-9) {
    if (oy < y0 || oy > y1) return Infinity;
    ty0 = -Infinity;
    ty1 = Infinity;
  } else {
    ty0 = (y0 - oy) / dy;
    ty1 = (y1 - oy) / dy;
    if (ty0 > ty1) {
      const swap = ty0;
      ty0 = ty1;
      ty1 = swap;
    }
  }
  const enter = t0 > ty0 ? t0 : ty0;
  const exit = t1 < ty1 ? t1 : ty1;
  if (enter > exit || exit < 0) return Infinity;
  const t = enter > 0 ? enter : 0;
  if (t >= maxT) return Infinity;
  if (enter === t0) {
    const hx = fx + dx * t;
    const hz = fz + dz * t;
    const len = Math.sqrt(hx * hx + hz * hz) || 1;
    out.nx = hx / len;
    out.ny = 0;
    out.nz = hz / len;
  } else {
    out.nx = 0;
    out.ny = dy > 0 ? -1 : 1;
    out.nz = 0;
  }
  return t;
}

/**
 * Distance along the ray to a vehicle's body (a box of its length, width and height, turned to its
 * heading, from just above the road to the roof), or Infinity. Writes the surface normal into `out`.
 */
function rayVehicle(vehicle, ox, oy, oz, dx, dy, dz, maxT, out) {
  const spec = vehicle.spec;
  const s = Math.sin(vehicle.heading);
  const c = Math.cos(vehicle.heading);
  const rx = ox - vehicle.pos.x;
  const rz = oz - vehicle.pos.z;
  // Local frame: x to the vehicle's left, z forward, y up.
  const lx = rx * c - rz * s;
  const lz = rx * s + rz * c;
  const ly = oy - vehicle.pos.y;
  const ldx = dx * c - dz * s;
  const ldz = dx * s + dz * c;
  const ldy = dy;
  const hw = spec.width * 0.5;
  const hl = spec.length * 0.5;
  const yLow = 0.22;
  const yHigh = spec.height;
  let near = -Infinity;
  let far = Infinity;
  let axis = 0;
  let sign = 1;
  // X slab
  if (Math.abs(ldx) < 1e-9) {
    if (lx < -hw || lx > hw) return Infinity;
  } else {
    let t1 = (-hw - lx) / ldx;
    let t2 = (hw - lx) / ldx;
    let n = -1;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
      n = 1;
    }
    if (t1 > near) {
      near = t1;
      axis = 0;
      sign = n;
    }
    if (t2 < far) far = t2;
  }
  // Y slab
  if (Math.abs(ldy) < 1e-9) {
    if (ly < yLow || ly > yHigh) return Infinity;
  } else {
    let t1 = (yLow - ly) / ldy;
    let t2 = (yHigh - ly) / ldy;
    let n = -1;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
      n = 1;
    }
    if (t1 > near) {
      near = t1;
      axis = 1;
      sign = n;
    }
    if (t2 < far) far = t2;
  }
  // Z slab
  if (Math.abs(ldz) < 1e-9) {
    if (lz < -hl || lz > hl) return Infinity;
  } else {
    let t1 = (-hl - lz) / ldz;
    let t2 = (hl - lz) / ldz;
    let n = -1;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
      n = 1;
    }
    if (t1 > near) {
      near = t1;
      axis = 2;
      sign = n;
    }
    if (t2 < far) far = t2;
  }
  if (near > far || far < 0) return Infinity;
  const t = near > 0 ? near : 0;
  if (t >= maxT) return Infinity;
  // Back to world space: local x is the left (c, -s), local z the forward (s, c).
  if (axis === 0) {
    out.nx = sign * c;
    out.ny = 0;
    out.nz = -sign * s;
  } else if (axis === 1) {
    out.nx = 0;
    out.ny = sign;
    out.nz = 0;
  } else {
    out.nx = sign * s;
    out.ny = 0;
    out.nz = sign * c;
  }
  return t;
}

/** Whoever a round through the windows finds: usually the driver, sometimes a passenger. */
function pickOccupant(vehicle) {
  const passengers = vehicle.passengers;
  if (passengers && passengers.length > 0 && Math.random() < 0.3) {
    const p = passengers[Math.floor(Math.random() * passengers.length)];
    if (p) return p;
  }
  return vehicle.driver || null;
}
