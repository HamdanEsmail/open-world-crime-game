// The gulf north of Port Sarab: one large plane of water with its own shader. Turquoise over the
// sandbars, deepening to blue offshore, layered moving ripples, a broad glittering path toward the
// sun (or the moon), the sky mirrored at grazing angles, foam rolling in toward the beach, and a far
// edge that dissolves into the haze so the sea meets the sky without a seam. No extra render passes.
import * as THREE from 'three';
import { SKY_COLOR_GLSL, createSkyColorUniforms } from './skyDome.js';

/**
 * Create the sea and add it to the scene. Returns the object the game keeps as game.sea.
 * The shore map (how deep the water is near the coast) is read from game.terrain on the first
 * update; call rebuildShoreMap() again if the terrain changes.
 * @param {Object} [options] { minX, maxX, minZ, southEdgeZ, shoreZ } in metres
 */
export function createSeaWater(game, options = {}) {
  const seaLevel = game.config.world.seaLevel;
  const extent = {
    minX: options.minX ?? -8000,
    maxX: options.maxX ?? 8000,
    minZ: options.minZ ?? -9500,
    southEdgeZ: options.southEdgeZ ?? -700,
    shoreZ: options.shoreZ ?? -815,
  };
  const shoreRect = { minX: -2600, maxX: 2600, minZ: -1320, maxZ: extent.southEdgeZ };
  const shoreMap = createShoreMapTexture(SHORE_MAP_WIDTH, SHORE_MAP_HEIGHT);
  const uniforms = createSeaUniforms(game, shoreMap, shoreRect, extent);

  const material = new THREE.ShaderMaterial({
    name: 'seaWater',
    uniforms,
    vertexShader: SEA_VERTEX,
    fragmentShader: SEA_FRAGMENT,
    transparent: true,
    depthWrite: true,
    fog: false,
  });
  const width = extent.maxX - extent.minX;
  const depth = extent.southEdgeZ - extent.minZ;
  const geometry = new THREE.PlaneGeometry(width, depth, 24, 16);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((extent.minX + extent.maxX) / 2, 0, (extent.minZ + extent.southEdgeZ) / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'gulfSea';
  mesh.position.y = seaLevel;
  mesh.renderOrder = 1;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  game.scene.add(mesh);

  let shoreMapFromTerrain = false;
  fillShoreMap(shoreMap, shoreRect, (x, z) => fallbackDepthAt(x, z, extent.shoreZ));

  const sea = {
    mesh,
    uniforms,
    seaLevel,
    /** Water depth at a point, metres (negative on dry land), as the sea's shader sees it. */
    depthAt(x, z) {
      const h = game.terrain?.heightAt?.(x, z);
      return h === undefined ? fallbackDepthAt(x, z, extent.shoreZ) : seaLevel - h;
    },
    rebuildShoreMap,
    update,
  };

  /** Read the coast's depth from the terrain into the shore map (shallows, sandbars, the marina basin). */
  function rebuildShoreMap() {
    const terrain = game.terrain;
    if (!terrain || typeof terrain.heightAt !== 'function') return false;
    fillShoreMap(shoreMap, shoreRect, (x, z) => seaLevel - terrain.heightAt(x, z));
    shoreMapFromTerrain = true;
    return true;
  }

  /** Move the water, and follow the sky's colours, the light and the haze. */
  function update(dt) {
    if (!shoreMapFromTerrain && game.terrain) rebuildShoreMap();
    const u = uniforms;
    u.uTime.value = game.time.elapsed;
    const sky = game.sky;
    if (sky && sky.colors) {
      u.uZenith.value.copy(sky.colors.zenith);
      u.uMid.value.copy(sky.colors.mid);
      u.uHorizon.value.copy(sky.colors.horizon);
      u.uGlowColor.value.copy(sky.colors.glow);
      if (sky.colors.band) u.uBandColor.value.copy(sky.colors.band);
      u.uGlowStrength.value = sky.glowStrength ?? 0.5;
      if (sky.trueSunDirection) u.uSunDir.value.copy(sky.trueSunDirection);
      if (sky.sunDirection) u.uLightDir.value.copy(sky.sunDirection);
      u.uLightColor.value.copy(sky.colors.sun);
      u.uAmbient.value.copy(sky.colors.ambient);
      u.uNight.value = sky.night ?? 0;
    }
    const fog = game.scene.fog;
    if (fog) {
      u.uFogColor.value.copy(fog.color);
      u.uFogDensity.value = fog.isFogExp2 ? fog.density : 0.0005;
    }
    u.uFarFade.value = game.camera.far * 0.97;
    const storm = game.weather?.sandstorm ?? 0;
    u.uChop.value = 1 + storm * 0.9;
    u.uGlitter.value = 1 - storm * 0.85;
  }

  update(0);
  return sea;
}

/** How deep the water is where no terrain is known: a gently shelving beach north of shoreZ. */
function fallbackDepthAt(x, z, shoreZ) {
  const shore = shoreZ - 30 * Math.sin(x * 0.004 + 1) - 16 * Math.sin(x * 0.011);
  const out = shore - z;
  return out < 0 ? out * 0.02 : Math.min(out * 0.03 + out * out * 0.00004, 40);
}

/** Uniforms of the sea: the shared sky colours plus water, light, haze and the shore map. */
function createSeaUniforms(game, shoreMap, rect, extent) {
  return {
    ...createSkyColorUniforms(),
    uTime: { value: 0 },
    uRipples: { value: createRippleTexture(game, RIPPLE_SIZE) },
    uShoreMap: { value: shoreMap },
    uShoreRect: { value: new THREE.Vector4(rect.minX, rect.minZ, 1 / (rect.maxX - rect.minX), 1 / (rect.maxZ - rect.minZ)) },
    uShoreZ: { value: extent.shoreZ },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightColor: { value: new THREE.Color(1, 1, 1) },
    uAmbient: { value: new THREE.Color(0.4, 0.45, 0.5) },
    uGlitter: { value: 1 },
    uChop: { value: 1 },
    uNight: { value: 0 },
    uShallow: { value: new THREE.Color(0x46e0c8) },
    uTeal: { value: new THREE.Color(0x14a8a0) },
    uDeep: { value: new THREE.Color(0x0b5f8c) },
    uOpenSea: { value: new THREE.Color(0x0a4374) },
    uFoamColor: { value: new THREE.Color(0xf4fbf6) },
    uFogColor: { value: new THREE.Color(0.9, 0.8, 0.6) },
    uFogDensity: { value: 0.0005 },
    uFarFade: { value: 4000 },
  };
}

/** A small texture holding the water depth along the coast: R = (depth + 2) / 26. */
function createShoreMapTexture(width, height) {
  const texture = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  return texture;
}

/** Sample `depthAt(x, z)` over the coastal rectangle into the shore map. */
function fillShoreMap(texture, rect, depthAt) {
  const { width, height, data } = texture.image;
  const dx = (rect.maxX - rect.minX) / width;
  const dz = (rect.maxZ - rect.minZ) / height;
  for (let j = 0; j < height; j += 1) {
    const z = rect.minZ + (j + 0.5) * dz;
    for (let i = 0; i < width; i += 1) {
      const x = rect.minX + (i + 0.5) * dx;
      const depth = depthAt(x, z);
      const value = Math.round(Math.min(Math.max((depth + 2) / 26, 0), 1) * 255);
      const k = (j * width + i) * 4;
      data[k] = value;
      data[k + 1] = value;
      data[k + 2] = value;
      data[k + 3] = 255;
    }
  }
  texture.needsUpdate = true;
}

/**
 * A tileable field of ripple slopes (R = slope east, G = slope south), built from periodic value
 * noise and a few long swells, so the water can be layered at several scales without seams.
 */
function createRippleTexture(game, size) {
  const hash = game.math.hash2D;
  const heights = new Float32Array(size * size);
  const octaves = [
    { cellsX: 4, cellsZ: 7, weight: 1.0 },
    { cellsX: 8, cellsZ: 14, weight: 0.55 },
    { cellsX: 16, cellsZ: 26, weight: 0.3 },
    { cellsX: 32, cellsZ: 48, weight: 0.16 },
  ];
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      let h = 0;
      for (let o = 0; o < octaves.length; o += 1) {
        const octave = octaves[o];
        h += periodicNoise(hash, (i / size) * octave.cellsX, (j / size) * octave.cellsZ, octave.cellsX, octave.cellsZ, o * 31 + 7) * octave.weight;
      }
      h += 0.35 * Math.sin(((i * 3 + j * 5) / size) * Math.PI * 2);
      h += 0.22 * Math.sin(((i * -4 + j * 7) / size) * Math.PI * 2 + 1.3);
      heights[j * size + i] = h;
    }
  }
  const slopes = new Float32Array(size * size * 2);
  let maxSlope = 1e-6;
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const sx = heights[j * size + ((i + 1) % size)] - heights[j * size + ((i - 1 + size) % size)];
      const sz = heights[((j + 1) % size) * size + i] - heights[((j - 1 + size) % size) * size + i];
      slopes[(j * size + i) * 2] = sx;
      slopes[(j * size + i) * 2 + 1] = sz;
      maxSlope = Math.max(maxSlope, Math.abs(sx), Math.abs(sz));
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k += 1) {
    data[k * 4] = Math.round((slopes[k * 2] / maxSlope) * 127 + 128);
    data[k * 4 + 1] = Math.round((slopes[k * 2 + 1] / maxSlope) * 127 + 128);
    data[k * 4 + 2] = 128;
    data[k * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Smooth value noise that repeats every `periodX` by `periodZ` cells. */
function periodicNoise(hash, x, z, periodX, periodZ, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const x0 = ((ix % periodX) + periodX) % periodX;
  const x1 = (x0 + 1) % periodX;
  const z0 = ((iz % periodZ) + periodZ) % periodZ;
  const z1 = (z0 + 1) % periodZ;
  const a = hash(x0, z0, seed);
  const b = hash(x1, z0, seed);
  const c = hash(x0, z1, seed);
  const d = hash(x1, z1, seed);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz - 0.5;
}

const SHORE_MAP_WIDTH = 512;
const SHORE_MAP_HEIGHT = 96;
const RIPPLE_SIZE = 256;

const SEA_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying float vViewDepth;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 viewPos = viewMatrix * world;
  vViewDepth = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;
}
`;

const SEA_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform sampler2D uRipples;
uniform sampler2D uShoreMap;
uniform vec4 uShoreRect;
uniform float uShoreZ;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform float uGlitter;
uniform float uChop;
uniform float uNight;
uniform vec3 uShallow;
uniform vec3 uTeal;
uniform vec3 uDeep;
uniform vec3 uOpenSea;
uniform vec3 uFoamColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFarFade;
varying vec3 vWorld;
varying float vViewDepth;

${SKY_COLOR_GLSL}

float waterDepthAt(vec2 xz) {
  vec2 uv = (xz - uShoreRect.xy) * uShoreRect.zw;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    return texture2D(uShoreMap, uv).r * 26.0 - 2.0;
  }
  return clamp((uShoreZ - xz.y) * 0.03, 0.0, 40.0);
}

// Three layers of ripples drifting in different directions; calmer with distance.
vec3 rippleNormal(vec2 xz, float dist) {
  vec2 a = texture2D(uRipples, xz * 0.019 + vec2(uTime * 0.011, uTime * 0.006)).rg - 0.5;
  vec2 b = texture2D(uRipples, xz * 0.043 + vec2(-uTime * 0.016, uTime * 0.010)).rg - 0.5;
  vec2 c = texture2D(uRipples, xz * 0.0057 + vec2(uTime * 0.0035, -uTime * 0.0028)).rg - 0.5;
  vec2 slope = a * 1.0 + b * 0.65 + c * 1.2;
  float strength = uChop * mix(0.62, 0.16, smoothstep(40.0, 1800.0, dist));
  return normalize(vec3(-slope.x * strength, 1.0, -slope.y * strength));
}

// Lines of foam that roll in over the shallows and gather at the waterline.
float shoreFoam(float depth, vec2 xz) {
  float wobble = sarabNoise(xz * 0.06 + vec2(uTime * 0.05, 0.0));
  float edge = smoothstep(0.5, 0.0, depth + (wobble - 0.5) * 0.3);
  float phase = depth * 19.0 - uTime * 1.1 + wobble * 3.0;
  float band = smoothstep(0.78, 0.98, sin(phase) * 0.5 + 0.5);
  float bands = band * smoothstep(1.3, 0.25, depth) * (0.35 + 0.65 * sarabNoise(xz * 0.15 - uTime * 0.07));
  return clamp(edge * 0.9 + bands * 0.8, 0.0, 1.0);
}

void main() {
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 V = toEye / dist;
  float depth = waterDepthAt(vWorld.xz);
  vec3 N = rippleNormal(vWorld.xz, dist);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  float NdotV = max(dot(N, V), 0.0);
  float fresnel = 0.03 + 0.67 * pow(1.0 - NdotV, 5.0);

  vec3 body = mix(uShallow, uTeal, smoothstep(0.2, 3.5, depth));
  body = mix(body, uDeep, smoothstep(3.0, 7.5, depth));
  body = mix(body, uOpenSea, smoothstep(300.0, 2400.0, dist));
  body = mix(body, vec3(0.012, 0.02, 0.04), uNight * 0.8);
  float lightUp = max(uLightDir.y, 0.0);
  vec3 lit = body * (uAmbient * mix(1.5, 0.5, uNight) + uLightColor * (0.2 + 0.8 * lightUp));

  vec3 sky = skyBaseColor(normalize(R));
  vec3 col = mix(lit, sky * 0.92, fresnel);

  float toLight = max(dot(R, uLightDir), 0.0);
  float sheen = pow(toLight, 70.0) * 1.4;
  float sparkle = pow(toLight, 900.0) * 34.0;
  vec3 glitter = uLightColor * (sheen + sparkle) * uGlitter;
  col += glitter;

  float foam = shoreFoam(depth, vWorld.xz);
  vec3 foamLit = uFoamColor * (uAmbient * 1.6 + uLightColor * (0.35 + 0.65 * lightUp));
  col = mix(col, foamLit, foam);

  float alpha = smoothstep(-0.05, 0.5, depth);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // The air over the water is a little hazier than over the streets, so the far sea melts into the sky.
  float seaHaze = uFogDensity * 1.6;
  float fogAmount = 1.0 - exp(-seaHaze * seaHaze * vViewDepth * vViewDepth);
  fogAmount = max(fogAmount, smoothstep(uFarFade * 0.6, uFarFade, vViewDepth));
  // A thin band of haze lies on the water at the horizon, mirroring the sky's own horizon band.
  fogAmount = max(fogAmount, exp(-V.y * 90.0) * 0.9 * smoothstep(150.0, 900.0, dist));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uFogColor, 1.0)).rgb, fogAmount);
  // The sun's path on the water shines through the haze toward the horizon.
  gl_FragColor.rgb += clamp(glitter * 0.6, 0.0, 1.0) * fogAmount * (1.0 - smoothstep(uFarFade * 0.8, uFarFade, vViewDepth));
}
`;
