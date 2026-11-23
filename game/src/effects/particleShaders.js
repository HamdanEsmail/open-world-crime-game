// The GPU side of Port Sarab's particles: how each instanced quad turns to face the camera, lies flat
// on the ground or streaks along its flight, is pulled clear of the ground it would slice into, picks
// its frame from the sprite atlas, catches the sun on its top and the sky on its underside, and fades
// into the haze. One program serves both batches; GLOW_BATCH switches it to additive light.

/**
 * Per-instance attributes: iPosSize (x, y, z, size), iColor (r, g, b, alpha),
 * iMisc (rotation, atlas frame, streak factor, mode: 0 facing, 1 flat, 2 overlay), iVel (vx, vy, vz, lit).
 */
export const PARTICLE_VERTEX_SHADER = /* glsl */ `
attribute vec4 iPosSize;
attribute vec4 iColor;
attribute vec4 iMisc;
attribute vec4 iVel;
uniform float uPixelScale;
uniform float uNear;
uniform vec3 uSunTint;
uniform vec3 uShadeTint;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vLight;
#include <fog_pars_vertex>

void main() {
  vec2 corner = position.xy;
  float size = iPosSize.w;
  float cs = cos(iMisc.x);
  float sn = sin(iMisc.x);
  vec2 turned = vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs);
  vec4 mvPosition;
  if (iMisc.w > 0.5 && iMisc.w < 1.5) {
    mvPosition = modelViewMatrix * vec4(iPosSize.xyz + vec3(turned.x * size, 0.0, turned.y * size), 1.0);
  } else {
    mvPosition = modelViewMatrix * vec4(iPosSize.xyz, 1.0);
    float depth = max(-mvPosition.z, 0.001);
    if (iMisc.z > 0.0) {
      vec3 viewVel = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xyz;
      float speed = length(viewVel.xy);
      vec2 dir = speed > 0.0001 ? viewVel.xy / speed : vec2(0.0, 1.0);
      vec2 side = vec2(dir.y, -dir.x);
      float width = max(size, depth * uPixelScale * 2.5);
      float len = width + speed * iMisc.z;
      mvPosition.xy += side * (corner.x * width) + dir * (corner.y * len);
    } else {
      // Pull big sprites toward the camera (keeping their size on screen) so a fireball or a dust
      // cloud is not sliced flat where it meets the ground or a wall.
      #ifdef GLOW_BATCH
        float pull = iMisc.w > 1.5 ? depth * 0.8 : min(size * 0.45, depth * 0.5);
      #else
        float pull = min(size * 0.3, depth * 0.35);
      #endif
      float keep = (depth - pull) / depth;
      mvPosition.xyz *= keep;
      mvPosition.xy += turned * size * keep;
    }
  }
  float frame = iMisc.y + 0.5;
  float column = floor(mod(frame, 4.0));
  float row = floor(frame / 4.0);
  vec2 cellUv = mix(vec2(0.04), vec2(0.96), corner + 0.5);
  vUv = vec2((column + cellUv.x) / 4.0, (3.0 - row + cellUv.y) / 4.0);
  float viewDepth = -mvPosition.z;
  float nearFade = smoothstep(uNear, uNear + 0.5 + size * 0.6, viewDepth);
  vColor = vec4(iColor.rgb, iColor.a * nearFade);
  float up = clamp(turned.y + 0.5, 0.0, 1.0);
  vec3 light = mix(uShadeTint, uSunTint, smoothstep(0.05, 0.95, up));
  vLight = mix(vec3(1.0), light, iVel.w);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

/** Premultiplied atlas in, premultiplied colour out: soft batch blends One/OneMinusSrcAlpha, glow batch One/One. */
export const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vLight;
#include <fog_pars_fragment>

void main() {
  #if __VERSION__ >= 300
    // Never sample below mip level 3 (16 px per frame): coarser levels would bleed neighbouring frames.
    vec2 ddx = dFdx(vUv * 512.0);
    vec2 ddy = dFdy(vUv * 512.0);
    float lod = 0.5 * log2(max(max(dot(ddx, ddx), dot(ddy, ddy)), 1e-8));
    vec4 texel = textureLod(uAtlas, vUv, clamp(lod, 0.0, 3.0));
  #else
    vec4 texel = texture2D(uAtlas, vUv);
  #endif
  float alpha = texel.a * vColor.a;
  if (alpha < 0.002) discard;
  vec3 straight = texel.rgb / max(texel.a, 0.004);
  gl_FragColor = vec4(straight * vColor.rgb * vLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogAmount = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogAmount = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    #ifdef GLOW_BATCH
      alpha *= 1.0 - fogAmount;
    #else
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogAmount);
    #endif
  #endif
  #ifdef GLOW_BATCH
    gl_FragColor = vec4(gl_FragColor.rgb * alpha, 0.0);
  #else
    gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
  #endif
}
`;
