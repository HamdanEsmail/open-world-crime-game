// What the khamsin looks like up close and from afar: thousands of streaks of blowing sand racing
// past the camera with the wind, and the towering wall of dust that rolls in from the dunes before
// the storm swallows the city. Both are single draw calls whose motion is computed on the GPU.
import * as THREE from 'three';
import { SKY_NOISE_GLSL } from './skyDome.js';

/**
 * Create the khamsin's two dust layers and add them to the scene (hidden while the air is clear).
 * @returns {{ streaks: THREE.Mesh, front: THREE.Mesh, update(dt:number, weather:Object, blowFrom:THREE.Vector3): void }}
 */
export function createSandstormDustLayers(game) {
  const rng = game.rng.fork('khamsin-dust');
  const streaks = createBlowingSandStreaks(rng, STREAK_COUNT);
  const front = createDustFrontWall();
  game.scene.add(streaks, front);

  const drift = streaks.material.uniforms.uDrift.value;
  const box = streaks.material.uniforms.uBox.value;
  const windDir = new THREE.Vector3();
  const sunLit = new THREE.Color();
  const shade = new THREE.Color();

  /** Blow the sand along the wind, light it like the hour, and move the wall of dust. */
  function update(dt, weather, blowFrom) {
    const s = weather.sandstorm;
    const sky = game.sky;
    const fog = game.scene.fog;
    lightTheDust(sky);

    // Streaks: visible once the storm has some bite, thickest in the gusts.
    const streakAmount = smoothstep(0.08, 0.55, s);
    streaks.visible = streakAmount > 0.001;
    if (streaks.visible) {
      const u = streaks.material.uniforms;
      drift.addScaledVector(weather.wind, dt);
      drift.x %= box.x;
      drift.y %= box.y;
      drift.z %= box.z;
      const speed = weather.wind.length();
      if (speed > 0.01) windDir.copy(weather.wind).multiplyScalar(1 / speed);
      u.uWindDir.value.copy(windDir);
      u.uLength.value = 0.5 + speed * 0.085;
      u.uOpacity.value = streakAmount * (0.34 + 0.36 * weather.gust);
      u.uTime.value = game.time.elapsed;
      u.uColor.value.copy(shade).lerp(sunLit, 0.5);
      if (fog) {
        u.uFogColor.value.copy(fog.color);
        u.uFogDensity.value = fog.density ?? 0;
      }
    }

    // The wall: only while a storm is arriving and still some way off.
    const distance = weather.frontDistance;
    front.visible = Number.isFinite(distance) && distance > 30;
    if (front.visible) {
      const u = front.material.uniforms;
      u.uRadius.value = distance;
      u.uUpwind.value.set(blowFrom.x, blowFrom.z).normalize();
      u.uTime.value = game.time.elapsed;
      u.uAlpha.value = smoothstep(2600, 2350, distance) * smoothstep(40, 260, distance);
      u.uDustLit.value.copy(sunLit);
      u.uDustShade.value.copy(shade);
      if (sky) {
        u.uLightDir.value.copy(sky.sunDirection);
        u.uLightColor.value.copy(sky.colors.sun);
      }
      if (fog) {
        u.uFogColor.value.copy(fog.color);
        u.uFogDensity.value = fog.density ?? 0;
      }
    }
  }

  /** The dust's colour in sunlight and in its own shadow, from the sky's light at this hour. */
  function lightTheDust(sky) {
    if (!sky || !sky.colors) {
      sunLit.setRGB(0.8, 0.5, 0.25);
      shade.setRGB(0.4, 0.26, 0.15);
      return;
    }
    const c = sky.colors;
    sunLit.copy(c.sun).multiplyScalar(0.75).add(c.ambient).multiply(DUST_ALBEDO).multiplyScalar(1.25);
    shade.copy(c.ambient).multiplyScalar(0.5).add(c.ground).multiply(DUST_ALBEDO).multiplyScalar(0.62);
  }

  return { streaks, front, update };
}

/**
 * One mesh of thin quads, each a streak of sand. The vertex shader drifts every streak with the
 * wind and wraps it inside a box that travels with the camera, so the sand never runs out.
 */
function createBlowingSandStreaks(rng, count) {
  const corners = new Float32Array(count * 4 * 3);
  const seeds = new Float32Array(count * 4 * 4);
  const index = new Uint16Array(count * 6);
  const cornerXY = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  for (let i = 0; i < count; i += 1) {
    const sx = rng.next();
    const sy = Math.pow(rng.next(), 1.6);
    const sz = rng.next();
    const sw = rng.next();
    for (let c = 0; c < 4; c += 1) {
      const v = i * 4 + c;
      corners[v * 3] = cornerXY[c][0];
      corners[v * 3 + 1] = cornerXY[c][1];
      corners[v * 3 + 2] = 0;
      seeds[v * 4] = sx;
      seeds[v * 4 + 1] = sy;
      seeds[v * 4 + 2] = sz;
      seeds[v * 4 + 3] = sw;
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(corners, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));

  const material = new THREE.ShaderMaterial({
    name: 'blowingSandStreaks',
    uniforms: {
      uDrift: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(64, 20, 64) },
      uWindDir: { value: new THREE.Vector3(0.27, 0, -0.96) },
      uLength: { value: 2 },
      uWidth: { value: 0.03 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0.8, 0.55, 0.3) },
      uOpacity: { value: 0 },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0 },
    },
    vertexShader: STREAK_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'blowingSandStreaks';
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.visible = false;
  return mesh;
}

/**
 * The advancing wall of dust: an open half-ring around the camera on the upwind side, its ragged
 * crest boiling slowly, sunlit along the top and dark and dense at its foot.
 */
function createDustFrontWall() {
  const segments = 96;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments - 0.5) * FRONT_ARC;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    positions.push(x, 0, z, x, 1, z);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    name: 'dustFrontWall',
    uniforms: {
      uRadius: { value: 2000 },
      uHeight: { value: 620 },
      uBase: { value: -30 },
      uUpwind: { value: new THREE.Vector2(0, 1) },
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uDustLit: { value: new THREE.Color(0.9, 0.6, 0.3) },
      uDustShade: { value: new THREE.Color(0.45, 0.28, 0.16) },
      uLightDir: { value: new THREE.Vector3(0, 1, 0) },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0 },
    },
    vertexShader: FRONT_VERTEX,
    fragmentShader: FRONT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'khamsinDustFront';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  return mesh;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

const STREAK_COUNT = 2400;
const FRONT_ARC = THREE.MathUtils.degToRad(210);
/** How sand reflects light: warm, a little red. */
const DUST_ALBEDO = new THREE.Color(0.78, 0.56, 0.34);

const STREAK_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uDrift;
uniform vec3 uBox;
uniform vec3 uWindDir;
uniform float uLength;
uniform float uWidth;
uniform float uTime;
varying vec2 vCorner;
varying float vFade;
varying float vViewDepth;
void main() {
  vec3 local = aSeed.xyz * uBox + uDrift;
  local.y += sin(uTime * (0.6 + aSeed.w) + aSeed.w * 31.0) * 0.5;
  vec3 rel = mod(local - cameraPosition + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec3 centre = cameraPosition + rel + vec3(0.0, uBox.y * 0.22, 0.0);
  vec3 along = normalize(uWindDir + vec3(0.0, (aSeed.w - 0.5) * 0.14, 0.0));
  vec3 toEye = cameraPosition - centre;
  vec3 side = cross(along, toEye);
  float sideLength = length(side);
  side = sideLength > 1e-4 ? side / sideLength : vec3(0.0, 1.0, 0.0);
  float len = uLength * (0.5 + aSeed.w);
  vec3 world = centre + along * (position.y - 0.5) * len + side * position.x * uWidth * (0.6 + aSeed.w * 0.8);
  vec3 edge = abs(rel) / (0.5 * uBox);
  float strength = 0.3 + 0.7 * fract(aSeed.w * 7.13 + aSeed.x * 3.1);
  vFade = smoothstep(1.0, 0.65, max(edge.x, edge.z)) * smoothstep(1.0, 0.7, edge.y) * smoothstep(2.5, 8.0, length(toEye)) * strength;
  vCorner = position.xy;
  vec4 viewPos = viewMatrix * vec4(world, 1.0);
  vViewDepth = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;
}
`;

const STREAK_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec2 vCorner;
varying float vFade;
varying float vViewDepth;
void main() {
  float across = 1.0 - vCorner.x * vCorner.x;
  float along = sin(3.14159 * vCorner.y);
  float alpha = across * along * vFade * uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float fogAmount = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uFogColor, 1.0)).rgb, fogAmount * 0.6);
}
`;

const FRONT_VERTEX = /* glsl */ `
uniform float uRadius;
uniform float uHeight;
uniform float uBase;
uniform vec2 uUpwind;
varying vec3 vWorld;
varying float vArc;
varying float vRise;
varying float vViewDepth;
void main() {
  vec2 ring = vec2(position.x * uUpwind.x - position.z * uUpwind.y, position.x * uUpwind.y + position.z * uUpwind.x);
  vec3 world = vec3(cameraPosition.x + ring.x * uRadius, uBase + position.y * uHeight, cameraPosition.z + ring.y * uRadius);
  vWorld = world;
  vArc = atan(position.z, position.x) * uRadius;
  vRise = position.y;
  vec4 viewPos = viewMatrix * vec4(world, 1.0);
  vViewDepth = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;
}
`;

const FRONT_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform vec3 uDustLit;
uniform vec3 uDustShade;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec3 vWorld;
varying float vArc;
varying float vRise;
varying float vViewDepth;
${SKY_NOISE_GLSL}
void main() {
  float u = vArc / 150.0;
  // The crest: broad surges with rounded, boiling heads on top of them.
  float surge = sarabFbm(vec2(u * 0.7 + uTime * 0.018, uTime * 0.012));
  float heads = sarabNoise(vec2(u * 3.2 - uTime * 0.05, uTime * 0.03));
  float crest = 0.38 + 0.4 * surge + 0.12 * heads * heads;
  float billows = sarabFbm(vec2(u * 2.6 - uTime * 0.035, vRise * 6.0 - uTime * 0.07));
  float edge = vRise + (billows - 0.5) * 0.1;
  float density = smoothstep(crest + 0.004, crest - 0.035, edge);
  // Darker and denser at the foot, sunlit cauliflower heads along the top.
  float height = clamp(vRise / max(crest, 0.05), 0.0, 1.0);
  vec3 col = mix(uDustShade * 0.6, uDustShade, smoothstep(0.0, 0.45, height));
  col = mix(col, uDustLit * 1.1, smoothstep(0.55, 1.0, height) * (0.55 + 0.45 * billows));
  vec3 toEye = normalize(cameraPosition - vWorld);
  float backLit = pow(max(dot(-toEye, uLightDir), 0.0), 5.0);
  col += uLightColor * backLit * 0.3 * (1.0 - density * 0.5);
  float alpha = density * uAlpha * (0.9 + 0.1 * billows);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float fogAmount = 1.0 - exp(-uFogDensity * uFogDensity * 0.08 * vViewDepth * vViewDepth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uFogColor, 1.0)).rgb, fogAmount);
}
`;
