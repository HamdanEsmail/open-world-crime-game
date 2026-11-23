// The light beacons that mark mission goals in Port Sarab: a tall translucent column of light in the
// marker's colour that softens as it rises, a pulsing ring on the ground the size of the goal, a ripple
// running out across it and a slowly turning diamond above it. Every marker with `beacon: true` gets
// one; all of them are drawn by a single instanced mesh and stay readable from 300 m away.
import * as THREE from 'three';

/**
 * Create the beacon batch and add it to game.scene. It follows game.markers.list by itself.
 * @param {{capacity?: number, columnHeight?: number}} [options]
 */
export function createMarkerBeacons(game, options = {}) {
  const capacity = options.capacity || 48;
  const geometry = buildBeaconGeometry();
  const baseAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iBase', baseAttr);
  geometry.setAttribute('iColor', colorAttr);
  geometry.instanceCount = 0;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  uniforms.uTime = { value: 0 };
  uniforms.uPixelScale = { value: 0.001 };
  uniforms.uColumnHeight = { value: options.columnHeight || 120 };
  uniforms.uNight = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: BEACON_VERTEX_SHADER,
    fragmentShader: BEACON_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  mesh.name = 'effects-mission-beacons';
  game.scene.add(mesh);

  const color = new THREE.Color();
  let shown = 0;

  /** Rebuild the beacon list from the markers: positions follow entities and the ground. */
  function update() {
    uniforms.uTime.value = game.time.elapsed;
    const camera = game.camera;
    const height = (game.renderer && game.renderer.domElement && game.renderer.domElement.height) || 800;
    uniforms.uPixelScale.value = (2 * Math.tan(((camera.fov || 60) * Math.PI) / 360)) / Math.max(1, height);
    const sky = game.sky;
    uniforms.uNight.value = sky && typeof sky.night === 'number' ? sky.night : 0;
    const markers = game.markers && game.markers.list;
    let count = 0;
    if (markers) {
      for (let i = 0; i < markers.length && count < capacity; i += 1) {
        const marker = markers[i];
        if (!marker || !marker.beacon) continue;
        const pos = marker.entity && marker.entity.pos ? marker.entity.pos : marker.pos;
        if (!pos) continue;
        const x = pos.x;
        const z = pos.z;
        let y = groundHeight(x, z);
        if (marker.entity) y = Number.isFinite(pos.y) ? pos.y : y;
        else if (Number.isFinite(pos.y) && pos.y > y + 0.5) y = pos.y;
        const o = count * 4;
        const base = baseAttr.array;
        base[o] = x;
        base[o + 1] = y;
        base[o + 2] = z;
        base[o + 3] = marker.radius || 3;
        color.set(marker.color === undefined ? 0xffd24a : marker.color);
        const c = colorAttr.array;
        c[o] = color.r;
        c[o + 1] = color.g;
        c[o + 2] = color.b;
        c[o + 3] = (marker.id || i) * 0.6180339;
        count += 1;
      }
    }
    if (count > 0 || shown > 0) {
      markRange(baseAttr, count * 4);
      markRange(colorAttr, count * 4);
    }
    shown = count;
    geometry.instanceCount = count;
    mesh.visible = count > 0;
  }

  function groundHeight(x, z) {
    const terrain = game.terrain;
    if (!terrain || typeof terrain.heightAt !== 'function') return 0;
    const h = terrain.heightAt(x, z);
    return Number.isFinite(h) ? Math.max(h, (game.config && game.config.world && game.config.world.seaLevel) || -100) : 0;
  }

  return {
    update, mesh,
    get count() { return shown; },
  };
}

/**
 * One beacon's shape in unit space, every part tagged so the shader can size and animate it:
 * 0 the light column, 1 the ground ring, 2 the outgoing ripple, 3 the faint disc, 4 the diamond.
 */
function buildBeaconGeometry() {
  const positions = [];
  const normals = [];
  const parts = [];
  const push = (x, y, z, nx, ny, nz, part) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    parts.push(part);
  };
  const columnSegments = 24;
  for (let i = 0; i < columnSegments; i += 1) {
    const a0 = (i / columnSegments) * Math.PI * 2;
    const a1 = ((i + 1) / columnSegments) * Math.PI * 2;
    const c0 = Math.cos(a0); const s0 = Math.sin(a0);
    const c1 = Math.cos(a1); const s1 = Math.sin(a1);
    push(c0, 0, s0, c0, 0, s0, 0); push(c1, 0, s1, c1, 0, s1, 0); push(c1, 1, s1, c1, 0, s1, 0);
    push(c0, 0, s0, c0, 0, s0, 0); push(c1, 1, s1, c1, 0, s1, 0); push(c0, 1, s0, c0, 0, s0, 0);
  }
  addAnnulus(push, 0.84, 1.0, 64, 1);
  addAnnulus(push, 0.9, 1.0, 64, 2);
  addAnnulus(push, 0.0, 1.0, 48, 3);
  const tips = [[0, 1, 0], [0, -1, 0]];
  const ring = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
  for (let t = 0; t < 2; t += 1) {
    const tip = tips[t];
    for (let i = 0; i < 4; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % 4];
      const nx = tip[0] + a[0] + b[0];
      const ny = tip[1] + a[1] + b[1];
      const nz = tip[2] + a[2] + b[2];
      const nl = Math.hypot(nx, ny, nz);
      push(tip[0], tip[1], tip[2], nx / nl, ny / nl, nz / nl, 4);
      push(a[0], a[1], a[2], nx / nl, ny / nl, nz / nl, 4);
      push(b[0], b[1], b[2], nx / nl, ny / nl, nz / nl, 4);
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('beaconNormal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('part', new THREE.Float32BufferAttribute(parts, 1));
  return geometry;
}

/** A flat ring (or a disc when inner is 0) in the ground plane, as triangles. */
function addAnnulus(push, inner, outer, segments, part) {
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0); const s0 = Math.sin(a0);
    const c1 = Math.cos(a1); const s1 = Math.sin(a1);
    push(c0 * inner, 0, s0 * inner, 0, 1, 0, part);
    push(c0 * outer, 0, s0 * outer, 0, 1, 0, part);
    push(c1 * outer, 0, s1 * outer, 0, 1, 0, part);
    if (inner > 0) {
      push(c0 * inner, 0, s0 * inner, 0, 1, 0, part);
      push(c1 * outer, 0, s1 * outer, 0, 1, 0, part);
      push(c1 * inner, 0, s1 * inner, 0, 1, 0, part);
    }
  }
}

function markRange(attribute, count) {
  if (attribute.addUpdateRange) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, Math.max(4, count));
  }
  attribute.needsUpdate = true;
}

const BEACON_VERTEX_SHADER = /* glsl */ `
attribute vec3 beaconNormal;
attribute float part;
attribute vec4 iBase;
attribute vec4 iColor;
uniform float uTime;
uniform float uPixelScale;
uniform float uColumnHeight;
varying float vPart;
varying vec3 vColor;
varying float vAlpha;
varying float vHeight;
varying float vRadial;
varying vec3 vViewNormal;
varying vec3 vViewDir;
#include <fog_pars_vertex>

void main() {
  vec3 base = iBase.xyz;
  float radius = iBase.w;
  float t = uTime + iColor.a * 7.0;
  vec4 mvBase = modelViewMatrix * vec4(base, 1.0);
  float dist = length(mvBase.xyz);
  vec3 p = position;
  vec3 n = beaconNormal;
  vec3 world;
  vAlpha = 1.0;
  vHeight = 0.0;
  vRadial = length(p.xz);
  if (part < 0.5) {
    float columnRadius = max(clamp(radius * 0.3, 0.7, 2.0), dist * uPixelScale * 4.0);
    world = base + vec3(p.x * columnRadius, p.y * uColumnHeight, p.z * columnRadius);
    vHeight = p.y;
  } else if (part < 1.5) {
    float ringRadius = radius * (1.0 + 0.035 * sin(t * 3.0));
    float ringWidth = max(radius * 0.16, dist * uPixelScale * 3.0);
    float r = length(p.xz);
    vec2 dir = p.xz / max(r, 0.0001);
    float rr = r < 0.92 ? max(ringRadius - ringWidth, 0.0) : ringRadius;
    world = base + vec3(dir.x * rr, 0.07, dir.y * rr);
    vAlpha = 0.72 + 0.2 * sin(t * 3.0);
  } else if (part < 2.5) {
    float k = fract(t * 0.55);
    float rr = radius * mix(0.2, 1.0, k);
    world = base + vec3(p.x * rr, 0.08, p.z * rr);
    vAlpha = (1.0 - k) * smoothstep(0.0, 0.12, k) * 0.8;
  } else if (part < 3.5) {
    world = base + vec3(p.x * radius, 0.06, p.z * radius);
  } else {
    float s = max(clamp(radius * 0.16, 0.42, 0.85), dist * uPixelScale * 5.0);
    float a = t * 1.6;
    float c = cos(a);
    float sn = sin(a);
    vec3 q = vec3(p.x * c - p.z * sn, p.y * 1.55, p.x * sn + p.z * c) * s;
    n = vec3(n.x * c - n.z * sn, n.y, n.x * sn + n.z * c);
    world = base + q + vec3(0.0, 2.6 + s * 1.6 + 0.25 * sin(t * 2.2), 0.0);
  }
  vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
  vViewNormal = normalize(normalMatrix * n);
  vViewDir = normalize(-mvPosition.xyz);
  vPart = part;
  vColor = iColor.rgb;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const BEACON_FRAGMENT_SHADER = /* glsl */ `
uniform float uNight;
varying float vPart;
varying vec3 vColor;
varying float vAlpha;
varying float vHeight;
varying float vRadial;
varying vec3 vViewNormal;
varying vec3 vViewDir;
#include <fog_pars_fragment>

void main() {
  vec3 color = vColor;
  float alpha = vAlpha;
  if (vPart < 0.5) {
    float facing = abs(dot(normalize(vViewNormal), normalize(vViewDir)));
    float core = pow(facing, 2.0);
    float rise = pow(1.0 - vHeight, 2.4);
    float foot = smoothstep(0.0, 0.01, vHeight);
    alpha = (0.07 + 0.5 * rise) * core * foot;
    color = mix(vColor, vec3(1.0), 0.35 * core * rise);
  } else if (vPart < 1.5) {
    color = mix(vColor, vec3(1.0), 0.25);
  } else if (vPart < 2.5) {
    color = mix(vColor, vec3(1.0), 0.15);
  } else if (vPart < 3.5) {
    alpha = 0.16 * (1.0 - vRadial * vRadial) + 0.05;
  } else {
    float light = 0.65 + 0.45 * max(dot(normalize(vViewNormal), normalize(vec3(0.3, 0.8, 0.5))), 0.0);
    color = mix(vColor * light, vec3(1.0), 0.15);
    alpha = 0.92;
  }
  color *= mix(1.0, 1.35, uNight);
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogAmount = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogAmount = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogAmount * 0.4);
  #endif
}
`;
