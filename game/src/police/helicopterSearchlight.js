// Shaheen-1's searchlight as light you can see: a soft additive cone from the lamp to the ground
// with dust drifting through it, a bright elliptical pool where it lands (stretched by the angle it
// strikes at, laid on whatever it hits), a glow scattered in the air around the suspect, and the
// glare of the lamp itself. Pale by day, brilliant at night; the brightest thing in a night scene.
import * as THREE from 'three';

/** Half the angle of the cone of light (radians): about 4.6 degrees, a 5 m pool from 60 m up. */
export const BEAM_HALF_ANGLE = 0.08;

/**
 * Build the beam, the pool and the two glows. They live in world space (add `group` to the scene)
 * and are placed each frame with aim().
 * @returns {{group: THREE.Group, aim: Function, setVisible: Function, update: Function}}
 */
export function buildSearchlightBeam() {
  const group = new THREE.Group();
  group.name = 'Shaheen-1 searchlight';

  const beamUniforms = {
    uIntensity: { value: 0 },
    uColor: { value: new THREE.Color(1.0, 0.93, 0.8) },
    uTime: { value: 0 },
  };
  const beam = new THREE.Mesh(buildConeGeometry(28, 8), new THREE.ShaderMaterial({
    uniforms: beamUniforms,
    vertexShader: BEAM_VERTEX_SHADER,
    fragmentShader: BEAM_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  beam.frustumCulled = false;
  beam.renderOrder = 7;
  group.add(beam);

  const poolUniforms = {
    uIntensity: { value: 0 },
    uColor: { value: new THREE.Color(1.0, 0.95, 0.84) },
  };
  const poolGeometry = new THREE.PlaneGeometry(2, 2);
  poolGeometry.rotateX(-Math.PI / 2);
  const pool = new THREE.Mesh(poolGeometry, new THREE.ShaderMaterial({
    uniforms: poolUniforms,
    vertexShader: POOL_VERTEX_SHADER,
    fragmentShader: POOL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  }));
  pool.matrixAutoUpdate = false;
  pool.frustumCulled = false;
  pool.renderOrder = 6;
  group.add(pool);

  const glowTexture = paintGlowTexture();
  const haloMaterial = new THREE.SpriteMaterial({
    map: glowTexture, color: 0xffe9c4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  });
  const halo = new THREE.Sprite(haloMaterial);
  halo.renderOrder = 8;
  group.add(halo);
  const glareMaterial = new THREE.SpriteMaterial({
    map: glowTexture, color: 0xfff6e6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  });
  const glare = new THREE.Sprite(glareMaterial);
  glare.renderOrder = 9;
  group.add(glare);

  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const major = new THREE.Vector3();
  const minor = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  /**
   * Point the light: from the lamp at `lens` to `end`, which lies on a surface with unit `normal`.
   * `strength` = {beam, pool, halo, glare} (0 hides each part); `cameraPosition` sets the glare.
   */
  function aim(lens, end, normal, strength, cameraPosition) {
    direction.subVectors(end, lens);
    const length = Math.max(0.5, direction.length());
    direction.multiplyScalar(1 / length);
    const radius = Math.max(1.6, length * Math.tan(BEAM_HALF_ANGLE));

    // The cone: apex at the lamp, base on the surface.
    beam.position.copy(lens);
    beam.quaternion.setFromUnitVectors(up, direction);
    beam.scale.set(radius, length, radius);
    beamUniforms.uIntensity.value = strength.beam;
    beam.visible = strength.beam > 0.002;

    // The pool: an ellipse on the surface, long along the way the light slants in.
    const incidence = Math.max(0.28, -direction.dot(normal));
    major.copy(direction).addScaledVector(normal, -direction.dot(normal));
    if (major.lengthSq() < 1e-6) major.set(1, 0, 0).addScaledVector(normal, -normal.x);
    major.normalize();
    minor.crossVectors(normal, major).normalize();
    const minorRadius = radius * 1.22;
    const majorRadius = minorRadius / incidence;
    const e = pool.matrix.elements;
    e[0] = major.x * majorRadius; e[1] = major.y * majorRadius; e[2] = major.z * majorRadius; e[3] = 0;
    e[4] = normal.x; e[5] = normal.y; e[6] = normal.z; e[7] = 0;
    e[8] = minor.x * minorRadius; e[9] = minor.y * minorRadius; e[10] = minor.z * minorRadius; e[11] = 0;
    e[12] = end.x + normal.x * 0.1; e[13] = end.y + normal.y * 0.1; e[14] = end.z + normal.z * 0.1; e[15] = 1;
    pool.matrixWorldNeedsUpdate = true;
    poolUniforms.uIntensity.value = strength.pool;
    pool.visible = strength.pool > 0.002;

    // Light scattered in the air just above the pool: it washes over whoever stands in it.
    halo.position.copy(end).addScaledVector(direction, -2.2);
    halo.position.y += 0.6;
    halo.scale.setScalar(radius * 3.4);
    haloMaterial.opacity = strength.halo;
    halo.visible = strength.halo > 0.01;

    // The lamp's glare, fiercest when you stand in its beam.
    toCamera.subVectors(cameraPosition, lens);
    const cameraDistance = Math.max(1, toCamera.length());
    toCamera.multiplyScalar(1 / cameraDistance);
    const facing = Math.max(0, direction.dot(toCamera));
    const glareSize = 1.4 + 2.6 * Math.pow(facing, 6) + cameraDistance * 0.012;
    glare.position.copy(lens).addScaledVector(direction, 0.25);
    glare.scale.setScalar(glareSize);
    glareMaterial.opacity = strength.glare * (0.45 + 0.55 * Math.pow(facing, 3));
    glare.visible = strength.glare > 0.01;
  }

  function setVisible(visible) {
    group.visible = visible;
  }

  /** Drift the dust in the beam. */
  function update(time) {
    beamUniforms.uTime.value = time;
  }

  return { group, aim, setVisible, update, beam, pool };
}

/** A unit cone along +Y: a tiny ring at y = 0 (the lamp) opening to radius 1 at y = 1, open at both ends. */
function buildConeGeometry(radialSegments, lengthSegments) {
  const positions = [];
  const normals = [];
  const indices = [];
  const apexRadius = 0.03;
  const slope = 1 - apexRadius;
  const normalLength = Math.hypot(1, slope);
  for (let i = 0; i <= lengthSegments; i += 1) {
    const t = i / lengthSegments;
    const y = t * t * 0.35 + t * 0.65;
    const r = apexRadius + slope * y;
    for (let j = 0; j <= radialSegments; j += 1) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      positions.push(c * r, y, s * r);
      normals.push(c / normalLength, -slope / normalLength, s / normalLength);
    }
  }
  const columns = radialSegments + 1;
  for (let i = 0; i < lengthSegments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * columns + j;
      indices.push(a, a + columns, a + 1, a + 1, a + columns, a + columns + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** A soft round glow with a hot centre, for the halo and the glare. */
function paintGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, 'rgba(255,250,236,0.85)');
  gradient.addColorStop(0.35, 'rgba(255,236,200,0.3)');
  gradient.addColorStop(0.7, 'rgba(255,220,170,0.07)');
  gradient.addColorStop(1, 'rgba(255,210,160,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const BEAM_VERTEX_SHADER = /* glsl */ `
varying float vAlong;
varying float vFacing;
varying float vAround;
void main() {
  vAlong = position.y;
  vAround = atan(position.z, position.x);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAGMENT_SHADER = /* glsl */ `
uniform float uIntensity;
uniform vec3 uColor;
uniform float uTime;
varying float vAlong;
varying float vFacing;
varying float vAround;
void main() {
  // Brightest through the middle of the cone, fading at its silhouette, near the lamp and far down.
  float body = pow(vFacing, 1.7);
  float fadeIn = smoothstep(0.0, 0.05, vAlong);
  float falloff = 1.0 - 0.55 * vAlong;
  float dust = 0.8 + 0.2 * sin(vAlong * 44.0 - uTime * 2.1 + vAround * 3.0) * sin(vAlong * 15.0 + uTime * 0.9 - vAround * 5.0);
  float alpha = uIntensity * body * falloff * fadeIn * dust;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
`;

const POOL_VERTEX_SHADER = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const POOL_FRAGMENT_SHADER = /* glsl */ `
uniform float uIntensity;
uniform vec3 uColor;
varying vec2 vLocal;
void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;
  float core = 1.0 - smoothstep(0.0, 1.0, r);
  float plateau = 1.0 - smoothstep(0.62, 0.9, r);
  float rim = smoothstep(0.74, 0.86, r) * (1.0 - smoothstep(0.86, 0.98, r));
  float light = core * core * 0.55 + plateau * 0.55 + rim * 0.3;
  gl_FragColor = vec4(uColor, clamp(light * uIntensity, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;
