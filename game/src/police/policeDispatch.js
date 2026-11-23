// PSPD dispatch for Port Sarab: decides how many units answer each wanted level and of what kind,
// where they come from (out of the player's sight, ahead of him, from different sides), gives each
// car its job in the chase, gets officers out of their cars and back in, and calls everyone off when
// the suspect is lost, caught or down. Becomes game.police.
import { createPoliceSight, EYE_HEIGHT_CAR, EYE_HEIGHT_FOOT } from './policeSight.js';
import { createPoliceUnitRoster } from './policeUnitRoster.js';
import { createPursuitDriver } from './pursuitDriverAI.js';
import { createOfficerAI } from './officerAI.js';
import { createArrestProcedure } from './arrestProcedure.js';
import { createAmbientPatrols } from './ambientPatrols.js';

/**
 * The response to each wanted level: how many cars, how many of them Enforcer SUVs, seconds between
 * arrivals, and how far away (metres) new units appear.
 */
const RESPONSE = [
  null,
  { cars: 1, enforcers: 0, interval: 3.0, near: [110, 180] },
  { cars: 3, enforcers: 0, interval: 2.6, near: [120, 220] },
  { cars: 4, enforcers: 2, interval: 2.2, near: [120, 230] },
  { cars: 6, enforcers: 3, interval: 1.6, near: [120, 240] },
  { cars: 7, enforcers: 5, interval: 1.2, near: [120, 240] },
];
/** Police cars alive at once, all kinds together. */
const MAX_POLICE_CARS = 10;
/** Seconds between reshuffles of the chase formation. */
const ROLE_INTERVAL = 0.4;
/** Seconds the player counts as violent after shooting or hurting someone. */
const VIOLENT_SECONDS = 9;

/**
 * Build game.police.
 * @param {Object} game
 */
export function createPoliceDispatch(game) {
  const sight = createPoliceSight(game);
  const roster = createPoliceUnitRoster(game, sight);
  const driver = createPursuitDriver(game);
  const officers = createOfficerAI(game, sight);
  const arrests = createArrestProcedure(game);
  const patrols = createAmbientPatrols(game, roster, driver, officers, sight);
  const rng = game.rng.fork('police-dispatch');
  const ctx = createChaseContext(roster.units);
  const ranked = [];
  const unitAt = { x: 0, y: 0, z: 0 };
  let spawnTimer = 0;
  let roleTimer = 0;
  let suspendTimer = 0;
  let violentUntil = -1e9;
  let stoppedFor = 0;
  let loudspeakerTimer = 6;
  let wantedSince = -1;
  let peakWindow = 0;

  const police = {
    /** Every live unit: [{vehicle, officers, role, state, mode, ...}]. */
    get units() {
      return roster.units;
    },
    /** The helicopter, when that system is running. */
    get helicopter() {
      return game.policeHelicopter || null;
    },
    /** Some unit sees the player right now. */
    seesPlayer: false,
    /** True while suspend() holds every response (cutscenes). */
    suspended: false,
    arrests,
    patrols,
    roster,
    sight,
    /** Cost and counts for the dev readout: thinkMs (smoothed), peakMs, firstSightDelay (s). */
    stats: { thinkMs: 0, peakMs: 0, lastMs: 0, spawned: 0, firstSightDelay: null, responseCars: 0 },
    suspend,
    update,
  };

  game.events.on('wanted:changed', onWantedChanged);
  game.events.on('shot:fired', (event) => {
    if (event && isPlayer(event.shooter)) violentUntil = game.time.elapsed + VIOLENT_SECONDS;
  });
  game.events.on('character:damaged', (event) => {
    if (event && isPlayer(event.source) && event.character && !isPlayer(event.character)) violentUntil = game.time.elapsed + VIOLENT_SECONDS;
  });
  game.events.on('police:officerDown', () => officers.shout('officerDown', null));
  game.events.on('police:unitSpawned', () => {
    police.stats.spawned += 1;
  });

  /** Hold every response (no driving, shooting, spawning or arrests) for `seconds`. */
  function suspend(seconds) {
    suspendTimer = Math.max(suspendTimer, seconds || 0);
  }

  /** Once a frame, before the vehicles and the people move. */
  function update(dt) {
    const started = performance.now();
    fillContext(dt);
    roster.update(dt);
    if (suspendTimer > 0) suspendTimer = Math.max(0, suspendTimer - dt);
    police.suspended = suspendTimer > 0 || game.mode === 'cutscene';
    ctx.suspended = police.suspended;
    if (police.suspended || !ctx.hasPlayer) {
      holdEveryone();
      arrests.reset();
      finishStats(started, dt);
      return;
    }
    driver.beginFrame(ctx, dt);
    updateEyes(dt);
    patrols.update(dt, ctx);
    if (ctx.level > 0 && !ctx.playerDown) {
      adoptPatrols();
      sendUnits(dt);
      assignRoles(dt);
    }
    const units = roster.units;
    for (let i = units.length - 1; i >= 0; i -= 1) {
      if (i < units.length) thinkUnit(units[i], dt);
    }
    arrests.update(dt, ctx);
    useLoudspeaker(dt);
    finishStats(started, dt);
  }

  /** What every unit needs to know about the suspect this frame (one shared object, no allocation). */
  function fillContext(dt) {
    const player = game.player;
    const character = player && player.character;
    const wanted = game.wanted;
    ctx.now = game.time.elapsed;
    ctx.level = wanted ? wanted.level : 0;
    ctx.pursuit = !!(wanted && wanted.state === 'pursuit');
    ctx.hasPlayer = !!character;
    ctx.cuffers = 0;
    if (!character) return;
    const vehicle = player.vehicle;
    ctx.playerCharacter = character;
    ctx.playerVehicle = vehicle;
    ctx.onFoot = !vehicle;
    ctx.playerDown = player.state === 'down' || character.alive === false || game.mode === 'dead';
    const p = player.pos;
    ctx.px = p.x;
    ctx.py = p.y;
    ctx.pz = p.z;
    const vel = vehicle ? vehicle.vel : character.vel;
    ctx.pvx = vel.x;
    ctx.pvz = vel.z;
    ctx.pspeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    ctx.pHalfLength = vehicle ? (vehicle.dynamics ? vehicle.dynamics.profile.halfLength : vehicle.spec.length / 2) : 0.4;
    if (ctx.pspeed > 2) {
      ctx.fx = vel.x / ctx.pspeed;
      ctx.fz = vel.z / ctx.pspeed;
    } else {
      const heading = vehicle ? vehicle.heading : character.heading;
      ctx.fx = Math.sin(heading);
      ctx.fz = Math.cos(heading);
    }
    ctx.rx = -ctx.fz;
    ctx.rz = ctx.fx;
    const lastKnown = wanted ? wanted.lastKnown : null;
    ctx.targetX = ctx.pursuit || !lastKnown ? ctx.px : lastKnown.x;
    ctx.targetZ = ctx.pursuit || !lastKnown ? ctx.pz : lastKnown.z;
    const area = wanted && wanted.searchArea;
    ctx.searchX = area ? area.x : ctx.targetX;
    ctx.searchZ = area ? area.z : ctx.targetZ;
    ctx.searchRadius = area ? area.radius : 60;
    ctx.night = game.sky && typeof game.sky.night === 'number' ? game.sky.night : nightFromHour(game.time.hour);
    ctx.ram = ctx.level >= 3;
    const weapon = game.weapons && game.weapons.current ? game.weapons.current(character) : null;
    ctx.armed = weapon ? !weapon.melee : !game.weapons && character.weaponIndex >= 0;
    ctx.aiming = !!(character.intent && character.intent.aim);
    ctx.fighting = !!(character.intent && character.intent.fire) || character.state === 'melee';
    ctx.violent = ctx.now < violentUntil;
    ctx.threatening = ctx.violent || (ctx.armed && ctx.aiming);
    stoppedFor = ctx.onFoot || ctx.pspeed < 2.5 ? stoppedFor + dt : 0;
    ctx.stoppedFor = stoppedFor;
    const calm = ctx.level === 1 ? !ctx.violent && !(ctx.armed && ctx.aiming) : !ctx.violent && !ctx.armed;
    ctx.arrestable = ctx.level >= 1 && ctx.level <= 2 && calm && !ctx.playerDown && (ctx.onFoot || ctx.pspeed < 2.5);
  }

  /**
   * Every car's crew and every officer on foot looks for the player (staggered line-of-sight tests);
   * a unit sees him if any of its people do.
   */
  function updateEyes(dt) {
    let anySees = false;
    const units = roster.units;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      const watching = ctx.level > 0 || unit.mode === 'response';
      let sees = false;
      const vehicle = unit.vehicle;
      if (vehicle && !vehicle.wrecked && crewInside(unit)) {
        if (watching) sees = sight.lookForPlayer(unit.eyes, vehicle.pos.x, vehicle.pos.y + EYE_HEIGHT_CAR, vehicle.pos.z, dt);
        else unit.eyes.sees = false;
      }
      const crew = unit.officers;
      for (let k = 0; k < crew.length; k += 1) {
        const officer = crew[k];
        if (officer.vehicle || officer.alive === false) {
          officer.ai.eyes.sees = false;
          continue;
        }
        if (watching && sight.lookForPlayer(officer.ai.eyes, officer.pos.x, officer.pos.y + EYE_HEIGHT_FOOT, officer.pos.z, dt)) sees = true;
        else if (!watching) officer.ai.eyes.distance = Math.hypot(officer.pos.x - ctx.px, officer.pos.z - ctx.pz);
      }
      const at = positionOf(unit);
      unit.distance = at ? Math.hypot(at.x - ctx.px, at.z - ctx.pz) : Infinity;
      unit.sees = sees && !ctx.playerDown;
      if (unit.sees) {
        unit.lastSeen = ctx.now;
        anySees = true;
      }
    }
    police.seesPlayer = anySees;
    if (anySees && wantedSince >= 0 && police.stats.firstSightDelay === null) police.stats.firstSightDelay = ctx.now - wantedSince;
  }

  /** Patrols near the trouble (or who see the player) answer the call first. */
  function adoptPatrols() {
    const plan = RESPONSE[ctx.level];
    let cars = responseCars();
    const room = plan.cars + (ctx.level >= 2 ? 1 : 0);
    const units = roster.units;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (unit.mode === 'patrol' && unit.vehicle && cars < room && (unit.sees || unit.distance < 320)) {
        toResponse(unit);
        cars += 1;
      } else if (unit.mode === 'footPatrol' && (unit.sees || unit.distance < 140)) {
        toResponse(unit);
      }
    }
  }

  function toResponse(unit) {
    unit.mode = 'response';
    unit.modeTime = 0;
    if (unit.vehicle) {
      unit.state = 'responding';
      unit.role = 'respond';
      driver.roads.dropRoute(unit.drive);
    } else {
      unit.state = 'onFoot';
      unit.role = 'onFoot';
      for (let k = 0; k < unit.officers.length; k += 1) officers.startFighting(unit.officers[k]);
    }
    roster.setBlip(unit, true);
    game.events.emit('police:unitResponding', { unit });
  }

  /** Keep the number of cars up to the level's plan, one at a time, from good places. */
  function sendUnits(dt) {
    const plan = RESPONSE[ctx.level];
    spawnTimer -= dt;
    let cars = 0;
    let enforcers = 0;
    let allCars = 0;
    const units = roster.units;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (!unit.vehicle || unit.vehicle.wrecked) continue;
      allCars += 1;
      if (unit.mode !== 'response') continue;
      cars += 1;
      if (unit.vehicle.spec.id === 'pspd_enforcer') enforcers += 1;
    }
    police.stats.responseCars = cars;
    const wantCars = ctx.level === 1 && !ctx.onFoot ? 2 : plan.cars;
    if (cars >= wantCars || spawnTimer > 0 || allCars >= MAX_POLICE_CARS) return;
    const useEnforcer = enforcers * wantCars < plan.enforcers * (cars + 1);
    const spot = findSpawnSpot(plan.near);
    if (!spot) {
      spawnTimer = 0.5;
      return;
    }
    const tactical = ctx.level >= 5 && useEnforcer;
    const unit = roster.spawnCarUnit({
      specId: useEnforcer ? 'pspd_enforcer' : 'pspd_interceptor',
      x: spot.x, z: spot.z, heading: spot.heading, crew: 2, tactical, mode: 'response',
    });
    if (unit) {
      unit.state = 'responding';
      unit.drive.progressX = spot.x;
      unit.drive.progressZ = spot.z;
      unit.lastSeen = ctx.now;
    }
    spawnTimer = plan.interval;
  }

  /**
   * A lane point 'near' metres from the player that he cannot see, preferring roads ahead of him and
   * bearings away from the units already coming, facing toward him.
   */
  const spawnSpot = { x: 0, z: 0, heading: 0 };
  function findSpawnSpot(near) {
    const roads = game.roads;
    if (!roads || !roads.randomLaneNear || !game.vehicles) return null;
    let found = false;
    let bestScore = -Infinity;
    let bestLane = null;
    let bestX = 0;
    let bestZ = 0;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const hit = roads.randomLaneNear(ctx.px, ctx.pz, near[0], near[1], rng);
      if (!hit) continue;
      const x = hit.x;
      const z = hit.z;
      const lane = hit.lane;
      if (game.vehicles.nearest(x, z, 10)) continue;
      const dx = x - ctx.px;
      const dz = z - ctx.pz;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      let score = 0;
      if (ctx.pspeed > 5) score += ((dx * ctx.fx + dz * ctx.fz) / d) * 2.5;
      score += Math.min(1.6, separationFromUnits(Math.atan2(dx, dz))) * 1.2;
      if (score <= bestScore) continue;
      if (sight.playerVisibleFrom(x, 1.4, z, 260)) continue;
      bestScore = score;
      bestLane = lane;
      bestX = x;
      bestZ = z;
      found = true;
    }
    if (!found) return null;
    // Face the player: take the lane of the same road that runs toward him.
    let lane = bestLane;
    const towardX = ctx.px - bestX;
    const towardZ = ctx.pz - bestZ;
    if (lane.dirX * towardX + lane.dirZ * towardZ < 0) {
      const lanes = lane.edge ? lane.edge.lanes : null;
      if (lanes) {
        for (let i = 0; i < lanes.length; i += 1) {
          if (lanes[i].forward !== lane.forward && lanes[i].index === lane.index) {
            lane = lanes[i];
            break;
          }
        }
      }
    }
    let t = ((bestX - lane.x0) * lane.dirX + (bestZ - lane.z0) * lane.dirZ) / lane.length;
    t = t < 0.05 ? 0.05 : t > 0.95 ? 0.95 : t;
    spawnSpot.x = lane.x0 + (lane.x1 - lane.x0) * t;
    spawnSpot.z = lane.z0 + (lane.z1 - lane.z0) * t;
    spawnSpot.heading = lane.heading;
    return spawnSpot;
  }

  /** The smallest bearing gap (radians, seen from the player) between `bearing` and any responding unit. */
  function separationFromUnits(bearing) {
    let least = Math.PI;
    const units = roster.units;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (unit.mode !== 'response' || !unit.vehicle) continue;
      const other = Math.atan2(unit.vehicle.pos.x - ctx.px, unit.vehicle.pos.z - ctx.pz);
      const gap = Math.abs(game.math.angleDelta(bearing, other));
      if (gap < least) least = gap;
    }
    return least;
  }

  /**
   * The chase formation: nearest car behind him on the bumper, the next two on his flanks, cars
   * ahead of him cut him off, the rest trail; a stopped car gets boxed in from four sides; a man on
   * foot gets every car converging.
   */
  function assignRoles(dt) {
    roleTimer -= dt;
    if (roleTimer > 0) return;
    roleTimer = ROLE_INTERVAL;
    ranked.length = 0;
    const units = roster.units;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (unit.mode !== 'response' || !unit.vehicle || unit.vehicle.wrecked) continue;
      if (unit.state !== 'chasing' && unit.state !== 'responding') continue;
      let at = ranked.length;
      ranked.push(unit);
      while (at > 0 && ranked[at - 1].distance > unit.distance) {
        ranked[at] = ranked[at - 1];
        at -= 1;
      }
      ranked[at] = unit;
    }
    if (ctx.onFoot) {
      for (let i = 0; i < ranked.length; i += 1) ranked[i].role = 'converge';
      return;
    }
    if (ctx.pspeed < 3.5) {
      assignBox();
      return;
    }
    let lead = false;
    let left = false;
    let right = false;
    let cutoffs = 0;
    for (let i = 0; i < ranked.length; i += 1) {
      const unit = ranked[i];
      const p = unit.vehicle.pos;
      const lon = (p.x - ctx.px) * ctx.fx + (p.z - ctx.pz) * ctx.fz;
      const lat = (p.x - ctx.px) * ctx.rx + (p.z - ctx.pz) * ctx.rz;
      let role;
      if (unit.distance > 170) role = 'respond';
      else if (lon > 18 && cutoffs < 2 && ctx.level >= 2) {
        role = 'cutoff';
        cutoffs += 1;
      } else if (!lead) {
        role = 'lead';
        lead = true;
      } else if (ctx.level >= 2 && !right && (lat >= 0 || left)) {
        role = 'flankRight';
        right = true;
      } else if (ctx.level >= 2 && !left) {
        role = 'flankLeft';
        left = true;
      } else if (ctx.level >= 3 && cutoffs < 2) {
        role = 'cutoff';
        cutoffs += 1;
      } else role = 'trail';
      unit.role = role;
    }
  }

  /** Four sides round a stopped car, each taken by the nearest free unit; the rest trail. */
  const BOX_ROLES = ['boxRear', 'boxLeft', 'boxRight', 'boxFront'];
  function assignBox() {
    for (let i = 0; i < ranked.length; i += 1) ranked[i].role = 'trail';
    const L = ctx.pHalfLength;
    for (let b = 0; b < BOX_ROLES.length; b += 1) {
      const role = BOX_ROLES[b];
      const along = role === 'boxRear' ? -(L + 3.4) : role === 'boxFront' ? L + 3.6 : 0;
      const across = role === 'boxRight' ? 3.4 : role === 'boxLeft' ? -3.4 : 0;
      const sx = ctx.px + ctx.fx * along + ctx.rx * across;
      const sz = ctx.pz + ctx.fz * along + ctx.rz * across;
      let best = null;
      let bestSq = 50 * 50;
      for (let i = 0; i < ranked.length; i += 1) {
        const unit = ranked[i];
        if (unit.role !== 'trail') continue;
        const dSq = (unit.vehicle.pos.x - sx) ** 2 + (unit.vehicle.pos.z - sz) ** 2;
        if (dSq < bestSq) {
          bestSq = dSq;
          best = unit;
        }
      }
      if (best) best.role = role;
    }
  }

  /** One unit's frame: its officers, getting out and back in, its driving, and whether it is done. */
  function thinkUnit(unit, dt) {
    unit.modeTime += dt;
    const crew = unit.officers;
    for (let k = crew.length - 1; k >= 0; k -= 1) {
      if (k < crew.length) officers.update(crew[k], unit, dt, ctx);
    }
    if (unit.mode === 'patrol' || unit.mode === 'footPatrol') return;
    const vehicle = unit.vehicle;
    if (vehicle && vehicle.wrecked) {
      roster.releaseVehicle(unit);
    } else if (vehicle) {
      manageCrew(unit);
      if (unit.vehicle) driver.driveUnit(unit, dt, ctx);
    } else if (unit.mode === 'leaving' || ctx.level === 0) {
      for (let k = 0; k < crew.length; k += 1) {
        const state = crew[k].ai.state;
        if (state !== 'walkAway' && state !== 'dead') officers.walkOff(crew[k]);
      }
    }
    updateVisibility(unit, dt);
    if (shouldRemove(unit)) roster.removeUnit(unit);
  }

  /**
   * Out of the car when the suspect is on foot nearby or his car has stopped close by; back in and
   * after him when he drives off or gets away; back in to leave when called off.
   */
  function manageCrew(unit) {
    const vehicle = unit.vehicle;
    if (unit.officers.length === 0) return;
    const seated = officers.seatedCount(unit);
    if (unit.state === 'deployed') {
      const goBack = unit.mode === 'leaving' || ctx.level === 0 || ctx.playerDown && ctx.level === 0
        || (!ctx.onFoot && ctx.pspeed > 6 && unit.distance > 16) || unit.distance > 75;
      if (!goBack) {
        unit.recalling = false;
        return;
      }
      if (!unit.recalling) {
        officers.recall(unit);
        unit.recalling = true;
      }
      if (seated >= unit.officers.length) {
        unit.recalling = false;
        unit.state = unit.mode === 'leaving' ? 'leaving' : 'responding';
        unit.drive.waypoint = false;
        driver.roads.dropRoute(unit.drive);
      }
      return;
    }
    if (unit.mode !== 'response' || seated === 0 || ctx.playerDown) return;
    if (unit.state === 'recovering' || unit.state === 'leaving') return;
    const speed = Math.abs(vehicle.speed);
    const close = ctx.onFoot ? unit.distance < 30 || (unit.distance < 60 && unit.stuckTime > 2) : unit.distance < 22;
    const suspectStopped = ctx.onFoot || (ctx.pspeed < 2.5 && ctx.stoppedFor > 1);
    if (close && suspectStopped && speed < 3) {
      officers.deploy(unit);
      if (!ctx.onFoot) officers.shout('stopCar', unit);
    }
  }

  /** About once a second: can the player see this unit? (Units vanish and get pushed only unseen.) */
  function updateVisibility(unit, dt) {
    unit.visibleTimer -= dt;
    if (unit.visibleTimer > 0) return;
    unit.visibleTimer = 0.8 + Math.random() * 0.4;
    const at = positionOf(unit);
    if (!at) return;
    unit.visibleToPlayer = unit.distance < 260
      && (unit.distance < 25 || sight.clearView(ctx.px, ctx.py + 1.6, ctx.pz, at.x, at.y + 1.2, at.z));
  }

  /** Lost far behind, wedged or upside down out of sight, or called off and gone: take it away. */
  function shouldRemove(unit) {
    const hidden = !unit.visibleToPlayer;
    if (unit.mode === 'leaving') return (hidden && (unit.distance > 150 || unit.modeTime > 45)) || unit.distance > 400;
    if (unit.distance > 450 && hidden) return true;
    if (unit.vehicle && (unit.stuckTime > 9 || unit.flipped) && hidden) return true;
    if (!unit.vehicle && unit.distance > 160 && hidden) return true;
    return false;
  }

  /** The level changed: note when the stars came; when they are gone, everyone stands down. */
  function onWantedChanged(event) {
    if (!event) return;
    if (event.previous === 0 && event.level > 0) {
      wantedSince = game.time.elapsed;
      police.stats.firstSightDelay = police.seesPlayer ? 0 : null;
      spawnTimer = Math.min(spawnTimer, 1.2);
    }
    if (event.level === 0) standDown();
  }

  /** Called off: sirens out, foot patrols back to their beat, everyone else back in the car and away. */
  function standDown() {
    wantedSince = -1;
    const units = roster.units;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (unit.mode !== 'response') continue;
      if (unit.home && !unit.vehicle) {
        unit.mode = 'footPatrol';
        unit.state = 'patrolling';
        unit.role = 'footPatrol';
        const home = unit.home;
        for (let k = 0; k < unit.officers.length; k += 1) {
          officers.startPatrol(unit.officers[k], home.x - home.beatZ * 1.5 * k, home.z + home.beatX * 1.5 * k, home.beatX, home.beatZ);
        }
        roster.setBlip(unit, false);
        continue;
      }
      unit.mode = 'leaving';
      unit.modeTime = 0;
      unit.role = 'leave';
      if (unit.vehicle && !unit.vehicle.wrecked) {
        unit.vehicle.controls.siren = false;
        if (unit.state !== 'deployed') unit.state = 'leaving';
        unit.drive.waypoint = false;
      } else {
        for (let k = 0; k < unit.officers.length; k += 1) officers.walkOff(unit.officers[k]);
      }
      roster.setBlip(unit, false);
    }
    game.events.emit('police:standDown', {});
  }

  /** Suspended (or no player): every car brakes and every officer lowers his gun. */
  function holdEveryone() {
    const units = roster.units;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (unit.vehicle && !unit.vehicle.wrecked) driver.holdStill(unit);
      for (let k = 0; k < unit.officers.length; k += 1) officers.standDown(unit.officers[k]);
    }
  }

  /** One or two stars, the suspect still driving and a car on his tail: the loudspeaker. */
  function useLoudspeaker(dt) {
    loudspeakerTimer -= dt;
    if (loudspeakerTimer > 0 || ctx.level === 0 || ctx.level > 2 || ctx.onFoot || ctx.playerDown) return;
    const units = roster.units;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (unit.state === 'chasing' && unit.distance < 30 && unit.sees) {
        officers.shout('loudspeaker', unit);
        loudspeakerTimer = 10;
        return;
      }
    }
  }

  function finishStats(started, dt) {
    const spent = performance.now() - started;
    const stats = police.stats;
    stats.lastMs = spent;
    stats.thinkMs = stats.thinkMs * 0.95 + spent * 0.05;
    peakWindow += dt;
    if (peakWindow > 3) {
      peakWindow = 0;
      stats.peakMs = spent;
    } else if (spent > stats.peakMs) stats.peakMs = spent;
  }

  /** Where a unit is: its car, or its first officer on foot. */
  function positionOf(unit) {
    if (unit.vehicle) return unit.vehicle.pos;
    for (let i = 0; i < unit.officers.length; i += 1) {
      const officer = unit.officers[i];
      if (officer.alive !== false) {
        unitAt.x = officer.pos.x;
        unitAt.y = officer.pos.y;
        unitAt.z = officer.pos.z;
        return unitAt;
      }
    }
    return null;
  }

  function responseCars() {
    let cars = 0;
    const units = roster.units;
    for (let i = 0; i < units.length; i += 1) {
      if (units[i].mode === 'response' && units[i].vehicle && !units[i].vehicle.wrecked) cars += 1;
    }
    return cars;
  }

  function isPlayer(character) {
    const player = game.player;
    return !!(player && character && (character === player.character || character.kind === 'player'));
  }

  return police;
}

/** The one context object every unit reads each frame. */
function createChaseContext(units) {
  return {
    units, now: 0, level: 0, pursuit: false, hasPlayer: false, suspended: false,
    playerCharacter: null, playerVehicle: null, onFoot: true, playerDown: false,
    px: 0, py: 0, pz: 0, pvx: 0, pvz: 0, pspeed: 0, pHalfLength: 0.4,
    fx: 0, fz: 1, rx: -1, rz: 0,
    targetX: 0, targetZ: 0, searchX: 0, searchZ: 0, searchRadius: 60,
    night: 0, ram: false, armed: false, aiming: false, fighting: false, violent: false, threatening: false,
    arrestable: false, stoppedFor: 0, cuffers: 0,
  };
}

/** The car's crew is aboard to look out of it (or it was sent out without people at all). */
function crewInside(unit) {
  const crew = unit.officers;
  if (crew.length === 0) return true;
  for (let i = 0; i < crew.length; i += 1) if (crew[i].vehicle === unit.vehicle) return true;
  return false;
}

function nightFromHour(hour) {
  if (typeof hour !== 'number') return 0;
  if (hour >= 20 || hour < 5) return 1;
  if (hour >= 18.5) return (hour - 18.5) / 1.5;
  if (hour < 6.5) return 1 - (hour - 5) / 1.5;
  return 0;
}
