// The night lights of Port Sarab: street lamps strung along the boulevards, neon signs, headlights and
// sirens, all soft additive glow sprites with a hot core, drawn in one instanced batch. Fixed lamps are
// written once and cost nothing per frame (the shader fades them by distance and by night); glows that
// ride on a car or a person are moved every frame in a small region of their own.
import * as THREE from 'three';

/**
 * Create the glow batch and add it to game.scene.
 *   add({x, y, z, color, size, intensity?, entity?, offset?, flicker?, nightOnly?}) -> glow
 *   addBatch(list) -> glow[]      remove(glow)      removeFor(entity)      refresh(glow) after changing its fields
 * An entity glow follows entity.pos and entity.heading; `offset` {x, y, z} is in the entity's own space
 * (+Z forward, +X left). `flicker` 0..1 makes it waver like a dying tube or a flame; `nightOnly` lamps
 * fade out by day.
 * @param {{capacity?: number, movingCapacity?: number, maxDistance?: number}} [options]
 */
export function createLightGlows(game, options = {}) {
  const movingCapacity = options.movingCapacity || 256;
  const capacity = Math.max(movingCapacity + 64, options.capacity || 3072);
  const fixedCapacity = capacity - movingCapacity;

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const posAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const paramAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iPosSize', posAttr);
  geometry.setAttribute('iColor', colorAttr);
  geometry.setAttribute('iParams', paramAttr);
  geometry.instanceCount = movingCapacity;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  uniforms.uTime = { value: 0 };
  uniforms.uNight = { value: 0 };
  uniforms.uPixelScale = { value: 0.001 };
  uniforms.uMaxDistance = { value: options.maxDistance || 1100 };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GLOW_VERTEX_SHADER,
    fragmentShader: GLOW_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.name = 'effects-light-glows';
  game.scene.add(mesh);

  /** Glows that follow an entity, in slots [0, movingCapacity). */
  const moving = [];
  /** Fixed glows, in slots [movingCapacity, capacity). */
  const fixed = [];
  const color = new THREE.Color();
  let fixedDirtyMin = Infinity;
  let fixedDirtyMax = -1;

  /** Add one glow; returns it, or null when the batch is full. */
  function add(spec) {
    const glow = makeGlow(spec);
    const list = glow.entity ? moving : fixed;
    const limit = glow.entity ? movingCapacity : fixedCapacity;
    if (list.length >= limit) return null;
    glow.slot = list.length;
    list.push(glow);
    writeGlow(glow);
    return glow;
  }

  /** Add many fixed glows at once (a district's street lamps). */
  function addBatch(specs) {
    const result = [];
    if (!specs) return result;
    for (let i = 0; i < specs.length; i += 1) {
      const glow = add(specs[i]);
      if (glow) result.push(glow);
    }
    return result;
  }

  /** Take a glow away. */
  function remove(glow) {
    if (!glow || glow.slot < 0) return;
    const list = glow.entity ? moving : fixed;
    if (list[glow.slot] !== glow) return;
    const last = list.pop();
    if (last !== glow) {
      last.slot = glow.slot;
      list[last.slot] = last;
      writeGlow(last);
    }
    const emptied = list.length;
    clearSlot(glow.entity ? emptied : movingCapacity + emptied, !glow.entity);
    glow.slot = -1;
  }

  /** Take away every glow that rides on `entity` (a despawned car's headlights and siren). */
  function removeFor(entity) {
    if (!entity) return;
    for (let i = moving.length - 1; i >= 0; i -= 1) if (moving[i].entity === entity) remove(moving[i]);
  }

  /** Write a glow again after changing its colour, size, intensity, position or visibility. */
  function refresh(glow) {
    if (glow && glow.slot >= 0) writeGlow(glow);
  }

  /** Follow moving glows, and feed the shader the clock, the night and the camera's pixel size. */
  function update() {
    uniforms.uTime.value = game.time.elapsed;
    const sky = game.sky;
    uniforms.uNight.value = sky && typeof sky.night === 'number' ? Math.min(1, Math.max(0, sky.night)) : 0;
    const camera = game.camera;
    const height = (game.renderer && game.renderer.domElement && game.renderer.domElement.height) || 800;
    uniforms.uPixelScale.value = (2 * Math.tan(((camera.fov || 60) * Math.PI) / 360)) / Math.max(1, height);
    for (let i = 0; i < moving.length; i += 1) writeGlow(moving[i]);
    if (moving.length > 0) markRange(0, moving.length);
    if (fixedDirtyMax >= 0) {
      markRange(fixedDirtyMin, fixedDirtyMax - fixedDirtyMin + 1);
      fixedDirtyMin = Infinity;
      fixedDirtyMax = -1;
    }
    geometry.instanceCount = movingCapacity + fixed.length;
    mesh.visible = moving.length + fixed.length > 0;
  }

  function writeGlow(glow) {
    const slot = glow.entity ? glow.slot : movingCapacity + glow.slot;
    let x = glow.x;
    let y = glow.y;
    let z = glow.z;
    let on = glow.visible ? 1 : 0;
    const entity = glow.entity;
    if (entity) {
      const pos = entity.pos;
      if (!pos || entity.despawned) on = 0;
      else {
        const h = entity.heading || 0;
        const cs = Math.cos(h);
        const sn = Math.sin(h);
        const off = glow.offset;
        const ox = off ? off.x || 0 : 0;
        const oy = off ? off.y || 0 : 0;
        const oz = off ? off.z || 0 : 0;
        x = pos.x + ox * cs + oz * sn;
        y = pos.y + oy;
        z = pos.z - ox * sn + oz * cs;
      }
    }
    const o = slot * 4;
    const p = posAttr.array;
    p[o] = x;
    p[o + 1] = y;
    p[o + 2] = z;
    p[o + 3] = glow.size;
    color.set(glow.color);
    const c = colorAttr.array;
    c[o] = color.r;
    c[o + 1] = color.g;
    c[o + 2] = color.b;
    c[o + 3] = glow.intensity;
    const q = paramAttr.array;
    q[o] = glow.flicker;
    q[o + 1] = glow.nightOnly ? 1 : 0;
    q[o + 2] = glow.phase;
    q[o + 3] = on;
    if (!entity) {
      if (slot < fixedDirtyMin) fixedDirtyMin = slot;
      if (slot > fixedDirtyMax) fixedDirtyMax = slot;
    }
  }

  /** Switch off the glow in buffer slot `slot` (an absolute slot). */
  function clearSlot(slot, isFixed) {
    paramAttr.array[slot * 4 + 3] = 0;
    colorAttr.array[slot * 4 + 3] = 0;
    if (isFixed) {
      if (slot < fixedDirtyMin) fixedDirtyMin = slot;
      if (slot > fixedDirtyMax) fixedDirtyMax = slot;
    } else {
      markRange(slot, 1);
    }
  }

  function markRange(firstSlot, slots) {
    markAttributeRange(posAttr, firstSlot * 4, slots * 4);
    markAttributeRange(colorAttr, firstSlot * 4, slots * 4);
    markAttributeRange(paramAttr, firstSlot * 4, slots * 4);
  }

  return {
    add, addBatch, remove, removeFor, refresh, update, mesh,
    get count() { return moving.length + fixed.length; },
  };
}

/** Fill a glow record from what the caller passed. */
function makeGlow(spec) {
  return {
    slot: -1,
    x: spec.x || 0,
    y: spec.y || 0,
    z: spec.z || 0,
    color: spec.color === undefined ? 0xffd9a0 : spec.color,
    size: spec.size || 1.5,
    intensity: spec.intensity === undefined ? 1 : spec.intensity,
    entity: spec.entity || null,
    offset: spec.offset || null,
    flicker: spec.flicker || 0,
    nightOnly: !!spec.nightOnly,
    phase: spec.phase === undefined ? Math.random() : spec.phase,
    visible: spec.visible !== false,
  };
}

/** Upload part of an instance buffer (three r159+); older builds upload all of it. */
function markAttributeRange(attribute, start, count) {
  if (attribute.addUpdateRange) attribute.addUpdateRange(start, count);
  attribute.needsUpdate = true;
}

const GLOW_VERTEX_SHADER = /* glsl */ `
attribute vec4 iPosSize;
attribute vec4 iColor;
attribute vec4 iParams;
uniform float uTime;
uniform float uNight;
uniform float uPixelScale;
uniform float uMaxDistance;
varying vec2 vUv;
varying vec3 vColor;
#include <fog_pars_vertex>

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(iPosSize.xyz, 1.0);
  float dist = -mvPosition.z;
  float nightGate = iParams.y > 0.5 ? smoothstep(0.15, 0.75, uNight) : mix(0.55, 1.0, uNight);
  float flicker = 1.0;
  if (iParams.x > 0.0) {
    float t = uTime * 13.0 + iParams.z * 37.0;
    float wobble = 0.5 + 0.5 * sin(t) * sin(t * 1.73 + 1.3);
    flicker = 1.0 - iParams.x * wobble * 0.65;
  }
  float fade = 1.0 - smoothstep(uMaxDistance * 0.7, uMaxDistance, dist);
  float strength = iColor.a * nightGate * flicker * fade * iParams.w;
  if (strength < 0.002 || dist < 0.25) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUv = vec2(0.0);
    vColor = vec3(0.0);
    return;
  }
  float grow = 1.0 + clamp(dist / 160.0, 0.0, 2.5) * 0.55;
  float pulse = 1.0 + 0.07 * sin(uTime * 1.9 + iParams.z * 6.2831 + dist * 0.03) * smoothstep(60.0, 320.0, dist);
  float size = max(iPosSize.w * grow * pulse * mix(0.8, 1.0, uNight), dist * uPixelScale * 3.0);
  // Pull the sprite toward the camera, keeping its size on screen, so a lamp's own head or a wall
  // just behind it does not cut the halo.
  float keep = (dist - min(size * 0.5, dist * 0.5)) / dist;
  mvPosition.xyz *= keep;
  mvPosition.xy += position.xy * size * keep;
  gl_Position = projectionMatrix * mvPosition;
  vUv = position.xy * 2.0;
  vColor = iColor.rgb * strength;
  #include <fog_vertex>
}
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
#include <fog_pars_fragment>

void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 34.0);
  float halo = exp(-r2 * 8.0) * 0.55 + exp(-r2 * 3.6) * 0.1;
  float flare = exp(-abs(vUv.y) * 28.0) * (1.0 - abs(vUv.x)) * 0.22;
  float peak = max(vColor.r, max(vColor.g, vColor.b));
  vec3 hot = mix(vColor, vec3(peak), 0.75);
  vec3 col = vColor * (halo + flare) + hot * core * 1.3;
  col *= 1.0 - smoothstep(0.35, 1.0, r2);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogAmount = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogAmount = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    col *= 1.0 - fogAmount * 0.85;
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
