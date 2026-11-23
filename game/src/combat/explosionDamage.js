// What a blast does in Port Sarab: everyone in its radius is hurt and thrown away from the centre,
// less with distance and hardly at all behind a wall; vehicles take damage (and may go up in turn) and
// are shoved outward. Blasts set off elsewhere (a gas can, a mission charge) hurt here too, once; an
// exploding car already throws its own blast, so its 'explosion' event is heard but not doubled.
import * as THREE from 'three';
import { blastStrength, blastDamageAtDistance } from './combatRules.js';

/** Damage at the centre of a blast that arrives as a bare 'explosion' event with no damage figure. */
const DEFAULT_EVENT_DAMAGE = 140;
/** How much harder a blast hits a vehicle's hit points than a person's. */
const VEHICLE_DAMAGE_SCALE = 6;
/** Speed (m/s) a blast gives a vehicle at its centre, scaled by mass below. */
const VEHICLE_SHOVE = 9;

/**
 * Create the blast rules and start listening for other systems' explosions.
 * `hooks.onHit(source, target, amount)` lets the weapon system keep its statistics.
 * @returns {{explode: Function, applyBlast: Function}}
 */
export function createExplosionDamage(game, grid, ballistics, hooks = {}) {
  const nearby = [];
  const centre = new THREE.Vector3();
  const body = new THREE.Vector3();
  const damageInfo = { source: null, weaponId: 'explosion', dirX: 0, dirZ: 0, headshot: false, kind: 'explosion' };
  const vehicleInfo = { source: null, kind: 'explosion', x: 0, z: 0 };
  const knockInfo = { source: null };

  /**
   * Set off a blast at (x, y, z): emits 'explosion' {x, y, z, radius, source} for the effects and the
   * audio, then hurts and throws everything within `radius` metres. `damage` is what a person standing
   * at the very centre would take.
   */
  function explode(x, y, z, radius = 6, damage = 150, source = null) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const groundY = game.terrain ? game.terrain.heightAt(x, z) : 0;
    const height = Number.isFinite(y) ? y : groundY + 0.5;
    game.events.emit('explosion', { x, y: height, z, radius, source, damage, blastApplied: true, fromWeapons: true });
    applyBlast(x, height, z, radius, damage, source);
  }

  /** The harm of a blast, without the event: people, then vehicles. */
  function applyBlast(x, y, z, radius, damage, source) {
    centre.set(x, y + 0.35, z);
    hurtPeople(x, z, radius, damage, source);
    shoveVehicles(x, z, radius, damage, source);
  }

  function hurtPeople(x, z, radius, damage, source) {
    const characters = game.characters;
    if (!characters) return;
    grid.gatherNear(x, z, radius + 1, nearby, grid.PEOPLE);
    for (let i = 0; i < nearby.length; i += 1) {
      const person = nearby[i];
      if (!person || person.alive === false || person.despawned) continue;
      if (person.vehicle) continue;
      const dx = person.pos.x - x;
      const dz = person.pos.z - z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance >= radius) continue;
      ballistics.chestPoint(person, body);
      const covered = game.colliders ? !game.colliders.lineOfSight(centre, body) : false;
      const nx = distance > 0.05 ? dx / distance : 1;
      const nz = distance > 0.05 ? dz / distance : 0;
      const amount = blastDamageAtDistance(damage, distance, radius, covered);
      if (amount > 0.5 && characters.damage) {
        // The character system throws whoever survives an explosion's damage away along (dirX, dirZ),
        // harder for a bigger hit, and launches whoever it kills.
        damageInfo.source = source;
        damageInfo.dirX = nx;
        damageInfo.dirZ = nz;
        characters.damage(person, amount, damageInfo);
        damageInfo.source = null;
        if (hooks.onHit) hooks.onHit(source, person, amount);
      } else if (!covered && characters.knockDown) {
        knockInfo.source = source;
        characters.knockDown(person, nx * 3.5, 2, nz * 3.5, knockInfo);
        knockInfo.source = null;
      }
    }
    nearby.length = 0;
  }

  function shoveVehicles(x, z, radius, damage, source) {
    const vehicles = game.vehicles;
    if (!vehicles) return;
    grid.gatherNear(x, z, radius + 4, nearby, grid.VEHICLES);
    for (let i = 0; i < nearby.length; i += 1) {
      const vehicle = nearby[i];
      if (!vehicle || vehicle.despawned || !vehicle.spec) continue;
      const dx = vehicle.pos.x - x;
      const dz = vehicle.pos.z - z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const reach = radius + vehicle.spec.width * 0.5;
      if (distance >= reach) continue;
      const strength = blastStrength(distance, reach);
      const nx = distance > 0.05 ? dx / distance : 1;
      const nz = distance > 0.05 ? dz / distance : 0;
      if (vehicles.applyImpulse) {
        const mass = vehicle.spec.mass || 1500;
        const impulse = mass * VEHICLE_SHOVE * strength * Math.min(1, 1800 / mass);
        // Off-centre, so it slews round as well as sliding away.
        vehicles.applyImpulse(vehicle, nx * impulse, nz * impulse, vehicle.pos.x - nz * 0.7, vehicle.pos.z + nx * 0.7);
        if (vehicle.vel) vehicle.vel.y += 3.5 * strength * Math.min(1, 1600 / mass);
      }
      if (vehicles.applyDamage) {
        vehicleInfo.source = source;
        vehicleInfo.x = x;
        vehicleInfo.z = z;
        const amount = damage * VEHICLE_DAMAGE_SCALE * strength;
        vehicles.applyDamage(vehicle, amount, vehicleInfo);
        vehicleInfo.source = null;
        if (hooks.onHit) hooks.onHit(source, vehicle, amount);
      }
    }
    nearby.length = 0;
  }

  /** Another system's 'explosion': hurt with it unless its own blast was already applied. */
  function onExplosion(event) {
    if (!event || event.fromWeapons || event.blastApplied) return;
    if (!Number.isFinite(event.x) || !Number.isFinite(event.z)) return;
    if (event.combatHandled) return;
    event.combatHandled = true;
    const radius = Number.isFinite(event.radius) ? event.radius : 6;
    const damage = Number.isFinite(event.damage) ? event.damage : DEFAULT_EVENT_DAMAGE;
    const y = Number.isFinite(event.y) ? event.y : (game.terrain ? game.terrain.heightAt(event.x, event.z) : 0) + 0.5;
    applyBlast(event.x, y, event.z, radius, damage, event.source || null);
  }

  game.events.on('explosion', onExplosion);

  return { explode, applyBlast };
}
