// What a PSPD driver watches for besides the suspect: people stepping into the road (he brakes for
// them below four stars), slower civilian cars in his lane (he swings out past them), and buildings,
// walls and containers coming up on either side of the bonnet (he steers away from them).
import * as THREE from 'three';

/** Length of the wall feelers: a few metres plus half a second of travel, at most this. */
const FEELER_MAX = 28;
/** Angle of each feeler off the car's heading (radians). */
const FEELER_ANGLE = 0.33;

/**
 * Build the hazard checks shared by every police car.
 * @param {Object} game
 */
export function createPoliceDrivingHazards(game) {
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();

  /**
   * Below four stars: brake for people in the road and swing out past slower civilian cars. Writes
   * drive.obstacleBrake (0..1) and, for a swerve, drive.dodge (metres to the right) until drive.dodgeUntil.
   */
  function checkObstacles(unit, ctx) {
    const drive = unit.drive;
    const vehicle = unit.vehicle;
    drive.obstacleBrake = 0;
    const speed = Math.abs(vehicle.speed);
    const autopilot = game.vehicles && game.vehicles.autopilot;
    if (ctx.level >= 4 || speed < 2 || !autopilot) return;
    const ahead = autopilot.obstacleAhead(vehicle, 6 + speed * 0.8);
    if (ahead.character) {
      const person = ahead.character;
      if (person !== ctx.playerCharacter && person.kind !== 'officer' && ahead.distance < speed * 0.6 + 3) {
        drive.obstacleBrake = ctx.level <= 2 ? 1 : 0.5;
      }
    } else if (ahead.vehicle && ctx.level <= 3) {
      const other = ahead.vehicle;
      if (other === ctx.playerVehicle || other.faction === 'police') return;
      if (ahead.distance < 5 + speed * 0.35 && speed > Math.abs(other.speed) + 2) {
        const s = Math.sin(vehicle.heading);
        const c = Math.cos(vehicle.heading);
        const right = (other.pos.x - vehicle.pos.x) * -c + (other.pos.z - vehicle.pos.z) * s;
        drive.dodge = right > 0 ? -3.4 : 3.4;
        drive.dodgeUntil = ctx.now + 0.7;
      }
    }
  }

  /**
   * Two feelers off the front bumper: a building, wall or container close ahead on one side turns
   * the wheel the other way (lamp posts and palms are ignored: a police car can take them down).
   * Returns the steering to add, scaled by `strength`.
   */
  function feelForWalls(vehicle, strength) {
    const colliders = game.colliders;
    const speed = Math.abs(vehicle.speed);
    if (!colliders || speed < 3) return 0;
    const profile = vehicle.dynamics.profile;
    const reach = Math.min(FEELER_MAX, 4 + speed * 0.5);
    const h = vehicle.heading;
    rayOrigin.set(vehicle.pos.x + Math.sin(h) * profile.halfLength, vehicle.pos.y + 0.7, vehicle.pos.z + Math.cos(h) * profile.halfLength);
    const left = probe(colliders, h + FEELER_ANGLE, reach);
    const right = probe(colliders, h - FEELER_ANGLE, reach);
    let steer = 0;
    if (left < reach) steer += (1 - left / reach) * 1.1;
    if (right < reach) steer -= (1 - right / reach) * 1.1;
    return Math.max(-0.9, Math.min(0.9, steer * strength));
  }

  /** Distance to the first solid thing along one feeler, or `reach` when it is clear. */
  function probe(colliders, angle, reach) {
    rayDirection.set(Math.sin(angle), 0, Math.cos(angle));
    const hit = colliders.raycast(rayOrigin, rayDirection, reach);
    if (!hit || !hit.collider || hit.collider.type === 'post') return reach;
    return hit.distance;
  }

  return { checkObstacles, feelForWalls };
}
