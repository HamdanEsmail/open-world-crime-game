// The cars and people a job brings into Port Sarab: its vehicles, extras and gunmen on free ground,
// the story's cast in their own looks, seats and weapons; and clearing all of it away when the job
// ends: kept things stay, the car Zayd sits in stays, cast members near their contact go back to
// standing there, and after a finished job whatever is near him leaves only once he has gone.

/**
 * Build the spawning and the clean-up of one job run.
 * @param {Object} game
 * @param {Object} run     the run (owner, vehicles, people, kept)
 * @param {Object} hooks   from the mission runner: adoptCast(castId), keepCast(person), leftover(entity)
 * @param {Object} actors  the run's actors (enemies are turned hostile, removed things released)
 * @param {{live:Function}} ops
 */
export function createJobSpawns(game, run, hooks, actors, ops) {
  /** A vehicle that belongs to the job (traffic and the police clean-up leave it alone). */
  function spawnVehicle(specId, options = {}) {
    ops.live();
    if (!game.vehicles) return null;
    const x = options.x || 0;
    const z = options.z || 0;
    makeRoom(x, z, 5.5);
    const vehicle = game.vehicles.spawn(specId, { x, z, heading: options.heading || 0, color: options.color, faction: options.faction, parked: !!options.parked, locked: !!options.locked });
    if (!vehicle) return null;
    vehicle.tags.mission = true;
    vehicle.tags.job = run.job.id;
    if (options.health) {
      vehicle.health = options.health;
      vehicle.maxHealth = Math.max(vehicle.maxHealth || 0, options.health);
    }
    if (options.invulnerable) vehicle.tags.invulnerable = true;
    run.vehicles.push(vehicle);
    return vehicle;
  }

  /** A person who belongs to the job, armed when `weapon` is given. */
  function spawnPerson(options = {}) {
    ops.live();
    if (!game.characters) return null;
    const archetype = options.archetype || 'civilian';
    const person = game.characters.spawn({
      kind: options.kind || KIND_FOR_ARCHETYPE[archetype] || 'civilian',
      faction: options.faction,
      archetype,
      x: options.x || 0,
      z: options.z || 0,
      heading: options.heading || 0,
      name: options.name,
      health: options.health,
      armor: options.armor,
      look: options.look,
    });
    if (!person) return null;
    person.tags.mission = true;
    person.ai = { mission: true, owner: run.owner, mode: 'idle' };
    if (options.weapon) arm(person, options.weapon, options.ammo);
    run.people.push(person);
    return person;
  }

  /** A member of the story's cast, with their own look; the one standing at the contact is reused. */
  function spawnCast(castId, x, z, heading = 0) {
    ops.live();
    const adopted = hooks.adoptCast ? hooks.adoptCast(castId) : null;
    if (adopted) {
      if (Math.hypot(adopted.pos.x - x, adopted.pos.z - z) > 0.5) {
        adopted.pos.set(x, game.terrain ? game.terrain.heightAt(x, z) : 0, z);
        adopted.vel.set(0, 0, 0);
      }
      adopted.heading = heading;
      adopted.intent.gesture = null;
      adopted.intent.faceYaw = heading;
      adopted.ai = { mission: true, owner: run.owner, mode: 'idle' };
      run.people.push(adopted);
      return adopted;
    }
    const person = game.story && game.story.spawnCast ? game.story.spawnCast(castId, x, z, heading) : null;
    if (!person) return null;
    person.tags.mission = true;
    person.ai = { mission: true, owner: run.owner, mode: 'idle' };
    run.people.push(person);
    return person;
  }

  /** `count` armed people on free ground around (x, z), already fighting the player. */
  function spawnEnemies(count, options = {}) {
    ops.live();
    const cx = options.x || 0;
    const cz = options.z || 0;
    const spots = freeGroundAround(cx, cz, options.radius || 10, count);
    const player = game.player && game.player.character;
    const list = [];
    for (const spot of spots) {
      const heading = player ? Math.atan2(player.pos.x - spot.x, player.pos.z - spot.z) : 0;
      const person = spawnPerson({
        archetype: options.archetype || 'gang', kind: options.kind, faction: options.faction || 'gang', name: options.name,
        x: spot.x, z: spot.z, heading, weapon: options.weapon === undefined ? 'pistol' : options.weapon, ammo: options.ammo,
        health: options.health, armor: options.armor,
      });
      if (!person) continue;
      actors.hostile(person, { accuracy: options.accuracy === undefined ? 0.45 : options.accuracy, style: options.style || 'cover' });
      list.push(person);
    }
    return list;
  }

  /** Put a person in a seat at once (seat 0 drives). */
  function seat(vehicle, person, seatIndex = 0) {
    ops.live();
    if (!vehicle || !person || !game.characters) return;
    game.characters.enterVehicle(person, vehicle, seatIndex, { instant: true });
    if (seatIndex === 0 && vehicle.driver !== person) game.vehicles?.setDriver?.(vehicle, person);
  }

  /** Keep an entity in the world after the job ends. */
  function keep(entity) {
    if (entity) run.kept.add(entity);
    return entity;
  }

  /** Take an entity out of the world now. */
  function remove(entity) {
    if (!entity) return;
    actors.release(entity);
    if (entity.spec) despawnVehicle(entity);
    else despawnPerson(entity);
  }

  /** Give a person a weapon and put it in their hands. */
  function arm(person, weaponId, ammo) {
    if (!person || !weaponId) return;
    const rounds = ammo === undefined ? 90 : ammo;
    if (game.weapons && typeof game.weapons.give === 'function') game.weapons.give(person, weaponId, rounds);
    else if (!person.weapons.some((weapon) => weapon.id === weaponId)) person.weapons.push({ id: weaponId, ammo: rounds, clip: Math.min(rounds, 12) });
    const index = person.weapons.findIndex((weapon) => weapon.id === weaponId);
    if (index !== -1 && person.kind !== 'player') person.weaponIndex = index;
  }

  /**
   * The job has ended: people first, then vehicles. Kept things stay; the car the player sits in stays
   * (unless a save is being loaded); cast members near their own contact go back to standing there;
   * after a finished job, whatever is near the player is left to vanish once he has gone.
   */
  function clearAway(outcome, reason) {
    const player = game.player;
    const loading = reason === 'load';
    const playerVehicle = player ? player.vehicle : null;
    for (const person of run.people) {
      if (!person || person.despawned || (player && person === player.character)) continue;
      if (run.kept.has(person)) {
        person.tags.mission = false;
        person.ai = null;
        continue;
      }
      if (!loading && person.tags.castId && hooks.keepCast && hooks.keepCast(person)) continue;
      if (outcome === 'completed' && hooks.leftover && nearPlayer(person, 70)) {
        hooks.leftover(person);
        continue;
      }
      despawnPerson(person);
    }
    for (const vehicle of run.vehicles) {
      if (!vehicle || vehicle.despawned) continue;
      if (run.kept.has(vehicle) || (vehicle === playerVehicle && !loading)) {
        vehicle.tags.mission = false;
        vehicle.tags.invulnerable = false;
        vehicle.ai = null;
        continue;
      }
      if (outcome === 'completed' && hooks.leftover && nearPlayer(vehicle, 70)) {
        hooks.leftover(vehicle);
        continue;
      }
      despawnVehicle(vehicle);
    }
    run.people.length = 0;
    run.vehicles.length = 0;
  }

  /** Clear parked or driverless strangers off the spot a job vehicle is about to appear on. */
  function makeRoom(x, z, radius) {
    game.traffic?.clearArea?.(x, z, radius + 4);
    const vehicles = game.vehicles;
    if (!vehicles) return;
    for (let i = vehicles.list.length - 1; i >= 0; i -= 1) {
      const other = vehicles.list[i];
      if (other.tags.mission || other.tags.owned || other.isPlayer || other.driver) continue;
      if (game.traffic && typeof game.traffic.owns === 'function' && game.traffic.owns(other)) continue;
      if (Math.hypot(other.pos.x - x, other.pos.z - z) < radius) vehicles.despawn(other);
    }
  }

  /** Spots for people around a point: dry, clear of walls, cars and each other, not on top of the player. */
  function freeGroundAround(x, z, radius, count) {
    const spots = [];
    const colliders = game.colliders;
    const terrain = game.terrain;
    const player = game.player && game.player.character;
    for (let attempt = 0; attempt < count * 30 && spots.length < count; attempt += 1) {
      const relaxed = attempt > count * 20;
      const angle = attempt * 2.39996 + Math.random() * 0.6;
      const r = radius * Math.sqrt(Math.min(1, (attempt % 24 + 0.5) / 12)) * (relaxed ? 1.3 : 1);
      const px = x + Math.sin(angle) * r;
      const pz = z + Math.cos(angle) * r;
      if (terrain && terrain.isWater && terrain.isWater(px, pz)) continue;
      if (colliders && colliders.query(px, pz, 0.7, QUERY_OUT).length > 0) continue;
      if (game.vehicles && game.vehicles.nearest(px, pz, 2.8)) continue;
      if (!relaxed && player && Math.hypot(player.pos.x - px, player.pos.z - pz) < 6) continue;
      if (spots.some((spot) => Math.hypot(spot.x - px, spot.z - pz) < 1.6)) continue;
      spots.push({ x: px, z: pz });
    }
    while (spots.length < count) spots.push({ x: x + (spots.length % 3) * 1.8, z: z + Math.floor(spots.length / 3) * 1.8 });
    return spots;
  }

  function despawnPerson(person) {
    if (!person || person.despawned) return;
    game.weapons?.ai?.disengage?.(person);
    person.despawned = true;
    game.characters?.despawn?.(person);
  }

  function despawnVehicle(vehicle) {
    if (!vehicle || vehicle.despawned) return;
    const player = game.player;
    if (player && player.vehicle === vehicle) player.teleport(vehicle.pos.x, vehicle.pos.z, vehicle.heading);
    const occupants = (vehicle.passengers || []).slice();
    if (vehicle.driver) occupants.push(vehicle.driver);
    for (const occupant of occupants) if (occupant && !(player && occupant === player.character)) game.characters?.exitVehicle?.(occupant, { instant: true });
    game.vehicles?.despawn?.(vehicle);
  }

  function nearPlayer(entity, metres) {
    const player = game.player;
    if (!player || !player.character) return false;
    return Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) < metres;
  }

  return { spawnVehicle, spawnPerson, spawnCast, spawnEnemies, seat, keep, remove, arm, clearAway };
}

const KIND_FOR_ARCHETYPE = { gang: 'gang', officer: 'officer', swat: 'officer', crew: 'crew', player: 'crew' };
const QUERY_OUT = [];
