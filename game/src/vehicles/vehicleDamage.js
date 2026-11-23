// What a beating does to a vehicle in Port Sarab: dents that sap the engine, grey smoke once it is
// down to a third of its health, then fire, a few seconds' fuse and an explosion that throws nearby
// cars and people, leaving a charred wreck on the street. A car driven into the gulf floods and dies.

/** Below this share of its health the engine coughs and the bonnet smokes. */
export const SMOKING_SHARE = 0.35;
export const EXPLOSION_RADIUS = 7;
/** Impulse (N s) and damage a vehicle takes at the heart of a blast; both fall off to the edge. */
const BLAST_IMPULSE = 12000;
const BLAST_VEHICLE_DAMAGE = 950;
const BLAST_PERSON_DAMAGE = 170;
/** Seconds a wreck burns before it blows (a blast-wrecked car goes much sooner: a chain reaction). */
const FUSE_MIN = 4;
const FUSE_MAX = 6;
const CHAIN_FUSE_MIN = 0.6;
const CHAIN_FUSE_MAX = 1.6;
/** Seconds the charred wreck keeps burning after the explosion. */
const AFTERBURN = 10;

/**
 * Build the damage model shared by every vehicle.
 * @param {Object} game
 * @param {{list:Object[], wake:Function, applyImpulse:Function}} vehicles  the vehicle manager
 */
export function createVehicleDamage(game, vehicles) {
  /**
   * Take `amount` hit points off a vehicle. Below 35% the engine loses power and smokes; at zero
   * the vehicle is wrecked and catches fire, and explodes a few seconds later. Hits on a burning
   * wreck shorten its fuse. Returns the damage actually dealt.
   * @param {{source?:Object, kind?:'crash'|'bullet'|'explosion'|'fire', x?:number, z?:number}} [info]
   */
  function applyDamage(vehicle, amount, info) {
    if (!vehicle || !vehicle.dynamics || !(amount > 0)) return 0;
    const dyn = vehicle.dynamics;
    if (dyn.exploded || dyn.sunk) return 0;
    const kind = (info && info.kind) || 'crash';
    const source = (info && info.source) || null;
    if (vehicle.wrecked) {
      if (vehicle.onFire && dyn.fuse > 0) dyn.fuse -= (amount / vehicle.maxHealth) * 8;
      return 0;
    }
    const before = vehicle.health;
    vehicle.health = Math.max(0, before - amount);
    const dealt = before - vehicle.health;
    if (source) dyn.lastAttacker = source;
    refreshEngine(vehicle);
    if (dealt >= Math.max(4, vehicle.maxHealth * 0.01)) {
      game.events.emit('vehicle:damaged', { vehicle, amount: dealt, source, kind });
    }
    if (vehicle.health <= 0) setAblaze(vehicle, source || dyn.lastAttacker || null, kind === 'explosion');
    if (dyn.sleeping) vehicles.wake(vehicle);
    return dealt;
  }

  /** Engine power falls away as the health drops below the smoking line. */
  function refreshEngine(vehicle) {
    const dyn = vehicle.dynamics;
    if (vehicle.wrecked) {
      dyn.enginePower = 0;
      return;
    }
    const share = vehicle.health / vehicle.maxHealth;
    vehicle.smoking = share < SMOKING_SHARE;
    dyn.enginePower = share >= SMOKING_SHARE ? 1 : 0.45 + 0.55 * (share / SMOKING_SHARE);
  }

  /** Health gone: the engine dies, the car burns, and the fuse starts. */
  function setAblaze(vehicle, source, chain) {
    const dyn = vehicle.dynamics;
    vehicle.wrecked = true;
    vehicle.onFire = true;
    vehicle.smoking = true;
    dyn.enginePower = 0;
    dyn.fuse = chain ? range(CHAIN_FUSE_MIN, CHAIN_FUSE_MAX) : range(FUSE_MIN, FUSE_MAX);
    dyn.wreckSource = source;
    game.events.emit('vehicle:onFire', { vehicle, fuse: dyn.fuse, source });
  }

  /**
   * Blow a vehicle up now: the 'explosion' and 'vehicle:destroyed' events, a blast that throws and
   * hurts nearby vehicles and people, and a charred wreck that stays where it lies.
   */
  function explode(vehicle, source) {
    if (!vehicle || !vehicle.dynamics) return;
    const dyn = vehicle.dynamics;
    if (dyn.exploded) return;
    const cause = source || dyn.wreckSource || dyn.lastAttacker || null;
    dyn.exploded = true;
    dyn.enginePower = 0;
    dyn.fuse = 0;
    dyn.afterburn = AFTERBURN;
    vehicle.exploded = true;
    vehicle.charred = true;
    vehicle.wrecked = true;
    vehicle.onFire = true;
    vehicle.smoking = true;
    vehicle.health = 0;
    // The wreck itself is kicked into the air and twisted.
    vehicles.wake(vehicle);
    vehicle.vel.y += 4.5 * Math.min(1, 2200 / dyn.profile.mass);
    vehicle.yawRate += (Math.random() - 0.5) * 2;
    dyn.pitchRate += (Math.random() - 0.5) * 3;
    dyn.rollRate += (Math.random() - 0.5) * 4;
    const x = vehicle.pos.x;
    const y = vehicle.pos.y + 0.8;
    const z = vehicle.pos.z;
    game.events.emit('explosion', { x, y, z, radius: EXPLOSION_RADIUS, source: cause, vehicle, blastApplied: true });
    game.events.emit('vehicle:destroyed', { vehicle, source: cause });
    hurtOccupants(vehicle, cause);
    blast(x, y, z, EXPLOSION_RADIUS, cause, vehicle);
  }

  /** Anyone still inside a vehicle when it blows does not walk away. */
  function hurtOccupants(vehicle, source) {
    const characters = game.characters;
    if (!characters || !characters.damage) return;
    if (vehicle.driver) characters.damage(vehicle.driver, 500, { source, kind: 'explosion' });
    const passengers = vehicle.passengers;
    if (passengers) {
      for (let i = 0; i < passengers.length; i += 1) {
        if (passengers[i]) characters.damage(passengers[i], 500, { source, kind: 'explosion' });
      }
    }
  }

  /**
   * A blast at (x, y, z): vehicles within `radius` are shoved, lifted, spun and damaged (a wreck
   * nearby may go up in a chain); people on foot are hurt and thrown. `except` is left alone.
   */
  function blast(x, y, z, radius, source, except) {
    const list = vehicles.list;
    for (let i = 0; i < list.length; i += 1) {
      const other = list[i];
      if (other === except) continue;
      const dx = other.pos.x - x;
      const dz = other.pos.z - z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const reach = radius + other.dynamics.profile.halfWidth;
      if (distance >= reach) continue;
      const strength = 1 - distance / reach;
      const nx = distance > 0.05 ? dx / distance : 1;
      const nz = distance > 0.05 ? dz / distance : 0;
      const mass = other.dynamics.profile.mass;
      vehicles.wake(other);
      // Strike it off-centre so it spins as well as slides.
      vehicles.applyImpulse(other, nx * BLAST_IMPULSE * strength, nz * BLAST_IMPULSE * strength,
        other.pos.x - nz * 0.5, other.pos.z + nx * 0.5);
      other.vel.y += 5.5 * strength * Math.min(1, 1800 / mass);
      other.dynamics.rollRate += (Math.random() - 0.5) * 3 * strength;
      applyDamage(other, BLAST_VEHICLE_DAMAGE * strength, { source, kind: 'explosion', x, z });
    }
    const characters = game.characters;
    if (!characters || !characters.list) return;
    const people = characters.list;
    for (let i = 0; i < people.length; i += 1) {
      const person = people[i];
      if (!person || person.vehicle || person.alive === false) continue;
      const dx = person.pos.x - x;
      const dz = person.pos.z - z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance >= radius) continue;
      const strength = 1 - distance / radius;
      const nx = distance > 0.05 ? dx / distance : 1;
      const nz = distance > 0.05 ? dz / distance : 0;
      if (characters.knockDown) {
        characters.knockDown(person, nx * (2 + 9 * strength), 1.5 + 5 * strength, nz * (2 + 9 * strength), { source });
      }
      if (characters.damage) {
        characters.damage(person, BLAST_PERSON_DAMAGE * strength, { source, kind: 'explosion', dirX: nx, dirZ: nz });
      }
    }
  }

  /** The gulf takes it: engine flooded, no fire, no explosion; 'vehicle:sunk' once. */
  function sink(vehicle) {
    const dyn = vehicle.dynamics;
    if (dyn.sunk) return;
    dyn.sunk = true;
    dyn.enginePower = 0;
    dyn.fuse = 0;
    vehicle.sunk = true;
    vehicle.wrecked = true;
    vehicle.onFire = false;
    vehicle.smoking = false;
    vehicle.health = 0;
    game.events.emit('vehicle:sunk', { vehicle });
  }

  /** A garage's work: full health, no smoke, no fire. Charred or sunk wrecks are beyond help. */
  function repair(vehicle) {
    if (!vehicle || !vehicle.dynamics) return false;
    const dyn = vehicle.dynamics;
    if (dyn.exploded || dyn.sunk) return false;
    vehicle.health = vehicle.maxHealth;
    vehicle.wrecked = false;
    vehicle.onFire = false;
    vehicle.smoking = false;
    dyn.fuse = 0;
    dyn.enginePower = 1;
    return true;
  }

  /** Count down the fuses of burning wrecks and the afterburn of charred ones. */
  function update(dt) {
    const list = vehicles.list;
    for (let i = 0; i < list.length; i += 1) {
      const vehicle = list[i];
      if (!vehicle.onFire) continue;
      const dyn = vehicle.dynamics;
      if (dyn.submerged > 0.5) {
        // Water puts the fire out; the car sinks instead of blowing up.
        vehicle.onFire = false;
        dyn.fuse = 0;
        continue;
      }
      if (!dyn.exploded) {
        dyn.fuse -= dt;
        if (dyn.fuse <= 0) explode(vehicle, dyn.wreckSource);
      } else {
        dyn.afterburn -= dt;
        if (dyn.afterburn <= 0) vehicle.onFire = false;
      }
    }
  }

  return { applyDamage, explode, blast, sink, repair, refreshEngine, update };
}

function range(min, max) {
  return min + Math.random() * (max - min);
}
