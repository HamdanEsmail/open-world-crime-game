// The sky over Port Sarab: a camera-centred dome painted by one shader. A deep zenith melting into a
// hazy horizon band, the sun's disc with its warm bloom, streaks of high cloud that catch the sunset,
// and by night stars and a moon over the gulf. It sits behind everything at the far plane, is never
// fogged, and its horizon is exactly the haze colour so the city, the sea and the sky meet seamlessly.
import * as THREE from 'three';
import { getSkyNoiseTexture } from './skyNoiseTexture.js';

/**
 * Build the sky dome and add it to the scene. The day-night cycle drives it through `uniforms`.
 * @returns {{ mesh: THREE.Mesh, uniforms: Object, update(dt:number): void }}
 */
export function createSkyDome(game) {
  const uniforms = createSkyDomeUniforms();
  uniforms.uNoiseMap.value = getSkyNoiseTexture(game);
  const material = new THREE.ShaderMaterial({
    name: 'skyDome',
    uniforms,
    vertexShader: SKY_DOME_VERTEX,
    fragmentShader: SKY_DOME_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    // The fog on everything else is applied after tone mapping, so the sky stays untouched by it too.
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.name = 'skyDome';
  mesh.frustumCulled = false;
  // Painted after the city at the far plane, so only the sky that shows between buildings is shaded.
  mesh.renderOrder = SKY_RENDER_ORDER;
  mesh.matrixAutoUpdate = false;
  game.scene.add(mesh);

  /** Advance the drifting clouds and the twinkling stars. */
  function update() {
    uniforms.uTime.value = game.time.elapsed;
  }

  return { mesh, uniforms, update };
}

/** Every uniform the dome reads; the shared sky-colour ones are also used by the sea. */
export function createSkyDomeUniforms() {
  return {
    ...createSkyColorUniforms(),
    uTime: { value: 0 },
    uNoiseMap: { value: null },
    uDiscColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uDiscSize: { value: 0.022 },
    uDiscAlpha: { value: 1 },
    uMoonDir: { value: new THREE.Vector3(0, 0.5, -0.86) },
    uMoonColor: { value: new THREE.Color(0.85, 0.9, 1.0) },
    uMoonAlpha: { value: 0 },
    uCloudLit: { value: new THREE.Color(1, 1, 1) },
    uCloudShade: { value: new THREE.Color(0.7, 0.75, 0.85) },
    uCloudCover: { value: 0.6 },
    uCloudOpacity: { value: 0.8 },
    uStars: { value: 0 },
    uStorm: { value: 0 },
  };
}

/** The uniforms behind skyBaseColor(): the three bands of the sky and the sun's bloom. */
export function createSkyColorUniforms() {
  return {
    uZenith: { value: new THREE.Color(0.1, 0.3, 0.7) },
    uMid: { value: new THREE.Color(0.4, 0.6, 0.85) },
    uHorizon: { value: new THREE.Color(0.85, 0.8, 0.7) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlowColor: { value: new THREE.Color(1, 0.8, 0.5) },
    uBandColor: { value: new THREE.Color(1, 0.6, 0.3) },
    uGlowStrength: { value: 0.5 },
  };
}

/** GLSL noise shared by the sky, the sea and the khamsin's dust: hashes, value noise and fbm. */
export const SKY_NOISE_GLSL = /* glsl */ `
// Two rounds of scaling and folding: stable when the GPU rounds a lattice point a hair differently.
float sarabHash2(vec2 p) {
  vec2 q = fract(p * vec2(0.1593, 0.2719));
  q += dot(q, q.yx + 17.83);
  q = fract(q * vec2(5.13, 7.91));
  return fract(q.x * q.y + dot(q, vec2(0.531, 0.713)));
}

float sarabHash3(vec3 p) {
  vec3 q = fract(p * vec3(0.1593, 0.2719, 0.3511));
  q += dot(q, q.yzx + 17.83);
  q = fract(q * vec3(5.13, 7.91, 3.37));
  return fract(q.x * q.y + q.z * 0.913 + dot(q, vec3(0.31, 0.53, 0.71)));
}

float sarabNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = sarabHash2(i);
  float b = sarabHash2(i + vec2(1.0, 0.0));
  float c = sarabHash2(i + vec2(0.0, 1.0));
  float d = sarabHash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float sarabFbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * sarabNoise(p);
    p = p * 2.07 + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return sum / 0.9375;
}
`;

/**
 * GLSL shared by the sky dome and the sea: skyBaseColor(dir), the clear sky seen along a direction.
 * At and below the horizon it returns exactly uHorizon, the haze colour.
 */
export const SKY_COLOR_GLSL = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uGlowColor;
uniform vec3 uBandColor;
uniform float uGlowStrength;
${SKY_NOISE_GLSL}
vec3 skyBaseColor(vec3 dir) {
  float y = max(dir.y, 0.0);
  float toMid = 1.0 - exp(-y * 8.0);
  float toZenith = smoothstep(0.08, 0.95, y);
  vec3 col = mix(uHorizon, uMid, toMid);
  col = mix(col, uZenith, toZenith);

  // The sun's bloom: a broad warm region that takes over the blue, a sunset band along the horizon
  // under a low sun, and a hot core close to the disc.
  float cosSun = dot(dir, uSunDir);
  float facing = max(cosSun, 0.0);
  float wide = pow(facing, 3.0);
  float core = pow(facing, 36.0);
  vec2 flatDir = dir.xz / max(length(dir.xz), 1e-4);
  vec2 flatSun = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
  float towardSun = dot(flatDir, flatSun) * 0.5 + 0.5;
  float lowSun = 1.0 - smoothstep(0.02, 0.5, uSunDir.y);
  float band = pow(towardSun, 2.5) * exp(-y * 4.5) * lowSun;
  float aboveHaze = smoothstep(0.0, 0.07, y);
  // Under a low sun the warmth hugs the horizon and the zenith keeps its depth.
  float hug = 1.0 - smoothstep(0.05, 0.65, y) * 0.7 * lowSun;
  col = mix(col, uGlowColor, clamp(wide * 0.62 * uGlowStrength * hug, 0.0, 0.9) * aboveHaze);
  col = mix(col, uBandColor, clamp(band * 0.75 * uGlowStrength, 0.0, 0.9) * aboveHaze);
  vec3 hot = clamp(uGlowColor * core * 0.75 * uGlowStrength * aboveHaze, 0.0, 1.0);
  return 1.0 - (1.0 - col) * (1.0 - hot);
}
`;

/** Drawn after every opaque thing, before the sea and other see-through things. */
const SKY_RENDER_ORDER = 10000;

const SKY_DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 viewPos = viewMatrix * vec4(cameraPosition + position * 1500.0, 1.0);
  gl_Position = projectionMatrix * viewPos;
  gl_Position.z = gl_Position.w * 0.999999;
}
`;

const SKY_DOME_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform sampler2D uNoiseMap;
uniform vec3 uDiscColor;
uniform float uDiscSize;
uniform float uDiscAlpha;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoonAlpha;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uCloudCover;
uniform float uCloudOpacity;
uniform float uStars;
uniform float uStorm;
varying vec3 vDir;

${SKY_COLOR_GLSL}

// The noise texture read with a smooth curve between its texels instead of straight lines, so cloud
// edges stay soft where the sky overhead stretches a few texels across the whole screen.
vec4 softNoise(vec2 uv) {
  vec2 texel = uv * 256.0 + 0.5;
  vec2 whole = floor(texel);
  vec2 part = texel - whole;
  part = part * part * part * (part * (part * 6.0 - 15.0) + 10.0);
  return texture2D(uNoiseMap, (whole + part - 0.5) / 256.0);
}

// Long thin streaks of high cloud, drifting slowly across a flattened sky plane.
float highCloudStreaks(vec3 dir) {
  if (dir.y < 0.012 || uCloudOpacity < 0.001) return 0.0;
  vec2 p = dir.xz / (dir.y + 0.16);
  p = vec2(p.x * 0.80 - p.y * 0.60, p.x * 0.60 + p.y * 0.80);
  p += vec2(uTime * 0.0030, uTime * 0.0009);
  // Bend the streaks with a slow warp so they sweep and curl instead of running ruler-straight.
  p += softNoise(p * 0.0875 + 0.31).gb * 1.4 - 0.7;
  float shape = softNoise(vec2(p.x * 0.42, p.y * 2.3) * 0.125).r;
  float wisps = texture2D(uNoiseMap, vec2(p.x * 2.2, p.y * 13.0) * 0.03125).a;
  float n = shape * 0.84 + wisps * 0.16;
  float cover = smoothstep(uCloudCover, uCloudCover + 0.22, n);
  return cover * smoothstep(0.012, 0.18, dir.y);
}

// A field of stars: one candidate per cell of a fine 3D grid around the eye.
float starField(vec3 dir) {
  vec3 p = dir * 240.0;
  vec3 cell = floor(p);
  float h = sarabHash3(cell);
  if (h < 0.955) return 0.0;
  vec3 jitter = vec3(sarabHash3(cell + 1.7), sarabHash3(cell + 4.3), sarabHash3(cell + 9.1)) - 0.5;
  float d = length(p - (cell + 0.5 + jitter * 0.55));
  float size = mix(0.16, 0.34, fract(h * 13.7));
  float twinkle = 0.72 + 0.28 * sin(uTime * (1.7 + 3.1 * fract(h * 7.3)) + h * 40.0);
  return smoothstep(size, 0.0, d) * twinkle * mix(0.4, 1.3, fract(h * 31.1));
}

// The moon: a pale disc with soft grey seas on it and a cool halo.
vec3 moonAndHalo(vec3 dir, vec3 col, float aboveHorizon) {
  float cosMoon = dot(dir, uMoonDir);
  float radius = 0.03;
  col += uMoonColor * (pow(max(cosMoon, 0.0), 900.0) * 0.22 + pow(max(cosMoon, 0.0), 40.0) * 0.05) * uMoonAlpha;
  if (cosMoon < 0.995) return col;
  vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, uMoonDir);
  vec2 local = vec2(dot(dir, right), dot(dir, up)) / radius;
  float r = length(local);
  float disc = smoothstep(1.0, 0.9, r);
  float seas = sarabNoise(local * 1.7 + 4.0) * 0.6 + sarabNoise(local * 4.1 + 9.0) * 0.4;
  float shade = mix(1.0, 0.72, smoothstep(0.45, 0.75, seas)) * mix(0.82, 1.0, sqrt(max(1.0 - r * r, 0.0)));
  return mix(col, uMoonColor * shade * 1.05, disc * uMoonAlpha * aboveHorizon);
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyBaseColor(dir);
  float aboveHorizon = smoothstep(-0.002, 0.004, dir.y);
  float cloud = highCloudStreaks(dir) * (1.0 - uStorm);
  float cosSun = dot(dir, uSunDir);

  if (uStars > 0.001) {
    float fadeLow = smoothstep(0.03, 0.3, dir.y);
    col += vec3(0.86, 0.9, 1.0) * starField(dir) * uStars * fadeLow * (1.0 - cloud);
  }
  if (uMoonAlpha > 0.001) col = moonAndHalo(dir, col, aboveHorizon);

  // The sun's disc, a little limb-darkened; the khamsin turns it into a pale copper coin.
  float disc = smoothstep(cos(uDiscSize * 1.12), cos(uDiscSize * 0.9), cosSun);
  float limb = mix(0.9, 1.0, smoothstep(cos(uDiscSize), 1.0, cosSun));
  float corona = pow(max(cosSun, 0.0), 2400.0) * 0.7 * uDiscAlpha * aboveHorizon;
  col = 1.0 - (1.0 - col) * (1.0 - clamp(uDiscColor * corona, 0.0, 1.0));
  col = mix(col, uDiscColor * limb, disc * uDiscAlpha * aboveHorizon);

  if (cloud > 0.0) {
    float lit = pow(cosSun * 0.5 + 0.5, 2.5);
    vec3 cloudCol = mix(uCloudShade, uCloudLit, lit);
    cloudCol = 1.0 - (1.0 - cloudCol) * (1.0 - clamp(uGlowColor * pow(max(cosSun, 0.0), 10.0) * uGlowStrength * 0.7, 0.0, 1.0));
    col = mix(col, cloudCol, cloud * uCloudOpacity);
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
  // A whisper of noise so the long gradients never band.
  gl_FragColor.rgb += (sarabHash2(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;
