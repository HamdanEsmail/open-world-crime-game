// KHAMSIN: Port Sarab. The entry point: builds the shared game object, raises the city, starts
// every system and runs the frame loop. Each import below is one system with one job.
import { createGameContext } from './core/gameContext.js';
import { startGameLoop } from './core/gameLoop.js';
import { createPortSarabCityPlan } from './world/portSarabCityPlan.js';
import { createRoadNetwork } from './world/roadNetwork.js';
import { createTerrainHeight } from './world/terrainHeight.js';
import { createCollisionWorld } from './world/collisionWorld.js';
import { VEHICLE_CATALOG, vehicleSpecById } from './vehicles/vehicleCatalog.js';

/** Boot the open world on the page's canvas. */
function bootPortSarab() {
  const canvas = document.getElementById('port-sarab-open-world');
  const game = createGameContext(canvas);
  window.khamsin = game;
  game.catalog.vehicles = VEHICLE_CATALOG;
  game.catalog.vehicleById = vehicleSpecById;

  buildPortSarabWorld(game);

  const THREE = game.THREE;
  game.scene.background = new THREE.Color(0xf2c48a);
  game.scene.add(new THREE.HemisphereLight(0xfff0d0, 0x8a6a40, 1.4));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0xd9b77a }));
  ground.rotation.x = -Math.PI / 2;
  game.scene.add(ground);

  document.getElementById('loading-screen').hidden = true;
  game.mode = 'playing';
  startGameLoop(game, () => {}, () => game.renderer.render(game.scene, game.camera));
}

/** The static world: the plan of the city, its roads, its ground and everything solid in it. */
function buildPortSarabWorld(game) {
  game.city = createPortSarabCityPlan(game);
  game.roads = createRoadNetwork(game);
  game.terrain = createTerrainHeight(game);
  game.colliders = createCollisionWorld(game);
  game.colliders.addCityPlan(game.city);
}

bootPortSarab();
