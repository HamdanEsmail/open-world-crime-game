// Every car, truck, bus and police unit alive in Port Sarab: spawning and despawning them, waking
// and sleeping them, and stepping their handling, collisions and damage in small sub-steps each
// frame. This is game.vehicles: traffic, police, missions and the player all reach vehicles here.
import * as THREE from 'three';
import { handlingProfileFor } from './vehicleHandlingProfile.js';
import { stepVehicleDynamics } from './vehiclePhysics.js';
import { restOnGround } from './vehicleSuspension.js';
import { tyreGripOnSurface, surfaceDrag, landingDamage, sinksInWater } from './drivingRules.js';
import { createVehicleCollisions } from './vehicleCollisions.js';
import { createVehicleDamage } from './vehicleDamage.js';
import { createVehicleAutopilot } from './vehicleAutopilot.js';

/**
 * Build game.vehicles.
 * @param {Object} game
 */
export function createVehicleManager(game) {
  /** @type {import('../core/gameContext.js').Vehicle[]} */
  const list = [];
  const world = { terrain: null, gravity: 9.81, seaLevel: -1 };
  const paintRng = game.rng && game.rng.fork ? game.rng.fork('vehicle-paint') : null;
  const stats = { awake: 0, asleep: 0, substeps: 0, updateMs: 0 };
  const pendingDespawns = [];
  let updating = false;
  let warnedFailure = false;
  let localIds = 1;

  const manager = {
    list,
    stats,
    spawn,
    despawn,
    nearest,
    applyDamage,
    explode,
    applyImpulse,
    setDriver,
    wake,
    place,
    repair,
    blast,
    pushOutCircle,
    update,
  };
  const damage = createVehicleDamage(game, manager);
  const collisions = createVehicleCollisions(game, manager);
  manager.autopilot = createVehicleAutopilot(game, manager);

  /**
   * Put a new vehicle of a catalogue model on the ground.
   * @param {string} specId  e.g. 'kestrel_sirocco'
   * @param {{x:number, z:number, heading?:number, color?:number, faction?:string, parked?:boolean, locked?:boolean}} options
   * @returns {import('../core/gameContext.js').Vehicle|null}
   */
  function spawn(specId, options) {
    const spec = resolveSpec(specId);
    if (!spec) {
      console.warn('vehicles: unknown model', specId);
      return null;
    }
    const o = options || {};
    const x = finite(o.x, 0);
    const z = finite(o.z, 0);
    const heading = finite(o.heading, 0);
    const profile = handlingProfileFor(spec);
    const terrain = game.terrain;
    const y = terrain && terrain.heightAt ? finite(terrain.heightAt(x, z), 0) : 0;
    const vehicle = {
      id: game.newEntityId ? game.newEntityId() : localIds++,
      spec,
      pos: new THREE.Vector3(x, y, z),
      heading,
      pitch: 0,
      roll: 0,
      vel: new THREE.Vector3(),
      speed: 0,
      yawRate: 0,
      controls: game.createVehicleControls ? game.createVehicleControls()
        : { throttle: 0, brake: 0, steer: 0, handbrake: false, reverse: false, horn: false, siren: false, headlights: false },
      health: spec.health,
      maxHealth: spec.health,
      wrecked: false,
      onFire: false,
      smoking: false,
      exploded: false,
      charred: false,
      sunk: false,
      grounded: true,
      slip: 0,
      rpm: 0,
      gear: 0,
      color: typeof o.color === 'number' ? o.color : pickPaint(spec),
      faction: o.faction || (spec.className === 'police' || spec.className === 'policeSuv' ? 'police' : 'civilian'),
      driver: null,
      passengers: [],
      isPlayer: false,
      parked: !!o.parked,
      locked: !!o.locked,
      wheels: [makeWheel(), makeWheel(), makeWheel(), makeWheel()],
      ai: null,
      tags: {},
      dynamics: createVehicleDynamics(profile, x, z),
    };
    setDown(vehicle);
    list.push(vehicle);
    game.events.emit('vehicle:spawned', { vehicle });
    return vehicle;
  }

  /**
   * Take a vehicle out of the world. Called from inside the vehicle update (an event handler),
   * the removal waits until the frame's physics is done.
   */
  function despawn(vehicle) {
    if (!vehicle || vehicle.despawned || list.indexOf(vehicle) === -1) return false;
    vehicle.despawned = true;
    if (updating) {
      pendingDespawns.push(vehicle);
      return true;
    }
    removeFromList(vehicle);
    return true;
  }

  function removeFromList(vehicle) {
    const index = list.indexOf(vehicle);
    if (index !== -1) list.splice(index, 1);
    game.events.emit('vehicle:despawned', { vehicle });
  }

  /**
   * The closest vehicle to (x, z) within maxDistance that passes `filter`, or null.
   * @param {(vehicle:Object)=>boolean} [filter]
   */
  function nearest(x, z, maxDistance, filter) {
    let best = null;
    let bestSq = (maxDistance === undefined ? Infinity : maxDistance) ** 2;
    for (let i = 0; i < list.length; i += 1) {
      const vehicle = list[i];
      if (vehicle.despawned) continue;
      const dx = vehicle.pos.x - x;
      const dz = vehicle.pos.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= bestSq) continue;
      if (filter && !filter(vehicle)) continue;
      best = vehicle;
      bestSq = d2;
    }
    return best;
  }

  /** Hurt a vehicle (crash, bullet, explosion, fire); see vehicleDamage. Returns the damage dealt. */
  function applyDamage(vehicle, amount, info) {
    return damage.applyDamage(vehicle, amount, info);
  }

  /** Blow a vehicle up now. */
  function explode(vehicle, source) {
    damage.explode(vehicle, source);
  }

  /** A blast at a point that throws and hurts vehicles and people (grenades, gas tanks). */
  function blast(x, y, z, radius, source) {
    damage.blast(x, y, z, radius, source, null);
  }

  /** Bring a vehicle back to full health (a garage); false for charred or sunk wrecks. */
  function repair(vehicle) {
    const done = damage.repair(vehicle);
    if (done) damage.refreshEngine(vehicle);
    return done;
  }

  /**
   * Shove a vehicle: an impulse (N s) on the ground plane, through the point (px, pz) if given so an
   * off-centre shove also spins it.
   */
  function applyImpulse(vehicle, ix, iz, px, pz) {
    if (!vehicle || !vehicle.dynamics) return;
    const profile = vehicle.dynamics.profile;
    vehicle.vel.x += ix * profile.invMass;
    vehicle.vel.z += iz * profile.invMass;
    if (px !== undefined && pz !== undefined) {
      const rx = px - (vehicle.pos.x + Math.sin(vehicle.heading) * profile.cgOffset);
      const rz = pz - (vehicle.pos.z + Math.cos(vehicle.heading) * profile.cgOffset);
      vehicle.yawRate += (rz * ix - rx * iz) / profile.collisionYawInertia;
    }
    wake(vehicle);
  }

  /** Seat a driver (a Character) or clear the seat (null). A driver-less car coasts to a stop. */
  function setDriver(vehicle, character) {
    if (!vehicle) return;
    vehicle.driver = character || null;
    vehicle.isPlayer = !!(character && character.kind === 'player');
    if (character) {
      vehicle.parked = false;
    } else {
      const c = vehicle.controls;
      c.throttle = 0;
      c.brake = 0;
      c.steer = 0;
      c.handbrake = false;
      c.reverse = false;
      c.horn = false;
    }
    wake(vehicle);
  }

  /** Teleport a vehicle onto the ground at (x, z) facing `heading`, at rest. */
  function place(vehicle, x, z, heading) {
    if (!vehicle) return;
    const dyn = vehicle.dynamics;
    const terrain = game.terrain;
    vehicle.pos.set(x, terrain && terrain.heightAt ? finite(terrain.heightAt(x, z), 0) : 0, z);
    if (heading !== undefined) vehicle.heading = heading;
    vehicle.vel.set(0, 0, 0);
    vehicle.yawRate = 0;
    vehicle.speed = 0;
    vehicle.pitch = 0;
    vehicle.roll = 0;
    dyn.pitchRate = 0;
    dyn.rollRate = 0;
    dyn.groundReady = false;
    dyn.prevX = x;
    dyn.prevZ = z;
    dyn.airTime = 0;
    setDown(vehicle);
    wake(vehicle);
  }

  /** Rest a vehicle on its four wheel contacts (surfaces first, so a kerb counts). */
  function setDown(vehicle) {
    const terrain = game.terrain;
    if (!terrain || !terrain.heightAt) return;
    readSurfaces(vehicle, terrain);
    restOnGround(vehicle, vehicle.dynamics.profile, vehicle.dynamics, terrain);
  }

  function wake(vehicle) {
    const dyn = vehicle.dynamics;
    dyn.sleeping = false;
    dyn.sleepTimer = 0;
  }

  /** Move a person's position out of any vehicle they walked into; returns the contact or null. */
  function pushOutCircle(pos, radius, y0, y1) {
    return collisions.pushOutCircle(pos, radius, y0 === undefined ? pos.y : y0, y1 === undefined ? pos.y + 1.8 : y1, list);
  }

  /** Step every awake vehicle in sub-steps of about 1/120 s; collisions, landings, water, sleep. */
  function update(dt) {
    if (!(dt > 0)) return;
    const started = performance.now();
    if (dt > 0.1) dt = 0.1;
    world.terrain = game.terrain || null;
    const config = game.config && game.config.world;
    world.gravity = config && config.gravity ? config.gravity : 9.81;
    world.seaLevel = config && typeof config.seaLevel === 'number' ? config.seaLevel : -1;
    const steps = Math.max(1, Math.min(MAX_SUBSTEPS, Math.round(dt / STEP)));
    updating = true;
    try {
      simulateFrame(dt, steps);
    } catch (error) {
      if (!warnedFailure) {
        console.warn('vehicles: a frame of the simulation failed', error);
        warnedFailure = true;
      }
    } finally {
      updating = false;
      while (pendingDespawns.length > 0) removeFromList(pendingDespawns.pop());
    }
    stats.substeps = steps;
    stats.updateMs = performance.now() - started;
  }

  /** The frame's work: wake and read the ground, sub-step physics and collisions, then the rest. */
  function simulateFrame(dt, steps) {
    const h = dt / steps;
    let awake = 0;
    for (let i = 0; i < list.length; i += 1) {
      if (prepareVehicle(list[i])) awake += 1;
    }
    for (let s = 0; s < steps; s += 1) {
      const last = s === steps - 1;
      for (let i = 0; i < list.length; i += 1) {
        const vehicle = list[i];
        if (vehicle.dynamics.sleeping) continue;
        stepVehicleDynamics(vehicle, h, world);
      }
      for (let i = 0; i < list.length; i += 1) {
        const vehicle = list[i];
        if (vehicle.dynamics.sleeping) continue;
        if (last || vehicle.vel.x * vehicle.vel.x + vehicle.vel.z * vehicle.vel.z > FAST_SPEED * FAST_SPEED) {
          collisions.resolveStaticCollisions(vehicle);
        }
      }
      collisions.resolveVehicleCollisions(list);
    }
    const now = game.time ? game.time.elapsed : 0;
    for (let i = 0; i < list.length; i += 1) {
      const vehicle = list[i];
      if (!vehicle.dynamics.sleeping) finishFrame(vehicle, dt);
    }
    collisions.resolveCharacterCollisions(list, now);
    damage.update(dt);
    stats.awake = awake;
    stats.asleep = list.length - awake;
  }

  /**
   * Once a frame before the sub-steps: wake a sleeper whose driver touches the controls, and read
   * what each wheel stands on and whether the car is in deep water. Returns true when awake.
   */
  function prepareVehicle(vehicle) {
    const dyn = vehicle.dynamics;
    const c = vehicle.controls;
    if (dyn.sleeping) {
      // Woken by the driver's controls, or by anyone who set it moving or moved it.
      const nudged = vehicle.vel.lengthSq() > 1e-4 || vehicle.yawRate !== 0
        || vehicle.pos.x !== dyn.prevX || vehicle.pos.z !== dyn.prevZ;
      if (nudged || c.throttle > 0.01 || (c.steer !== 0 && !vehicle.parked)) wake(vehicle);
      else return false;
    }
    const terrain = world.terrain;
    if (!terrain) return true;
    const moving = vehicle.vel.x * vehicle.vel.x + vehicle.vel.z * vehicle.vel.z > 0.25;
    if (moving || !dyn.surfaceKnown) readSurfaces(vehicle, terrain);
    dyn.inWater = terrain.isWater ? !!terrain.isWater(vehicle.pos.x, vehicle.pos.z) : false;
    return true;
  }

  /** What each wheel stands on, and what that does to its grip and drag. */
  function readSurfaces(vehicle, terrain) {
    const dyn = vehicle.dynamics;
    const profile = dyn.profile;
    dyn.surfaceKnown = true;
    if (!terrain.surfaceAt) return;
    const s = Math.sin(vehicle.heading);
    const c = Math.cos(vehicle.heading);
    const cgX = vehicle.pos.x + s * profile.cgOffset;
    const cgZ = vehicle.pos.z + c * profile.cgOffset;
    const speed = Math.abs(vehicle.speed);
    for (let i = 0; i < 4; i += 1) {
      const pf = i < 2 ? profile.cgToFront : -profile.cgToRear;
      const pl = (i & 1) === 0 ? profile.halfTrack : -profile.halfTrack;
      const kind = terrain.surfaceAt(cgX + s * pf + c * pl, cgZ + c * pf - s * pl);
      dyn.surface[i] = kind;
      // Loose ground: less grip, a softer tyre curve, and drag that bogs down a low road car.
      dyn.surfaceGrip[i] = tyreGripOnSurface(kind, profile.offroad);
      dyn.surfaceStiffness[i] = kind === 'sand' || kind === 'beach' ? 0.62 : kind === 'water' ? 0.5 : 1;
      dyn.sandDrag[i] = surfaceDrag(kind, profile.offroad, speed);
    }
  }

  /** After the sub-steps: landing and terrain-wall events, sinking, and falling asleep. */
  function finishFrame(vehicle, dt) {
    const dyn = vehicle.dynamics;
    // Health may have been set directly (a mission, a garage): keep smoke and engine power in step.
    if (!vehicle.wrecked) damage.refreshEngine(vehicle);
    if (dyn.pendingLanding > 0) {
      const impact = dyn.pendingLanding;
      dyn.pendingLanding = 0;
      game.events.emit('vehicle:landed', { vehicle, impact });
      // A stunt-ramp landing is free; dropping off a quay or a dune crest onto the nose is not.
      const hurt = landingDamage(impact, vehicle.maxHealth);
      if (hurt > 0) damage.applyDamage(vehicle, hurt, { kind: 'crash' });
    }
    if (dyn.pendingTerrainImpact > 0) {
      collisions.reportTerrainImpact(vehicle, dyn.pendingTerrainImpact);
      dyn.pendingTerrainImpact = 0;
    }
    if (dyn.inWater && dyn.submerged > 0) {
      dyn.waterTime += dt;
      if (!dyn.sunk && sinksInWater(dyn.submerged, dyn.waterTime)) damage.sink(vehicle);
    } else if (dyn.waterTime > 0) {
      dyn.waterTime = Math.max(0, dyn.waterTime - dt);
    }
    const c = vehicle.controls;
    const still = vehicle.grounded && c.throttle <= 0.01 && (c.steer === 0 || vehicle.parked)
      && vehicle.vel.lengthSq() < 0.0025 && Math.abs(vehicle.yawRate) < 0.02
      && Math.abs(dyn.pitchRate) < 0.03 && Math.abs(dyn.rollRate) < 0.03 && dyn.submerged <= 0;
    if (still) {
      dyn.sleepTimer += dt;
      if (dyn.sleepTimer > SLEEP_AFTER) fallAsleep(vehicle);
    } else {
      dyn.sleepTimer = 0;
    }
  }

  function fallAsleep(vehicle) {
    const dyn = vehicle.dynamics;
    dyn.sleeping = true;
    vehicle.vel.set(0, 0, 0);
    vehicle.yawRate = 0;
    vehicle.speed = 0;
    vehicle.slip = 0;
    dyn.pitchRate = 0;
    dyn.rollRate = 0;
    for (let i = 0; i < 4; i += 1) vehicle.wheels[i].skid = 0;
  }

  function resolveSpec(specId) {
    if (specId && typeof specId === 'object' && specId.mass) return specId;
    const catalog = game.catalog || {};
    if (typeof catalog.vehicleById === 'function') {
      const found = catalog.vehicleById(specId);
      if (found) return found;
    }
    const all = catalog.vehicles || [];
    for (let i = 0; i < all.length; i += 1) if (all[i].id === specId) return all[i];
    return null;
  }

  function pickPaint(spec) {
    const colors = spec.colors && spec.colors.length ? spec.colors : [0xd9d9d9];
    const roll = paintRng ? paintRng.next() : Math.random();
    return colors[Math.floor(roll * colors.length) % colors.length];
  }

  return manager;
}

/** The private physical state of one vehicle (everything the handling, collisions and damage keep). */
function createVehicleDynamics(profile, x, z) {
  return {
    profile,
    steer: 0,
    steerAngle: 0,
    pitchRate: 0,
    rollRate: 0,
    groundY: new Float64Array(4),
    groundVel: new Float64Array(4),
    groundReady: false,
    groundPitch: 0,
    groundRoll: 0,
    travel: new Float64Array(4),
    travelVel: new Float64Array(4),
    load: Float64Array.from(profile.staticLoad),
    contact: [true, true, true, true],
    surface: ['road', 'road', 'road', 'road'],
    surfaceKnown: false,
    surfaceGrip: new Float64Array([1, 1, 1, 1]),
    surfaceStiffness: new Float64Array([1, 1, 1, 1]),
    sandDrag: new Float64Array(4),
    wheelRate: new Float64Array(4),
    wheelspin: 0,
    shiftTimer: 0,
    enginePower: 1,
    powerScale: 1,
    speedScale: 1,
    gripScale: 1,
    tyresBurst: false,
    airTime: 0,
    airVelY: 0,
    pendingLanding: 0,
    pendingTerrainImpact: 0,
    inWater: false,
    waterTime: 0,
    submerged: 0,
    buoyancy: 0,
    sunk: false,
    sleeping: false,
    sleepTimer: 0,
    prevX: x,
    prevZ: z,
    fuse: 0,
    afterburn: 0,
    exploded: false,
    wreckSource: null,
    lastAttacker: null,
    impactKeys: [null, null, null, null],
    impactTimes: new Float64Array(4),
    impactSizes: new Float64Array(4),
    impactDamage: new Float64Array(4),
    impactCursor: 0,
    lastImpactTime: -1e9,
    struckPeople: new Float64Array([-1, -1e9, -1, -1e9, -1, -1e9, -1, -1e9]),
    struckCursor: 0,
    pilot: null,
    spinFreedom: 0,
    warnedBadState: false,
  };
}

function makeWheel() {
  return { steerAngle: 0, spin: 0, compression: 0, grounded: true, skid: 0 };
}

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The physics sub-step: about 1/120 s, sized so the sub-steps exactly cover each frame. */
const STEP = 1 / 120;
const MAX_SUBSTEPS = 8;
/** Seconds a vehicle must stand perfectly still, untouched, before it sleeps. */
const SLEEP_AFTER = 0.8;
/** Above this speed (m/s) the static world is checked every sub-step, not once a frame. */
const FAST_SPEED = 10;
