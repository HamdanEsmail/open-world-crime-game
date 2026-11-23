// The lights of Port Sarab's traffic, drawn as additive glows: warm headlamp flares and the long pool of
// light they throw on the road at night, red tail and brake lamps, white reversing lamps, the cab and bus
// signs, the bullion carrier's amber beacon, and the PSPD red-and-blue strobes with their wash of colour
// on the tarmac. Everything lives in two instanced meshes, refilled each frame by the vehicle renderer.
import * as THREE from 'three';

/**
 * Create the glow pools and add them to the scene.
 * @param {import('../core/gameContext.js').Game} game
 * @returns {{begin:Function, addVehicle:Function, end:Function, addFlare:Function, addPool:Function, group:THREE.Group}}
 */
export function createVehicleLights(game, { maxFlares = 640, maxPools = 160 } = {}) {
  const group = new THREE.Group();
  group.name = 'vehicle-lights';
  const flares = makeGlowMesh(new THREE.PlaneGeometry(1, 1), paintFlareTexture(), maxFlares);
  flares.renderOrder = 12;
  const poolGeometry = new THREE.PlaneGeometry(1, 1);
  poolGeometry.rotateX(-Math.PI / 2);
  const pools = makeGlowMesh(poolGeometry, paintPoolTexture(), maxPools);
  pools.renderOrder = 11;
  pools.material.polygonOffset = true;
  pools.material.polygonOffsetFactor = -2;
  pools.material.polygonOffsetUnits = -2;
  const beacons = makeGlowMesh(new THREE.PlaneGeometry(1, 1), paintBeaconTexture(), 128);
  beacons.material.blending = THREE.NormalBlending;
  beacons.material.toneMapped = false;
  beacons.renderOrder = 13;
  group.add(pools, flares, beacons);
  game.scene?.add(group);

  let flareCount = 0;
  let poolCount = 0;
  let beaconCount = 0;
  let camX = 0;
  let camY = 0;
  let camZ = 0;
  const camQuaternion = new THREE.Quaternion();
  const _matrix = new THREE.Matrix4();
  const _position = new THREE.Vector3();
  const _scale = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);

  /** Start a frame: forget last frame's glows and note where the camera is. */
  function begin() {
    flareCount = 0;
    poolCount = 0;
    beaconCount = 0;
    const camera = game.camera;
    if (camera) {
      camera.getWorldQuaternion(camQuaternion);
      camX = camera.matrixWorld.elements[12];
      camY = camera.matrixWorld.elements[13];
      camZ = camera.matrixWorld.elements[14];
    }
  }

  /** One camera-facing glow of world size `size`, colour (r, g, b) in linear light (may exceed 1). */
  function addFlare(x, y, z, size, r, g, b) {
    if (flareCount >= maxFlares || size <= 0.01) return;
    _position.set(x, y, z);
    _scale.set(size, size, size);
    _matrix.compose(_position, camQuaternion, _scale);
    _matrix.toArray(flares.instanceMatrix.array, flareCount * 16);
    const c = flares.instanceColor.array;
    c[flareCount * 3] = r;
    c[flareCount * 3 + 1] = g;
    c[flareCount * 3 + 2] = b;
    flareCount += 1;
  }

  /**
   * One solid-coloured strobe halo (alpha blended, colour 0..1): keeps the PSPD red and blue saturated in
   * bright daylight, where additive light washes out to white.
   */
  function addBeacon(x, y, z, size, r, g, b) {
    if (beaconCount >= 128 || size <= 0.01) return;
    _position.set(x, y, z);
    _scale.set(size, size, size);
    _matrix.compose(_position, camQuaternion, _scale);
    _matrix.toArray(beacons.instanceMatrix.array, beaconCount * 16);
    const c = beacons.instanceColor.array;
    c[beaconCount * 3] = r;
    c[beaconCount * 3 + 1] = g;
    c[beaconCount * 3 + 2] = b;
    beaconCount += 1;
  }

  /** One soft pool of light on the ground, `width` across and `length` along the heading. */
  function addPool(x, y, z, heading, width, length, r, g, b) {
    if (poolCount >= maxPools) return;
    _position.set(x, y, z);
    _quat.setFromAxisAngle(_up, heading);
    _scale.set(width, 1, length);
    _matrix.compose(_position, _quat, _scale);
    _matrix.toArray(pools.instanceMatrix.array, poolCount * 16);
    const c = pools.instanceColor.array;
    c[poolCount * 3] = r;
    c[poolCount * 3 + 1] = g;
    c[poolCount * 3 + 2] = b;
    poolCount += 1;
  }

  /**
   * Add the glows of one vehicle. `matrix` is its body's world matrix; `state` holds the lamp levels the
   * renderer worked out: head, tail, brake, reverse, sirenRed, sirenBlue, sign, amber (0..1) and night.
   */
  function addVehicle(vehicle, model, matrix, state) {
    const e = matrix.elements;
    const lamps = model.lamps;
    const night = state.night;
    const groundY = vehicle.pos.y + 0.06;
    if (state.head > 0.01) {
      const strength = state.head * (0.3 + 1.3 * night);
      const size = (0.5 + 0.9 * night) * (0.7 + 0.3 * state.head);
      addLampFlares(lamps.head, e, size, 1.0 * strength, 0.86 * strength, 0.62 * strength, true);
      if (night > 0.05) {
        const reach = model.spec.length / 2 + 5.8;
        const ground = 0.38 * night * state.head;
        addPool(e[12] + e[8] * reach, groundY, e[14] + e[10] * reach, vehicle.heading, 4.6, 12, 1.0 * ground, 0.84 * ground, 0.6 * ground);
      }
    }
    const tailLevel = state.tail * 0.55 + state.brake * 1.7;
    if (tailLevel > 0.02) {
      addLampFlares(lamps.tail, e, 0.42 + 0.3 * state.brake + 0.25 * night, 1.0 * tailLevel, 0.07 * tailLevel, 0.05 * tailLevel, true);
      if (night > 0.05 && state.brake > 0.1) {
        const back = -(model.spec.length / 2 + 1.0);
        const ground = 0.35 * night * state.brake;
        addPool(e[12] + e[8] * back, groundY, e[14] + e[10] * back, vehicle.heading, 3.2, 2.6, ground, 0.03 * ground, 0.02 * ground);
      }
    }
    if (state.reverse > 0.01) addLampFlares(lamps.reverse, e, 0.38 + 0.3 * night, 0.9 * state.reverse, 0.95 * state.reverse, 1.0 * state.reverse, true);
    if (state.sign > 0.01) addLampFlares(lamps.sign, e, 0.55 + 0.5 * night, 1.0 * state.sign, 0.82 * state.sign, 0.5 * state.sign, false);
    if (state.amber > 0.01) addLampFlares(lamps.amber, e, 0.9 + 0.9 * night, 1.6 * state.amber, 0.75 * state.amber, 0.1 * state.amber, false);
    if (state.sirenRed > 0.01 || state.sirenBlue > 0.01) {
      const punch = 2.2 + 1.8 * night;
      const size = 1.15 + 0.85 * night;
      addLampFlares(lamps.sirenRed, e, size * (0.6 + 0.4 * state.sirenRed), punch * state.sirenRed, 0.05 * punch * state.sirenRed, 0.06 * punch * state.sirenRed, false);
      addLampFlares(lamps.sirenBlue, e, size * (0.6 + 0.4 * state.sirenBlue), 0.05 * punch * state.sirenBlue, 0.16 * punch * state.sirenBlue, 1.25 * punch * state.sirenBlue, false);
      const day = 1 - night;
      if (day > 0.05) {
        addBeaconsAt(lamps.sirenRed, e, (0.35 + 1.0 * state.sirenRed * state.sirenRed) * day, 1.0, 0.06, 0.05);
        addBeaconsAt(lamps.sirenBlue, e, (0.35 + 1.0 * state.sirenBlue * state.sirenBlue) * day, 0.1, 0.3, 1.0);
      }
      const wash = 0.03 + 0.8 * night * night;
      const red = state.sirenRed * state.sirenRed;
      const blue = state.sirenBlue * state.sirenBlue;
      addPool(e[12], groundY, e[14], vehicle.heading, 10, 12, wash * red, 0.05 * wash * (red + blue), wash * blue * 1.15);
    }
  }

  /** Flares at each anchor; `directional` dims lamps that face away from the camera. */
  function addLampFlares(anchors, e, size, r, g, b, directional) {
    if (!anchors) return;
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      const x = e[0] * a.x + e[4] * a.y + e[8] * a.z + e[12];
      const y = e[1] * a.x + e[5] * a.y + e[9] * a.z + e[13];
      const z = e[2] * a.x + e[6] * a.y + e[10] * a.z + e[14];
      let facing = 1;
      if (directional) {
        const nx = e[0] * a.nx + e[4] * a.ny + e[8] * a.nz;
        const ny = e[1] * a.nx + e[5] * a.ny + e[9] * a.nz;
        const nz = e[2] * a.nx + e[6] * a.ny + e[10] * a.nz;
        const dx = camX - x;
        const dy = camY - y;
        const dz = camZ - z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const dot = (nx * dx + ny * dy + nz * dz) / d;
        facing = Math.min(1, Math.max(0, (dot + 0.25) / 0.75));
        if (facing <= 0.01) continue;
      }
      addFlare(x, y, z, size * (0.55 + 0.45 * facing), r * facing, g * facing, b * facing);
    }
  }

  /** Strobe halos of `size` metres at each anchor. */
  function addBeaconsAt(anchors, e, size, r, g, b) {
    if (!anchors) return;
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      const y = a.y + 0.1;
      addBeacon(
        e[0] * a.x + e[4] * y + e[8] * a.z + e[12],
        e[1] * a.x + e[5] * y + e[9] * a.z + e[13],
        e[2] * a.x + e[6] * y + e[10] * a.z + e[14],
        size, r, g, b,
      );
    }
  }

  /** Upload this frame's glows. */
  function end() {
    flares.count = flareCount;
    pools.count = poolCount;
    beacons.count = beaconCount;
    flares.visible = flareCount > 0;
    pools.visible = poolCount > 0;
    beacons.visible = beaconCount > 0;
    beacons.instanceMatrix.needsUpdate = true;
    beacons.instanceColor.needsUpdate = true;
    flares.instanceMatrix.needsUpdate = true;
    flares.instanceColor.needsUpdate = true;
    pools.instanceMatrix.needsUpdate = true;
    pools.instanceColor.needsUpdate = true;
  }

  return {
    group,
    begin,
    addVehicle,
    addFlare,
    addPool,
    end,
    get flareCount() { return flareCount; },
    get poolCount() { return poolCount; },
  };
}

/** An instanced additive glow mesh with per-instance colour. */
function makeGlowMesh(geometry, texture, capacity) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  return mesh;
}

/** A hot white core with a soft halo and a faint horizontal streak. */
function paintFlareTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const halo = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.12, 'rgba(255,255,255,0.9)');
  halo.addColorStop(0.3, 'rgba(255,255,255,0.32)');
  halo.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(1, 0.06);
  const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  streak.addColorStop(0, 'rgba(255,255,255,0.55)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = streak;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A solid round strobe halo with a short soft rim, so its colour holds against bright daylight. */
function paintBeaconTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const halo = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.32, 'rgba(255,255,255,0.95)');
  halo.addColorStop(0.55, 'rgba(255,255,255,0.4)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft round pool that fades smoothly to nothing at its rim. */
function paintPoolTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pool = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  pool.addColorStop(0, 'rgba(255,255,255,0.95)');
  pool.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  pool.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  pool.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
