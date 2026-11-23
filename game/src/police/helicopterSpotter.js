// The observer's seat in Shaheen-1: the eyes that decide whether the suspect is in plain sight from
// the cabin (what keeps a pursuit alive), and the searchlight operator who tracks him with a sprung
// lamp (a little lag, a little overshoot), sweeps the last known position during a search, and
// lights wherever the beam really lands: the road, a roof, or the wall of a tower in the way.
import * as THREE from 'three';
import { buildSearchlightBeam } from './helicopterSearchlight.js';
import { searchlightLeadsTarget } from './policeHeavyResponseRules.js';

const AIM_STIFFNESS = 15;
const AIM_DAMPING = 5.2;
const MAX_AIM_LAG = 22;
const SIGHT_RANGE_DAY = 280;
const SIGHT_RANGE_NIGHT = 190;

/**
 * Create the spotter for a helicopter and its model. `suspect` = {pos, vel, ok} is kept current by the owner.
 * Writes heli.seesPlayer, heli.lostSightTime and heli.searchlight {on, level, aim, end}.
 * @returns {{update: Function, setSees: Function, reset: Function, setVisible: Function, holdAimAt: Function,
 *   followSuspect: Function, setLight: Function}}
 */
export function createHelicopterSpotter(game, heli, model, suspect) {
  const { lerp, approach } = game.math;
  const light = buildSearchlightBeam();
  light.setVisible(false);
  game.scene.add(light.group);
  const aimVel = new THREE.Vector3();
  const aimTarget = new THREE.Vector3();
  const aimTargetVel = new THREE.Vector3();
  const lens = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const beamNormal = new THREE.Vector3(0, 1, 0);
  const eye = new THREE.Vector3();
  const sightTarget = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  const strength = { beam: 0, pool: 0, halo: 0, glare: 0 };
  const sightEvent = { helicopter: heli, seen: false };
  let clock = 0;
  let eyeTimer = 0;
  let lightLevel = 0;
  let holdAim = false;
  heli.lostSightTime = 0;

  /** Look, aim and shine for one frame (after the model has been placed). */
  function update(dt) {
    clock += dt;
    watchSuspect(dt);
    aimLamp(dt);
    shine(dt);
  }

  /** Four times a second: is the suspect in plain sight from the cabin? */
  function watchSuspect(dt) {
    heli.lostSightTime = heli.seesPlayer ? 0 : heli.lostSightTime + dt;
    eyeTimer -= dt;
    if (eyeTimer > 0) return;
    eyeTimer = 0.25;
    let sees = false;
    const onDuty = heli.state === 'onStation' || (heli.state === 'inbound' && heli.distanceToPlayer < 280);
    if (onDuty && suspect.ok && game.colliders) {
      eye.set(heli.position.x, heli.position.y + 0.5, heli.position.z);
      sightTarget.set(suspect.pos.x, suspect.pos.y + 1.1, suspect.pos.z);
      const distance = eye.distanceTo(sightTarget);
      const range = lerp(SIGHT_RANGE_DAY, SIGHT_RANGE_NIGHT, nightAmount());
      const end = heli.searchlight.end;
      const lit = lightLevel > 0.5 && Math.hypot(end.x - suspect.pos.x, end.z - suspect.pos.z) < 12;
      if (distance < range || (lit && distance < 420)) sees = game.colliders.lineOfSight(eye, sightTarget);
    }
    setSees(sees);
  }

  /** Change what the crew sees; on station that is news ('helicopter:sighted'). */
  function setSees(sees) {
    if (sees === heli.seesPlayer) return;
    heli.seesPlayer = sees;
    if (heli.state !== 'onStation') return;
    sightEvent.seen = sees;
    game.events.emit('helicopter:sighted', sightEvent);
  }

  /** Track the suspect with a sprung lamp; sweep round the last known position while searching. */
  function aimLamp(dt) {
    const aim = heli.searchlight.aim;
    if (holdAim) {
      aim.y = groundAt(aim.x, aim.z);
      return;
    }
    const wanted = game.wanted;
    const searching = wanted && wanted.state === 'search' && wanted.lastKnown && !heli.seesPlayer;
    if (searching) {
      const last = wanted.lastKnown;
      aimTarget.set(last.x + 24 * Math.sin(clock * 0.55), 0, last.z + 18 * Math.sin(clock * 0.83 + 1));
      aimTargetVel.set(13 * Math.cos(clock * 0.55), 0, 15 * Math.cos(clock * 0.83 + 1));
    } else if (suspect.ok) {
      aimTarget.set(searchlightLeadsTarget(suspect.pos.x, suspect.vel.x), 0, searchlightLeadsTarget(suspect.pos.z, suspect.vel.z));
      aimTargetVel.copy(suspect.vel);
    }
    aimVel.x += ((aimTarget.x - aim.x) * AIM_STIFFNESS + (aimTargetVel.x - aimVel.x) * AIM_DAMPING) * dt;
    aimVel.z += ((aimTarget.z - aim.z) * AIM_STIFFNESS + (aimTargetVel.z - aimVel.z) * AIM_DAMPING) * dt;
    aim.x += aimVel.x * dt;
    aim.z += aimVel.z * dt;
    const lagX = aimTarget.x - aim.x;
    const lagZ = aimTarget.z - aim.z;
    const lag = Math.hypot(lagX, lagZ);
    if (lag > MAX_AIM_LAG) {
      aim.x = aimTarget.x - (lagX / lag) * MAX_AIM_LAG;
      aim.z = aimTarget.z - (lagZ / lag) * MAX_AIM_LAG;
    }
    aim.y = groundAt(aim.x, aim.z);
  }

  /** Point the lamp, find where the light lands (road, roof or wall) and draw the beam and pool. */
  function shine(dt) {
    const working = heli.state === 'onStation' || (heli.state === 'inbound' && heli.distanceToPlayer < 320);
    lightLevel = approach(lightLevel, working && heli.rotorSpeed > 0.5 ? 1 : 0, dt * 1.5);
    const searchlight = heli.searchlight;
    searchlight.on = lightLevel > 0.01;
    searchlight.level = lightLevel;
    const aim = searchlight.aim;
    if (lightLevel > 0.001) {
      lookPoint.copy(aim);
    } else {
      lookPoint.set(heli.position.x + Math.sin(heli.heading) * 12, heli.position.y - 6, heli.position.z + Math.cos(heli.heading) * 12);
    }
    model.searchlight.lookAt(lookPoint);
    model.searchlight.updateMatrixWorld(true);
    if (lightLevel <= 0.001) {
      light.setVisible(false);
      return;
    }
    light.setVisible(true);
    model.lensWorldPosition(lens);
    beamDir.subVectors(aim, lens);
    const distance = beamDir.length();
    beamDir.multiplyScalar(1 / Math.max(0.001, distance));
    const end = searchlight.end;
    const hit = game.colliders ? game.colliders.raycast(lens, beamDir, Math.max(0.5, distance - 0.3)) : null;
    if (hit) {
      end.copy(hit.point);
      if (hit.collider) beamNormal.copy(hit.normal);
      else groundNormal(end.x, end.z);
    } else {
      end.copy(aim);
      groundNormal(end.x, end.z);
    }
    const night = nightAmount();
    const storm = game.weather && typeof game.weather.sandstorm === 'number' ? game.weather.sandstorm : 0;
    strength.beam = lightLevel * lerp(0.075, 0.5, night) * (1 + storm);
    strength.pool = lightLevel * lerp(0.3, 1.6, night) * (1 - 0.4 * storm);
    strength.halo = lightLevel * lerp(0.04, 0.6, night);
    strength.glare = lightLevel * lerp(0.55, 1.0, night);
    light.aim(lens, end, beamNormal, strength, game.camera.position);
    light.update(clock);
  }

  /** Put the lamp on the suspect at once (an instant arrival, a staged scene). */
  function reset(on) {
    heli.searchlight.aim.set(suspect.pos.x, suspect.pos.y, suspect.pos.z);
    aimVel.set(0, 0, 0);
    lightLevel = on ? 1 : 0;
    holdAim = false;
    heli.lostSightTime = 0;
  }

  /** Hold the beam on a fixed ground point (a staged scene). */
  function holdAimAt(x, z) {
    heli.searchlight.aim.set(x, groundAt(x, z), z);
    aimVel.set(0, 0, 0);
    holdAim = true;
  }

  /** Go back to tracking the suspect. */
  function followSuspect() {
    holdAim = false;
  }

  function setVisible(visible) {
    light.setVisible(visible);
    if (!visible) lightLevel = 0;
  }

  function setLight(level) {
    lightLevel = level;
  }

  function groundNormal(x, z) {
    if (game.terrain && game.terrain.normalAt) game.terrain.normalAt(x, z, beamNormal);
    else beamNormal.set(0, 1, 0);
  }

  function groundAt(x, z) {
    return game.terrain ? game.terrain.heightAt(x, z) : 0;
  }

  function nightAmount() {
    const night = game.sky && typeof game.sky.night === 'number' ? game.sky.night : 0;
    return night < 0 ? 0 : night > 1 ? 1 : night;
  }

  return { update, setSees, reset, holdAimAt, followSuspect, setVisible, setLight };
}
