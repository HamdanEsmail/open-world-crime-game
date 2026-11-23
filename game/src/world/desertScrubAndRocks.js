// Life on the Amber Dunes: tufts of dry desert scrub gathered in the hollows and low sandstone rocks
// breaking the sand, scattered around the city, along the highways and out toward the horizon. Two
// instanced meshes; each tuft and rock leans, turns and sinks a little so no two look alike.
import * as THREE from 'three';

/**
 * Scatter scrub and rocks over the desert, clear of roads, the city and the landmarks' pads.
 * @returns {THREE.InstancedMesh[]}
 */
export function createDesertScrubAndRocks(game, avoid) {
  const terrain = game.terrain;
  const city = game.city;
  const world = game.config.world;
  const rng = game.rng.fork('desert-scatter');
  const urban = city.urban;
  const scrubSpots = [];
  const rockSpots = [];
  let attempts = 0;
  while ((scrubSpots.length < 320 || rockSpots.length < 150) && attempts < 20000) {
    attempts += 1;
    const x = rng.range(world.minX + 40, world.maxX - 40);
    const z = rng.range(city.coast.beachTopZ + 30, world.maxZ - 40);
    const outside = Math.max(urban.minX - 30 - x, x - urban.maxX - 30, urban.minZ - 30 - z, z - urban.maxZ - 30);
    if (outside < 0) continue;
    if (avoid(x, z)) continue;
    const h = terrain.baseHeightAt(x, z);
    const around = (terrain.baseHeightAt(x + 8, z) + terrain.baseHeightAt(x - 8, z) + terrain.baseHeightAt(x, z + 8) + terrain.baseHeightAt(x, z - 8)) / 4;
    const hollow = around - h;
    if (scrubSpots.length < 320 && rng.chance(0.35 + Math.max(0, hollow) * 0.6)) scrubSpots.push([x, h, z]);
    else if (rockSpots.length < 150 && rng.chance(0.25)) rockSpots.push([x, h, z]);
  }
  const meshes = [];
  const scrub = scatter(buildScrubTuft(), new THREE.MeshLambertMaterial({ vertexColors: true }), scrubSpots, rng, (colour) => colour.setHSL(rng.range(0.13, 0.2), rng.range(0.25, 0.4), rng.range(0.32, 0.46)), [0.7, 1.6], 0.12);
  scrub.name = 'desert-scrub';
  scrub.castShadow = false;
  meshes.push(scrub);
  const rocks = scatter(buildRock(), new THREE.MeshLambertMaterial({ vertexColors: true }), rockSpots, rng, (colour) => colour.setHSL(rng.range(0.05, 0.09), rng.range(0.35, 0.5), rng.range(0.5, 0.66)), [0.8, 2.6], 0.3);
  rocks.name = 'desert-rocks';
  meshes.push(rocks);
  return meshes;
}

function scatter(geometry, material, spots, rng, tint, sizeRange, sink) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, spots.length));
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();
  spots.forEach(([x, y, z], index) => {
    const size = rng.range(sizeRange[0], sizeRange[1]);
    euler.set(rng.range(-0.12, 0.12), rng.range(0, Math.PI * 2), rng.range(-0.12, 0.12));
    rotation.setFromEuler(euler);
    matrix.compose(position.set(x, y - sink * size, z), rotation, scale.set(size * rng.range(0.8, 1.25), size * rng.range(0.7, 1.1), size * rng.range(0.8, 1.25)));
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, tint(colour));
  });
  mesh.count = spots.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** A tuft of scrub: eight spiky blades fanning out of a low clump, darker at the root. */
function buildScrubTuft() {
  const positions = [];
  const colors = [];
  const blades = 8;
  for (let b = 0; b < blades; b += 1) {
    const angle = (b / blades) * Math.PI * 2 + (b % 2) * 0.3;
    const reach = 0.55 + (b % 3) * 0.12;
    const height = 0.7 + ((b * 7) % 5) * 0.09;
    const tip = [Math.sin(angle) * reach, height, Math.cos(angle) * reach];
    const side = [Math.cos(angle) * 0.16, 0, -Math.sin(angle) * 0.16];
    const a = [side[0], 0, side[2]];
    const c = [-side[0], 0, -side[2]];
    for (const tri of [[a, c, tip], [c, a, tip]]) {
      for (const p of tri) {
        positions.push(p[0], p[1], p[2]);
        const light = 0.55 + p[1] * 0.6;
        colors.push(light, light, light * 0.9);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A low wind-worn rock: a squashed, faceted lump. */
function buildRock() {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const bump = 0.85 + 0.3 * Math.abs(Math.sin(x * 5.1 + z * 3.7));
    position.setXYZ(i, x * bump, Math.max(-0.2, y * 0.55 * bump), z * bump * 0.9);
  }
  const colors = [];
  for (let i = 0; i < position.count; i += 1) {
    const light = 0.8 + position.getY(i) * 0.3;
    colors.push(light, light * 0.97, light * 0.92);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
