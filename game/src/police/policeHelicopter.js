// Shaheen-1, the PSPD patrol helicopter. Scrambled from Headquarters once the wanted level reaches
// three stars, it flies in from out of sight and holds a station 50 to 70 m from the chase and 40 to
// 60 m up (higher over towers), pins the suspect in its searchlight and keeps the pursuit alive while
// it has eyes on, puts a door gunner to work at five stars, and pulls out trailing smoke when it is
// shot up, to come back a minute later. Becomes game.policeHelicopter.
import * as THREE from 'three';
import { buildShaheenModel, BODY_CENTER, EXHAUST_POINT } from './helicopterModel.js';
import { createHelicopterFlight } from './helicopterFlight.js';
import { createHelicopterSpotter } from './helicopterSpotter.js';
import { createHelicopterDoorGunner } from './helicopterDoorGunner.js';
import { helicopterJoinsAtStars, helicopterAltitudeOverRoof } from './policeHeavyResponseRules.js';

const DISPATCH_DELAY = [6, 10];
const MAX_HEALTH = 700;
const WITHDRAW_SECONDS = 60;
const HIT_RADIUS = 3.1;
const SPAWN_DISTANCE = 520;
const SPAWN_HEIGHT = 110;
const STAGE_HEIGHT = 48;

/**
 * Create Shaheen-1 (hidden until a chase calls for it).
 * @param {Object} game
 * @returns {Object} game.policeHelicopter
 */
export function createPoliceHelicopter(game) {
  const { smoothstep, approach } = game.math;
  const model = buildShaheenModel();
  model.root.visible = false;
  game.scene.add(model.root);

  const heli = {
    callsign: 'Shaheen-1',
    isHelicopter: true,
    /** In the world and visible. */
    active: false,
    /** 'idle' | 'inbound' | 'onStation' | 'leaving' | 'withdrawing' */
    state: 'idle',
    /** Held in place for a staged screenshot. */
    staged: false,
    position: new THREE.Vector3(0, -500, 0),
    velocity: new THREE.Vector3(),
    heading: 0,
    pitch: 0,
    roll: 0,
    yawRate: 0,
    /** 0..1 of flight rpm, for the rotor sound. */
    rotorSpeed: 0,
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    /** On station with a clear line of sight to the player: the wanted level reads this. */
    seesPlayer: false,
    /** Metres above the ground below. */
    altitude: 0,
    distanceToPlayer: Infinity,
    /** Seconds before it may come back after being driven off. */
    cooldown: 0,
    searchlight: { on: false, level: 0, aim: new THREE.Vector3(), end: new THREE.Vector3() },
    marker: null,
    model,
    updateMs: 0,
    update,
    damage,
    hitTest,
    summon,
    dismiss,
    arriveNow,
    stageAt,
    release,
    reset,
  };
  /** Same vector as position, so the minimap and markers can treat it like any other entity. */
  heli.pos = heli.position;

  /** Where the suspect is, read once a frame and shared with the pilot and the observer. */
  const suspect = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), ok: false };
  const flight = createHelicopterFlight(game, heli, suspect);
  const spotter = createHelicopterSpotter(game, heli, model, suspect);
  const gunner = createHelicopterDoorGunner(game, heli);
  heli.gunner = gunner;
  /** Where it is trying to hold station (for debugging views). */
  heli.goal = flight.goal;

  let clock = 0;
  let dispatchTimer = -1;
  let summoned = false;
  let announcedArrival = false;
  let smokeTimer = 0;
  const worldPoint = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const projectionScreen = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const statusEvent = { helicopter: heli, reason: '' };
  const damageEvent = { helicopter: heli, amount: 0, health: 0, source: null };
  const smokeOptions = { count: 1, scale: 1.3 };
  const sparkOptions = { count: 8 };

  game.events.on('shot:fired', onShotFired);

  /** Run the helicopter for one frame. */
  function update(dt) {
    if (!(dt > 0)) return;
    const started = performance.now();
    if (dt > 0.1) dt = 0.1;
    clock += dt;
    readSuspect();
    const wanted = suspect.ok && (summoned || helicopterJoinsAtStars(wantedLevel()));
    if (heli.cooldown > 0) heli.cooldown = Math.max(0, heli.cooldown - dt);
    runStateMachine(dt, wanted);
    if (heli.active) {
      if (!heli.staged) flight.fly(dt);
      placeModel(dt);
      spotter.update(dt);
      gunner.update(dt);
      trailSmoke(dt);
    }
    heli.updateMs = performance.now() - started;
  }

  // ---- when to come and go ----------------------------------------------------------------------

  function runStateMachine(dt, wanted) {
    const goal = flight.goal;
    switch (heli.state) {
      case 'idle':
        if (!wanted || heli.cooldown > 0) {
          dispatchTimer = -1;
          return;
        }
        if (dispatchTimer < 0) dispatchTimer = DISPATCH_DELAY[0] + Math.random() * (DISPATCH_DELAY[1] - DISPATCH_DELAY[0]);
        dispatchTimer -= dt;
        if (dispatchTimer <= 0) launch();
        return;
      case 'inbound':
        if (!wanted) {
          startLeaving('standDown');
          return;
        }
        if (Math.hypot(goal.x - heli.position.x, goal.z - heli.position.z) < 110 && Math.abs(goal.y - heli.position.y) < 45) arrive();
        return;
      case 'onStation':
        if (!wanted && !heli.staged) startLeaving('standDown');
        return;
      case 'leaving':
        if (wanted && heli.cooldown <= 0) {
          heli.state = 'inbound';
          addMarker();
          emitStatus('helicopter:dispatched', 'pursuit');
          return;
        }
        if (outOfView()) hide();
        return;
      case 'withdrawing':
        if (outOfView()) hide();
        return;
      default:
        heli.state = 'idle';
    }
  }

  /** Lift off: appear far away toward PSPD Headquarters, outside the camera's view, and fly in. */
  function launch() {
    dispatchTimer = -1;
    chooseSpawnPoint(heli.position);
    heli.velocity.set(suspect.pos.x - heli.position.x, 0, suspect.pos.z - heli.position.z).setLength(45);
    heli.heading = Math.atan2(heli.velocity.x, heli.velocity.z);
    heli.pitch = 0.2;
    heli.roll = 0;
    heli.health = MAX_HEALTH;
    heli.rotorSpeed = 1;
    heli.active = true;
    heli.staged = false;
    heli.state = 'inbound';
    announcedArrival = false;
    flight.beginChase();
    spotter.reset(false);
    model.root.visible = true;
    spotter.setVisible(true);
    addMarker();
    flight.computeGoal(0);
    emitStatus('helicopter:dispatched', 'pursuit');
  }

  function arrive() {
    heli.state = 'onStation';
    if (announcedArrival) return;
    announcedArrival = true;
    emitStatus('helicopter:arrived', 'onStation');
  }

  /** The chase is over: climb away. */
  function startLeaving(reason) {
    heli.state = 'leaving';
    flight.setExitDirection();
    spotter.setSees(false);
    removeMarker();
    emitStatus('helicopter:left', reason);
  }

  /** Shot up: break off trailing smoke, and stay away for a minute. */
  function withdraw() {
    heli.state = 'withdrawing';
    heli.cooldown = WITHDRAW_SECONDS;
    flight.setExitDirection();
    spotter.setSees(false);
    removeMarker();
    emitStatus('helicopter:left', 'damaged');
  }

  /** Gone beyond the haze: take it out of the world. */
  function hide() {
    spotter.setSees(false);
    heli.active = false;
    heli.state = 'idle';
    heli.staged = false;
    model.root.visible = false;
    spotter.setVisible(false);
    spotter.followSuspect();
    removeMarker();
    heli.velocity.set(0, 0, 0);
    heli.rotorSpeed = 0;
    heli.distanceToPlayer = Infinity;
  }

  /** Toward Headquarters (or behind the camera), 520 m out, turned until it is outside the view. */
  function chooseSpawnPoint(out) {
    const hq = game.city && game.city.place ? game.city.place('police_hq') : null;
    let bearing;
    if (hq && Math.hypot(hq.x - suspect.pos.x, hq.z - suspect.pos.z) > 80) {
      bearing = Math.atan2(hq.x - suspect.pos.x, hq.z - suspect.pos.z);
    } else {
      game.camera.getWorldDirection(cameraForward);
      bearing = Math.atan2(cameraForward.x, cameraForward.z) + Math.PI;
    }
    updateFrustum();
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const turn = Math.ceil(attempt / 2) * 0.45 * (attempt % 2 === 1 ? 1 : -1);
      const b = bearing + turn;
      const x = suspect.pos.x + Math.sin(b) * SPAWN_DISTANCE;
      const z = suspect.pos.z + Math.cos(b) * SPAWN_DISTANCE;
      const y = Math.max(groundAt(x, z) + SPAWN_HEIGHT, helicopterAltitudeOverRoof(flight.roofline.highestNear(x, z)));
      out.set(x, y, z);
      sphere.center.copy(out);
      sphere.radius = 16;
      if (!frustum.intersectsSphere(sphere)) return;
    }
  }

  /** Far enough, or out of the camera's view and well away, to vanish unseen. */
  function outOfView() {
    const d = heli.position.distanceTo(game.camera.position);
    if (d > 950) return true;
    if (d < 380) return false;
    updateFrustum();
    sphere.center.copy(heli.position);
    sphere.radius = 16;
    return !frustum.intersectsSphere(sphere);
  }

  /** Put the model where the flight is, with a hover wobble, and spin it up. */
  function placeModel(dt) {
    const pos = heli.position;
    const speed = Math.hypot(heli.velocity.x, heli.velocity.z);
    const calm = heli.staged ? 0.6 : 1 - smoothstep(10, 30, speed);
    const bob = (0.35 * Math.sin(clock * 1.3) + 0.18 * Math.sin(clock * 2.9 + 1)) * calm;
    model.root.position.set(pos.x, pos.y + bob, pos.z);
    model.root.rotation.set(
      heli.pitch + 0.02 * Math.sin(clock * 1.1) * calm,
      heli.heading,
      heli.roll + 0.025 * Math.sin(clock * 1.7 + 2) * calm,
    );
    model.root.updateMatrixWorld(true);
    heli.rotorSpeed = approach(heli.rotorSpeed, 1, dt * 0.5);
    model.animate(dt, clock, heli.rotorSpeed, nightAmount(), pixelScale());
    heli.altitude = pos.y - groundAt(pos.x, pos.z);
    heli.distanceToPlayer = suspect.ok ? pos.distanceTo(suspect.pos) : Infinity;
  }

  // ---- damage -------------------------------------------------------------------------------------

  /** Smoke from the engine once it is hurt; a thick black trail while it limps home. */
  function trailSmoke(dt) {
    const leaving = heli.state === 'withdrawing';
    if (!(leaving || heli.health < MAX_HEALTH * 0.5) || !game.effects) return;
    smokeTimer -= dt;
    if (smokeTimer > 0) return;
    smokeTimer = leaving ? 0.09 : 0.35;
    modelToWorld(EXHAUST_POINT, worldPoint);
    const kind = leaving || heli.health < MAX_HEALTH * 0.25 ? 'blackSmoke' : 'smoke';
    game.effects.spawn(kind, worldPoint.x, worldPoint.y, worldPoint.z, smokeOptions);
  }

  /**
   * Hurt the helicopter (bullets from the player, a rocket from a mission). Returns true when it
   * counted. At zero health it pulls out for a minute.
   * @param {number} amount
   * @param {Object} [source]
   */
  function damage(amount, source) {
    if (!heli.active || heli.staged || !(amount > 0)) return false;
    if (heli.state !== 'inbound' && heli.state !== 'onStation') return false;
    heli.health = Math.max(0, heli.health - amount);
    damageEvent.amount = amount;
    damageEvent.health = heli.health;
    damageEvent.source = source || null;
    game.events.emit('helicopter:damaged', damageEvent);
    if (game.effects) {
      modelToWorld(BODY_CENTER, worldPoint);
      game.effects.spawn('sparks', worldPoint.x, worldPoint.y, worldPoint.z, sparkOptions);
    }
    if (heli.health <= 0) withdraw();
    return true;
  }

  /**
   * Distance along a ray (origin, unit direction) to the airframe, or -1 when it misses or is beyond
   * maxDistance. Weapon code may call this to let bullets hit the helicopter.
   */
  function hitTest(ox, oy, oz, dx, dy, dz, maxDistance) {
    if (!heli.active) return -1;
    modelToWorld(BODY_CENTER, worldPoint);
    const cx = worldPoint.x - ox;
    const cy = worldPoint.y - oy;
    const cz = worldPoint.z - oz;
    const along = cx * dx + cy * dy + cz * dz;
    if (along < 0 || along - HIT_RADIUS > maxDistance) return -1;
    const missSq = cx * cx + cy * cy + cz * cz - along * along;
    if (missSq > HIT_RADIUS * HIT_RADIUS) return -1;
    return Math.max(0, along - Math.sqrt(HIT_RADIUS * HIT_RADIUS - missSq));
  }

  /** The player's bullets: a sphere test against the airframe for every shot the player fires. */
  function onShotFired(e) {
    if (!heli.active || !e || e.source === 'helicopter' || e.hit === heli) return;
    const player = game.player;
    if (!player || !e.shooter || e.shooter !== player.character) return;
    const length = Math.hypot(e.dirX || 0, e.dirY || 0, e.dirZ || 0);
    if (!(length > 0)) return;
    let reach = 260;
    if (Number.isFinite(e.hitX) && Number.isFinite(e.hitY) && Number.isFinite(e.hitZ)) {
      reach = Math.hypot(e.hitX - e.x, e.hitY - e.y, e.hitZ - e.z) + 1.5;
    }
    if (hitTest(e.x, e.y, e.z, e.dirX / length, e.dirY / length, e.dirZ / length, reach) < 0) return;
    const catalog = game.catalog;
    const spec = catalog && typeof catalog.weaponById === 'function' ? catalog.weaponById(e.weaponId) : null;
    damage(spec && spec.damage > 0 ? spec.damage : 22, e.shooter);
  }

  // ---- commands for missions and staged scenes ---------------------------------------------------

  /** Call the helicopter in whatever the wanted level (a mission's set piece). */
  function summon() {
    summoned = true;
    if (heli.state === 'idle' && heli.cooldown <= 0) dispatchTimer = 0.5;
  }

  /** Let the wanted level decide again. */
  function dismiss() {
    summoned = false;
  }

  /** Skip the flight in: appear on station over the suspect at once. */
  function arriveNow() {
    readSuspect();
    if (!heli.active) launch();
    const goal = flight.settleStation();
    heli.position.copy(goal);
    heli.velocity.set(suspect.vel.x, 0, suspect.vel.z);
    heli.heading = Math.atan2(suspect.pos.x - goal.x, suspect.pos.z - goal.z);
    heli.state = 'onStation';
    spotter.reset(true);
    arrive();
  }

  /**
   * Hold the helicopter at a pose for a staged screenshot: { x, y, z, heading?, pitch?, roll?,
   * aimX?, aimZ?, light? }. The searchlight tracks the player unless aimX/aimZ are given; light: false
   * leaves it dark. release() lets it fly.
   */
  function stageAt(options) {
    const o = options || {};
    readSuspect();
    if (!heli.active) {
      heli.active = true;
      model.root.visible = true;
      spotter.setVisible(true);
      addMarker();
    }
    heli.staged = true;
    heli.state = 'onStation';
    announcedArrival = true;
    heli.health = MAX_HEALTH;
    const p = suspect.pos;
    heli.position.set(finite(o.x, p.x + 40), finite(o.y, p.y + STAGE_HEIGHT), finite(o.z, p.z + 40));
    heli.velocity.set(0, 0, 0);
    heli.heading = finite(o.heading, Math.atan2(p.x - heli.position.x, p.z - heli.position.z));
    heli.pitch = finite(o.pitch, 0.06);
    heli.roll = finite(o.roll, 0);
    heli.rotorSpeed = 1;
    spotter.reset(o.light !== false);
    if (Number.isFinite(o.aimX) && Number.isFinite(o.aimZ)) spotter.holdAimAt(o.aimX, o.aimZ);
    return heli;
  }

  /** Let a staged helicopter fly again. */
  function release() {
    heli.staged = false;
    spotter.followSuspect();
  }

  /** Take it out of the world at once (a new game, a loaded save). */
  function reset() {
    hide();
    heli.cooldown = 0;
    summoned = false;
    dispatchTimer = -1;
  }

  // ---- small helpers -----------------------------------------------------------------------------

  /** The player's car (or the player on foot) and whether he is up and about. */
  function readSuspect() {
    suspect.ok = false;
    const player = game.player;
    if (!player) return;
    const character = player.character;
    const body = player.vehicle || character;
    if (!body || !body.pos) return;
    suspect.pos.copy(body.pos);
    if (body.vel) suspect.vel.copy(body.vel);
    else suspect.vel.set(0, 0, 0);
    suspect.ok = player.state !== 'down' && !(character && character.alive === false);
  }

  function wantedLevel() {
    const wanted = game.wanted;
    return wanted && typeof wanted.level === 'number' ? wanted.level : 0;
  }

  function groundAt(x, z) {
    return game.terrain ? game.terrain.heightAt(x, z) : 0;
  }

  function nightAmount() {
    const night = game.sky && typeof game.sky.night === 'number' ? game.sky.night : 0;
    return night < 0 ? 0 : night > 1 ? 1 : night;
  }

  /** Points per metre at one metre away, for the navigation lights' size on screen. */
  function pixelScale() {
    const camera = game.camera;
    const height = game.renderer && game.renderer.domElement ? game.renderer.domElement.height : 800;
    return height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  function modelToWorld(local, out) {
    out.set(local.x, local.y, local.z);
    return model.root.localToWorld(out);
  }

  function updateFrustum() {
    const camera = game.camera;
    camera.updateMatrixWorld();
    projectionScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projectionScreen);
  }

  function addMarker() {
    if (heli.marker || !game.markers) return;
    heli.marker = game.markers.add({ kind: 'police', entity: heli, label: 'Shaheen-1', flash: true, icon: 'helicopter', color: 0x2f6bff });
  }

  function removeMarker() {
    if (!heli.marker) return;
    if (game.markers) game.markers.remove(heli.marker);
    heli.marker = null;
  }

  function emitStatus(name, reason) {
    statusEvent.reason = reason;
    game.events.emit(name, statusEvent);
  }

  return heli;
}

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
