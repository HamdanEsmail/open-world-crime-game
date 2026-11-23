// The hunt for the twenty golden falcons hidden around Port Sarab: on piers and beaches, behind the
// souk, out at the oasis, the airfield and the solar farm. Each falcon turns slowly over its plinth
// with a glint that catches the eye from a distance; walk or drive within two metres to take it.
// $400 and some reputation each, a prize at every fifth (armour, a rifle, cash), and a fortune for all
// twenty. A falcon shows on the minimap only when the player is within 150 m of it.
import * as THREE from 'three';
import { buildGoldenFalconGeometry } from './goldenFalconModel.js';
import { FALCON_REWARD, falconMilestoneReward } from './activityRules.js';

const PICKUP_RADIUS = 2;
const BLIP_RADIUS = 150;
const FALCON_GOLD = 0xffd700;

/**
 * Build the falcon hunt (game.activities.falcons).
 * @returns {{id:string, falcons:Object[], found:Set<string>, count:number, collect(index:number):void, update(dt:number):void,
 *   stop():void, serialize():Object, deserialize(data:Object):void}}
 */
export function createCollectibleFalcons(game, activities) {
  const seaLevel = game.config.world.seaLevel;
  const falcons = game.city.placesOfKind('collectible').map((place, index) => {
    const ground = game.terrain ? game.terrain.heightAt(place.x, place.z) : 0;
    return { id: place.id, index, x: place.x, z: place.z, y: Math.max(ground, seaLevel + 0.1), phase: index * 0.71, marker: null };
  });
  const found = new Set();
  const count = falcons.length;

  const mesh = new THREE.InstancedMesh(
    buildGoldenFalconGeometry(),
    new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0xfff4c8, shininess: 90, emissive: 0x4a3200 }),
    Math.max(1, count),
  );
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'golden-falcons';
  game.scene.add(mesh);
  const glints = createFalconGlints(falcons);
  game.scene.add(glints.points);

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  writeAllMatrices();

  const module = {
    id: 'falcons',
    falcons,
    found,
    get count() {
      return found.size;
    },
    collect,
    update,
    stop() {},
    serialize,
    deserialize,
  };

  /** Spin the falcons near the camera, look for a pickup, keep the near ones on the minimap. */
  function update() {
    const time = game.time.elapsed;
    glints.material.uniforms.uTime.value = time;
    const player = game.player;
    const pos = player && player.character ? player.pos : null;
    const camera = game.camera.position;
    let moved = false;
    for (let i = 0; i < count; i += 1) {
      const falcon = falcons[i];
      if (found.has(falcon.id)) continue;
      const cx = camera.x - falcon.x;
      const cz = camera.z - falcon.z;
      if (cx * cx + cz * cz < 260 * 260) {
        placeFalcon(i, falcon, time);
        moved = true;
      }
      if (!pos) continue;
      const dx = pos.x - falcon.x;
      const dz = pos.z - falcon.z;
      const distanceSq = dx * dx + dz * dz;
      const reach = PICKUP_RADIUS + (player.vehicle ? player.vehicle.spec.width * 0.5 : 0);
      if (distanceSq < reach * reach && Math.abs(pos.y - falcon.y) < 4) {
        collect(i);
        moved = true;
        continue;
      }
      if ((game.time.frame % 20) === (i % 20)) showBlipWhenNear(falcon, distanceSq);
    }
    if (moved) mesh.instanceMatrix.needsUpdate = true;
  }

  /** Take falcon `index`: pay, count, and hand out a milestone prize every fifth. */
  function collect(index) {
    const falcon = falcons[index];
    if (!falcon || found.has(falcon.id)) return;
    found.add(falcon.id);
    mesh.setMatrixAt(index, hidden);
    mesh.instanceMatrix.needsUpdate = true;
    glints.hide(index);
    if (falcon.marker) game.markers.remove(falcon.marker);
    falcon.marker = null;
    const total = found.size;
    game.audio?.play?.('pickup');
    game.effects?.flash?.(0xffd700, 0.25);
    game.events.emit('falcon:found', { id: falcon.id, index, count: total, of: count });
    game.economy?.stats?.add?.('falconsFound', 1);
    activities.banner(`GOLDEN FALCON  ${total} / ${count}`, `+${activities.money(FALCON_REWARD)}`, 'good', 2.6);
    activities.payout({ id: 'falcon', title: `Golden Falcon ${total} / ${count}`, reward: FALCON_REWARD, rep: 10, sound: 'cash', banner: false });
    const milestone = falconMilestoneReward(total);
    if (milestone) giveMilestone(milestone);
  }

  function giveMilestone(milestone) {
    const player = game.player;
    const character = player ? player.character : null;
    if (milestone.armour && character) character.armor = game.config.player.maxArmor || 100;
    let reward = milestone.reward;
    if (milestone.weapon) {
      if (character && game.weapons && game.weapons.give) game.weapons.give(character, milestone.weapon, milestone.ammo);
      else reward += 2500;
    }
    activities.payout({ id: 'falconMilestone', title: milestone.title, reward, rep: milestone.rep, detail: milestone.detail });
  }

  /** A falcon is a secret until the player is close: then a blip appears on the minimap. */
  function showBlipWhenNear(falcon, distanceSq) {
    const near = distanceSq < BLIP_RADIUS * BLIP_RADIUS;
    if (near && !falcon.marker) {
      falcon.marker = game.markers.add({ kind: 'pickup', icon: 'collectible', owner: 'goldenFalcons', pos: { x: falcon.x, y: falcon.y, z: falcon.z }, edge: false, color: FALCON_GOLD, label: 'Golden falcon' });
    } else if (!near && falcon.marker && distanceSq > (BLIP_RADIUS + 15) * (BLIP_RADIUS + 15)) {
      game.markers.remove(falcon.marker);
      falcon.marker = null;
    }
  }

  /** Turn and bob one falcon over its spot. */
  function placeFalcon(i, falcon, time) {
    position.set(falcon.x, falcon.y + 0.2 + Math.sin(time * 1.8 + falcon.phase) * 0.08, falcon.z);
    rotation.setFromAxisAngle(up, time * 1.1 + falcon.phase);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(i, matrix);
  }

  function writeAllMatrices() {
    for (let i = 0; i < count; i += 1) {
      const falcon = falcons[i];
      if (found.has(falcon.id)) {
        mesh.setMatrixAt(i, hidden);
        glints.hide(i);
      } else {
        placeFalcon(i, falcon, 0);
        glints.show(i);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function serialize() {
    return { found: Array.from(found) };
  }

  function deserialize(data) {
    found.clear();
    for (const id of (data && data.found) || []) found.add(id);
    for (const falcon of falcons) {
      if (falcon.marker) game.markers.remove(falcon.marker);
      falcon.marker = null;
    }
    writeAllMatrices();
  }

  return module;
}

/**
 * The glint over each falcon: one point sprite per falcon, a four-pointed star that flares every few
 * seconds, drawn additively in a single draw call and sized in pixels so it reads from far away.
 */
function createFalconGlints(falcons) {
  const count = Math.max(1, falcons.length);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const visible = new Float32Array(count);
  for (let i = 0; i < falcons.length; i += 1) {
    positions[i * 3] = falcons[i].x;
    positions[i * 3 + 1] = falcons[i].y + 1.4;
    positions[i * 3 + 2] = falcons[i].z;
    phases[i] = falcons[i].phase * 3.7;
    visible[i] = 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const visibleAttribute = new THREE.BufferAttribute(visible, 1);
  geometry.setAttribute('shown', visibleAttribute);
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: drawGlintTexture() } },
    vertexShader: GLINT_VERTEX_SHADER,
    fragmentShader: GLINT_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.name = 'golden-falcon-glints';
  return {
    points,
    material,
    hide(i) {
      visible[i] = 0;
      visibleAttribute.needsUpdate = true;
    },
    show(i) {
      visible[i] = 1;
      visibleAttribute.needsUpdate = true;
    },
  };
}

/** A soft four-pointed star on a 64 px canvas. */
function drawGlintTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
  halo.addColorStop(0, 'rgba(255,250,220,1)');
  halo.addColorStop(0.18, 'rgba(255,215,110,0.7)');
  halo.addColorStop(0.5, 'rgba(255,180,60,0.12)');
  halo.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,248,215,0.95)';
  for (const [w, h] of [[2.2, c * 0.95], [c * 0.95, 2.2]]) {
    ctx.beginPath();
    ctx.moveTo(c - w, c);
    ctx.lineTo(c, c - h);
    ctx.lineTo(c + w, c);
    ctx.lineTo(c, c + h);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const GLINT_VERTEX_SHADER = /* glsl */ `
attribute float phase;
attribute float shown;
uniform float uTime;
varying float vStrength;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float flare = pow(max(0.0, sin(uTime * 1.7 + phase)), 12.0);
  vStrength = (0.45 + 0.55 * flare) * shown;
  float depth = max(1.0, -mvPosition.z);
  gl_PointSize = shown * clamp((26.0 + 46.0 * flare) * 14.0 / depth, 5.0 + 9.0 * flare, 64.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const GLINT_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
varying float vStrength;
void main() {
  vec4 texel = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(texel.rgb * vStrength, texel.a * vStrength);
}
`;
