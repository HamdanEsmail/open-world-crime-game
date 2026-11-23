// Shaheen-1's door gunner. At five stars, while the helicopter is on station with the suspect in
// sight, a marksman in the open side door facing the chase fires short rifle bursts at the
// suspect's car or at the suspect on foot. Shots from a moving aircraft at a moving target scatter,
// so most miss; the ones that land hurt, but never all at once.
import * as THREE from 'three';
import { DOOR_LEFT, DOOR_RIGHT } from './helicopterModel.js';
import { doorGunnerFiresAtStars } from './policeHeavyResponseRules.js';

const RANGE = 140;
const SHOT_INTERVAL = 0.095;
const BURST_MIN = 4;
const BURST_EXTRA = 3;
const PAUSE_MIN = 2.4;
const PAUSE_EXTRA = 1.8;
/** Damage per hit: a car soaks a few bursts, a person on foot many seconds of them. */
const VEHICLE_DAMAGE = [10, 16];
const PERSON_DAMAGE = [4, 7];

/**
 * Create the gunner for a helicopter (it reads helicopter.position, heading, state and seesPlayer).
 * @returns {{update: (dt:number) => void, firing: boolean, shotsFired: number, enabled: boolean}}
 */
export function createHelicopterDoorGunner(game, helicopter) {
  const gunner = { update, firing: false, shotsFired: 0, hits: 0, enabled: true };
  let pauseTimer = 2;
  let shotTimer = 0;
  let burstLeft = 0;
  const muzzle = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const shot = {
    shooter: null, weaponId: 'rifle', x: 0, y: 0, z: 0, dirX: 0, dirY: 0, dirZ: 0,
    hitX: 0, hitY: 0, hitZ: 0, hit: false, source: 'helicopter', helicopter,
  };
  const damageInfo = { source: null, kind: 'bullet', weaponId: 'rifle', x: 0, z: 0, dirX: 0, dirZ: 0 };

  /** Fire in bursts while the conditions hold; rest between them. */
  function update(dt) {
    gunner.firing = false;
    if (!gunner.enabled || !ready()) {
      burstLeft = 0;
      pauseTimer = Math.max(pauseTimer, 1.2);
      return;
    }
    if (burstLeft > 0) {
      gunner.firing = true;
      shotTimer -= dt;
      if (shotTimer <= 0) {
        shotTimer += SHOT_INTERVAL;
        burstLeft -= 1;
        fireOneShot();
      }
      return;
    }
    pauseTimer -= dt;
    if (pauseTimer <= 0) {
      burstLeft = BURST_MIN + Math.floor(Math.random() * (BURST_EXTRA + 1));
      shotTimer = 0;
      pauseTimer = PAUSE_MIN + Math.random() * PAUSE_EXTRA;
    }
  }

  /** Five stars, on station, eyes on the suspect, in range, and a live target. */
  function ready() {
    const level = game.wanted && typeof game.wanted.level === 'number' ? game.wanted.level : 0;
    if (!doorGunnerFiresAtStars(level) || helicopter.state !== 'onStation' || !helicopter.seesPlayer || helicopter.staged) return false;
    const player = game.player;
    if (!player || !player.character || player.state === 'down' || player.character.alive === false) return false;
    return helicopter.distanceToPlayer < RANGE;
  }

  /** One round from the door that faces the suspect, scattered around where the target will be. */
  function fireOneShot() {
    const player = game.player;
    const vehicle = player.vehicle;
    const character = player.character;
    const target = vehicle || character;
    const pos = helicopter.position;
    const h = helicopter.heading;
    const sin = Math.sin(h);
    const cos = Math.cos(h);
    // Left of the airframe is (cos h, 0, -sin h): pick the door on the suspect's side.
    const towardX = target.pos.x - pos.x;
    const towardZ = target.pos.z - pos.z;
    const door = towardX * cos - towardZ * sin >= 0 ? DOOR_LEFT : DOOR_RIGHT;
    muzzle.set(pos.x + door.x * cos + door.z * sin, pos.y + door.y, pos.z - door.x * sin + door.z * cos);

    const vel = target.vel;
    const targetSpeed = vel ? Math.hypot(vel.x, vel.z) : 0;
    const centreHeight = vehicle ? (vehicle.spec ? vehicle.spec.height * 0.5 : 0.7) : 1.1;
    aimPoint.set(target.pos.x, target.pos.y + centreHeight, target.pos.z);
    if (vel) aimPoint.addScaledVector(vel, 0.06);
    const distance = muzzle.distanceTo(aimPoint);
    const spread = (vehicle ? 1.9 : 2.2) + distance * 0.014 + targetSpeed * 0.05;
    const angle = Math.random() * Math.PI * 2;
    const reach = spread * Math.sqrt(Math.random());
    aimPoint.x += Math.cos(angle) * reach;
    aimPoint.z += Math.sin(angle) * reach;
    aimPoint.y += (Math.random() - 0.5) * spread * 0.4;
    direction.subVectors(aimPoint, muzzle).normalize();

    const maxDistance = distance + 40;
    let landing = maxDistance;
    let struck = null;
    const world = game.colliders ? game.colliders.raycast(muzzle, direction, maxDistance) : null;
    if (world) landing = world.distance;
    const t = vehicle ? rayHitsVehicle(vehicle) : rayHitsPerson(character);
    if (t >= 0 && t < landing) {
      landing = t;
      struck = target;
    }
    hitPoint.copy(muzzle).addScaledVector(direction, landing);

    shot.x = muzzle.x;
    shot.y = muzzle.y;
    shot.z = muzzle.z;
    shot.dirX = direction.x;
    shot.dirY = direction.y;
    shot.dirZ = direction.z;
    shot.hitX = hitPoint.x;
    shot.hitY = hitPoint.y;
    shot.hitZ = hitPoint.z;
    shot.hit = struck || (world ? true : false);
    gunner.shotsFired += 1;
    game.events.emit('shot:fired', shot);
    if (!struck) return;
    gunner.hits += 1;
    damageInfo.x = hitPoint.x;
    damageInfo.z = hitPoint.z;
    damageInfo.dirX = direction.x;
    damageInfo.dirZ = direction.z;
    if (vehicle) {
      game.vehicles?.applyDamage?.(vehicle, range(VEHICLE_DAMAGE), damageInfo);
    } else {
      game.characters?.damage?.(character, range(PERSON_DAMAGE), damageInfo);
    }
  }

  /** Distance along the shot to a car's body box (oriented by its heading), or -1. */
  function rayHitsVehicle(vehicle) {
    const spec = vehicle.spec || { width: 1.9, length: 4.6, height: 1.4 };
    const h = vehicle.heading;
    const s = Math.sin(h);
    const c = Math.cos(h);
    // Into the car's frame: x across (left +), y up, z forward.
    const ox = muzzle.x - vehicle.pos.x;
    const oy = muzzle.y - (vehicle.pos.y + spec.height * 0.5);
    const oz = muzzle.z - vehicle.pos.z;
    const lx = ox * c - oz * s;
    const lz = ox * s + oz * c;
    const dx = direction.x * c - direction.z * s;
    const dz = direction.x * s + direction.z * c;
    return slab(lx, oy, lz, dx, direction.y, dz, spec.width / 2, spec.height / 2, spec.length / 2);
  }

  /** Distance along the shot to a standing person (a box 0.9 m wide, 1.8 m tall), or -1. */
  function rayHitsPerson(character) {
    const ox = muzzle.x - character.pos.x;
    const oy = muzzle.y - (character.pos.y + 0.9);
    const oz = muzzle.z - character.pos.z;
    return slab(ox, oy, oz, direction.x, direction.y, direction.z, 0.45, 0.9, 0.45);
  }

  return gunner;
}

/** Ray against an axis-aligned box centred at the origin with half sizes (hx, hy, hz); entry distance or -1. */
function slab(ox, oy, oz, dx, dy, dz, hx, hy, hz) {
  slabNear = -Infinity;
  slabFar = Infinity;
  if (!clipSlab(ox, dx, hx) || !clipSlab(oy, dy, hy) || !clipSlab(oz, dz, hz)) return -1;
  if (slabFar < 0) return -1;
  return slabNear >= 0 ? slabNear : 0;
}

let slabNear = 0;
let slabFar = 0;

/** Narrow the ray's [near, far] interval by one pair of box faces; false when it misses. */
function clipSlab(o, d, h) {
  if (Math.abs(d) < 1e-9) return o >= -h && o <= h;
  let t1 = (-h - o) / d;
  let t2 = (h - o) / d;
  if (t1 > t2) {
    const swap = t1;
    t1 = t2;
    t2 = swap;
  }
  if (t1 > slabNear) slabNear = t1;
  if (t2 < slabFar) slabFar = t2;
  return slabNear <= slabFar;
}

function range(pair) {
  return pair[0] + Math.random() * (pair[1] - pair[0]);
}
