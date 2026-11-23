// The one material the ground of Port Sarab is drawn with: a lit, shadowed, fogged Lambert surface
// whose every triangle picks its own swatch of the surface atlas (asphalt, pavers, lawn, sand ...)
// and repeats it seamlessly in world metres. A twin with a depth offset lays road paint, inlays and
// patches on top without flicker; a third casts shadows for kerbs, walls and hedges.
import * as THREE from 'three';
import { ATLAS, paintGroundSurfaceAtlas } from './groundSurfaceAtlas.js';

/**
 * Build the atlas texture and the three ground materials.
 * @param {THREE.WebGLRenderer} renderer   used for the anisotropy limit
 * @returns {{ base: THREE.MeshLambertMaterial, paint: THREE.MeshLambertMaterial, solid: THREE.MeshLambertMaterial, texture: THREE.CanvasTexture }}
 */
export function createGroundSurfaceMaterials(renderer) {
  const texture = new THREE.CanvasTexture(paintGroundSurfaceAtlas());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);

  const base = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true });
  const paint = new THREE.MeshLambertMaterial({
    map: texture, vertexColors: true, alphaTest: 0.4,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
  });
  const solid = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true });
  for (const material of [base, paint, solid]) teachSwatchSampling(material);
  base.name = 'ground-base';
  paint.name = 'ground-paint';
  solid.name = 'ground-solid';
  return { base, paint, solid, texture };
}

/**
 * Rewrite the material's texture lookup: the `surfaceTile` attribute names the atlas slot, `uv` is
 * the position in swatch repeats. The lookup wraps inside the slot with explicit gradients (no mip
 * seams), caps the blur so neighbouring slots never bleed in, and fades far ground to the swatch's
 * average colour so distant paving does not shimmer.
 */
function teachSwatchSampling(material) {
  const { size, slot, pad, span, columns } = ATLAS;
  const f = (n) => n.toFixed(6);
  const sheen = SWATCH_SHEEN.map((s) => f(s)).join(', ');
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float surfaceTile;\nvarying float vSurfaceTile;\nvarying vec2 vSurfaceUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSurfaceTile = surfaceTile;\nvSurfaceUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSurfaceTile;\nvarying vec2 vSurfaceUv;')
      .replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>
        // A broad forward sheen: asphalt, polished stone and water glow when you look toward a low sun.
        float groundSheenOf(float tile) {
          float table[16] = float[16](${sheen});
          return table[int(clamp(floor(tile + 0.5), 0.0, 15.0))];
        }
        void RE_Direct_GroundSheen(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight) {
          RE_Direct_Lambert(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
          vec3 halfDir = normalize(directLight.direction + geometryViewDir);
          float dotNH = saturate(dot(geometryNormal, halfDir));
          float grazing = 1.0 - saturate(dot(geometryNormal, geometryViewDir));
          float glow = pow(dotNH, 22.0) * (0.35 + 0.65 * grazing * grazing);
          reflectedLight.directDiffuse += directLight.color * glow * groundSheenOf(vSurfaceTile) * 0.16;
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_GroundSheen
      `)
      .replace('#include <map_fragment>', `
        {
          float slotIndex = floor(vSurfaceTile + 0.5);
          vec2 slotCell = vec2(mod(slotIndex, ${f(columns)}), floor(slotIndex / ${f(columns)} + 0.001));
          vec2 slotOrigin = slotCell * ${f(slot / size)} + ${f(pad / size)};
          vec2 atlasUv = slotOrigin + fract(vSurfaceUv) * ${f(span / size)};
          vec2 gx = dFdx(vSurfaceUv) * ${f(span / size)};
          vec2 gy = dFdy(vSurfaceUv) * ${f(span / size)};
          float texelsPerPixel = max(length(gx), length(gy)) * ${f(size)};
          float capped = min(1.0, 6.0 / max(texelsPerPixel, 0.0001));
          vec4 detail = textureGrad(map, atlasUv, gx * capped, gy * capped);
          vec4 average = textureLod(map, (slotCell + 0.5) * ${f(slot / size)}, 7.0);
          float farAway = smoothstep(2.0, 4.2, log2(max(texelsPerPixel, 0.0001)));
          vec4 sampledDiffuseColor = mix(detail, vec4(average.rgb, detail.a), farAway);
          diffuseColor *= sampledDiffuseColor;
        }
      `);
  };
  material.customProgramCacheKey = () => 'port-sarab-ground-swatches';
}

/** How strongly each swatch catches the low sun (asphalt, paint, pavers, kerb, granite, cobbles, earth,
 *  decking, concrete, lawn, dark stone, sand, tiles, pool, dirt). */
const SWATCH_SHEEN = [0.55, 0.4, 0.3, 0.16, 0.2, 0.32, 0.12, 0.04, 0.18, 0.14, 0.0, 0.9, 0.14, 0.45, 1.4, 0.06];
