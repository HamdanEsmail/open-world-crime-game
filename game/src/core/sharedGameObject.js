// Builds the one `game` object every system of KHAMSIN receives: the renderer, scene and camera,
// the event bus, input, random numbers, markers, prompts, the clock and the settings. Systems are
// attached to it afterwards (game.vehicles, game.wanted ...) and reach each other only through it.
import * as THREE from 'three';
import { gameConfig } from './gameConfig.js';
import { createEventBus } from './eventBus.js';
import { createInputControls, KEY_BINDINGS, ACTION_LABELS } from './inputControls.js';
import { createMarkerRegistry } from './markerRegistry.js';
import { createInteractPrompts } from './interactPrompts.js';
import { createSeededRandom } from './seededRandom.js';
import { mathUtils } from './mathUtils.js';

/**
 * Build the renderer, scene, camera and the core services on `canvas`, and return the `game`
 * object the systems are then attached to (its shape is documented in core/gameContext.js).
 */
export function createGameContext(canvas, options = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: options.antialias !== false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gameConfig.render.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(gameConfig.render.fieldOfView, 16 / 10, gameConfig.render.near, gameConfig.render.far);
  camera.position.set(0, 30, -60);
  camera.lookAt(0, 0, 0);

  const events = createEventBus();
  const game = {
    THREE,
    renderer,
    scene,
    camera,
    canvas,
    config: gameConfig,
    events,
    input: createInputControls(canvas),
    math: mathUtils,
    rng: createSeededRandom(gameConfig.worldSeed),
    markers: createMarkerRegistry(events),
    time: { elapsed: 0, dt: 0, realDt: 0, frame: 0, hour: gameConfig.startHour, clockRate: 1, scale: 1, paused: false, fps: 0 },
    mode: 'loading',
    catalog: {},
    rules: {},
    newEntityId,
    createVehicleControls,
    createCharacterIntent,
    keyBindings: KEY_BINDINGS,
    actionLabels: ACTION_LABELS,
    settings: { mouseSensitivity: 1, invertY: false, quality: 'medium', master: 0.8, music: 0.6, effects: 0.9 },
    prompts: null,
  };
  game.prompts = createInteractPrompts(game);

  function fitToWindow() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    events.emit('resize', { width, height });
  }
  window.addEventListener('resize', fitToWindow);
  fitToWindow();

  return game;
}

/** Hand out ids that are unique across vehicles and characters. */
export function newEntityId() {
  const id = nextEntityId;
  nextEntityId += 1;
  return id;
}

/** A zeroed set of vehicle controls. */
export function createVehicleControls() {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, reverse: false, horn: false, siren: false, headlights: false };
}

/** A zeroed character intent. */
export function createCharacterIntent() {
  return { moveX: 0, moveZ: 0, pace: 'walk', jump: false, aim: false, aimYaw: 0, aimPitch: 0, fire: false, crouch: false, faceYaw: null, gesture: null };
}

let nextEntityId = 1;
