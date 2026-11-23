// What happens when a car knocks one of Port Sarab's props flat: the standing copy vanishes (with its
// glow and whatever hung from it) and a loose copy takes its place, a lamp post toppling over the way
// the car was going, a bin or a parasol flung tumbling down the road, bouncing and fading out. A
// hydrant leaves a fountain behind it. Out of sight, a minute later, the city quietly puts it back.
import * as THREE from 'three';
import { setRecordHidden } from './propInstancing.js';

const POOL_SIZE = 16;
const SETTLE_SECONDS = 4.5;
const FADE_SECONDS = 1.3;
const RESTORE_AFTER = 70;
const RESTORE_DISTANCE = 150;
const HYDRANT_SECONDS = 9;
const GRAVITY = 9.81;

/** Listen for 'prop:broken' and play out the falls. Returns { update(dt), knockOver(record, vx, vz), active }. */
export function createPropBreaking(game, kit) {
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i += 1) pool.push(makeLooseCopy(kit));
  const broken = [];
  const jets = [];
  const camera = new THREE.Vector3();
  const splashOptions = { count: 5, scale: 0.85, vx: 0, vz: 0 };
  let restoreClock = 0;

  game.events.on('prop:broken', (event) => {
    const collider = event && event.collider;
    const record = collider && collider.ref;
    if (!record || record.owner !== kit.owner || record.hidden) return;
    const vehicle = event.vehicle;
    const vx = Number.isFinite(event.vx) ? event.vx : vehicle && vehicle.vel ? vehicle.vel.x : 0;
    const vz = Number.isFinite(event.vz) ? event.vz : vehicle && vehicle.vel ? vehicle.vel.z : 0;
    knockOver(record, vx, vz);
  });

  /** Take a standing prop away and send a loose copy flying with the car's velocity (vx, vz). */
  function knockOver(record, vx, vz) {
    if (record.hidden) return;
    if (record.collider && game.colliders) game.colliders.remove(record.collider);
    setRecordHidden(record, true);
    record.brokenAt = game.time.elapsed;
    broken.push(record);
    const glows = game.effects && game.effects.glows;
    if (record.glows && glows) {
      for (const glow of record.glows) glows.remove(glow);
      record.glows = null;
    }
    if (record.def && record.def.water) jets.push({ x: record.x, y: record.y, z: record.z, left: HYDRANT_SECONDS, clock: 0 });
    const set = record.sets[0];
    const piece = pool.find((p) => !p.active) || pool.reduce((a, b) => (a.age > b.age ? a : b));
    if (set) launch(piece, record, set.sourceGeometry, vx, vz);
  }

  /** Start a loose copy: toppling about its foot, or thrown and spinning. */
  function launch(piece, record, geometry, vx, vz) {
    piece.active = true;
    piece.age = 0;
    piece.record = record;
    piece.mesh.geometry = geometry;
    piece.mesh.visible = true;
    piece.material.opacity = 1;
    piece.mesh.setColorAt(0, piece.color.setRGB(record.r, record.g, record.b));
    piece.mesh.instanceColor.needsUpdate = true;
    piece.baseQuaternion.setFromEuler(piece.euler.set(record.pitch, record.yaw, record.roll, 'YXZ'));
    piece.scale.set(record.sx, record.sy, record.sz);
    const def = record.def || { fall: 'fly', height: 1 };
    const speed = Math.hypot(vx, vz);
    const dirX = speed > 0.1 ? vx / speed : Math.sin(record.yaw + Math.PI);
    const dirZ = speed > 0.1 ? vz / speed : Math.cos(record.yaw + Math.PI);
    piece.height = def.height || 1;
    piece.mode = def.fall === 'topple' ? 'topple' : 'fly';
    if (piece.mode === 'topple') {
      piece.pivot.set(record.x, record.y, record.z);
      piece.axis.set(dirZ, 0, -dirX).normalize();
      piece.angle = 0.05;
      piece.angularSpeed = Math.min(3, 0.4 + speed / Math.max(2, piece.height) * 0.9);
      piece.slideX = dirX * Math.min(4, speed * 0.2);
      piece.slideZ = dirZ * Math.min(4, speed * 0.2);
    } else {
      const k = def.light ? 0.95 : def.heavy ? 0.35 : 0.7;
      piece.center.set(record.x, record.y + piece.height * 0.5, record.z);
      piece.velocity.set(vx * k + (Math.random() - 0.5) * 2, (def.heavy ? 1.5 : 3.2) + Math.random() * 2.5 + speed * 0.08, vz * k + (Math.random() - 0.5) * 2);
      piece.spinAxis.set(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize();
      piece.spin = (def.heavy ? 2 : 5) + Math.random() * 5;
      piece.turn.identity();
    }
    placePiece(piece);
  }

  /** Move the loose copies, run the hydrant fountains and put old breakages back out of sight. */
  function update(dt) {
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < pool.length; i += 1) {
      const piece = pool[i];
      if (!piece.active) continue;
      piece.age += step;
      if (piece.mode === 'topple') stepTopple(piece, step);
      else stepFlight(piece, step);
      if (piece.age > SETTLE_SECONDS) {
        const fade = 1 - (piece.age - SETTLE_SECONDS) / FADE_SECONDS;
        piece.material.opacity = Math.max(0, fade);
        if (fade <= 0) {
          piece.active = false;
          piece.mesh.visible = false;
        }
      }
      placePiece(piece);
    }
    for (let i = jets.length - 1; i >= 0; i -= 1) {
      const jet = jets[i];
      jet.left -= step;
      jet.clock -= step;
      if (jet.clock <= 0) {
        jet.clock = 0.09;
        splashOptions.count = jet.left > 2 ? 5 : 2;
        game.effects?.spawn?.('splash', jet.x, jet.y + 0.12, jet.z, splashOptions);
      }
      if (jet.left <= 0) jets.splice(i, 1);
    }
    restoreClock -= dt;
    if (restoreClock <= 0 && broken.length > 0) {
      restoreClock = 2;
      restoreOutOfSight();
    }
  }

  /** A post falling about its foot like a rod (gravity pulls harder the further it leans), bouncing once. */
  function stepTopple(piece, dt) {
    if (piece.angle < Math.PI / 2 || piece.angularSpeed < 0) {
      piece.angularSpeed += (1.5 * GRAVITY / Math.max(1, piece.height)) * Math.sin(Math.max(0.05, piece.angle)) * dt;
      piece.angle += piece.angularSpeed * dt;
      if (piece.angle >= Math.PI / 2) {
        piece.angle = Math.PI / 2;
        piece.angularSpeed = piece.angularSpeed > 1.2 ? -piece.angularSpeed * 0.22 : 0;
      }
    }
    const drag = Math.exp(-3 * dt);
    piece.pivot.x += piece.slideX * dt;
    piece.pivot.z += piece.slideZ * dt;
    piece.slideX *= drag;
    piece.slideZ *= drag;
  }

  function stepFlight(piece, dt) {
    const v = piece.velocity;
    v.y -= GRAVITY * dt;
    piece.center.addScaledVector(v, dt);
    piece.stepTurn.makeRotationAxis(piece.spinAxis, piece.spin * dt);
    piece.turn.premultiply(piece.stepTurn);
    const ground = game.terrain ? game.terrain.heightAt(piece.center.x, piece.center.z) : 0;
    const rest = ground + Math.max(0.15, piece.height * 0.3);
    if (piece.center.y < rest) {
      piece.center.y = rest;
      if (v.y < 0) v.y = -v.y * 0.32;
      v.x *= 0.62;
      v.z *= 0.62;
      piece.spin *= 0.55;
      if (Math.abs(v.y) < 0.6) v.y = 0;
    }
  }

  /** Write a loose copy's transform into its one-copy instance buffer. */
  function placePiece(piece) {
    const m = piece.matrix;
    if (piece.mode === 'topple') {
      piece.tilt.setFromAxisAngle(piece.axis, piece.angle);
      piece.quaternion.copy(piece.tilt).multiply(piece.baseQuaternion);
      m.compose(piece.pivot, piece.quaternion, piece.scale);
    } else {
      // Spin about the centre of mass: centre, turn, then the base back down by half the height.
      piece.quaternion.setFromRotationMatrix(piece.turn).multiply(piece.baseQuaternion);
      piece.offset.set(0, -piece.height * 0.5, 0).applyQuaternion(piece.quaternion);
      piece.position.copy(piece.center).add(piece.offset);
      m.compose(piece.position, piece.quaternion, piece.scale);
    }
    piece.mesh.setMatrixAt(0, m);
    piece.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Stand broken props up again once they have been down a while and nobody is watching. */
  function restoreOutOfSight() {
    if (!game.camera) return;
    game.camera.getWorldPosition(camera);
    for (let i = broken.length - 1; i >= 0; i -= 1) {
      const record = broken[i];
      if (game.time.elapsed - record.brokenAt < RESTORE_AFTER) continue;
      if (Math.hypot(record.x - camera.x, record.z - camera.z) < RESTORE_DISTANCE) continue;
      if (pool.some((p) => p.active && p.record === record)) continue;
      setRecordHidden(record, false);
      if (record.colliderSpec) record.collider = kit.addColliderFromSpec(record.colliderSpec, record);
      const glows = game.effects && game.effects.glows;
      if (record.glowSpecs && glows && typeof glows.add === 'function') {
        record.glows = [];
        for (const spec of record.glowSpecs) {
          const glow = glows.add({ x: spec.x, y: spec.y, z: spec.z, color: spec.color, size: spec.size, flicker: spec.flicker || 0, nightOnly: true });
          if (glow) record.glows.push(glow);
        }
      }
      broken.splice(i, 1);
    }
  }

  return { update, knockOver, get active() { return pool.filter((p) => p.active).length; } };
}

/** One reusable loose copy: a one-instance mesh with its own fading material. */
function makeLooseCopy(kit) {
  const material = kit.materials.createPaintedPropMaterial({ transparent: true });
  const mesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), material, 1);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'furniture-loose-copy';
  kit.group.add(mesh);
  return {
    mesh,
    material,
    active: false,
    age: 0,
    record: null,
    mode: 'fly',
    height: 1,
    color: new THREE.Color(),
    euler: new THREE.Euler(),
    baseQuaternion: new THREE.Quaternion(),
    quaternion: new THREE.Quaternion(),
    tilt: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
    pivot: new THREE.Vector3(),
    axis: new THREE.Vector3(1, 0, 0),
    angle: 0,
    angularSpeed: 0,
    slideX: 0,
    slideZ: 0,
    center: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    spinAxis: new THREE.Vector3(0, 1, 0),
    spin: 0,
    turn: new THREE.Matrix4(),
    stepTurn: new THREE.Matrix4(),
    offset: new THREE.Vector3(),
    position: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
  };
}
