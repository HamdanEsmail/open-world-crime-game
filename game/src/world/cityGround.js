// The ground of Port Sarab, assembled: streets and sidewalks, the floors of every block, the beach and
// the dunes out to the horizon, the marina and the port, and the landmarks of the Amber Dunes. Built
// once into a few large meshes; at run time only the moored boats move.
import * as THREE from 'three';
import { createGroundSurfaceMaterials } from './groundSurfaceMaterial.js';
import { createGroundMeshBuilder } from './groundMeshBuilder.js';
import { createPropBuilder } from './groundPropBuilder.js';
import { buildRoadSurfaces, applyStreetLevels, STREET_LEVELS } from './roadSurfaces.js';
import { buildRoadMarkings } from './roadMarkings.js';
import { buildBlockFloors } from './groundBlockFloors.js';
import { createTerrainMesh } from './terrainMesh.js';
import { buildShoreStructures } from './shoreStructures.js';
import { buildContainerShip } from './shoreContainerShip.js';
import { createContainerStacks } from './shoreContainerStacks.js';
import { createMooredBoats } from './shoreBoats.js';

/**
 * Build the ground and add it to game.scene. Becomes game.cityGround.
 * @returns {{ group: THREE.Group, update: (dt: number) => void, walkLiftAt: (x: number, z: number) => number, stats: Object }}
 */
export function createCityGround(game) {
  const started = performance.now();
  applyStreetLevels(game);
  const city = game.city;
  const materials = createGroundSurfaceMaterials(game.renderer);
  const propMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  propMaterial.name = 'ground-props';
  const group = new THREE.Group();
  group.name = 'port-sarab-ground';

  // Streets, block floors, quays: the swatch-textured ground in a few chunks.
  const ground = createGroundMeshBuilder(game, chunkOfCityGround);
  const shoreProps = createPropBuilder();
  const streets = buildRoadSurfaces(game, ground);
  buildRoadMarkings(game, ground, streets);
  buildBlockFloors(game, ground);
  const shore = buildShoreStructures(game, ground, shoreProps);
  for (const mesh of ground.build(materials)) group.add(mesh);

  // The beach and the dunes to the horizon.
  const terrain = createTerrainMesh(game, materials.base, { holes: groundHoles(city), pads: [] });
  for (const mesh of terrain.meshes) group.add(mesh);

  // The port's ship and containers, and the boats in the marina.
  const ship = city.landmarks.find((mark) => mark.kind === 'containerShip');
  const deckSlots = ship ? buildContainerShip(shoreProps, ship, game.rng.fork('container-ship')) : [];
  const shoreMesh = shoreProps.build(propMaterial, 'shore-structures');
  if (shoreMesh) group.add(shoreMesh);
  group.add(createContainerStacks(city.containers, deckSlots, STREET_LEVELS.sidewalk));
  const boats = createMooredBoats(game);
  if (boats.mesh) group.add(boats.mesh);

  game.scene.add(group);
  const stats = countGround(group);
  stats.buildMs = Math.round(performance.now() - started);
  stats.terrainTriangles = terrain.triangles;

  const lamps = [];
  if (shore.lamp) lamps.push({ ...shore.lamp, color: 0xfff0c0, size: 9 });
  for (const light of shore.craneLights) lamps.push({ ...light, color: 0xff3020, size: 2.4, flicker: true });
  let lampsLit = false;

  return {
    group,
    streets,
    stats,
    levels: STREET_LEVELS,
    boats: boats.boats,
    /** Where the gantry cranes' legs stand, for anyone who wants them solid: [{x, z, radius}]. */
    craneLegs: shore.craneLegs,
    /** Called once a frame: the boats ride the swell; the lamps are lit once the effects exist. */
    update(dt) {
      boats.update(dt);
      if (!lampsLit && game.effects?.glows) {
        lampsLit = true;
        for (const lamp of lamps) game.effects.glows.add(lamp);
      }
    },
    /** The height of the visible ground at a point: the paving in the city, the terrain mesh outside it. */
    surfaceHeightAt(x, z) {
      return game.terrain ? game.terrain.heightAt(x, z) : 0;
    },
  };
}

/**
 * The rectangles the terrain leaves to other meshes: the city floor out to the ring roads' outer
 * kerbs, the marina basin and promenade, the port quay. `sink` hides terrain vertices inside them.
 */
function groundHoles(city) {
  const kinds = city.roadKinds;
  const sidewalk = kinds.street.sidewalk;
  const west = city.avenues[0];
  const east = city.avenues[city.avenues.length - 1];
  const north = city.streets[0];
  const south = city.streets[city.streets.length - 1];
  const marina = city.coast.marina;
  const port = city.coast.port;
  const top = north.z - kinds[north.kind].width / 2 - sidewalk;
  return [
    {
      x0: west.x - kinds[west.kind].width / 2 - sidewalk, x1: east.x + kinds[east.kind].width / 2 + sidewalk,
      z0: top, z1: south.z + kinds[south.kind].width / 2 + sidewalk, sink: -0.6,
    },
    { x0: marina.minX - marina.breakwaterHalfWidth, x1: marina.maxX + marina.breakwaterHalfWidth, z0: marina.minZ, z1: top, sink: -7, snap: true },
    { x0: port.minX, x1: port.maxX, z0: port.edgeZ, z1: top, sink: -10, snap: true },
  ];
}

/** The four quarters the city's ground is split into around the Al Noor / Vane Boulevard crossing. */
function chunkOfCityGround(x, z) {
  return `${x < 40 ? 'west' : 'east'}-${z < 60 ? 'north' : 'south'}`;
}

/** Draw calls and triangles of everything under the group. */
function countGround(group) {
  let meshes = 0;
  let triangles = 0;
  group.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    const count = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    triangles += object.isInstancedMesh ? count * object.count : count;
  });
  return { meshes, triangles: Math.round(triangles) };
}
