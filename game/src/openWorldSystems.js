// The heavy half of KHAMSIN: Port Sarab, loaded while the loading screen is up. It raises the
// city from its plan, starts every system in dependency order, and runs them each frame in the
// order that keeps drivers, cars, people, police, camera and HUD in step.
import { createPortSarabCityPlan } from './world/portSarabCityPlan.js';
import { createRoadNetwork } from './world/roadNetwork.js';
import { createTerrainHeight } from './world/terrainHeight.js';
import { createCollisionWorld } from './world/collisionWorld.js';
import { createSandstormWeather } from './world/sandstormWeather.js';
import { createDayNightCycle } from './world/dayNightCycle.js';
import { createSeaWater } from './world/seaWater.js';
import { createCityGround } from './world/cityGround.js';
import { createCityArchitecture } from './world/cityArchitecture.js';
import { createCityFurniture } from './world/cityFurniture.js';
import { createEffects } from './effects/effectsDirector.js';
import { createAudio } from './audio/audioDirector.js';
import { createVehicleManager } from './vehicles/vehicleManager.js';
import { createVehicleRenderer } from './vehicles/vehicleRenderer.js';
import { createCharacterManager } from './characters/characterManager.js';
import { createWeaponSystem } from './combat/weaponSystem.js';
import { createWantedLevel } from './police/wantedLevel.js';
import { createPoliceDispatch } from './police/policeDispatch.js';
import { createPoliceHelicopter } from './police/policeHelicopter.js';
import { createRoadblocks } from './police/roadblocks.js';
import { createPoliceRadioChatter } from './police/policeRadioChatter.js';
import { createTrafficSystem } from './traffic/trafficSystem.js';
import { createPedestrianSystem } from './pedestrians/pedestrianSystem.js';
import { createCoverMeter } from './story/coverMeter.js';
import { createCutsceneDirector } from './story/cutsceneDirector.js';
import { createHandlerCalls } from './story/handlerCalls.js';
import { startNewGameIntro } from './story/storyIntro.js';
import { createMissionRunner } from './missions/missionRunner.js';
import { createActivities } from './activities/activityDirector.js';
import { createShops } from './economy/shops.js';
import { createSafehouses } from './economy/safehouses.js';
import { createCityServices } from './economy/cityServices.js';
import { createHud } from './ui/hudDirector.js';
import { createMenus } from './ui/menuDirector.js';

/** What is built, in order, with the line the loading screen shows for it. */
const RAISING_STEPS = [
  ['Surveying the coast and the dunes', planTheCity],
  ['Lighting the gulf sky', startSkySeaAndWeather],
  ['Paving the boulevards', paveTheGround],
  ['Raising the Spires', (game) => { game.cityArchitecture = createCityArchitecture(game); }],
  ['Planting palms along the Corniche', (game) => { game.cityFurniture = createCityFurniture(game); }],
  ['Tuning engines and radios', startVehiclesAndSound],
  ['Waking the city', startPeopleTrafficAndPolice],
  ['Briefing the crew', startStoryJobsAndActivities],
  ['Polishing the dashboard', (game) => { game.hud = createHud(game); game.menus = createMenus(game); }],
];

/** Build the whole open world, reporting progress (0..1 and a line of text) between steps. */
export async function raiseOpenWorld(game, report) {
  for (let i = 0; i < RAISING_STEPS.length; i += 1) {
    report((i + 0.4) / RAISING_STEPS.length, RAISING_STEPS[i][0]);
    await nextFrame();
    RAISING_STEPS[i][1](game);
  }
  report(1, 'Welcome to Port Sarab');
  await nextFrame();
}

/** One frame of the living city. The order matters: decide, then move, then look, then draw. */
export function updateOpenWorld(game, dt) {
  // 1. Everyone decides what to do: the player, drivers, walkers, police, the story.
  game.player.update(dt);
  game.traffic.update(dt);
  game.pedestrians.update(dt);
  game.police.update(dt);
  game.policeHelicopter.update(dt);
  game.roadblocks.update(dt);
  game.policeRadio.update(dt);
  game.missions.update(dt);
  game.activities.update(dt);
  game.shops.update(dt);
  game.safehouses.update(dt);
  game.cityServices.update(dt);
  game.phone.update(dt);
  game.cutscenes.update(dt);
  // 2. The world moves: cars first, so the people sitting in them ride exactly with them.
  game.vehicles.update(dt);
  game.characters.update(dt);
  game.weapons.update(dt);
  game.wanted.update(dt);
  game.story.update(dt);
  game.economy.update(dt);
  // 3. The camera looks, then the sky and everything drawn follows it.
  game.cameraRig.update(dt);
  game.weather.update(dt);
  game.sky.update(dt);
  game.sea.update(dt);
  game.cityGround.update(dt);
  game.cityArchitecture.update(dt);
  game.cityFurniture.update(dt);
  game.vehicleRenderer.update(dt);
  game.effects.update(dt);
  game.audio.update(dt);
  // 4. The dashboard.
  game.hud.update(dt);
  game.menus.update(dt);
  game.prompts.flush();
}

/** While a menu has the game paused, the menus, the sound and the picture still need a turn. */
export function updateWhilePaused(game, dt) {
  game.menus.update(dt);
  game.hud.update(dt);
  game.audio.update(dt);
  if (game.cameraRig.isCinematic) game.cameraRig.update(dt);
}

/** The opening cutscene of a new game; resolves when the player has control. */
export function playStoryIntro(game) {
  return startNewGameIntro(game);
}

/** The data of Port Sarab: the plan, the roads, the ground and everything solid. */
function planTheCity(game) {
  game.city = createPortSarabCityPlan(game);
  game.roads = createRoadNetwork(game);
  game.terrain = createTerrainHeight(game);
  game.colliders = createCollisionWorld(game);
  game.colliders.addCityPlan(game.city);
}

/** The sandstorm first (the sky reads it), then the sun and sky, then the sea that mirrors them. */
function startSkySeaAndWeather(game) {
  game.weather = createSandstormWeather(game);
  game.sky = createDayNightCycle(game);
  game.sea = createSeaWater(game);
}

/** Effects first (lamps register their glows with it), then the ground; the port cranes' legs become solid. */
function paveTheGround(game) {
  game.effects = createEffects(game);
  game.cityGround = createCityGround(game);
  for (const leg of game.cityGround.craneLegs || []) {
    game.colliders.addPost({ x: leg.x, z: leg.z, radius: leg.radius, y0: 0, y1: 40, kind: 'crane' });
  }
}

function startVehiclesAndSound(game) {
  game.audio = createAudio(game);
  game.vehicles = createVehicleManager(game);
  game.vehicleRenderer = createVehicleRenderer(game);
}

function startPeopleTrafficAndPolice(game) {
  game.characters = createCharacterManager(game, { capacity: 128 });
  game.weapons = createWeaponSystem(game);
  game.wanted = createWantedLevel(game);
  game.police = createPoliceDispatch(game);
  game.policeHelicopter = createPoliceHelicopter(game);
  game.roadblocks = createRoadblocks(game);
  game.policeRadio = createPoliceRadioChatter(game);
  game.traffic = createTrafficSystem(game);
  game.pedestrians = createPedestrianSystem(game);
}

function startStoryJobsAndActivities(game) {
  game.story = createCoverMeter(game);
  game.cutscenes = createCutsceneDirector(game);
  game.phone = createHandlerCalls(game);
  game.missions = createMissionRunner(game);
  game.activities = createActivities(game);
  game.shops = createShops(game);
  game.safehouses = createSafehouses(game);
  game.cityServices = createCityServices(game);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
