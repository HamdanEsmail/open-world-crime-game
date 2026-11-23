// Every shipping container of Port Sarab, the 653 stacked in the Mina Docks yards and the bays on the
// deck of the MV Amber Star, drawn as ONE instanced mesh: ribbed steel sides, door ends and roof
// panels painted on a small canvas, six bold colours, the ribs repeating once per tier of each stack.
import * as THREE from 'three';

/** The six container colours, by the plan's colorIndex: coral red, harbour blue, sand gold, green, orange, slate. */
export const CONTAINER_COLOURS = [0xc8442e, 0x2c6cb4, 0xe2a838, 0x2e9a5c, 0xe47a2a, 0x7c8794];

const TIER = 2.6;

/**
 * Build the instanced container stacks.
 * @param {Object[]} yard   city.containers: {x, z, w, d, h, stack, colorIndex}
 * @param {Object[]} deck   ship slots: {x, y, z, length, width, tiers, colorIndex, alongX}
 * @param {number} floorY   height of the yard floor
 * @returns {THREE.InstancedMesh}
 */
export function createContainerStacks(yard, deck, floorY) {
  const texture = new THREE.CanvasTexture(paintContainerSteel());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  const material = new THREE.MeshLambertMaterial({ map: texture });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float containerSide;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vMapUv.y *= mix(1.0, max(1.0, floor(length(instanceMatrix[1].xyz) / ${TIER.toFixed(2)} + 0.5)), containerSide);
        #endif`);
  };
  material.customProgramCacheKey = () => 'port-sarab-container-tiers';

  const geometry = buildContainerBox();
  const count = yard.length + deck.length;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'shore-container-stacks';
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();
  let index = 0;
  const place = (x, y, z, length, width, height, alongX, colorIndex) => {
    rotation.setFromAxisAngle(up, alongX ? 0 : Math.PI / 2);
    matrix.compose(position.set(x, y, z), rotation, scale.set(length, height, width));
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, colour.setHex(CONTAINER_COLOURS[colorIndex % CONTAINER_COLOURS.length]));
    index += 1;
  };
  for (const box of yard) {
    const alongX = box.w >= box.d;
    place(box.x, floorY, box.z, (alongX ? box.w : box.d) - 0.04, (alongX ? box.d : box.w) - 0.04, box.h - 0.04, alongX, box.colorIndex);
  }
  for (const slot of deck) place(slot.x, slot.y, slot.z, slot.length, slot.width, slot.tiers * TIER - 0.04, slot.alongX, slot.colorIndex);
  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A unit container standing on y = 0, long axis along x: sides map the ribbed panel, ends the doors,
 * the top the roof. `containerSide` marks faces whose texture repeats once per tier.
 */
function buildContainerBox() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const sides = [];
  const quad = (corners, normal, u0, u1, tiered) => {
    const [a, b, c, d] = corners;
    for (const [p, u, v] of [[a, u0, 0], [b, u1, 0], [c, u1, 1], [a, u0, 0], [c, u1, 1], [d, u0, 1]]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(normal[0], normal[1], normal[2]);
      uvs.push(u, v);
      sides.push(tiered ? 1 : 0);
    }
  };
  quad([[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]], [0, 0, 1], 0, 0.5, true);
  quad([[0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]], [0, 0, -1], 0, 0.5, true);
  quad([[0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5]], [1, 0, 0], 0.5, 0.75, true);
  quad([[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]], [-1, 0, 0], 0.5, 0.75, true);
  quad([[-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5]], [0, 1, 0], 0.75, 1, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('containerSide', new THREE.Float32BufferAttribute(sides, 1));
  return geometry;
}

/** Paint the steel of a container: ribbed side panel, double doors with locking bars, roof, all in light greys to be tinted. */
function paintContainerSteel() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Side panel (u 0..0.5): vertical ribs, top and bottom rails, corner posts.
  const sideWidth = 256;
  for (let x = 0; x < sideWidth; x += 1) {
    const rib = Math.sin((x / sideWidth) * Math.PI * 2 * 34);
    const shade = 214 + rib * 26;
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(x, 0, 1, 128);
  }
  ctx.fillStyle = 'rgba(40,36,34,0.18)';
  for (let k = 0; k < 9; k += 1) ctx.fillRect(18 + k * 27, 14, 3 + (k % 3), 70 + (k * 13) % 30);
  ctx.fillStyle = 'rgb(150,150,152)';
  ctx.fillRect(0, 0, sideWidth, 9);
  ctx.fillRect(0, 119, sideWidth, 9);
  ctx.fillRect(0, 0, 7, 128);
  ctx.fillRect(sideWidth - 7, 0, 7, 128);
  ctx.fillStyle = 'rgb(246,246,246)';
  ctx.fillRect(sideWidth * 0.68, 22, 52, 18);
  // Door end (u 0.5..0.75): two doors, four locking bars, hinges.
  const doorX = 256;
  ctx.fillStyle = 'rgb(206,206,206)';
  ctx.fillRect(doorX, 0, 128, 128);
  ctx.fillStyle = 'rgb(150,150,152)';
  ctx.fillRect(doorX, 0, 128, 9);
  ctx.fillRect(doorX, 119, 128, 9);
  ctx.fillRect(doorX, 0, 8, 128);
  ctx.fillRect(doorX + 120, 0, 8, 128);
  ctx.fillRect(doorX + 63, 9, 2, 110);
  ctx.fillStyle = 'rgb(90,90,94)';
  for (const bar of [26, 50, 78, 102]) ctx.fillRect(doorX + bar, 10, 3, 108);
  for (const hinge of [20, 64, 108]) {
    ctx.fillRect(doorX + 8, hinge, 6, 4);
    ctx.fillRect(doorX + 114, hinge, 6, 4);
  }
  // Roof (u 0.75..1): shallow pressed panels.
  for (let y = 0; y < 128; y += 1) {
    const shade = 200 + Math.sin((y / 128) * Math.PI * 2 * 3) * 8;
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(384, y, 128, 1);
  }
  return canvas;
}
