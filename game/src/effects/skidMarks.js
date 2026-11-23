// Tyre marks on Port Sarab's asphalt and ruts in its sand: a ring buffer of thin ribbon quads that follow
// each sliding wheel and fade away over two minutes, drawn in one call as a darkening (multiply) decal
// so they read right by day and by night. Explosions leave their scorch marks in the same buffer.
import * as THREE from 'three';

/** Mark styles: black rubber on asphalt, darker ruts in sand, a burnt scorch. */
export const MARK_RUBBER = 0;
export const MARK_SAND_RUT = 1;
export const MARK_SCORCH = 2;

/**
 * Create the decal ring buffer and add its mesh to game.scene.
 * Each sliding wheel keeps a track: const track = skidMarks.createTrack();
 * then every frame skidMarks.extend(track, x, y, z, width, strength, style) or skidMarks.endTrack(track).
 * @param {{capacity?: number}} [options]  quads kept before the oldest are reused (default 4096)
 */
export function createSkidMarks(game, options = {}) {
  const capacity = Math.min(16000, options.capacity || 4096);
  const vertexCount = capacity * 4;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const marks = new Float32Array(vertexCount * 4);
  const births = new Float32Array(vertexCount).fill(-1e6);
  const index = new Uint16Array(capacity * 6);
  for (let q = 0; q < capacity; q += 1) {
    const v = q * 4;
    index.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const uvAttr = new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage);
  const markAttr = new THREE.BufferAttribute(marks, 4).setUsage(THREE.DynamicDrawUsage);
  const birthAttr = new THREE.BufferAttribute(births, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttr);
  geometry.setAttribute('markUv', uvAttr);
  geometry.setAttribute('markColor', markAttr);
  geometry.setAttribute('birth', birthAttr);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  uniforms.uMask = { value: paintMarkMask() };
  uniforms.uTime = { value: 0 };
  uniforms.uFadeStart = { value: 50 };
  uniforms.uFadeEnd = { value: 120 };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MARK_VERTEX_SHADER,
    fragmentShader: MARK_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    fog: true,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.ZeroFactor;
  material.blendDst = THREE.SrcColorFactor;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.name = 'effects-skid-marks';
  game.scene.add(mesh);

  let cursor = 0;
  let dirtyMin = Infinity;
  let dirtyMax = -1;
  let written = 0;

  /** A wheel's running mark. */
  function createTrack() {
    return { active: false, hasEdges: false, x: 0, y: 0, z: 0, lx: 0, lz: 0, rx: 0, rz: 0, strength: 0 };
  }

  /**
   * Continue a wheel's mark to (x, y, z). `width` in metres, `strength` 0..1 (how dark), `style` a MARK_ constant.
   * A new quad is laid every 0.35 m; a jump of more than 3 m starts a fresh mark.
   */
  function extend(track, x, y, z, width, strength, style) {
    if (!track.active) {
      beginTrack(track, x, y, z);
      return;
    }
    const dx = x - track.x;
    const dz = z - track.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > MAX_GAP * MAX_GAP) {
      beginTrack(track, x, y, z);
      return;
    }
    if (d2 < MIN_SEGMENT * MIN_SEGMENT) return;
    const d = Math.sqrt(d2);
    const half = width * 0.5;
    const sx = (-dz / d) * half;
    const sz = (dx / d) * half;
    if (!track.hasEdges) {
      track.lx = track.x + sx;
      track.lz = track.z + sz;
      track.rx = track.x - sx;
      track.rz = track.z - sz;
      track.hasEdges = true;
    }
    const lx = x + sx;
    const lz = z + sz;
    const rx = x - sx;
    const rz = z - sz;
    const q = takeQuad();
    const now = game.time.elapsed;
    const style0 = STYLES[style] || STYLES[MARK_RUBBER];
    setVertex(q * 4, track.lx, track.y + LIFT, track.lz, U_LEFT, 0.5, style0, track.strength, now);
    setVertex(q * 4 + 1, track.rx, track.y + LIFT, track.rz, U_RIGHT, 0.5, style0, track.strength, now);
    setVertex(q * 4 + 2, rx, y + LIFT, rz, U_RIGHT, 0.5, style0, strength, now);
    setVertex(q * 4 + 3, lx, y + LIFT, lz, U_LEFT, 0.5, style0, strength, now);
    track.x = x;
    track.y = y;
    track.z = z;
    track.lx = lx;
    track.lz = lz;
    track.rx = rx;
    track.rz = rz;
    track.strength = strength;
  }

  /** Lift the wheel: the next extend() starts a new mark. */
  function endTrack(track) {
    if (track) track.active = false;
  }

  /** A blackened star of burnt ground where something exploded; it outlasts tyre marks. */
  function addScorch(x, y, z, radius, rotation = Math.random() * Math.PI * 2) {
    const q = takeQuad();
    const c = Math.cos(rotation) * radius;
    const s = Math.sin(rotation) * radius;
    const now = game.time.elapsed + SCORCH_EXTRA_SECONDS;
    const style = STYLES[MARK_SCORCH];
    const h = y + LIFT * 1.5;
    setVertex(q * 4, x - c + s, h, z - s - c, 0.5, 0, style, 1, now);
    setVertex(q * 4 + 1, x + c + s, h, z + s - c, 1, 0, style, 1, now);
    setVertex(q * 4 + 2, x + c - s, h, z + s + c, 1, 1, style, 1, now);
    setVertex(q * 4 + 3, x - c - s, h, z - s + c, 0.5, 1, style, 1, now);
  }

  /** Advance the fade clock and upload the quads written since the last frame. */
  function update() {
    uniforms.uTime.value = game.time.elapsed;
    if (dirtyMax < 0) return;
    const first = dirtyMin * 4;
    const count = (dirtyMax - dirtyMin + 1) * 4;
    markRange(positionAttr, first * 3, count * 3);
    markRange(uvAttr, first * 2, count * 2);
    markRange(markAttr, first * 4, count * 4);
    markRange(birthAttr, first, count);
    dirtyMin = Infinity;
    dirtyMax = -1;
  }

  /** Forget every mark (a loaded game). */
  function clear() {
    births.fill(-1e6);
    markRange(birthAttr, 0, births.length);
    cursor = 0;
    written = 0;
  }

  function beginTrack(track, x, y, z) {
    track.active = true;
    track.hasEdges = false;
    track.x = x;
    track.y = y;
    track.z = z;
    track.strength = 0;
  }

  function takeQuad() {
    const q = cursor;
    cursor = (cursor + 1) % capacity;
    written += 1;
    if (q < dirtyMin) dirtyMin = q;
    if (q > dirtyMax) dirtyMax = q;
    return q;
  }

  function setVertex(v, x, y, z, u, w, style, strength, birth) {
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    uvs[v * 2] = u;
    uvs[v * 2 + 1] = w;
    marks[v * 4] = style[0];
    marks[v * 4 + 1] = style[1];
    marks[v * 4 + 2] = style[2];
    marks[v * 4 + 3] = style[3] * strength;
    births[v] = birth;
  }

  return {
    createTrack, extend, endTrack, addScorch, update, clear, mesh,
    get quadsWritten() { return written; },
  };
}

/** The mask texture: a tyre-tread strip on the left half, a blast scorch on the right (red channel). */
function paintMarkMask() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 128);
  for (let x = 4; x < 124; x += 1) {
    const t = (x - 4) / 120;
    const edge = Math.min(1, t * 6, (1 - t) * 6);
    const groove = Math.sin(t * Math.PI * 9) > 0.55 ? 0.6 : 1;
    const v = Math.round(255 * edge * groove * 0.95);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, 1, 128);
  }
  const random = seededSequence(31);
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${0.15 + random() * 0.25})`;
    ctx.fillRect(8 + random() * 112, random() * 128, 1 + random() * 3, 1 + random() * 6);
  }
  const cx = 192;
  const cy = 64;
  for (let i = 0; i < 26; i += 1) {
    const angle = random() * Math.PI * 2;
    const dist = random() * 34;
    const r = 10 + random() * 22;
    const g = ctx.createRadialGradient(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 0, cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(128, 0, 128, 128);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2 + random() * 0.3;
    const reach = 40 + random() * 18;
    ctx.lineWidth = 2 + random() * 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 14, cy + Math.sin(angle) * 14);
    ctx.lineTo(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
    ctx.stroke();
  }
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
  core.addColorStop(0, 'rgba(255,255,255,0.9)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(128, 0, 128, 128);
  ctx.globalCompositeOperation = 'destination-in';
  const rim = ctx.createRadialGradient(cx, cy, 40, cx, cy, 62);
  rim.addColorStop(0, 'rgba(0,0,0,1)');
  rim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(128, 0, 128, 128);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(126, 0, 4, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function markRange(attribute, start, count) {
  if (attribute.addUpdateRange) attribute.addUpdateRange(start, count);
  else if (attribute.updateRange) {
    const range = attribute.updateRange;
    if (range.count === -1 || range.count === 0) {
      range.offset = start;
      range.count = count;
    } else {
      const end = Math.max(range.offset + range.count, start + count);
      range.offset = Math.min(range.offset, start);
      range.count = end - range.offset;
    }
  }
  attribute.needsUpdate = true;
}

function seededSequence(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const LIFT = 0.025;
const MIN_SEGMENT = 0.35;
const MAX_GAP = 3;
const U_LEFT = 0.03;
const U_RIGHT = 0.47;
const SCORCH_EXTRA_SECONDS = 70;
/** Multiplier colour (what the ground is darkened toward) and peak opacity, per style. */
const STYLES = [
  [0.16, 0.15, 0.15, 0.72],
  [0.7, 0.58, 0.46, 0.5],
  [0.09, 0.075, 0.065, 0.92],
];

const MARK_VERTEX_SHADER = /* glsl */ `
attribute vec2 markUv;
attribute vec4 markColor;
attribute float birth;
varying vec2 vUv;
varying vec4 vMark;
varying float vBirth;
#include <fog_pars_vertex>

void main() {
  vUv = markUv;
  vMark = markColor;
  vBirth = birth;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const MARK_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMask;
uniform float uTime;
uniform float uFadeStart;
uniform float uFadeEnd;
varying vec2 vUv;
varying vec4 vMark;
varying float vBirth;
#include <fog_pars_fragment>

void main() {
  float age = uTime - vBirth;
  float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, age);
  float a = texture2D(uMask, vUv).r * vMark.a * fade;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogAmount = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogAmount = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    a *= 1.0 - fogAmount;
  #endif
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(vec3(1.0), vMark.rgb, a), 1.0);
}
`;
