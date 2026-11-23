// PSPD stinger strips: a flat chain of steel teeth laid across the gap of a roadblock. Any car but a
// police one whose wheels roll over it bursts its tyres (it limps on its rims from then on: the
// vehicle physics reads tags.tyresBurst), throws a shower of sparks and takes a hard knock.
// One instanced mesh draws every strip in town.
import * as THREE from 'three';
import { buildSpikeLinkGeometry, SPIKE_LINK_LENGTH } from './roadblockPropGeometry.js';

const CAPACITY = 64;
const BURST_DAMAGE = 60;

/**
 * Create the spike strips.
 * @returns {{list: Object[], lay: Function, remove: Function, clear: Function, update: Function}}
 */
export function createSpikeStrips(game) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(buildSpikeLinkGeometry(), material, CAPACITY);
  mesh.name = 'spike strips';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  game.scene.add(mesh);
  const used = new Uint8Array(CAPACITY);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const burstEvent = { vehicle: null, strip: null, x: 0, z: 0 };
  const sparkOptions = { count: 16, dirY: 2.5, speed: 7 };
  const smokeOptions = { count: 3 };
  const damageInfo = { kind: 'crash', source: null };
  for (let i = 0; i < CAPACITY; i += 1) hide(i);
  mesh.instanceMatrix.needsUpdate = true;

  const strips = {
    /** Every strip lying on the road: {x, z, axisX, axisZ, length, links, bursts}. */
    list: [],
    lay,
    remove,
    clear,
    update,
    mesh,
  };

  /**
   * Lay a strip centred at (x, z), running along the unit direction (axisX, axisZ), `length` metres long.
   * Returns the strip, or null when there are not enough links left.
   */
  function lay(x, z, axisX, axisZ, length) {
    const count = Math.max(2, Math.round(length / SPIKE_LINK_LENGTH));
    const links = [];
    for (let i = 0; i < CAPACITY && links.length < count; i += 1) if (!used[i]) links.push(i);
    if (links.length < count) return null;
    const norm = Math.hypot(axisX, axisZ) || 1;
    const ax = axisX / norm;
    const az = axisZ / norm;
    const strip = {
      x, z, axisX: ax, axisZ: az, normalX: -az, normalZ: ax,
      length: count * SPIKE_LINK_LENGTH, halfLength: (count * SPIKE_LINK_LENGTH) / 2, links, bursts: 0,
    };
    // A link's own X runs along the strip: heading yaw such that (cos yaw, -sin yaw) = (ax, az).
    rotation.setFromAxisAngle(yAxis, Math.atan2(-az, ax));
    for (let k = 0; k < count; k += 1) {
      const along = (k + 0.5) * SPIKE_LINK_LENGTH - strip.halfLength;
      const px = x + ax * along;
      const pz = z + az * along;
      position.set(px, groundAt(px, pz) + 0.01, pz);
      matrix.compose(position, rotation, one);
      used[links[k]] = 1;
      mesh.setMatrixAt(links[k], matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    strips.list.push(strip);
    return strip;
  }

  /** Pick a strip up off the road. */
  function remove(strip) {
    const index = strips.list.indexOf(strip);
    if (index === -1) return;
    strips.list.splice(index, 1);
    for (const link of strip.links) {
      used[link] = 0;
      hide(link);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function clear() {
    while (strips.list.length) remove(strips.list[strips.list.length - 1]);
  }

  /** Check every wheel near a strip; a wheel on the teeth bursts the tyres. */
  function update(dt) {
    if (!(dt > 0) || strips.list.length === 0 || !game.vehicles) return;
    const vehicles = game.vehicles.list;
    for (let s = 0; s < strips.list.length; s += 1) {
      const strip = strips.list[s];
      const reach = strip.halfLength + 5;
      for (let i = 0; i < vehicles.length; i += 1) {
        const vehicle = vehicles[i];
        if (vehicle.tags.tyresBurst || isPoliceVehicle(vehicle)) continue;
        const dx = vehicle.pos.x - strip.x;
        const dz = vehicle.pos.z - strip.z;
        if (dx * dx + dz * dz > reach * reach) continue;
        const speed = Math.abs(vehicle.speed || 0);
        if (speed < 1) continue;
        checkWheels(vehicle, strip, 0.22 + speed * dt);
      }
    }
  }

  /** Any of the four wheels within `band` of the strip's centre line, and along its length? */
  function checkWheels(vehicle, strip, band) {
    const spec = vehicle.spec || { track: 1.6, wheelbase: 2.7 };
    const h = vehicle.heading;
    const s = Math.sin(h);
    const c = Math.cos(h);
    for (let w = 0; w < 4; w += 1) {
      const side = (w % 2 === 0 ? 1 : -1) * spec.track * 0.5;
      const along = (w < 2 ? 1 : -1) * spec.wheelbase * 0.5;
      // Left is (cos h, -sin h); forward is (sin h, cos h).
      const wx = vehicle.pos.x + c * side + s * along;
      const wz = vehicle.pos.z - s * side + c * along;
      const rx = wx - strip.x;
      const rz = wz - strip.z;
      const onStrip = Math.abs(rx * strip.axisX + rz * strip.axisZ) <= strip.halfLength + 0.1;
      const crossing = Math.abs(rx * strip.normalX + rz * strip.normalZ) <= band;
      if (onStrip && crossing) {
        burstTyres(vehicle, strip, wx, wz);
        return;
      }
    }
  }

  function burstTyres(vehicle, strip, x, z) {
    vehicle.tags.tyresBurst = true;
    strip.bursts += 1;
    burstEvent.vehicle = vehicle;
    burstEvent.strip = strip;
    burstEvent.x = x;
    burstEvent.z = z;
    game.events.emit('vehicle:tyresBurst', burstEvent);
    const y = groundAt(x, z) + 0.3;
    game.effects?.spawn?.('sparks', x, y, z, sparkOptions);
    game.effects?.spawn?.('tyreSmoke', x, y, z, smokeOptions);
    game.audio?.play?.('tyreBurst', { x, y, z });
    game.vehicles.applyDamage(vehicle, BURST_DAMAGE, damageInfo);
  }

  function hide(index) {
    matrix.compose(zero, rotation.identity(), zero);
    mesh.setMatrixAt(index, matrix);
  }

  function groundAt(x, z) {
    return game.terrain ? game.terrain.heightAt(x, z) : 0;
  }

  return strips;
}

/** Police cars run on run-flat tyres: the strips are theirs. */
function isPoliceVehicle(vehicle) {
  const kind = vehicle.spec && vehicle.spec.className;
  return vehicle.faction === 'police' || kind === 'police' || kind === 'policeSuv';
}
