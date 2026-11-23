// Draws every vehicle in Port Sarab: one instanced mesh per model for the bodies and one shared mesh for
// all the wheels, refilled each frame from game.vehicles.list, so the whole fleet costs a couple of dozen
// draw calls. Paint takes each car's colour, darkens to soot as it is damaged and chars black when
// wrecked; lenses and glows follow the controls (headlights, brakes, reverse, siren) and the night.
import * as THREE from 'three';
import { createVehicleMaterials } from './vehicleMaterials.js';
import { buildVehicleModel } from './vehicleModels.js';
import { buildWheelGeometry } from './vehicleWheelModel.js';
import { createVehicleLights } from './vehicleLights.js';
import { createShapeKit } from './vehicleShapeKit.js';
import {
  headlightsOnAtNight, brakeLightsOn, policeLightBarColour, paintAfterDamage, charAfterDamage,
} from './vehicleBodyStyles.js';

/**
 * Create game.vehicleRenderer.
 * @param {import('../core/gameContext.js').Game} game
 * @returns {{update:(dt:number)=>void, buildPreview:(specId:string, color?:number)=>THREE.Object3D,
 *   getModel:(spec:Object)=>Object, lights:Object, materials:Object, stats:Object, root:THREE.Group}}
 */
export function createVehicleRenderer(game) {
  const materials = createVehicleMaterials(game);
  const lights = createVehicleLights(game);
  const root = new THREE.Group();
  root.name = 'vehicle-fleet';
  game.scene?.add(root);

  const models = new Map();
  const pools = new Map();
  const renderStates = new WeakMap();
  const wheelGeometry = buildWheelGeometry();
  let wheelPool = createInstancePool(wheelGeometry, materials.base, 256, false);
  root.add(wheelPool.mesh);
  const stats = { vehicles: 0, drawCalls: 0, models: 0, flares: 0 };
  for (const spec of game.catalog?.vehicles || []) poolFor(spec);

  /** Redraw the fleet from game.vehicles.list. Never throws. */
  function update(dt) {
    try {
      drawFleet(dt || 0);
    } catch (error) {
      console.warn('vehicleRenderer: frame skipped', error);
    }
  }

  function drawFleet(dt) {
    const list = game.vehicles?.list || EMPTY_LIST;
    const camera = game.camera;
    const camX = camera ? camera.position.x : 0;
    const camZ = camera ? camera.position.z : 0;
    for (const pool of pools.values()) pool.needed = 0;
    let wheelsNeeded = 0;
    for (let i = 0; i < list.length; i += 1) {
      const vehicle = list[i];
      if (!isDrawable(vehicle, camX, camZ)) continue;
      const pool = poolFor(vehicle.spec);
      pool.needed += 1;
      wheelsNeeded += 4;
    }
    for (const [id, pool] of pools) {
      if (pool.needed > pool.capacity) pools.set(id, growPool(pool, pool.needed));
    }
    if (wheelsNeeded > wheelPool.capacity) wheelPool = growPool(wheelPool, wheelsNeeded);

    for (const pool of pools.values()) pool.count = 0;
    wheelPool.count = 0;
    lights.begin();
    const night = game.sky?.night ?? 0;
    const elapsed = game.time?.elapsed ?? 0;
    let drawn = 0;
    for (let i = 0; i < list.length; i += 1) {
      const vehicle = list[i];
      if (!isDrawable(vehicle, camX, camZ)) continue;
      writeVehicle(vehicle, pools.get(vehicle.spec.id), night, elapsed, dt);
      drawn += 1;
    }
    let drawCalls = 0;
    for (const pool of pools.values()) drawCalls += finishPool(pool);
    drawCalls += finishPool(wheelPool);
    lights.end();
    stats.vehicles = drawn;
    stats.drawCalls = drawCalls + (lights.flareCount > 0 ? 1 : 0) + (lights.poolCount > 0 ? 1 : 0);
    stats.flares = lights.flareCount;
  }

  /** Body matrix, paint, lamp state and four wheels of one vehicle. */
  function writeVehicle(vehicle, pool, night, elapsed, dt) {
    const spec = vehicle.spec;
    const model = pool.model;
    const i = pool.count;
    pool.count += 1;

    _euler.set(vehicle.pitch || 0, vehicle.heading || 0, vehicle.roll || 0, 'YXZ');
    _quaternion.setFromEuler(_euler);
    _bodyMatrix.compose(vehicle.pos, _quaternion, UNIT_SCALE);
    _bodyMatrix.toArray(pool.mesh.instanceMatrix.array, i * 16);

    let state = renderStates.get(vehicle);
    if (!state) {
      state = { char: vehicle.wrecked ? 1 : 0, sirenSeed: Math.random(), amberSeed: Math.random() * 6 };
      renderStates.set(vehicle, state);
    }
    const maxHealth = spec.health || 1000;
    const healthFraction = clamp01((vehicle.health ?? maxHealth) / maxHealth);
    const charTarget = charAfterDamage(healthFraction, !!vehicle.wrecked);
    state.char += (charTarget - state.char) * Math.min(1, dt * 1.6);

    _paint.setHex(model.livery ? 0xffffff : (vehicle.color ?? spec.colors?.[0] ?? 0xffffff));
    _paint.lerp(SOOT, paintAfterDamage(healthFraction));
    const colors = pool.mesh.instanceColor.array;
    colors[i * 3] = _paint.r;
    colors[i * 3 + 1] = _paint.g;
    colors[i * 3 + 2] = _paint.b;

    const lamp = readLampState(vehicle, model, state, night, elapsed);
    const lampArray = pool.lamps.array;
    lampArray[i * 4] = lamp.head > 0 ? 3.4 * lamp.head : 0.12;
    lampArray[i * 4 + 1] = lamp.brake > 0 ? 4.5 : lamp.tail > 0 ? 1.4 : 0.06;
    lampArray[i * 4 + 2] = lamp.reverse * 3.2;
    lampArray[i * 4 + 3] = lamp.amber * 3.5;
    const stateArray = pool.state.array;
    stateArray[i * 4] = state.char;
    stateArray[i * 4 + 1] = lamp.sirenRed * 8;
    stateArray[i * 4 + 2] = lamp.sirenBlue * 11;
    stateArray[i * 4 + 3] = lamp.sign * 2.4;
    if (state.char < 0.9) lights.addVehicle(vehicle, model, _bodyMatrix, lamp);

    _rim.setHex(model.rimColor);
    writeWheels(_bodyMatrix, spec, model, vehicle.wheels, wheelPool, state.char, _rim);
  }

  /** Lamp levels (0..1) of one vehicle this frame, from its controls, health and the night. */
  function readLampState(vehicle, model, state, night, elapsed) {
    const controls = vehicle.controls || NO_CONTROLS;
    const alive = !vehicle.wrecked && (vehicle.health ?? 1) > 0;
    const running = alive && !vehicle.parked;
    const reversing = running && (vehicle.speed ?? 0) < -0.4;
    const lamp = _lamp;
    lamp.night = night;
    lamp.head = alive && (running ? headlightsOnAtNight(night, controls) : !!controls.headlights) ? 1 : 0;
    lamp.tail = lamp.head;
    lamp.brake = running && !reversing && brakeLightsOn(controls) ? 1 : 0;
    lamp.reverse = reversing ? 1 : 0;
    lamp.sirenRed = 0;
    lamp.sirenBlue = 0;
    if (alive && controls.siren && model.lamps.sirenRed.length > 0) {
      lamp.sirenRed = policeLightBarColour(elapsed + state.sirenSeed, 'red');
      lamp.sirenBlue = policeLightBarColour(elapsed + state.sirenSeed, 'blue');
    }
    lamp.sign = alive && model.lamps.sign.length > 0 ? 0.45 + 0.55 * night : 0;
    lamp.amber = running && model.lamps.amber.length > 0 ? Math.max(0, Math.sin(elapsed * 7 + state.amberSeed)) : 0;
    return lamp;
  }

  /** Upload a pool's instances; returns 1 if it draws this frame. */
  function finishPool(pool) {
    const mesh = pool.mesh;
    mesh.count = pool.count;
    mesh.visible = pool.count > 0;
    if (pool.count === 0) return 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    pool.lamps.needsUpdate = true;
    pool.state.needsUpdate = true;
    return 1;
  }

  /** The instance pool of a spec, building its model on first use. */
  function poolFor(spec) {
    let pool = pools.get(spec.id);
    if (!pool) {
      const model = modelFor(spec);
      pool = createInstancePool(model.geometry, materials.materialFor(spec, model.livery), 4, true);
      pool.model = model;
      pools.set(spec.id, pool);
      root.add(pool.mesh);
      stats.models = pools.size;
    }
    return pool;
  }

  /** A pool twice as big (or as big as needed) that replaces `pool` in the scene. */
  function growPool(pool, needed) {
    let capacity = pool.capacity;
    while (capacity < needed) capacity *= 2;
    const bigger = createInstancePool(pool.baseGeometry, pool.mesh.material, capacity, pool.mesh.castShadow);
    bigger.model = pool.model;
    root.remove(pool.mesh);
    root.add(bigger.mesh);
    return bigger;
  }

  /** The render model of a spec (built once), or a plain stand-in if building it fails. */
  function modelFor(spec) {
    let model = models.get(spec.id);
    if (!model) {
      try {
        model = buildVehicleModel(spec);
      } catch (error) {
        console.warn(`vehicleRenderer: could not sculpt ${spec.id}`, error);
        model = buildStandInModel(spec);
      }
      models.set(spec.id, model);
    }
    return model;
  }

  /**
   * A standalone copy of one model for menus and garages: body and wheels at rest, origin on the
   * ground under the centre, in the given paint (or the model's first colour).
   */
  function buildPreview(specId, color) {
    const spec = findSpec(specId);
    const group = new THREE.Group();
    if (!spec) return group;
    const model = modelFor(spec);
    group.name = `vehicle-preview-${spec.id}`;
    const body = createInstancePool(model.geometry, materials.materialFor(spec, model.livery), 1, true);
    IDENTITY.toArray(body.mesh.instanceMatrix.array, 0);
    _paint.setHex(model.livery ? 0xffffff : (color ?? spec.colors?.[0] ?? 0xffffff));
    body.mesh.instanceColor.array.set([_paint.r, _paint.g, _paint.b], 0);
    body.lamps.array.set([0.12, 0.06, 0, 0], 0);
    body.state.array.set([0, 0, 0, model.lamps.sign.length > 0 ? 1 : 0], 0);
    body.count = 1;
    finishPool(body);
    const wheels = createInstancePool(wheelGeometry, materials.base, 4, true);
    _rim.setHex(model.rimColor);
    writeWheels(IDENTITY, spec, model, null, wheels, 0, _rim);
    finishPool(wheels);
    group.add(body.mesh, wheels.mesh);
    group.userData.vehicleSpecId = spec.id;
    return group;
  }

  function findSpec(specId) {
    const byId = game.catalog?.vehicleById;
    const spec = typeof byId === 'function' ? byId(specId) : null;
    return spec || (game.catalog?.vehicles || []).find((s) => s.id === specId) || null;
  }

  return { update, buildPreview, getModel: modelFor, lights, materials, stats, root };
}

/**
 * Write a vehicle's four wheels into the wheel pool: each at its corner, lifted by its suspension
 * compression, turned by its steer angle and rolled by its spin. Right-hand wheels are turned around so
 * every rim faces outward.
 */
function writeWheels(bodyMatrix, spec, model, wheels, pool, char, rimColor) {
  const radius = spec.wheelRadius;
  _wheelScale.set(model.wheelWidth, radius, radius);
  for (let w = 0; w < 4; w += 1) {
    if (pool.count >= pool.capacity) return;
    const wheel = wheels ? wheels[w] : null;
    const left = w % 2 === 0;
    const compression = Math.max(-0.35, Math.min(0.35, wheel?.compression ?? 0));
    const spin = wheel?.spin ?? 0;
    _wheelPosition.set((left ? 1 : -1) * spec.track / 2, radius + compression, (w < 2 ? 1 : -1) * spec.wheelbase / 2);
    _euler.set(left ? spin : -spin, (wheel?.steerAngle ?? 0) + (left ? 0 : Math.PI), 0, 'YXZ');
    _wheelQuaternion.setFromEuler(_euler);
    _wheelLocal.compose(_wheelPosition, _wheelQuaternion, _wheelScale);
    _wheelMatrix.multiplyMatrices(bodyMatrix, _wheelLocal);
    const i = pool.count;
    pool.count += 1;
    _wheelMatrix.toArray(pool.mesh.instanceMatrix.array, i * 16);
    const colors = pool.mesh.instanceColor.array;
    colors[i * 3] = rimColor.r;
    colors[i * 3 + 1] = rimColor.g;
    colors[i * 3 + 2] = rimColor.b;
    pool.lamps.array.fill(0, i * 4, i * 4 + 4);
    const state = pool.state.array;
    state[i * 4] = char;
    state[i * 4 + 1] = 0;
    state[i * 4 + 2] = 0;
    state[i * 4 + 3] = 0;
  }
}

/** An InstancedMesh over a shared geometry, with its own per-instance colour, lamp and state data. */
function createInstancePool(baseGeometry, material, capacity, castShadow) {
  const geometry = new THREE.BufferGeometry();
  for (const name of Object.keys(baseGeometry.attributes)) geometry.setAttribute(name, baseGeometry.attributes[name]);
  const lamps = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  lamps.setUsage(THREE.DynamicDrawUsage);
  state.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceLamps', lamps);
  geometry.setAttribute('instanceState', state);
  if (baseGeometry.boundingSphere) geometry.boundingSphere = baseGeometry.boundingSphere.clone();
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  return { mesh, baseGeometry, capacity, count: 0, needed: 0, lamps, state, model: null };
}

/** A plain rounded box with wheels' worth of dimensions, used only if a model fails to build. */
function buildStandInModel(spec) {
  const kit = createShapeKit({ length: spec.length, width: spec.width, height: spec.height });
  const half = spec.length / 2;
  kit.profileShell([[half, 0.3], [half, spec.height * 0.6], [half * 0.3, spec.height], [-half * 0.8, spec.height], [-half, spec.height * 0.6], [-half, 0.3]], {
    width: spec.width, bevel: 0.08, part: 'paint',
  });
  return {
    id: spec.id, spec, geometry: kit.finalize(),
    lamps: { head: [], tail: [], reverse: [], sirenRed: [], sirenBlue: [], amber: [], sign: [] },
    livery: null, wheelWidth: 0.24, rimColor: 0xc9ced4, triangles: kit.triangleCount,
  };
}

/** Whether a vehicle should be drawn this frame: complete, not hidden, and within sight range. */
function isDrawable(vehicle, camX, camZ) {
  if (!vehicle || !vehicle.spec || !vehicle.pos || vehicle.hidden) return false;
  const dx = vehicle.pos.x - camX;
  const dz = vehicle.pos.z - camZ;
  return dx * dx + dz * dz < DRAW_DISTANCE * DRAW_DISTANCE;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

const DRAW_DISTANCE = 700;
const EMPTY_LIST = [];
const NO_CONTROLS = { throttle: 0, brake: 0, steer: 0, handbrake: false, reverse: false, horn: false, siren: false, headlights: false };
const SOOT = new THREE.Color(0x1e1a17);
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const IDENTITY = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _quaternion = new THREE.Quaternion();
const _bodyMatrix = new THREE.Matrix4();
const _paint = new THREE.Color();
const _rim = new THREE.Color();
const _lamp = { head: 0, tail: 0, brake: 0, reverse: 0, sirenRed: 0, sirenBlue: 0, sign: 0, amber: 0, night: 0 };
const _wheelPosition = new THREE.Vector3();
const _wheelQuaternion = new THREE.Quaternion();
const _wheelScale = new THREE.Vector3();
const _wheelLocal = new THREE.Matrix4();
const _wheelMatrix = new THREE.Matrix4();
