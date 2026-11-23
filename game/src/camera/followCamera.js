// The camera of KHAMSIN: an over-the-shoulder camera on foot, a chase camera behind the wheel
// that swings with the car and pulls back with speed, mouse look, collision with walls, shake on
// impacts, and a cinematic mode for the title screen and cutscenes. Becomes game.cameraRig.
import * as THREE from 'three';

const CAMERA_DISTANCES = [1, 1.45, 0.72];

/** Build the camera rig; main.js calls update(dt) after everything has moved. */
export function createFollowCamera(game) {
  const { clamp, damp, dampAngle, angleDelta, lerp } = game.math;
  const camera = game.camera;
  const baseFov = game.config.render.fieldOfView;
  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const position = new THREE.Vector3().copy(camera.position);
  let lastManualLook = -10;
  let trauma = 0;
  let distanceIndex = 0;
  let currentDistance = 5;
  let currentFov = baseFov;
  let aimBlend = 0;
  let cinematic = null;
  let snapNext = true;

  const rig = {
    /** The heading the camera looks along (0 faces +Z); the player's movement is relative to it. */
    yaw: 0,
    /** Tilt: 0 is level, positive looks down from above. */
    pitch: 0.22,
    /** The point the camera follows, for the sun's shadow box and for audio. */
    focus: new THREE.Vector3(),
    lookBehind: false,
    /** Add impact shake, 0..1. */
    shake(strength) {
      trauma = Math.min(1, trauma + strength);
    },
    /** Jump straight to the follow position on the next frame (after a respawn or a cutscene). */
    snap() {
      snapNext = true;
    },
    /** Point the camera along a heading at once. */
    setYaw(yaw) {
      rig.yaw = yaw;
      lastManualLook = -10;
    },
    /**
     * Take the camera away from the player: { position, lookAt, fov } for a fixed shot, or
     * { orbit: {x, y, z}, radius, height, speed, fov } for a slow circling shot; null gives it back.
     */
    setCinematic(shot) {
      cinematic = shot;
      if (!shot) snapNext = true;
    },
    get isCinematic() {
      return cinematic !== null;
    },
    update,
  };

  /** Mouse look, follow the player or the vehicle, avoid walls, apply shake. */
  function update(dt) {
    if (cinematic) {
      updateCinematic(dt);
      return;
    }
    const player = game.player;
    if (!player || !player.character) return;
    const vehicle = player.vehicle;
    const input = game.input;
    const settings = game.settings || {};
    const sensitivity = 0.0026 * (settings.mouseSensitivity || 1);

    if (input.enabled && (input.lookX !== 0 || input.lookY !== 0)) {
      rig.yaw -= input.lookX * sensitivity;
      rig.pitch = clamp(rig.pitch + input.lookY * sensitivity * (settings.invertY ? -1 : 1), -0.32, 1.25);
      lastManualLook = game.time.elapsed;
    }
    if (input.pressed('changeCamera')) distanceIndex = (distanceIndex + 1) % CAMERA_DISTANCES.length;
    const sinceLook = game.time.elapsed - lastManualLook;

    let distance;
    let height;
    let shoulder = 0;
    let fov = baseFov;
    if (vehicle) {
      const spec = vehicle.spec;
      const speed = Math.abs(vehicle.speed);
      // Swing behind the car when the mouse is idle, leading a little into the turn.
      if (sinceLook > 1.1) {
        const wanted = vehicle.heading + (vehicle.speed < -2 ? Math.PI : 0) - clamp(vehicle.yawRate * 0.22, -0.4, 0.4);
        rig.yaw = dampAngle(rig.yaw, wanted, 2.2 + Math.min(speed, 30) * 0.12, dt);
        rig.pitch = damp(rig.pitch, 0.2, 1.5, dt);
      }
      distance = (spec.length * 1.15 + 3.6 + speed * 0.045) * CAMERA_DISTANCES[distanceIndex];
      height = spec.height * 0.55 + 0.9;
      fov = baseFov + clamp(speed / 60, 0, 1) * 16;
      target.copy(vehicle.pos);
      target.y += height;
    } else {
      const character = player.character;
      const aiming = character.state === 'aim' || (character.intent && character.intent.aim);
      aimBlend = damp(aimBlend, aiming ? 1 : 0, 10, dt);
      const moving = Math.abs(character.vel.x) + Math.abs(character.vel.z) > 1.2;
      // Without the mouse the camera drifts round behind the way the player walks.
      if (sinceLook > 2.2 && moving && !aiming && !input.pointerLocked) {
        rig.yaw = dampAngle(rig.yaw, character.heading, 1.6, dt);
      }
      distance = lerp(4.4, 2.3, aimBlend) * CAMERA_DISTANCES[distanceIndex];
      shoulder = lerp(0.35, 0.62, aimBlend);
      fov = lerp(baseFov, 48, aimBlend);
      target.copy(character.pos);
      target.y += lerp(1.55, 1.62, aimBlend);
    }
    rig.focus.copy(target);

    const yaw = rig.yaw + (rig.lookBehind ? Math.PI : 0);
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const cosPitch = Math.cos(rig.pitch);
    const sinPitch = Math.sin(rig.pitch);
    // The camera sits behind and above the target, shifted to the right shoulder on foot.
    rayDirection.set(-forwardX * cosPitch - forwardZ * shoulder * 0.2, sinPitch, -forwardZ * cosPitch + forwardX * shoulder * 0.2).normalize();
    let reach = distance;
    const hit = game.colliders ? game.colliders.raycast(target, rayDirection, distance + 0.4) : null;
    if (hit) reach = Math.max(0.6, hit.distance - 0.35);
    currentDistance = reach < currentDistance ? reach : damp(currentDistance, reach, 6, dt);
    desired.copy(target).addScaledVector(rayDirection, currentDistance);
    desired.x += -forwardZ * shoulder;
    desired.z += forwardX * shoulder;
    const ground = game.terrain ? game.terrain.heightAt(desired.x, desired.z) : 0;
    if (desired.y < ground + 0.35) desired.y = ground + 0.35;

    if (snapNext) {
      position.copy(desired);
      snapNext = false;
    } else {
      const follow = vehicle ? 14 : 18;
      position.x = damp(position.x, desired.x, follow, dt);
      position.y = damp(position.y, desired.y, follow * 0.7, dt);
      position.z = damp(position.z, desired.z, follow, dt);
    }
    camera.position.copy(position);
    lookPoint.copy(target);
    lookPoint.x += forwardX * 6 - forwardZ * shoulder;
    lookPoint.z += forwardZ * 6 + forwardX * shoulder;
    lookPoint.y += 6 * (0.16 - sinPitch * 0.75);
    applyShake(dt);
    camera.lookAt(lookPoint);
    currentFov = damp(currentFov, fov, 5, dt);
    if (Math.abs(camera.fov - currentFov) > 0.02) {
      camera.fov = currentFov;
      camera.updateProjectionMatrix();
    }
  }

  let orbitAngle = 0;
  function updateCinematic(dt) {
    const shot = cinematic;
    if (shot.orbit) {
      orbitAngle += (shot.speed || 0.05) * dt;
      camera.position.set(shot.orbit.x + Math.sin(orbitAngle) * shot.radius, shot.orbit.y + shot.height, shot.orbit.z + Math.cos(orbitAngle) * shot.radius);
      lookPoint.set(shot.orbit.x, shot.orbit.y, shot.orbit.z);
    } else {
      camera.position.set(shot.position.x, shot.position.y, shot.position.z);
      lookPoint.set(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z);
    }
    rig.focus.copy(lookPoint);
    position.copy(camera.position);
    applyShake(dt);
    camera.lookAt(lookPoint);
    const fov = shot.fov || baseFov;
    if (Math.abs(camera.fov - fov) > 0.02) {
      camera.fov = fov;
      currentFov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function applyShake(dt) {
    if (trauma <= 0) return;
    const amount = trauma * trauma;
    const t = game.time.elapsed * 38;
    camera.position.x += Math.sin(t * 1.3) * amount * 0.35;
    camera.position.y += Math.sin(t * 1.7 + 2) * amount * 0.28;
    camera.position.z += Math.sin(t * 1.1 + 4) * amount * 0.35;
    lookPoint.x += Math.sin(t * 0.9 + 1) * amount * 0.5;
    lookPoint.y += Math.sin(t * 1.5 + 3) * amount * 0.4;
    trauma = Math.max(0, trauma - dt * 1.6);
  }

  return rig;
}
