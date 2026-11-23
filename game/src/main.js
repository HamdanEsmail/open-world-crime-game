// KHAMSIN: Port Sarab. An original open-world crime game: a desert-coast city to drive and walk,
// traffic and pedestrians, a five-star wanted level with police who respond, ten story jobs with
// two endings. This file starts the game: the core first, then the open world, then the title screen.
//
// Loaded first, before the systems themselves: each system's rule book (one small file of the
// rules that system plays by), the vehicle catalogue, the player, the camera, money and saving.
import * as districtArchitecture from './world/districtArchitectureStyles.js';
import * as groundSurfaces from './world/groundSurfaceRules.js';
import * as streetFurniture from './world/streetFurnitureRules.js';
import { VEHICLE_CATALOG, vehicleSpecById } from './vehicles/vehicleCatalog.js';
import * as driving from './vehicles/drivingRules.js';
import * as vehicleBodies from './vehicles/vehicleBodyStyles.js';
import { createPlayerController } from './player/playerController.js';
import { createFollowCamera } from './camera/followCamera.js';
import * as traffic from './traffic/trafficRules.js';
import * as pedestrians from './pedestrians/pedestrianRules.js';
import * as wantedLevel from './police/wantedLevelRules.js';
import * as policeHeavyResponse from './police/policeHeavyResponseRules.js';
import * as storyJobs from './missions/storyJobOutline.js';
import * as coverMeter from './story/coverMeterRules.js';
import * as combat from './combat/combatRules.js';
import * as activities from './activities/activityRules.js';
import * as shopPrices from './economy/shopPriceRules.js';
import { createWalletAndRank } from './economy/walletAndRank.js';
import * as hudAndMenus from './ui/hudAndMenuGuide.js';
import * as characterAnimation from './characters/characterAnimationRules.js';
import * as effects from './effects/effectRules.js';
import * as radioAndSound from './audio/radioAndSoundGuide.js';
import { createSaveGame } from './core/saveGame.js';
import { startGameLoop } from './core/gameLoop.js';
import { createGameContext } from './core/sharedGameObject.js';

/** Start everything on the page's canvas: loading screen, open world, then the title or a saved game. */
async function bootPortSarab() {
  const query = new URLSearchParams(window.location.search);
  const game = createGameContext(document.getElementById('port-sarab-open-world'), { antialias: query.get('smooth') !== '0' });
  window.khamsin = game;
  game.rules = RULE_BOOKS;
  game.catalog.vehicles = VEHICLE_CATALOG;
  game.catalog.vehicleById = vehicleSpecById;
  game.economy = createWalletAndRank(game);
  game.cameraRig = createFollowCamera(game);
  game.player = createPlayerController(game);

  showLoadingStep(0.04, 'Unrolling the map of Port Sarab');
  const openWorld = await import('./openWorldSystems.js');
  await openWorld.raiseOpenWorld(game, showLoadingStep);
  game.save = createSaveGame(game);
  applyGraphicsQuality(game);
  listenToMenusAndSettings(game, openWorld);
  spawnPlayerAtTheFlat(game);

  game.loop = startGameLoop(
    game,
    (dt) => openWorld.updateOpenWorld(game, dt),
    () => {
      if (game.time.paused) openWorld.updateWhilePaused(game, game.time.realDt);
      keepFrameRateSmooth(game);
      game.renderer.render(game.scene, game.camera);
    },
  );

  if (query.has('shot')) {
    const shots = await import('./shots/screenshotScenes.js');
    await shots.stageScreenshot(game, query.get('shot'));
  } else if (query.has('play')) {
    beginPlaying(game);
  } else {
    showTitleScreen(game);
  }
  hideLoadingScreen(game);
}

/** The title screen: the menu over a slow circling shot of the skyline at golden hour. */
function showTitleScreen(game) {
  game.mode = 'menu';
  game.time.paused = false;
  game.time.hour = game.config.startHour;
  game.wanted.clear();
  game.missions.abort('title');
  game.player.teleport(TITLE_PLAYER_SPOT.x, TITLE_PLAYER_SPOT.z, TITLE_PLAYER_SPOT.heading);
  game.cameraRig.setCinematic(TITLE_SHOT);
  game.hud.hide();
  game.menus.showMainMenu();
}

/** A new story: reset progress, put Zayd at his flat, play the opening, hand over control. */
async function startNewGame(game, openWorld) {
  game.menus.closeAll();
  game.economy.reset();
  game.story.reset();
  game.missions.reset?.();
  game.activities.reset?.();
  game.safehouses.reset?.();
  game.wanted.clear();
  game.weather.set(0);
  game.time.hour = game.config.startHour;
  const character = game.player.character;
  character.weapons.length = 0;
  character.weaponIndex = -1;
  character.armor = 0;
  game.characters.revive(character);
  spawnPlayerAtTheFlat(game);
  game.cameraRig.setCinematic(null);
  game.mode = 'playing';
  try {
    await openWorld.playStoryIntro(game);
  } catch (error) {
    console.warn('the opening could not play', error);
  }
  beginPlaying(game);
  game.save.save('auto');
}

/** Load a slot (the newest when none is named) and play on from it. */
function continueSavedGame(game, slot) {
  const chosen = slot || game.save.latest();
  game.menus.closeAll();
  game.cameraRig.setCinematic(null);
  if (!chosen || !game.save.load(chosen)) spawnPlayerAtTheFlat(game);
  beginPlaying(game);
}

/** Give the player the controls, on streets already full of cars and people. */
function beginPlaying(game) {
  game.traffic.populateNow();
  game.pedestrians.refill();
  game.cameraRig.setCinematic(null);
  game.mode = 'playing';
  game.time.paused = false;
  game.input.enabled = true;
  game.hud.show();
}

/** Zayd's flat in Al Wadi: where a new game and an empty save begin. */
function spawnPlayerAtTheFlat(game) {
  const flat = game.city.place('safehouse_flat');
  if (game.player.character) game.player.teleport(flat.x, flat.z, flat.heading + Math.PI);
  else game.player.spawn(flat.x, flat.z, flat.heading + Math.PI);
}

/** What the menus ask for: new game, continue, load, quit to title, settings, and the mouse. */
function listenToMenusAndSettings(game, openWorld) {
  game.events.on('menu:newGame', () => startNewGame(game, openWorld));
  game.events.on('menu:continue', () => continueSavedGame(game, null));
  game.events.on('menu:load', (event) => continueSavedGame(game, event.slot));
  game.events.on('menu:quit', () => showTitleScreen(game));
  game.events.on('settings:changed', () => applyGraphicsQuality(game));
  game.canvas.addEventListener('click', () => {
    game.audio.unlock();
    if (game.mode === 'playing' && !game.menus.isOpen) game.input.lockPointer();
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'F5' && game.mode === 'playing' && !game.missions.active) game.save.save('slot1');
  });
}

/**
 * Low, medium or high: the drawing resolution, the size of the sun's shadow map and how often it is
 * redrawn (every frame on high, every second frame on medium, no shadows on low).
 */
function applyGraphicsQuality(game) {
  const quality = game.settings.quality;
  const device = window.devicePixelRatio || 1;
  renderScale = quality === 'low' ? 0.75 : quality === 'high' ? Math.min(device, 1.5) : Math.min(device, 1);
  shadowInterval = quality === 'high' ? 1 : 2;
  const sun = game.sky.sunLight;
  sun.castShadow = quality !== 'low';
  const mapSize = quality === 'high' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== mapSize) {
    sun.shadow.mapSize.set(mapSize, mapSize);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }
  game.renderer.shadowMap.autoUpdate = shadowInterval === 1;
  game.renderer.shadowMap.needsUpdate = true;
  game.renderer.setPixelRatio(renderScale);
  game.renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/**
 * Called before each frame is drawn: redraw the shadows on their interval and, if the frame rate
 * stays low, redraw them less often and then draw at a lower resolution rather than stutter.
 */
function keepFrameRateSmooth(game) {
  if (shadowInterval > 1 && game.time.frame % shadowInterval === 0) game.renderer.shadowMap.needsUpdate = true;
  if (game.mode !== 'playing' || game.time.fps === 0) return;
  slowFrames = game.time.fps < 27 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
  if (slowFrames < 200) return;
  slowFrames = 0;
  if (shadowInterval > 1 && shadowInterval < 4) {
    shadowInterval += 1;
  } else if (renderScale > 0.6) {
    renderScale = Math.max(0.6, renderScale - 0.1);
    game.renderer.setPixelRatio(renderScale);
    game.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
}

function showLoadingStep(fraction, text) {
  const bar = document.querySelector('#loading-bar i');
  const step = document.getElementById('loading-step');
  if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
  if (step) step.textContent = `${text}…`;
}

function hideLoadingScreen(game) {
  if (game.menus && game.menus.hideLoading) game.menus.hideLoading();
  else document.getElementById('loading-screen').hidden = true;
}

/** Every system's rule book by name, shared as game.rules. */
const RULE_BOOKS = {
  districtArchitecture, groundSurfaces, streetFurniture, driving, vehicleBodies, traffic, pedestrians, wantedLevel,
  policeHeavyResponse, storyJobs, coverMeter, combat, activities, shopPrices, hudAndMenus, characterAnimation, effects, radioAndSound,
};

/** The title camera circles this point above The Spires. */
const TITLE_SHOT = { orbit: { x: 20, y: 46, z: -470 }, radius: 430, height: 52, speed: 0.03, fov: 50 };
const TITLE_PLAYER_SPOT = { x: 62, z: -420, heading: 0 };
let renderScale = 1;
let shadowInterval = 2;
let slowFrames = 0;

bootPortSarab();
