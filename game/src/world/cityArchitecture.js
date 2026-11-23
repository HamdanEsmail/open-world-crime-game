// The architecture of Port Sarab: raises every building of the eight districts and every landmark
// from the city plan, merged neighbourhood by neighbourhood into a handful of meshes that share
// one facade material, and after dusk lights their windows, neon and aircraft beacons.
import * as THREE from 'three';
import { createFacadeAtlas } from './facadeTextures.js';
import { createFacadeMaterials } from './facadeMaterial.js';
import { createBuildingGeometryBuilder } from './buildingGeometryBuilder.js';
import { raiseOrdinaryBuilding } from './buildingShapes.js';
import { raiseLandmarkBuilding, LANDMARK_STYLES } from './landmarkBuildings.js';
import { createBeaconLights } from './rooftopDetails.js';
import { signsOfGroup } from './neonSigns.js';

/**
 * Build all of Port Sarab's buildings from game.city and add them to game.scene.
 * Returns game.cityArchitecture: { group, meshes, atlas, materials, beacons, stats, update(dt) }.
 */
export function createCityArchitecture(game) {
  const city = game.city;
  const atlas = createFacadeAtlas(game);
  const materials = createFacadeMaterials(atlas);
  const group = new THREE.Group();
  group.name = 'cityArchitecture';
  const chunks = new Map();
  const beaconPoints = [];
  const signDecks = {};
  const signCursor = {};
  const rngRoot = game.rng.fork('architecture');

  const nextSign = (groupName) => {
    if (!signDecks[groupName]) {
      signDecks[groupName] = rngRoot.fork(`signs-${groupName}`).shuffle(signsOfGroup(groupName));
      signCursor[groupName] = 0;
    }
    const deck = signDecks[groupName];
    if (deck.length === 0) return null;
    const id = deck[signCursor[groupName] % deck.length];
    signCursor[groupName] += 1;
    return id;
  };

  for (const building of city?.buildings || []) {
    const chunk = chunkFor(building);
    const seed = fract(building.id * 0.6180339 + (building.tint || 0) * 0.37);
    chunk.solid.seed(seed);
    chunk.cutout.seed(seed);
    const ctx = {
      game,
      city,
      atlas,
      solid: chunk.solid,
      cutout: chunk.cutout,
      rng: rngRoot.fork(`building-${building.id}`),
      seed,
      nextSign,
      /** An aircraft-warning (or decorative) light at (x, y, z) that shows after dusk. */
      beacon(x, y, z, color = 0xff2a1a, size = 3.2, blink = 1) {
        beaconPoints.push({ x, y, z, color, size, blink });
      },
    };
    try {
      if (LANDMARK_STYLES.has(building.style)) raiseLandmarkBuilding(ctx, building);
      else raiseOrdinaryBuilding(ctx, building);
    } catch (error) {
      console.warn(`could not raise building ${building.id} (${building.style})`, error);
    }
  }

  const meshes = [];
  let triangles = 0;
  for (const [key, chunk] of chunks) {
    for (const [builder, material, kind] of [[chunk.solid, materials.solid, 'walls'], [chunk.cutout, materials.cutout, 'lattices']]) {
      const geometry = builder.build();
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `architecture-${key}-${kind}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      meshes.push(mesh);
      triangles += geometry.index.count / 3;
    }
  }
  const beacons = createBeaconLights(beaconPoints);
  if (beacons.points) group.add(beacons.points);
  game.scene.add(group);

  const architecture = {
    group,
    meshes,
    atlas,
    materials,
    beacons,
    stats: { meshes: meshes.length, triangles, buildings: city?.buildings?.length || 0, beacons: beaconPoints.length },
    /** Follow the sky: window lights, neon, glass reflections and blinking beacons. */
    update(dt) {
      materials.applyLighting(game);
      const camera = game.camera;
      const height = game.renderer?.domElement?.height || 800;
      const pixelScale = camera?.isPerspectiveCamera ? height / (2 * Math.tan((camera.fov * Math.PI) / 360)) : 600;
      beacons.update(game.time?.elapsed ?? 0, game.sky?.night ?? 0, pixelScale);
    },
  };
  return architecture;

  /** The neighbourhood chunk a building is merged into: city blocks in twos by twos. */
  function chunkFor(building) {
    const block = city.blocks[building.block];
    const key = building.style === 'vaneSpire' ? 'vaneSpire' : block ? `${block.col >> 1}-${block.row >> 1}` : 'loose';
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { solid: createBuildingGeometryBuilder(atlas), cutout: createBuildingGeometryBuilder(atlas) };
      chunks.set(key, chunk);
    }
    return chunk;
  }
}

function fract(v) {
  return v - Math.floor(v);
}
