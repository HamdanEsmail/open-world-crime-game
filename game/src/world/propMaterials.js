// The few materials all of Port Sarab's street furniture shares: painted props that take each copy's
// own colour on chosen parts and light their lamps at night, wind-blown foliage cut from one painted
// atlas (with a matching shadow caster), printed faces (adverts, street names, rugs) read per copy
// from a texture atlas, and the self-lit lenses of the traffic lights.
import * as THREE from 'three';

/**
 * Create the shared materials and the uniforms that drive them: uTime (seconds), uWind (0 calm ..
 * about 2.5 in a khamsin), uWindDir (unit vector on the ground the wind blows toward) and uNight (0..1).
 */
export function createFurnitureMaterials(game) {
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: 0.6 },
    uWindDir: { value: new THREE.Vector2(0.3, 0.95) },
    uNight: { value: 0 },
  };
  const prop = createPaintedPropMaterial(uniforms);
  const lens = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  lens.name = 'signal-lens';
  let windTarget = 0.6;

  return {
    uniforms,
    prop,
    lens,
    createPaintedPropMaterial: (options) => createPaintedPropMaterial(uniforms, options),
    createFoliageMaterials: (texture) => createFoliageMaterials(uniforms, texture),
    createPrintedFaceMaterial: (texture, nightGlow) => createPrintedFaceMaterial(uniforms, texture, nightGlow),

    /** Advance the wind clock and read the night and the khamsin. */
    update(dt) {
      uniforms.uTime.value += dt;
      const sky = game.sky;
      uniforms.uNight.value = sky && typeof sky.night === 'number' ? clamp01(sky.night) : nightFromHour(game.time.hour);
      const weather = game.weather;
      let wx = 0.3;
      let wz = 0.95;
      windTarget = 0.6;
      if (weather && weather.wind) {
        const speed = Math.hypot(weather.wind.x, weather.wind.z);
        if (speed > 0.01) {
          wx = weather.wind.x / speed;
          wz = weather.wind.z / speed;
        }
        windTarget = Math.min(2.6, 0.35 + speed / 11);
      } else if (weather && typeof weather.sandstorm === 'number') {
        windTarget = 0.6 + 2 * weather.sandstorm;
      }
      const k = 1 - Math.exp(-1.5 * Math.max(0, dt));
      uniforms.uWind.value += (windTarget - uniforms.uWind.value) * k;
      const dir = uniforms.uWindDir.value;
      dir.x += (wx - dir.x) * k;
      dir.y += (wz - dir.y) * k;
      const length = Math.hypot(dir.x, dir.y) || 1;
      dir.x /= length;
      dir.y /= length;
    },
  };
}

/**
 * Lambert with vertex colours, where parts flagged `tint` take the copy's instance colour, parts
 * flagged `glow` light up after dark, and parts flagged `bend` sway in the wind.
 */
function createPaintedPropMaterial(uniforms, options = {}) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: !!options.transparent });
  material.name = 'painted-prop';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.uniforms.uNight = uniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PROP_VERTEX_HEADER}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_SWAY_VERTEX}`)
      .replace('#include <color_vertex>', TINTED_COLOR_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vPropGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vPropGlow * smoothstep(0.12, 0.7, uNight) * 2.4;');
  };
  material.customProgramCacheKey = () => 'port-sarab-painted-prop-v1';
  return material;
}

/**
 * Foliage: the painted leaf atlas cut out by alpha, both sides lit, tinted per copy and swaying.
 * Returns { material, depth } where depth is the matching shadow caster (customDepthMaterial).
 */
function createFoliageMaterials(uniforms, texture) {
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    vertexColors: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x0b1404),
  });
  material.name = 'foliage';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.uniforms.uNight = uniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PROP_VERTEX_HEADER}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_SWAY_VERTEX}`)
      .replace('#include <color_vertex>', TINTED_COLOR_VERTEX);
    // Leaves are lit by their authored normals on both faces (no flip for the back), so a crown
    // reads as one soft mass rather than a stack of light and dark cards.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');
  };
  material.customProgramCacheKey = () => 'port-sarab-foliage-v1';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5 });
  depth.name = 'foliage-shadow';
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SWAY_VERTEX_HEADER}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_SWAY_VERTEX}`);
  };
  depth.customProgramCacheKey = () => 'port-sarab-foliage-depth-v1';
  return { material, depth };
}

/**
 * Printed faces: a texture atlas where each copy reads its own rectangle (instanced attribute
 * uvRect = [u, v, width, height]); `nightGlow` lights the print after dark (a lit billboard).
 */
function createPrintedFaceMaterial(uniforms, texture, nightGlow = 0) {
  const material = new THREE.MeshLambertMaterial({ map: texture });
  material.name = 'printed-face';
  const glow = { value: nightGlow };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uniforms.uNight;
    shader.uniforms.uFaceGlow = glow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = uvRect.xy + uv * uvRect.zw;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform float uFaceGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uFaceGlow * smoothstep(0.15, 0.75, uNight);');
  };
  material.customProgramCacheKey = () => `port-sarab-printed-face-v1-${nightGlow > 0 ? 'lit' : 'plain'}`;
  return material;
}

/** Without a sky system: dark from 20:00 to 05:30, with an hour of dusk and dawn. */
function nightFromHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7 && h <= 18) return 0;
  if (h > 18 && h < 20) return (h - 18) / 2;
  if (h > 5 && h < 7) return 1 - (h - 5) / 2;
  return 1;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

const SWAY_VERTEX_HEADER = /* glsl */ `
attribute vec3 propFlags;
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
`;

const PROP_VERTEX_HEADER = /* glsl */ `${SWAY_VERTEX_HEADER}
uniform float uNight;
varying float vPropGlow;
`;

// Sway: a slow lean with the wind, a rocking swing and a quick flutter at the tips, all scaled by the
// vertex's bend flag. The push is built in world axes and turned into the copy's own frame, so every
// palm in the street leans the same way when the khamsin blows.
const WIND_SWAY_VERTEX = /* glsl */ `
{
  float swayBend = propFlags.z;
  if (swayBend > 0.0) {
    #ifdef USE_INSTANCING
      vec3 swayOrigin = instanceMatrix[3].xyz;
    #else
      vec3 swayOrigin = vec3(0.0);
    #endif
    float swaySeed = dot(swayOrigin.xz, vec2(0.071, 0.053));
    float gust = 0.62 + 0.38 * sin(uTime * 0.29 + swaySeed * 0.37) * sin(uTime * 0.83 + swaySeed);
    float rock = sin(uTime * 1.05 + swaySeed) * 0.6 + sin(uTime * 1.87 + swaySeed * 1.31) * 0.4;
    float flutter = sin(uTime * 4.6 + swaySeed * 2.1 + (position.x + position.z) * 1.9);
    float push = uWind * gust * swayBend;
    vec3 along = vec3(uWindDir.x, 0.0, uWindDir.y);
    vec3 across = vec3(-uWindDir.y, 0.0, uWindDir.x);
    vec3 swayWorld = along * push * (0.16 * uWind + 0.2 * rock) + across * push * 0.1 * rock;
    swayWorld.y += flutter * 0.06 * push * swayBend;
    swayWorld += across * flutter * 0.035 * push * swayBend;
    #ifdef USE_INSTANCING
      mat3 swayBasis = mat3(instanceMatrix);
      float swayScale2 = max(dot(swayBasis[0], swayBasis[0]), 1e-4);
      transformed += (transpose(swayBasis) * swayWorld) / swayScale2;
    #else
      transformed += swayWorld;
    #endif
  }
}
`;

// Vertex colours times the copy's colour, but only where the part is flagged to take it.
const TINTED_COLOR_VERTEX = /* glsl */ `
#if defined( USE_COLOR_ALPHA )
  vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, propFlags.x );
#endif
vPropGlow = propFlags.y;
`;
