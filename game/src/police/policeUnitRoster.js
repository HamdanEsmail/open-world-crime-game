// The PSPD units in play in Port Sarab: putting a crewed Interceptor or Enforcer on the road or a
// pair of officers on the pavement, arming them and giving them their minimap blips, and taking a
// unit away again, leaving its dead and its wreck behind for a while. Shared by dispatch and patrols.

/** Seconds a fallen officer lies where he fell, at least, and at most. */
const BODY_MIN_SECONDS = 30;
const BODY_MAX_SECONDS = 120;
/** A wreck is cleared once the player is this far away (or after a long time a little closer). */
const WRECK_CLEAR_DISTANCE = 140;
/** Minimap sight cone shown for a unit (metres). */
const BLIP_VISION = 60;

let nextUnitId = 1;

/**
 * Build the roster of live police units.
 * @param {Object} game
 * @param {Object} sight  from createPoliceSight
 */
export function createPoliceUnitRoster(game, sight) {
  const roster = {
    /** Every live unit: response units, patrol cars and foot patrols. */
    units: [],
    /** Officers who died, lying where they fell: [{character, time}]. */
    bodies: [],
    /** Burnt-out police cars waiting to be cleared: [{vehicle, time}]. */
    wrecks: [],
    spawnCarUnit,
    spawnFootUnit,
    removeUnit,
    releaseVehicle,
    setBlip,
    update,
  };

  game.events.on('character:died', onCharacterDied);
  game.events.on('vehicle:carjacked', onCarjacked);

  /**
   * Put a crewed police car on the road.
   * @param {{specId:string, x:number, z:number, heading:number, crew?:number, tactical?:boolean, mode?:string}} options
   * @returns {Object|null} the unit
   */
  function spawnCarUnit(options) {
    const vehicles = game.vehicles;
    if (!vehicles || !vehicles.spawn) return null;
    const vehicle = vehicles.spawn(options.specId, { x: options.x, z: options.z, heading: options.heading, faction: 'police' });
    if (!vehicle) return null;
    const unit = makeUnit(options.mode || 'response', !!options.tactical);
    unit.eyes = sight.createEyes();
    unit.vehicle = vehicle;
    vehicle.faction = 'police';
    vehicle.tags.police = true;
    vehicle.ai = { police: true, unit };
    const crew = options.crew === undefined ? 2 : options.crew;
    for (let seat = 0; seat < crew; seat += 1) {
      const officer = spawnOfficer(options.x, options.z, options.heading, unit, seat);
      if (!officer) break;
      game.characters.enterVehicle?.(officer, vehicle, seat, { instant: true });
      officer.ai.state = 'seated';
      unit.officers.push(officer);
    }
    if (unit.officers.length > 0) vehicles.setDriver?.(vehicle, unit.officers[0]);
    vehicle.controls.siren = unit.mode === 'response';
    roster.units.push(unit);
    setBlip(unit, unit.mode === 'response');
    game.events.emit('police:unitSpawned', { unit });
    return unit;
  }

  /**
   * Put officers on foot at (x, z), a pace apart.
   * @param {{x:number, z:number, heading?:number, count?:number, mode?:string, home?:Object}} options
   */
  function spawnFootUnit(options) {
    if (!game.characters || !game.characters.spawn) return null;
    const unit = makeUnit(options.mode || 'footPatrol', false);
    unit.eyes = sight.createEyes();
    unit.home = options.home || null;
    const count = options.count || 2;
    const heading = options.heading || 0;
    for (let i = 0; i < count; i += 1) {
      const side = i === 0 ? 0.8 : -0.8;
      const officer = spawnOfficer(options.x + Math.cos(heading) * side, options.z - Math.sin(heading) * side, heading, unit, i);
      if (!officer) break;
      officer.ai.state = unit.mode === 'footPatrol' ? 'patrol' : 'advance';
      unit.officers.push(officer);
    }
    if (unit.officers.length === 0) return null;
    unit.state = unit.mode === 'footPatrol' ? 'patrolling' : 'onFoot';
    unit.role = unit.mode === 'footPatrol' ? 'footPatrol' : 'onFoot';
    roster.units.push(unit);
    setBlip(unit, unit.mode === 'response');
    game.events.emit('police:unitSpawned', { unit });
    return unit;
  }

  /** Take a unit out of the world: its living officers and its car go; a wreck stays a while. */
  function removeUnit(unit) {
    const index = roster.units.indexOf(unit);
    if (index !== -1) roster.units.splice(index, 1);
    if (unit.blip) {
      game.markers?.remove(unit.blip);
      unit.blip = null;
    }
    const characters = game.characters;
    for (let i = 0; i < unit.officers.length; i += 1) {
      const officer = unit.officers[i];
      clearIntent(officer);
      if (characters && characters.despawn) characters.despawn(officer);
    }
    unit.officers.length = 0;
    const vehicle = unit.vehicle;
    unit.vehicle = null;
    if (vehicle && !vehicle.despawned && !vehicle.isPlayer) {
      vehicle.controls.siren = false;
      if (vehicle.wrecked) {
        roster.wrecks.push({ vehicle, time: game.time.elapsed });
      } else {
        game.vehicles?.setDriver?.(vehicle, null);
        vehicle.ai = null;
        game.vehicles?.despawn?.(vehicle);
      }
    }
    unit.removed = true;
    game.events.emit('police:unitRemoved', { unit });
  }

  /**
   * The unit loses its car (stolen by the player, wrecked and abandoned): anyone still inside gets out,
   * and the blip moves to an officer.
   */
  function releaseVehicle(unit) {
    const vehicle = unit.vehicle;
    if (!vehicle) return;
    unit.vehicle = null;
    const characters = game.characters;
    for (let i = 0; i < unit.officers.length; i += 1) {
      const officer = unit.officers[i];
      if (officer.vehicle === vehicle && characters && characters.exitVehicle) characters.exitVehicle(officer, { instant: false });
      if (officer.ai.state === 'seated' || officer.ai.state === 'entering') officer.ai.state = 'exiting';
    }
    if (vehicle.ai && vehicle.ai.unit === unit) vehicle.ai = null;
    if (vehicle.wrecked && !vehicle.isPlayer) roster.wrecks.push({ vehicle, time: game.time.elapsed });
    unit.state = 'onFoot';
    unit.role = 'onFoot';
    setBlip(unit, unit.mode === 'response');
  }

  /** Point the unit's minimap blip at its car or its first officer; flashing while it answers a call. */
  function setBlip(unit, flash) {
    const markers = game.markers;
    if (!markers) return;
    const entity = unit.vehicle || (unit.officers.length > 0 ? unit.officers[0] : null);
    if (!entity) {
      if (unit.blip) markers.remove(unit.blip);
      unit.blip = null;
      return;
    }
    if (unit.blip && unit.blip.entity === entity) {
      unit.blip.flash = flash;
      unit.blip.edge = flash;
      return;
    }
    if (unit.blip) markers.remove(unit.blip);
    unit.blip = markers.add({ kind: 'police', entity, flash, edge: flash, label: 'PSPD unit', visionRange: BLIP_VISION, owner: 'police' });
  }

  /** Once a frame: notice stolen or vanished cars, clear old bodies and wrecks, drop empty units. */
  function update() {
    const now = game.time.elapsed;
    const player = game.player;
    const px = player && player.character ? player.pos.x : 0;
    const pz = player && player.character ? player.pos.z : 0;
    for (let i = roster.units.length - 1; i >= 0; i -= 1) {
      const unit = roster.units[i];
      const vehicle = unit.vehicle;
      if (vehicle && (vehicle.despawned || vehicle.isPlayer || (vehicle.driver && vehicle.driver.kind === 'player'))) releaseVehicle(unit);
      if (!unit.vehicle && unit.officers.length === 0) removeUnit(unit);
    }
    for (let i = roster.bodies.length - 1; i >= 0; i -= 1) {
      const body = roster.bodies[i];
      const age = now - body.time;
      const far = distanceSq(body.character.pos, px, pz) > 70 * 70;
      if (age > BODY_MAX_SECONDS || (age > BODY_MIN_SECONDS && far) || body.character.despawned) {
        if (!body.character.despawned) game.characters?.despawn?.(body.character);
        roster.bodies.splice(i, 1);
      }
    }
    for (let i = roster.wrecks.length - 1; i >= 0; i -= 1) {
      const wreck = roster.wrecks[i];
      const vehicle = wreck.vehicle;
      if (vehicle.despawned || vehicle.isPlayer) {
        roster.wrecks.splice(i, 1);
        continue;
      }
      const d2 = distanceSq(vehicle.pos, px, pz);
      if (d2 > WRECK_CLEAR_DISTANCE * WRECK_CLEAR_DISTANCE || (now - wreck.time > 150 && d2 > 70 * 70)) {
        game.vehicles?.despawn?.(vehicle);
        roster.wrecks.splice(i, 1);
      }
    }
  }

  /** One officer, armed and with police eyes; tactical officers carry rifles and body armour. */
  function spawnOfficer(x, z, heading, unit, seat) {
    const characters = game.characters;
    if (!characters || !characters.spawn) return null;
    const archetype = unit.tactical ? 'swat' : 'officer';
    const look = characters.randomLook ? characters.randomLook(archetype) : undefined;
    const officer = characters.spawn({
      kind: 'officer', faction: 'police', archetype, look, x, z, heading,
      name: unit.tactical ? 'PSPD Tactical' : 'PSPD Officer', health: unit.tactical ? 150 : 100,
    });
    if (!officer) return null;
    if (unit.tactical) officer.armor = 100;
    officer.ai = {
      police: true, unit, seat, state: 'seated', timer: 0,
      eyes: sight.createEyes(),
      goalX: x, goalZ: z, hasGoal: false, repositionTimer: 0,
      burstTimer: Math.random(), firing: false, fireTimer: Math.random(),
      lastX: x, lastZ: z, stuckTimer: 0, shoutTimer: 0,
      postX: x, postZ: z, beatX: 1, beatZ: 0, beat: 0, beatTimer: Math.random() * 6,
    };
    armOfficer(officer, unit.tactical);
    return officer;
  }

  /** A pistol for a patrol officer, a rifle for the tactical team, through the weapon system if it is there. */
  function armOfficer(officer, tactical) {
    const weapons = game.weapons;
    if (!weapons || !weapons.give) return;
    const weaponId = weaponIdFor(tactical ? 'rifle' : 'pistol');
    weapons.give(officer, weaponId, 999);
    const list = officer.weapons;
    if (!list) return;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id === weaponId) {
        officer.weaponIndex = i;
        break;
      }
    }
  }

  /** The catalogue id of the first weapon of a model ('pistol', 'rifle'), or the model name itself. */
  function weaponIdFor(model) {
    const list = game.catalog && game.catalog.weapons;
    if (list) {
      for (let i = 0; i < list.length; i += 1) if (list[i].id === model) return model;
      for (let i = 0; i < list.length; i += 1) if (list[i].model === model) return list[i].id;
    }
    return model;
  }

  /** An officer fell: he leaves his unit and lies where he fell. */
  function onCharacterDied(event) {
    const officer = event && event.character;
    if (!officer || !officer.ai || !officer.ai.police) return;
    const unit = officer.ai.unit;
    officer.ai.state = 'dead';
    clearIntent(officer);
    if (unit) {
      const index = unit.officers.indexOf(officer);
      if (index !== -1) unit.officers.splice(index, 1);
      if (!unit.removed) setBlip(unit, unit.mode === 'response');
    }
    roster.bodies.push({ character: officer, time: game.time.elapsed });
    game.events.emit('police:officerDown', { officer, unit, source: event.source || null });
  }

  /** The player pulled an officer out of his car: the officer is on foot now and the car is gone. */
  function onCarjacked(event) {
    const victim = event && event.victim;
    if (!victim || !victim.ai || !victim.ai.police) return;
    victim.ai.state = 'exiting';
    victim.ai.timer = 0;
  }

  return roster;
}

/** A unit's record: its car, its officers, its job in the chase and its own memory for the road. */
function makeUnit(mode, tactical) {
  return {
    id: nextUnitId++,
    vehicle: null,
    officers: [],
    /** 'patrol' | 'footPatrol' | 'lead' | 'flankLeft' | 'flankRight' | 'cutoff' | 'trail' | 'box*' | 'converge' | 'search' | 'onFoot' */
    role: mode === 'patrol' ? 'patrol' : 'respond',
    /** 'patrolling' | 'responding' | 'chasing' | 'searching' | 'deployed' | 'recovering' | 'leaving' | 'holding' | 'onFoot' */
    state: mode === 'patrol' ? 'patrolling' : 'responding',
    /** 'patrol' | 'footPatrol' | 'response' | 'leaving' */
    mode,
    tactical,
    blip: null,
    eyes: null,
    sees: false,
    distance: Infinity,
    lastSeen: -1e9,
    stuckTime: 0,
    flipped: false,
    visibleToPlayer: true,
    visibleTimer: Math.random(),
    modeTime: 0,
    home: null,
    removed: false,
    drive: createDriveMemory(),
  };
}

/** What a police driver remembers between frames: the route, sight of the target, manoeuvres in hand. */
function createDriveMemory() {
  return {
    routeX: new Float32Array(64), routeZ: new Float32Array(64), routeCum: new Float32Array(64),
    routeCount: 0, routeIndex: 0, routeTargetX: 0, routeTargetZ: 0, routeAge: 0,
    losTimer: 0, direct: false, directToPlayer: false, crumb: -1,
    feelerTimer: Math.random() * 0.1, feelerSteer: 0,
    obstacleTimer: Math.random() * 0.15, obstacleBrake: 0, dodge: 0, dodgeUntil: 0,
    progressX: 0, progressZ: 0, progressTimer: 0, wantsMove: true,
    recoverUntil: 0, recoverSteer: 1, resumeState: 'responding',
    pitUntil: 0, pitCooldown: 0, pitSteer: 0, swipeUntil: 0, swipeCooldown: 0, swipeSteer: 0, ramCooldown: 0,
    lane: null, nextLane: null, waypoint: false, waypointX: 0, waypointZ: 0, waypointAge: 0,
    stopTimer: 0,
  };
}

function clearIntent(character) {
  const intent = character && character.intent;
  if (!intent) return;
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.aim = false;
  intent.fire = false;
  intent.faceYaw = null;
  intent.gesture = null;
}

function distanceSq(pos, x, z) {
  const dx = pos.x - x;
  const dz = pos.z - z;
  return dx * dx + dz * dz;
}
