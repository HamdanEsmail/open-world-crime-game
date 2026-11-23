// The player: Zayd "Dust" Karam. Turns keyboard and mouse into walking, sprinting, aiming and
// shooting on foot, and into throttle, brake, steering and handbrake behind the wheel; steals and
// leaves vehicles; and handles being knocked out or arrested. Becomes game.player.
import * as THREE from 'three';
import { findVehicleToEnter, enterOrStealVehicle, leaveVehicle } from './vehicleEntry.js';

/** Build the player controller. Call spawn() once the world and the character system exist. */
export function createPlayerController(game) {
  const { clamp } = game.math;
  const player = {
    /** @type {import('../core/gameContext.js').Character|null} */
    character: null,
    /** @type {import('../core/gameContext.js').Vehicle|null} */
    vehicle: null,
    /** 'onFoot' | 'driving' | 'down' (knocked out or arrested, waiting to respawn) */
    state: 'onFoot',
    /** Where the player is: the vehicle when driving, the character otherwise. */
    get pos() {
      return player.vehicle ? player.vehicle.pos : player.character ? player.character.pos : ORIGIN;
    },
    get heading() {
      return player.vehicle ? player.vehicle.heading : player.character ? player.character.heading : 0;
    },
    /** Metres per second over the ground. */
    get speed() {
      if (player.vehicle) return Math.abs(player.vehicle.speed);
      return player.character ? Math.hypot(player.character.vel.x, player.character.vel.z) : 0;
    },
    get isDriving() {
      return player.vehicle !== null;
    },
    spawn,
    teleport,
    putInVehicle,
    knockOut,
    arrest,
    update,
  };
  let downTimer = 0;
  let downCause = '';
  let sirenLatch = false;

  /** Create the player's character at a place. */
  function spawn(x, z, heading = 0) {
    const look = game.characters.randomLook('player');
    player.character = game.characters.spawn({ kind: 'player', faction: 'player', archetype: 'player', name: 'Zayd', x, z, heading, look, health: game.config.player.maxHealth });
    player.character.maxHealth = game.config.player.maxHealth;
    player.vehicle = null;
    player.state = 'onFoot';
    if (game.cameraRig) {
      game.cameraRig.setYaw(heading);
      game.cameraRig.snap();
    }
    return player.character;
  }

  /** Move the player (out of any vehicle) to a point. */
  function teleport(x, z, heading = 0) {
    if (player.vehicle) leaveVehicle(game, player, { instant: true });
    const character = player.character;
    character.pos.set(x, game.terrain ? game.terrain.heightAt(x, z) : 0, z);
    character.vel.set(0, 0, 0);
    character.heading = heading;
    if (game.cameraRig) {
      game.cameraRig.setYaw(heading);
      game.cameraRig.snap();
    }
  }

  /** Seat the player at the wheel at once (missions, loading a save). */
  function putInVehicle(vehicle) {
    if (player.vehicle) leaveVehicle(game, player, { instant: true });
    enterOrStealVehicle(game, player, vehicle, { instant: true, quiet: true });
  }

  /** Read the controls and drive the character or the vehicle. */
  function update(dt) {
    const character = player.character;
    if (!character) return;
    if (player.state === 'down') {
      updateDown(dt);
      return;
    }
    if (!character.alive) {
      knockOut();
      return;
    }
    if (game.mode !== 'playing') {
      idleControls();
      return;
    }
    if (player.vehicle) updateDriving(dt);
    else updateOnFoot(dt);
    regenerate(dt);
  }

  /** Walking, sprinting, jumping, aiming, shooting, and looking for a car to take. */
  function updateOnFoot() {
    const input = game.input;
    const character = player.character;
    const intent = character.intent;
    const yaw = game.cameraRig ? game.cameraRig.yaw : character.heading;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    // Screen-right is the camera's right: (-cos yaw, sin yaw).
    let moveX = forwardX * input.moveZ - forwardZ * input.moveX;
    let moveZ = forwardZ * input.moveZ + forwardX * input.moveX;
    const length = Math.hypot(moveX, moveZ);
    if (length > 1) {
      moveX /= length;
      moveZ /= length;
    }
    intent.moveX = moveX;
    intent.moveZ = moveZ;
    intent.pace = input.held('sprint') ? 'sprint' : 'run';
    intent.jump = input.pressed('jump');
    intent.crouch = input.held('crouch');
    const armed = character.weaponIndex >= 0;
    const firing = input.held('fire');
    intent.aim = input.held('aim') || (armed && firing);
    intent.aimYaw = yaw;
    intent.aimPitch = game.cameraRig ? -game.cameraRig.pitch * 0.75 + 0.12 : 0;
    intent.fire = firing;
    intent.faceYaw = null;
    switchWeapons(input, character);

    if (character.state === 'ragdoll' || character.state === 'getUp') return;
    const near = findVehicleToEnter(game, character);
    if (near) {
      const stealing = near.driver && near.driver !== character;
      const verb = near.wrecked ? null : stealing ? 'Steal' : near.tags.owned ? 'Drive' : near.parked || !near.driver ? 'Take' : 'Enter';
      if (verb) {
        game.prompts?.offer(10, 'F', `${verb} the ${near.spec.name}`);
        if (input.pressed('enterVehicle')) enterOrStealVehicle(game, player, near, {});
      }
    }
  }

  /** Throttle, brake and reverse, steering, handbrake, horn or siren, lights, radio, bailing out. */
  function updateDriving() {
    const input = game.input;
    const vehicle = player.vehicle;
    const controls = vehicle.controls;
    const speed = vehicle.speed;
    controls.steer = input.moveX;
    controls.handbrake = input.held('handbrake');
    controls.throttle = 0;
    controls.brake = 0;
    if (input.moveZ > 0) {
      if (speed < -1.2) controls.brake = 1;
      else {
        controls.reverse = false;
        controls.throttle = 1;
      }
    } else if (input.moveZ < 0) {
      if (speed > 1.2) controls.brake = 1;
      else {
        controls.reverse = true;
        controls.throttle = 1;
      }
    } else if (Math.abs(speed) < 0.6) {
      controls.reverse = false;
    }
    const police = vehicle.spec.className === 'police' || vehicle.spec.className === 'policeSuv';
    if (police) {
      if (input.pressed('horn')) sirenLatch = !sirenLatch;
      controls.siren = sirenLatch;
      controls.horn = false;
    } else {
      controls.horn = input.held('horn');
      controls.siren = false;
    }
    if (input.pressed('headlights')) controls.headlights = !controls.headlights;
    if (input.pressed('nextRadio')) game.audio?.radio?.next?.();
    if (game.cameraRig) game.cameraRig.lookBehind = input.held('lookBehind');

    // Shooting from the driver's seat with a one-handed weapon.
    const character = player.character;
    const intent = character.intent;
    intent.aimYaw = game.cameraRig ? game.cameraRig.yaw : vehicle.heading;
    intent.aimPitch = 0;
    intent.fire = input.held('fire') && character.weaponIndex >= 0;
    intent.aim = intent.fire;
    switchWeapons(input, character);

    if (vehicle.wrecked && vehicle.onFire) game.prompts?.offer(40, 'F', 'Get out, it is going to blow');
    if (input.pressed('enterVehicle')) {
      sirenLatch = false;
      leaveVehicle(game, player, { thrown: Math.abs(speed) > 9 });
    }
  }

  /** Mouse wheel and the next / previous keys cycle through fists and the carried weapons. */
  function switchWeapons(input, character) {
    let step = 0;
    if (input.pressed('nextWeapon') || input.wheel > 0) step = 1;
    else if (input.pressed('previousWeapon') || input.wheel < 0) step = -1;
    if (step === 0 || character.weapons.length === 0) return;
    const slots = character.weapons.length + 1;
    character.weaponIndex = ((character.weaponIndex + 1 + step + slots) % slots) - 1;
    game.events.emit('player:weaponChanged', { character, weaponIndex: character.weaponIndex });
  }

  /** Stand still (or coast) while a menu or a cutscene has the controls. */
  function idleControls() {
    const intent = player.character.intent;
    intent.moveX = 0;
    intent.moveZ = 0;
    intent.fire = false;
    intent.aim = false;
    intent.jump = false;
    if (player.vehicle && game.mode !== 'cutscene') {
      const controls = player.vehicle.controls;
      controls.throttle = 0;
      controls.steer = 0;
      controls.brake = 0.4;
    }
  }

  /** Health creeps back to half when the player has not been hurt for a while. */
  function regenerate(dt) {
    const character = player.character;
    const calm = game.time.elapsed - (character.lastDamageTime || -100) > 8;
    if (calm && character.health < character.maxHealth * 0.5) {
      character.health = Math.min(character.maxHealth * 0.5, character.health + dt * 3);
    }
  }

  /** The player has run out of health: wake up outside Sarab General, lighter of some cash. */
  function knockOut() {
    if (player.state === 'down') return;
    player.state = 'down';
    downCause = 'died';
    downTimer = 4.6;
    game.mode = 'dead';
    game.events.emit('player:died', {});
  }

  /** The police have the player: weapons gone, a fine paid, released outside the nearest station. */
  function arrest() {
    if (player.state === 'down') return;
    player.state = 'down';
    downCause = 'arrested';
    downTimer = 4.6;
    game.mode = 'dead';
    if (player.vehicle) {
      player.vehicle.controls.throttle = 0;
      player.vehicle.controls.brake = 1;
    }
    player.character.intent.gesture = 'handsUp';
    game.events.emit('player:arrested', {});
  }

  function updateDown(dt) {
    idleControls();
    downTimer -= dt;
    if (downTimer > 0) return;
    const kind = downCause === 'arrested' ? 'policeStation' : 'hospital';
    const here = player.pos;
    let best = null;
    let bestDistance = Infinity;
    for (const place of game.city.placesOfKind(kind)) {
      const d = Math.hypot(place.x - here.x, place.z - here.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = place;
      }
    }
    if (player.vehicle) leaveVehicle(game, player, { instant: true, quiet: true });
    const character = player.character;
    if (!character.alive) game.characters.revive?.(character);
    character.alive = true;
    character.health = character.maxHealth;
    character.state = 'idle';
    character.intent.gesture = null;
    const economy = game.economy;
    if (downCause === 'arrested') {
      character.weapons.length = 0;
      character.weaponIndex = -1;
      if (economy) economy.spend(Math.min(economy.money, Math.round(economy.money * 0.12 + 150)), 'PSPD fine', true);
    } else if (economy) {
      economy.spend(Math.min(economy.money, Math.round(economy.money * 0.08 + 100)), 'Hospital bill', true);
    }
    teleport(best.x, best.z, best.heading + Math.PI);
    game.wanted?.clear?.();
    player.state = 'onFoot';
    game.mode = 'playing';
    game.time.hour = (game.time.hour + 3) % 24;
    game.events.emit('player:respawned', { cause: downCause, place: best });
  }

  return player;
}

const ORIGIN = new THREE.Vector3();
