// The shared materials every vehicle in Port Sarab is drawn with. One glossy surface material serves the
// whole fleet: each vertex says what it is (paint, tinted glass, black trim, chrome, rubber, a lamp lens),
// paint takes the vehicle's own colour, and everything reflects a small sun-over-sand sky made once in
// code, so the cars catch the warm horizon and a hot white highlight. Liveried fleets add a canvas map.
import * as THREE from 'three';
import { paintLivery } from './vehicleLiveries.js';

/**
 * What a vehicle mesh is made of. `paint: 1` multiplies the vertex by the vehicle's paint colour (and the
 * livery, if any); `lamp` names the light that makes the lens glow (see LAMP_CODES).
 */
export const VEHICLE_SURFACES = {
  paint: { color: 0xffffff, paint: 1, roughness: 0.26, metalness: 0.5 },
  paintSatin: { color: 0xd6d6d6, paint: 1, roughness: 0.55, metalness: 0.25 },
  glass: { color: 0x0b1118, roughness: 0.04, metalness: 0.45 },
  trim: { color: 0x1c1e22, roughness: 0.72, metalness: 0.05 },
  grille: { color: 0x0f1013, roughness: 0.5, metalness: 0.4 },
  under: { color: 0x101113, roughness: 0.95, metalness: 0 },
  chrome: { color: 0xeef1f5, roughness: 0.1, metalness: 1 },
  gold: { color: 0xe2ad45, roughness: 0.22, metalness: 0.95 },
  interior: { color: 0x5a3a28, roughness: 0.85, metalness: 0 },
  seat: { color: 0x7a4a2e, roughness: 0.7, metalness: 0 },
  cream: { color: 0xf1e8d4, roughness: 0.42, metalness: 0.05 },
  plate: { color: 0xf6f1e2, roughness: 0.5, metalness: 0 },
  bedLiner: { color: 0x26282c, roughness: 0.95, metalness: 0 },
  headLens: { color: 0xe9f1f8, roughness: 0.06, metalness: 0.35, lamp: 1 },
  tailLens: { color: 0x8c0d12, roughness: 0.1, metalness: 0.1, lamp: 2 },
  reverseLens: { color: 0xdfe3e8, roughness: 0.08, metalness: 0.2, lamp: 3 },
  sirenRed: { color: 0x9a0d12, roughness: 0.12, metalness: 0, lamp: 4 },
  sirenBlue: { color: 0x0c2a9a, roughness: 0.12, metalness: 0, lamp: 5 },
  amberLens: { color: 0xd97a12, roughness: 0.12, metalness: 0.1, lamp: 6 },
  signLamp: { color: 0xf8eccb, roughness: 0.3, metalness: 0, lamp: 7 },
  tyre: { color: 0x1b1b1d, roughness: 0.9, metalness: 0 },
  tyreWall: { color: 0x2a2a2d, roughness: 0.8, metalness: 0 },
  rim: { color: 0xffffff, paint: 1, roughness: 0.24, metalness: 0.9 },
  rimRecess: { color: 0x0c0d0f, roughness: 0.9, metalness: 0 },
};

/** Which light makes a lens glow, as stored in the fourth component of a vertex's surface data. */
export const LAMP_CODES = { head: 1, tail: 2, reverse: 3, sirenRed: 4, sirenBlue: 5, amber: 6, sign: 7 };

/**
 * Build the fleet's materials: the sky reflection, the plain surface material and, on demand, one
 * liveried material per fleet model (police, cab, metro bus, bullion carrier).
 * @param {import('../core/gameContext.js').Game} game
 */
export function createVehicleMaterials(game) {
  const envMap = buildSunlitEnvironment(game.renderer);
  const base = createVehicleSurfaceMaterial(envMap, null);
  const liveried = new Map();

  /** The material a model is drawn with: the plain one, or its own livery for a fleet model. */
  function materialFor(spec, liveryKind) {
    if (!liveryKind) return base;
    const key = `${liveryKind}:${spec.id}`;
    let material = liveried.get(key);
    if (!material) {
      const map = paintLivery(liveryKind, spec);
      material = createVehicleSurfaceMaterial(envMap, map);
      liveried.set(key, material);
    }
    return material;
  }

  return { envMap, base, materialFor };
}

/**
 * The one vehicle surface material: a MeshStandardMaterial whose colour, roughness, metalness and lamp
 * glow come from vertex data and per-instance state (instanceLamps, instanceState).
 * @param {THREE.Texture|null} envMap
 * @param {THREE.Texture|null} map   a livery atlas, applied to painted surfaces only
 */
export function createVehicleSurfaceMaterial(envMap, map) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.5,
    metalness: 0,
    envMap: envMap || null,
    envMapIntensity: 1.0,
    map: map || null,
  });
  material.onBeforeCompile = patchVehicleSurfaceShader;
  material.customProgramCacheKey = () => 'port-sarab-vehicle-surface';
  return material;
}

/**
 * Paint a small sunlit desert sky into a reflection map: a warm hazy horizon over pale sand, a deep
 * blue zenith, a hot low sun and a ring of distant tower silhouettes that break up the highlights.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.Texture|null}
 */
export function buildSunlitEnvironment(renderer) {
  if (!renderer) return null;
  const scene = new THREE.Scene();
  const disposables = [];

  const dome = new THREE.SphereGeometry(60, 40, 20);
  const position = dome.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const zenith = new THREE.Color(0x3f86d6);
  const sky = new THREE.Color(0x8cc3ee);
  const haze = new THREE.Color(0xffe2b0);
  const sandNear = new THREE.Color(0xe3bf86);
  const sandFar = new THREE.Color(0x9a7a52);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i) / 60;
    if (y >= 0) {
      const t = Math.pow(y, 0.55);
      if (t < 0.35) color.copy(haze).lerp(sky, t / 0.35);
      else color.copy(sky).lerp(zenith, (t - 0.35) / 0.65);
      color.multiplyScalar(1.35);
    } else {
      color.copy(sandNear).lerp(sandFar, Math.min(1, -y * 2.2));
      color.multiplyScalar(0.95);
    }
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const domeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false });
  scene.add(new THREE.Mesh(dome, domeMaterial));
  disposables.push(dome, domeMaterial);

  const sunGeometry = new THREE.SphereGeometry(4.5, 12, 8);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(14, 10.5, 7) });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sun.position.set(0.55, 0.36, -0.75).normalize().multiplyScalar(50);
  scene.add(sun);
  disposables.push(sunGeometry, sunMaterial);

  const towerGeometry = new THREE.BoxGeometry(1, 1, 1);
  const towerMaterial = new THREE.MeshBasicMaterial({ color: 0x3b4656 });
  const glassTowerMaterial = new THREE.MeshBasicMaterial({ color: 0x7c9cb8 });
  disposables.push(towerGeometry, towerMaterial, glassTowerMaterial);
  for (let i = 0; i < 22; i += 1) {
    const angle = (i / 22) * Math.PI * 2 + 0.13 * Math.sin(i * 7.1);
    const height = 3 + 11 * Math.abs(Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 3.3) * 0.5);
    const tower = new THREE.Mesh(towerGeometry, i % 3 === 0 ? glassTowerMaterial : towerMaterial);
    tower.scale.set(4 + (i % 4) * 2, height, 4);
    tower.position.set(Math.cos(angle) * 46, height / 2 - 1.5, Math.sin(angle) * 46);
    tower.lookAt(0, tower.position.y, 0);
    scene.add(tower);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.015, 0.1, 200);
  pmrem.dispose();
  for (const item of disposables) item.dispose();
  return target.texture;
}

/** Rewrite the standard shader so surface data and per-instance lamp state drive the look. */
function patchVehicleSurfaceShader(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', VERTEX_DECLARATIONS)
    .replace('#include <color_vertex>', VERTEX_SURFACE);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAGMENT_DECLARATIONS)
    .replace('#include <map_fragment>', FRAGMENT_LIVERY)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurface.y;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurface.z;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vLampGlow;');
}

const VERTEX_DECLARATIONS = `#include <common>
attribute vec4 aSurface;
attribute vec4 instanceLamps;
attribute vec4 instanceState;
varying vec4 vSurface;
varying vec3 vLampGlow;
float lampIs(float code, float wanted) { return 1.0 - step(0.5, abs(code - wanted)); }`;

// instanceLamps: headlights, tail/brake, reversing, amber.  instanceState: char, siren red, siren blue, sign.
const VERTEX_SURFACE = `
vColor = color;
#ifdef USE_INSTANCING_COLOR
  vColor = mix(color, color * instanceColor, aSurface.x);
#endif
float charLevel = clamp(instanceState.x, 0.0, 1.0);
vColor *= mix(vec3(1.0), vec3(0.055, 0.05, 0.048), charLevel);
vSurface = aSurface;
vSurface.y = mix(aSurface.y, 0.92, charLevel);
vSurface.z = aSurface.z * (1.0 - charLevel);
float lampCode = aSurface.w;
vec3 glow = vec3(1.0, 0.93, 0.8) * instanceLamps.x * lampIs(lampCode, 1.0);
glow += vec3(1.0, 0.05, 0.03) * instanceLamps.y * lampIs(lampCode, 2.0);
glow += vec3(0.95, 0.96, 1.0) * instanceLamps.z * lampIs(lampCode, 3.0);
glow += vec3(1.0, 0.45, 0.05) * instanceLamps.w * lampIs(lampCode, 6.0);
glow += vec3(1.0, 0.04, 0.05) * instanceState.y * lampIs(lampCode, 4.0);
glow += vec3(0.08, 0.28, 1.0) * instanceState.z * lampIs(lampCode, 5.0);
glow += vec3(1.0, 0.86, 0.55) * instanceState.w * lampIs(lampCode, 7.0);
vLampGlow = glow * (1.0 - charLevel);
`;

const FRAGMENT_DECLARATIONS = `#include <common>
varying vec4 vSurface;
varying vec3 vLampGlow;`;

const FRAGMENT_LIVERY = `
#ifdef USE_MAP
  vec4 liveryTexel = texture2D( map, vMapUv );
  diffuseColor.rgb *= mix( vec3( 1.0 ), liveryTexel.rgb, step( 0.5, vSurface.x ) );
#endif
`;
