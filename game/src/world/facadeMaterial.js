// The material every building in Port Sarab is drawn with: a Lambert surface that reads its look
// from the facade atlas, takes each building's tint, mirrors the sky and catches the sun in its
// glass, and after dusk lights a random share of windows (and every sign) so the skyline sparkles.
// Two variants share one set of uniforms: solid walls, and cut-out lattices seen from both sides.
import * as THREE from 'three';

/**
 * Make the solid and cut-out facade materials for `atlas` (from createFacadeAtlas).
 * Call applyLighting(game) once a frame to follow the sky and the night.
 */
export function createFacadeMaterials(atlas) {
  const uniforms = {
    uTileRect: { value: atlas.tileRects },
    uTileInfo: { value: atlas.tileInfo },
    uWindowGlow: { value: 0 },
    uLitShare: { value: 0 },
    uSignGlow: { value: 0.55 },
    uSkyZenith: { value: new THREE.Color(0x3a72c0) },
    uSkyHorizon: { value: new THREE.Color(0xf6d5a2) },
    uGroundReflect: { value: new THREE.Color(0xa88660) },
    uSunDirection: { value: new THREE.Vector3(-0.9, 0.22, -0.38).normalize() },
    uSunGlint: { value: new THREE.Color(0xffc880).multiplyScalar(3) },
  };
  const solid = makeFacadeMaterial(atlas, uniforms, false);
  const cutout = makeFacadeMaterial(atlas, uniforms, true);

  /** Follow the sky: night lights, sky colours in the glass, the sun's glint. */
  function applyLighting(game) {
    const sky = game.sky;
    const night = clamp01(sky?.night ?? 0);
    uniforms.uLitShare.value = smoothstep(0.06, 0.65, night);
    uniforms.uWindowGlow.value = 0.9 * smoothstep(0.04, 0.5, night);
    uniforms.uSignGlow.value = 0.22 + 1.18 * smoothstep(0.05, 0.6, night);
    const colors = sky?.colors;
    if (colors?.zenith) {
      uniforms.uSkyZenith.value.copy(colors.zenith);
      uniforms.uSkyHorizon.value.copy(colors.horizon);
      if (colors.ground) uniforms.uGroundReflect.value.copy(colors.ground).multiplyScalar(0.6);
    } else if (game.scene?.fog?.color) {
      uniforms.uSkyHorizon.value.copy(game.scene.fog.color);
    }
    if (sky?.sunDirection) uniforms.uSunDirection.value.copy(sky.sunDirection);
    if (sky?.sunLight) {
      uniforms.uSunGlint.value.copy(sky.sunLight.color).multiplyScalar((sky.sunLight.intensity || 0) * 0.9);
    }
  }

  return { solid, cutout, uniforms, applyLighting };
}

function makeFacadeMaterial(atlas, uniforms, cutout) {
  const material = new THREE.MeshLambertMaterial({
    map: atlas.colorTexture,
    emissiveMap: atlas.glowTexture,
    emissive: 0xffffff,
    vertexColors: true,
    side: cutout ? THREE.DoubleSide : THREE.FrontSide,
  });
  material.name = cutout ? 'portSarabFacadeCutout' : 'portSarabFacade';
  material.defines = { FACADE_TILE_COUNT: atlas.tileList.length, ATLAS_SIZE: `${atlas.size.toFixed(1)}` };
  if (cutout) material.defines.FACADE_CUTOUT = '';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n${VERTEX_TILE_LOOKUP}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n  vFacadeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace('#include <map_fragment>', FRAGMENT_ATLAS_LOOKUP)
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', FRAGMENT_LIGHTS_AND_GLASS);
  };
  material.customProgramCacheKey = () => (cutout ? 'port-sarab-facade-cutout' : 'port-sarab-facade');
  return material;
}

const VERTEX_DECLARATIONS = /* glsl */ `
attribute vec2 facadeTile;
uniform vec4 uTileRect[FACADE_TILE_COUNT];
uniform vec4 uTileInfo[FACADE_TILE_COUNT];
varying vec4 vTileRect;
varying vec4 vTileInfo;
varying float vBuildingSeed;
varying vec3 vFacadeWorld;
`;

const VERTEX_TILE_LOOKUP = /* glsl */ `
  int facadeIndex = int(facadeTile.x + 0.5);
  vTileRect = uTileRect[facadeIndex];
  vTileInfo = uTileInfo[facadeIndex];
  vBuildingSeed = facadeTile.y;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform float uWindowGlow;
uniform float uLitShare;
uniform float uSignGlow;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGroundReflect;
uniform vec3 uSunDirection;
uniform vec3 uSunGlint;
varying vec4 vTileRect;
varying vec4 vTileInfo;
varying float vBuildingSeed;
varying vec3 vFacadeWorld;

float facadeHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// The tile repeats across the face (vMapUv counts repeats); fract() finds the spot inside the
// tile and the explicit gradients keep mipmaps smooth across the seams. The alpha channel says
// how much of the building's tint a pixel takes (and, for lattices, where the holes are).
const FRAGMENT_ATLAS_LOOKUP = /* glsl */ `
  vec2 facadeRepeat = vMapUv;
  vec2 facadeAtlasUv = vTileRect.xy + fract(facadeRepeat) * vTileRect.zw;
  // One mip level for both atlases, from the unwrapped UVs (so tile seams never pick a wrong one),
  // leaning toward the sharper axis so facades seen along a street stay crisp.
  vec2 facadeDx = dFdx(facadeRepeat) * vTileRect.zw * ATLAS_SIZE;
  vec2 facadeDy = dFdy(facadeRepeat) * vTileRect.zw * ATLAS_SIZE;
  float facadeA = dot(facadeDx, facadeDx);
  float facadeB = dot(facadeDy, facadeDy);
  float facadeLodBlurry = 0.5 * log2(max(max(facadeA, facadeB), 1e-8));
  float facadeLodSharp = 0.5 * log2(max(min(facadeA, facadeB), 1e-8));
  float facadeLod = max(0.0, mix(facadeLodBlurry, facadeLodSharp, 0.4));
  vec4 facadeTexel = textureLod(map, facadeAtlasUv, facadeLod);
  #ifdef FACADE_CUTOUT
    if (facadeTexel.a < 0.3) discard;
  #endif
  float facadeTintMix = smoothstep(0.72, 0.9, facadeTexel.a);
  diffuseColor.rgb *= facadeTexel.rgb * mix(vec3(1.0), vColor.rgb, facadeTintMix);
  diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 6.0, vFacadeWorld.y));
`;

// Night: window tiles light a share of their windows, chosen per window and per floor from the
// building's seed, warm or cool; signs and pools always glow, neon in its own tint. Day and
// night: glass mirrors a sky gradient (and the sand below the horizon) and flashes in the sun.
const FRAGMENT_LIGHTS_AND_GLASS = /* glsl */ `
  vec3 facadeGlow = vec3(0.0);
  if (vTileInfo.w > 0.5 || vTileInfo.z > 0.01) facadeGlow = textureLod(emissiveMap, facadeAtlasUv, facadeLod).rgb;
  float facadeLight = 0.0;
  vec3 facadeLightColor = facadeGlow;
  if (vTileInfo.w > 2.5) {
    facadeLight = uSignGlow;
    facadeLightColor = facadeGlow * vColor.rgb * 1.1;
  } else if (vTileInfo.w > 1.5) {
    facadeLight = uSignGlow;
  } else if (vTileInfo.w > 0.5) {
    vec2 facadeCell = floor(facadeRepeat * vTileInfo.xy);
    float facadePick = mix(facadeHash(facadeCell + vBuildingSeed * 97.0), facadeHash(vec2(vBuildingSeed * 53.0, facadeCell.y)), 0.5);
    float facadeShare = uLitShare * (0.14 + 0.36 * fract(vBuildingSeed * 7.31));
    facadeLight = step(facadePick, facadeShare) * uWindowGlow;
    float facadeTone = facadeHash(facadeCell * 1.7 + 11.0);
    facadeLightColor *= (0.45 + 0.55 * fract(facadeTone * 13.7)) * (facadeTone > 0.84 ? vec3(0.62, 0.8, 1.05) : vec3(1.0, 0.72 + 0.2 * facadeTone, 0.42 + 0.3 * facadeTone));
  }
  totalEmissiveRadiance = facadeLightColor * facadeLight;

  float facadeGlass = clamp(max(facadeGlow.r, max(facadeGlow.g, facadeGlow.b)) * 1.6, 0.0, 1.0) * vTileInfo.z;
  if (facadeGlass > 0.01) {
    vec3 facadeView = normalize(vFacadeWorld - cameraPosition);
    vec3 facadeNormal = inverseTransformDirection(normal, viewMatrix);
    vec3 facadeMirror = reflect(facadeView, facadeNormal);
    float facadeFresnel = pow(1.0 - clamp(dot(-facadeView, facadeNormal), 0.0, 1.0), 4.0);
    // Higher floors see more open sky; low ones mostly the street and the towers opposite.
    float facadeOpenSky = 0.2 + 0.45 * smoothstep(8.0, 220.0, vFacadeWorld.y);
    vec3 facadeSky = facadeMirror.y >= 0.0
      ? mix(uSkyHorizon, uSkyZenith, clamp(facadeOpenSky + 0.8 * facadeMirror.y, 0.0, 1.0))
      : mix(uSkyHorizon * 0.85, uGroundReflect, clamp(-facadeMirror.y * 4.0, 0.0, 1.0));
    vec3 facadeGlassTint = mix(vec3(1.0), vColor.rgb, 0.6 * facadeTintMix);
    float facadeSun = pow(max(dot(facadeMirror, uSunDirection), 0.0), 40.0);
    float facadeLit = min(facadeLight, 1.0);
    vec3 facadeMirrored = facadeSky * facadeGlassTint * (0.32 + 0.68 * facadeFresnel) + uSunGlint * facadeSun;
    totalEmissiveRadiance += facadeMirrored * facadeGlass * (1.0 - 0.75 * facadeLit);
    diffuseColor.rgb *= 1.0 - facadeGlass * 0.55;
  }
`;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
