// The ground of Port Sarab, assembled: streets and sidewalks, the floors of every block, the beach and
// the dunes out to the horizon, the marina and the port, the highways and the landmarks of the Amber
// Dunes. Built once into about two dozen large meshes; at run time only the moored boats move.
import * as THREE from 'three';
import { createGroundSurfaceMaterials } from './groundSurfaceMaterial.js';
import { createGroundMeshBuilder } from './groundMeshBuilder.js';
import { createPropBuilder } from './groundPropBuilder.js';
import { buildRoadSurfaces, applyStreetLevels, STREET_LEVELS } from './roadSurfaces.js';
import { buildRoadMarkings } from './roadMarkings.js';
import { buildDesertHighways } from './roadDesertHighways.js';
import { buildBlockFloors } from './groundBlockFloors.js';
import { createTerrainMesh } from './terrainMesh.js';
import { buildShoreStructures } from './shoreStructures.js';
import { buildContainerShip } from './shoreContainerShip.js';
import { createContainerStacks } from './shoreContainerStacks.js';
import { createMooredBoats } from './shoreBoats.js';
import { buildDesertLandmarks, desertPads } from './desertLandmarks.js';
import { createSolarFarm } from './desertSolarFarm.js';
import { createDesertScrubAndRocks } from './desertScrubAndRocks.js';
import { SHORE_STRUCTURES, DESERT_LANDMARKS } from './groundSurfaceRules.js';

/**
 * Build the ground and add it to game.scene. Becomes game.cityGround.
 * @returns {{ group: THREE.Group, update: (dt: number) => void, stats: Object, craneLegs: Object[], gateLegs: Object[] }}
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

  // Streets, block floors, quays, highways, runway: swatch-textured ground in a few chunks.
  const ground = createGroundMeshBuilder(game, chunkOfGround);
  const shoreProps = createPropBuilder();
  const desertProps = createPropBuilder();
  const streets = buildRoadSurfaces(game, ground);
  buildRoadMarkings(game, ground, streets);
  buildBlockFloors(game, ground);
  const shore = buildShoreStructures(game, ground, shoreProps);
  const highways = buildDesertHighways(game, ground);
  const desert = buildDesertLandmarks(game, ground, desertProps, highways.signs);
  const solar = city.landmarks.find((mark) => mark.kind === 'solarFarm');
  const solarFarm = solar ? createSolarFarm(game, ground, solar) : null;
  for (const mesh of ground.build(materials)) group.add(mesh);

  // The beach and the dunes to the horizon, tucked under the roads and pads.
  const terrain = createTerrainMesh(game, materials.base, { holes: groundHoles(city), pads: desertPads(city) });
  for (const mesh of terrain.meshes) group.add(mesh);

  // Standing things: quays and cranes, the ship and its containers, boats, desert landmarks, scrub.
  const ship = city.landmarks.find((mark) => mark.kind === 'containerShip');
  const deckSlots = ship ? buildContainerShip(shoreProps, ship, game.rng.fork('container-ship')) : [];
  addIf(group, shoreProps.build(propMaterial, 'shore-structures'));
  group.add(createContainerStacks(city.containers, deckSlots, STREET_LEVELS.sidewalk));
  const boats = createMooredBoats(game);
  addIf(group, boats.mesh);
  addIf(group, desertProps.build(propMaterial, 'desert-landmarks'));
  addIf(group, solarFarm);
  for (const mesh of createDesertScrubAndRocks(game, scatterBlocker(game))) group.add(mesh);

  game.scene.add(group);
  const stats = countGround(group);
  stats.buildMs = Math.round(performance.now() - started);
  stats.terrainTriangles = terrain.triangles;

  const lamps = [...desert.lights];
  if (shore.lamp) lamps.push({ ...shore.lamp, color: 0xfff0c0, size: 9 });
  for (const light of shore.craneLights) lamps.push({ ...light, color: 0xff3020, size: 2.4, flicker: true });
  let lampsLit = false;

  return {
    group,
    streets,
    stats,
    levels: STREET_LEVELS,
    /** The names of what the waterfront and the desert hold, for maps and menus. */
    features: { shore: SHORE_STRUCTURES, desert: DESERT_LANDMARKS },
    boats: boats.boats,
    /** Where the gantry cranes' legs stand: [{x, z, radius}]. */
    craneLegs: shore.craneLegs,
    /** The two legs of the Port Sarab Gate: [{minX, maxX, minZ, maxZ}]; the highway runs between them. */
    gateLegs: desert.gateLegs,
    /** The centre lines of the desert roads as drawn, with their rounded bends: [{name, kind, half, line}]. */
    desertRoads: highways.centrelines,
    /** Called once a frame: the boats ride the swell; the lamps are lit once the effects exist. */
    update(dt) {
      boats.update(dt);
      if (!lampsLit && game.effects?.glows) {
        lampsLit = true;
        for (const lamp of lamps) game.effects.glows.add(lamp);
      }
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

/** Keeps scrub and rocks off the roads and out of the landmarks. */
function scatterBlocker(game) {
  const city = game.city;
  const { distanceToSegment2D } = game.math;
  const segments = [];
  for (const road of city.desertRoads) {
    const clear = city.roadKinds[road.kind].width / 2 + 7;
    for (let i = 0; i < road.points.length - 1; i += 1) segments.push([...road.points[i], ...road.points[i + 1], clear]);
  }
  const zones = city.flatZones.map(([x, z, r]) => [x, z, r * 0.95]);
  for (const mark of city.landmarks) if (mark.kind === 'shipwreck' || mark.kind === 'gate') zones.push([mark.x, mark.z, 40]);
  return (x, z) => {
    for (const [ax, az, bx, bz, clear] of segments) if (distanceToSegment2D(x, z, ax, az, bx, bz) < clear) return true;
    for (const [zx, zz, r] of zones) if ((x - zx) * (x - zx) + (z - zz) * (z - zz) < r * r) return true;
    return false;
  };
}

/**
 * The quarters the swatch ground is split into around the Al Noor / Vane Boulevard crossing; the
 * shadow-casting kerbs, walls and hedges stay one mesh so the sun's shadow pass draws them once.
 */
function chunkOfGround(x, z, layer) {
  if (layer === 'solid') return 'all';
  return `${x < 40 ? 'west' : 'east'}-${z < 60 ? 'north' : 'south'}`;
}

function addIf(group, mesh) {
  if (mesh) group.add(mesh);
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
