// The shared `game` object of KHAMSIN: Port Sarab, and the contract between its systems.
// Every system is made by a factory, createXxx(game), and reaches every other system only through
// this object (game.vehicles, game.wanted, game.events ...), never by importing its file. The
// typedefs below are the agreed shapes: entities are plain objects that any system may read, and
// each field has one owner that writes it.
//
// Space: metres. +X east, +Z south (the dunes), -Z north (the sea), +Y up. The city is flat at y = 0.
// Heading (yaw, radians): 0 faces +Z, PI/2 faces +X; forward = (sin h, 0, cos h); a model is built
// facing +Z and placed with rotation.y = heading. Seen from the driver's seat a growing heading is a
// LEFT turn, so steer = +1 (right) makes the heading fall.
import * as THREE from 'three';
import { gameConfig } from './gameConfig.js';
import { createEventBus } from './eventBus.js';
import { createInputControls } from './inputControls.js';
import { createMarkerRegistry } from './markerRegistry.js';
import { createSeededRandom } from './seededRandom.js';
import { mathUtils } from './mathUtils.js';

/**
 * @typedef {Object} VehicleSpec  One entry of the vehicle catalogue (game.catalog.vehicles).
 * @property {string} id            e.g. 'sarab_taxi'
 * @property {string} name          the invented model name shown on the HUD, e.g. 'Dromo Falcon GT'
 * @property {string} className     'compact'|'sedan'|'sports'|'super'|'suv'|'pickup'|'van'|'truck'|'bus'|'buggy'|'police'|'taxi'|'armored'
 * @property {number} mass          kg
 * @property {number} length @property {number} width @property {number} height   body box, metres
 * @property {number} wheelbase @property {number} track @property {number} wheelRadius
 * @property {number} topSpeed      m/s
 * @property {number} acceleration  m/s^2 at low speed
 * @property {number} braking       m/s^2
 * @property {number} grip          lateral grip in g (0.8 loose .. 1.4 glued)
 * @property {'rwd'|'fwd'|'awd'} drive
 * @property {number} health        hit points when new
 * @property {number} seats
 * @property {number} value         street price in dollars
 * @property {number[]} colors      paint colours (0xRRGGBB) it spawns in
 * @property {Object} traffic       how often it appears per district kind, e.g. { downtown: 3, docks: 0 }
 */

/**
 * @typedef {Object} VehicleControls  Written by the driver (the player system or an AI), read by vehicle physics.
 * @property {number} throttle  0..1
 * @property {number} brake     0..1 (also reverses once stopped when `reverse` is set)
 * @property {number} steer     -1 full left .. +1 full right
 * @property {boolean} handbrake
 * @property {boolean} reverse  drive backwards
 * @property {boolean} horn @property {boolean} siren @property {boolean} headlights
 */

/**
 * @typedef {Object} Vehicle  A live vehicle. Owner of pos/vel/heading and all physics fields: game.vehicles.
 * @property {number} id
 * @property {VehicleSpec} spec
 * @property {THREE.Vector3} pos      centre of the vehicle at ground level (its wheels' contact plane)
 * @property {number} heading @property {number} pitch @property {number} roll
 * @property {THREE.Vector3} vel      world velocity, m/s
 * @property {number} speed           signed forward speed, m/s
 * @property {number} yawRate
 * @property {VehicleControls} controls
 * @property {number} health @property {boolean} wrecked @property {boolean} onFire
 * @property {boolean} grounded       false while airborne
 * @property {number} slip            0..1 how hard the tyres are sliding (skid marks, smoke, screech)
 * @property {number} rpm             0..1 engine speed for the engine sound
 * @property {number} gear
 * @property {number} color           paint, 0xRRGGBB
 * @property {string} faction         'civilian'|'police'|'crew'|'gang'|'player'
 * @property {Character|null} driver  @property {Character[]} passengers
 * @property {boolean} isPlayer       the player is at the wheel
 * @property {boolean} parked @property {boolean} locked
 * @property {{steerAngle:number, spin:number, compression:number, grounded:boolean, skid:number}[]} wheels
 *           four wheels in the order front-left, front-right, rear-left, rear-right. In model space (facing +Z) the
 *           LEFT side is +X, so wheel i sits at x = (i % 2 === 0 ? +1 : -1) * track / 2, z = (i < 2 ? +1 : -1) * wheelbase / 2.
 *           spin is the accumulated rolling angle (radians), compression the suspension travel in metres (+ is squashed).
 *           pitch and roll are the angles to put in rotation.x and rotation.z with order 'YXZ': pitch > 0 is nose down,
 *           roll > 0 lifts the left side.
 * @property {any} ai                 owned by whichever system drives it (traffic, police, missions)
 * @property {Object} tags            free-form marks set by missions, e.g. { missionTarget: true }
 */

/**
 * @typedef {Object} CharacterIntent  Written by the mover (player system or an AI), read by game.characters.
 * @property {number} moveX @property {number} moveZ   world-space direction, length 0..1
 * @property {'walk'|'run'|'sprint'} pace
 * @property {boolean} jump
 * @property {boolean} aim @property {number} aimYaw @property {number} aimPitch
 * @property {boolean} fire
 * @property {boolean} crouch
 * @property {number|null} faceYaw   turn to face this heading while standing still
 * @property {string|null} gesture   'handsUp'|'cower'|'talk'|'wave'|'phone'|'sit'|'lean'|null
 */

/**
 * @typedef {Object} Character  A live person. Owner of pos/vel/state/health: game.characters.
 * @property {number} id
 * @property {'player'|'civilian'|'officer'|'gang'|'crew'|'target'} kind
 * @property {string} faction
 * @property {string} [name]
 * @property {THREE.Vector3} pos   at the feet
 * @property {number} heading
 * @property {THREE.Vector3} vel
 * @property {CharacterIntent} intent
 * @property {string} state  'idle'|'walk'|'run'|'sprint'|'jump'|'fall'|'aim'|'melee'|'enterVehicle'|'driving'|
 *                           'passenger'|'exitVehicle'|'ragdoll'|'getUp'|'dead'|'handsUp'|'cower'|'sit'|'talk'
 * @property {boolean} grounded @property {boolean} alive
 * @property {number} health @property {number} maxHealth @property {number} armor
 * @property {Object} look     colours and build from game.characters.randomLook()
 * @property {{id:string, ammo:number, clip:number}[]} weapons
 * @property {number} weaponIndex    index into weapons; -1 is bare fists
 * @property {Vehicle|null} vehicle  the vehicle the character sits in
 * @property {number} seat           0 is the driver
 * @property {any} ai                owned by whichever system spawned it
 * @property {Object} tags
 */

/**
 * @typedef {Object} Game
 * @property {typeof THREE} THREE
 * @property {THREE.WebGLRenderer} renderer @property {THREE.Scene} scene @property {THREE.PerspectiveCamera} camera
 * @property {HTMLCanvasElement} canvas
 * @property {typeof gameConfig} config
 * @property {ReturnType<typeof createEventBus>} events
 * @property {ReturnType<typeof createInputControls>} input
 * @property {typeof mathUtils} math
 * @property {ReturnType<typeof createSeededRandom>} rng   world-building stream; fork it: game.rng.fork('traffic')
 * @property {ReturnType<typeof createMarkerRegistry>} markers
 * @property {{elapsed:number, dt:number, realDt:number, frame:number, hour:number, clockRate:number, scale:number, paused:boolean, fps:number}} time
 * @property {'loading'|'menu'|'playing'|'cutscene'|'paused'|'dead'|'shot'} mode
 * @property {Object} catalog   { vehicles, vehicleById, weapons, weaponById, characters (story cast), radio }
 *
 * World (static, built once):
 * @property {Object} city       the data of Port Sarab: districts, roads, blocks, buildings, landmarks, places
 * @property {Object} roads      lanes for traffic, sidewalks for people, findRoute() for the GPS and the police
 * @property {Object} terrain    heightAt(x,z), surfaceAt(x,z), isWater(x,z)
 * @property {Object} colliders  static collision: boxes and posts in a spatial hash, raycast, lineOfSight
 * @property {Object} cityScene  the meshes of the city
 * @property {Object} sky        sun, sky dome, day and night: sunDirection, night (0..1)
 * @property {Object} weather    the khamsin: sandstorm (0..1), visibility
 *
 * Simulation:
 * @property {Object} vehicles    every live Vehicle and its physics
 * @property {Object} characters  every live Character, movement, animation
 * @property {Object} player      the player's Character, current Vehicle and controls
 * @property {Object} cameraRig   chase and on-foot camera
 * @property {Object} traffic @property {Object} pedestrians
 * @property {Object} wanted @property {Object} police
 * @property {Object} weapons     firing, ballistics, pickups, explosions
 * @property {Object} missions @property {Object} story @property {Object} cutscenes
 * @property {Object} activities  races, taxi fares, courier runs, stunt jumps, hidden falcons
 * @property {Object} economy     money, reputation rank, shops, safehouses, statistics
 * @property {Object} effects @property {Object} audio
 * @property {Object} hud @property {Object} menus
 * @property {Object} save
 */

/*
 * WHAT THE SYSTEMS PROMISE EACH OTHER. Besides these, every system has update(dt), called by main.js
 * once a frame. A system must work when another is still missing (game.audio?.play(...)).
 *
 * game.terrain    (world/terrainHeight.js)
 *   heightAt(x, z) -> y            0 in the city, dunes in the desert, below sea level under water
 *   surfaceAt(x, z) -> 'road'|'sidewalk'|'plaza'|'sand'|'beach'|'water'
 *   isWater(x, z) -> boolean       deep enough to sink a car or make a person swim
 *
 * game.colliders  (world/collisionWorld.js)   static things only: buildings, walls, posts, palms
 *   addBox({minX, minZ, maxX, maxZ, y0, y1, kind, breakable?, ref?}) -> collider
 *   addPost({x, z, radius, y0, y1, kind, breakable?, ref?}) -> collider      remove(collider)
 *   query(x, z, radius, out) -> out                     colliders whose bounds touch the circle
 *   pushOutCircle(pos, radius, y0, y1) -> contact|null  moves pos.x/pos.z out; contact = {nx, nz, depth, collider}
 *   boxContacts(cx, cz, halfWidth, halfLength, heading, y0, y1, out) -> out
 *                                                       an oriented box against the world: [{nx, nz, depth, px, pz, collider}]
 *                                                       (nx, nz) points from the collider toward the box
 *   raycast(origin, direction, maxDistance) -> {distance, point, normal, collider}|null   static world and ground
 *   lineOfSight(a, b) -> boolean                        nothing static blocks the segment a-b
 *
 * game.vehicles   (vehicles/vehicleManager.js)
 *   list: Vehicle[]
 *   spawn(specId, {x, z, heading, color?, faction?, parked?, locked?}) -> Vehicle       despawn(vehicle)
 *   nearest(x, z, maxDistance, filter?) -> Vehicle|null
 *   applyDamage(vehicle, amount, {source?, kind?: 'crash'|'bullet'|'explosion'|'fire', x?, z?})
 *   explode(vehicle, source?)        applyImpulse(vehicle, ix, iz, px?, pz?)        setDriver(vehicle, character|null)
 *   emits 'vehicle:spawned' {vehicle}  'vehicle:despawned' {vehicle}
 *         'vehicle:collision' {vehicle, other, collider, impulse, speed, x, y, z, nx, nz}   other is a Vehicle or null
 *         'vehicle:hitCharacter' {vehicle, character, speed}   'vehicle:damaged' {vehicle, amount, source, kind}
 *         'vehicle:destroyed' {vehicle, source}   'vehicle:sunk' {vehicle}   'prop:broken' {collider, x, z, vehicle}
 * game.vehicleRenderer (vehicles/vehicleRenderer.js)
 *   update(dt)  draws game.vehicles.list        buildPreview(specId, color) -> THREE.Object3D for menus
 *
 * game.characters (characters/characterManager.js)
 *   list: Character[]
 *   spawn({kind, x, z, heading?, faction?, look?, archetype?, name?, health?, weapons?}) -> Character    despawn(character)
 *   nearest(x, z, maxDistance, filter?) -> Character|null
 *   damage(character, amount, {source?, weaponId?, dirX?, dirZ?, headshot?, kind?: 'bullet'|'melee'|'vehicle'|'explosion'|'fall'|'fire'})
 *   knockDown(character, vx, vy, vz, {source?})   ragdoll with a launch velocity        kill(character, info?)
 *   enterVehicle(character, vehicle, seat, {instant?})        exitVehicle(character, {instant?})
 *   randomLook(archetype, rng?) -> look   archetypes 'civilian'|'tourist'|'business'|'worker'|'local'|'officer'|'swat'|'gang'|'crew'|'player'
 *   emits 'character:damaged' {character, amount, source, kind}   'character:died' {character, source, kind}
 *         'character:knockedDown' {character, source}
 *
 * game.sky        (world/dayNightCycle.js)   sunDirection: Vector3 (toward the sun), night: 0..1, sunLight, setHour(h)
 * game.weather    (world/sandstormWeather.js) sandstorm: 0..1, visibility (metres), start(intensity, rampSeconds), clear(rampSeconds)
 *
 * game.effects    (effects/effectsDirector.js)
 *   spawn(kind, x, y, z, options?)  kinds 'dust'|'sand'|'smoke'|'blackSmoke'|'fire'|'sparks'|'impact'|'debris'|'glass'|'splash'|'muzzle'|'tyreSmoke'|'blood'
 *   tracer(ax, ay, az, bx, by, bz)        explosion(x, y, z, radius)        flash(color, strength)   a brief full-screen tint
 *   glows.add({x, y, z, color, size, entity?, offset?, flicker?}) -> glow      glows.remove(glow)
 *
 * game.audio      (audio/audioDirector.js)
 *   unlock()   start audio after the first click or key        play(soundId, {x?, y?, z?, volume?, pitch?})
 *   radio: { stations, index, next(), off() }                  setVolumes({master?, music?, effects?})
 *
 * game.cameraRig  (camera/followCamera.js)   yaw (the heading the camera looks along), pitch, shake(strength), focus: Vector3
 * game.player     (player/playerController.js)   character: Character, vehicle: Vehicle|null, pos (the one that counts)
 * game.wanted     (police/wantedLevel.js)   level 0..5, state 'clear'|'pursuit'|'search', report(crime, x, z, options?), set(level), clear()
 * game.economy    (economy/walletAndRank.js) money, addMoney(amount, reason), spend(amount, reason) -> boolean, rank, addRespect(points)
 * game.missions   (missions/missionRunner.js) active, start(id), abort(), isCompleted(id)
 * game.story      (story/coverMeter.js)     crewTrust 0..100, badge 0..100, addTrust(n, why), addBadge(n, why), flags
 *
 * EVENTS anyone may emit or hear: 'notify' {text, kind?: 'info'|'good'|'bad'|'cash'|'wanted'}   'subtitle' {speaker, text, seconds?}
 *   'crime' {type, x, z, severity?, victim?}   'shot:fired' {shooter, weaponId, x, y, z, dirX, dirY, dirZ, hitX, hitY, hitZ, hit}
 *   'explosion' {x, y, z, radius, source}   'wanted:changed' {level, previous}   'money:changed' {money, delta, reason}
 *   'player:enteredVehicle' {vehicle}   'player:exitedVehicle' {vehicle}   'player:died' {}   'player:arrested' {}   'player:respawned' {}
 *   'mission:started' {mission}   'mission:objective' {mission, text}   'mission:completed' {mission, reward}   'mission:failed' {mission, reason}
 */

/** Hand out ids that are unique across vehicles and characters. */
let nextEntityId = 1;
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

/**
 * Build the renderer, scene, camera and the core services on `canvas`, and return the `game`
 * object the systems are then attached to.
 * @returns {Game}
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
    newEntityId,
    createVehicleControls,
    createCharacterIntent,
  };

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
