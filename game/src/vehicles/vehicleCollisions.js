// Vehicles meeting the world: glancing off walls and buildings (and flattening the lamp posts, signs
// and hydrants that give way), shunting, ramming and spinning each other by mass and by where they
// are struck, which is what makes a police PIT work, and knocking down whoever steps in front of them.
import { crashDamageFromSpeed, propGivesWay, personHitDamage } from './drivingRules.js';

/**
 * Build the collision stage of the vehicle simulation.
 * @param {Object} game
 * @param {{applyDamage:Function, wake:Function, list:Object[]}} vehicles  the vehicle manager
 */
export function createVehicleCollisions(game, vehicles) {
  const contacts = [];
  const grid = createVehicleGrid();
  const nearby = new Int32Array(128);
  const corner = { x: 0, z: 0 };
  const pair = { overlap: 0, nx: 0, nz: 0, px: 0, pz: 0 };
  const touch = { nx: 0, nz: 0, depth: 0, vehicle: null };

  /**
   * The vehicle against the static world: push it out of what it overlaps, bounce it off with low
   * restitution, scrape it along with friction, and spin it by the lever of the contact. Breakable
   * props (lamp posts, signs, hydrants, bins, fences) give way to a fast or heavy car instead.
   */
  function resolveStaticCollisions(vehicle) {
    const colliders = game.colliders;
    if (!colliders || !colliders.boxContacts) return;
    const profile = vehicle.dynamics.profile;
    const pos = vehicle.pos;
    colliders.boxContacts(pos.x, pos.z, profile.halfWidth, profile.halfLength, vehicle.heading,
      pos.y + 0.18, pos.y + profile.height, contacts);
    if (contacts.length === 0) return;
    const sinH = Math.sin(vehicle.heading);
    const cosH = Math.cos(vehicle.heading);
    const cgX = pos.x + sinH * profile.cgOffset;
    const cgZ = pos.z + cosH * profile.cgOffset;
    const invMass = profile.invMass;
    const invInertia = 1 / profile.collisionYawInertia;
    const vel = vehicle.vel;
    let yawRate = vehicle.yawRate;
    let pushX = 0;
    let pushZ = 0;
    let hardest = 0;
    let hardestImpulse = 0;
    let hardestContact = null;
    for (let k = 0; k < contacts.length; k += 1) {
      const c = contacts[k];
      const collider = c.collider;
      if (!collider || collider.removed) continue;
      const rx = c.px - cgX;
      const rz = c.pz - cgZ;
      const pointVx = vel.x + yawRate * rz;
      const pointVz = vel.z - yawRate * rx;
      const normalSpeed = pointVx * c.nx + pointVz * c.nz;
      if (collider.breakable && propGivesWay(-normalSpeed, profile.mass)) {
        knockOverProp(vehicle, collider, c, -normalSpeed);
        continue;
      }
      // Push out, counting what earlier contacts along the same direction already did.
      const done = pushX * c.nx + pushZ * c.nz;
      if (c.depth > done) {
        pushX += c.nx * (c.depth - done);
        pushZ += c.nz * (c.depth - done);
      }
      if (normalSpeed >= 0) continue;
      const armN = rz * c.nx - rx * c.nz;
      const impulse = (-(1 + WALL_RESTITUTION) * normalSpeed) / (invMass + armN * armN * invInertia);
      vel.x += c.nx * impulse * invMass;
      vel.z += c.nz * impulse * invMass;
      yawRate += armN * impulse * invInertia;
      // Scrape along the wall.
      const tx = -c.nz;
      const tz = c.nx;
      const slideSpeed = (vel.x + yawRate * rz) * tx + (vel.z - yawRate * rx) * tz;
      const armT = rz * tx - rx * tz;
      let friction = -slideSpeed / (invMass + armT * armT * invInertia);
      const limit = WALL_FRICTION * impulse;
      if (friction > limit) friction = limit;
      else if (friction < -limit) friction = -limit;
      vel.x += tx * friction * invMass;
      vel.z += tz * friction * invMass;
      yawRate += armT * friction * invInertia;
      if (-normalSpeed > hardest) {
        hardest = -normalSpeed;
        hardestImpulse = impulse;
        hardestContact = c;
      }
    }
    pos.x += pushX;
    pos.z += pushZ;
    vehicle.yawRate = yawRate;
    vehicle.speed = vel.x * sinH + vel.z * cosH;
    if (hardestContact && hardest > IMPACT_SPEED) {
      // One impact per call, judged by the real closing speed of the hardest contact (never by
      // how deep it was pushed out, nor by how many posts it touched at once).
      crash(vehicle, null, hardestContact.collider, hardest, hardestImpulse, hardest,
        hardestContact.px, pos.y + 0.6, hardestContact.pz, hardestContact.nx, hardestContact.nz, true);
    }
  }

  /** A lamp post or sign that gave way: it falls, the car carries on with a little less speed. */
  function knockOverProp(vehicle, collider, contact, closing) {
    const profile = vehicle.dynamics.profile;
    if (game.colliders.remove) game.colliders.remove(collider);
    // Only a small loss of speed: the prop folds, the car carries on.
    const loss = Math.min(0.12, 70 / profile.mass);
    vehicle.vel.x *= 1 - loss;
    vehicle.vel.z *= 1 - loss;
    vehicle.yawRate += (Math.random() - 0.5) * 0.3;
    game.events.emit('prop:broken', {
      collider, x: contact.px, z: contact.pz, vehicle, speed: closing, vx: vehicle.vel.x, vz: vehicle.vel.z,
    });
    crash(vehicle, null, collider, 0, closing * 60, closing, contact.px, vehicle.pos.y + 0.6, contact.pz, contact.nx, contact.nz, true);
  }

  /**
   * Every pair of vehicles whose boxes overlap: an oriented-box separating-axis test after a grid
   * broad phase, then impulses by mass at the point of contact (straight and spinning), friction,
   * and a push apart shared by mass. A bus shrugs off a compact; a hit on the rear quarter spins it.
   */
  function resolveVehicleCollisions(list) {
    grid.build(list);
    for (let a = 0; a < list.length; a += 1) {
      const va = list[a];
      const count = grid.neighboursOf(a, list, nearby);
      for (let k = 0; k < count; k += 1) {
        const vb = list[nearby[k]];
        if (!vb || (va.dynamics.sleeping && vb.dynamics.sleeping)) continue;
        if (overlapBoxes(va, vb, pair)) collidePair(va, vb, pair);
      }
    }
  }

  function collidePair(a, b, hit) {
    const pa = a.dynamics.profile;
    const pb = b.dynamics.profile;
    const sinA = Math.sin(a.heading);
    const cosA = Math.cos(a.heading);
    const sinB = Math.sin(b.heading);
    const cosB = Math.cos(b.heading);
    const rax = hit.px - (a.pos.x + sinA * pa.cgOffset);
    const raz = hit.pz - (a.pos.z + cosA * pa.cgOffset);
    const rbx = hit.px - (b.pos.x + sinB * pb.cgOffset);
    const rbz = hit.pz - (b.pos.z + cosB * pb.cgOffset);
    const nx = hit.nx;
    const nz = hit.nz;
    const invMa = pa.invMass;
    const invMb = pb.invMass;
    const invIa = 1 / pa.collisionYawInertia;
    const invIb = 1 / pb.collisionYawInertia;

    // Separate them, the lighter one moving more.
    const correction = Math.max(0, hit.overlap - 0.01) * 0.85;
    const shareA = invMa / (invMa + invMb);
    a.pos.x += nx * correction * shareA;
    a.pos.z += nz * correction * shareA;
    b.pos.x -= nx * correction * (1 - shareA);
    b.pos.z -= nz * correction * (1 - shareA);

    let relVx = a.vel.x + a.yawRate * raz - (b.vel.x + b.yawRate * rbz);
    let relVz = a.vel.z - a.yawRate * rax - (b.vel.z - b.yawRate * rbx);
    const closing = -(relVx * nx + relVz * nz);
    if (closing <= 0) return;
    const armA = raz * nx - rax * nz;
    const armB = rbz * nx - rbx * nz;
    const impulse = ((1 + CAR_RESTITUTION) * closing) / (invMa + invMb + armA * armA * invIa + armB * armB * invIb);
    a.vel.x += nx * impulse * invMa;
    a.vel.z += nz * impulse * invMa;
    a.yawRate += armA * impulse * invIa;
    b.vel.x -= nx * impulse * invMb;
    b.vel.z -= nz * impulse * invMb;
    b.yawRate -= armB * impulse * invIb;
    // Friction across the contact: side-swipes drag and twist.
    const tx = -nz;
    const tz = nx;
    relVx = a.vel.x + a.yawRate * raz - (b.vel.x + b.yawRate * rbz);
    relVz = a.vel.z - a.yawRate * rax - (b.vel.z - b.yawRate * rbx);
    const slide = relVx * tx + relVz * tz;
    const armTa = raz * tx - rax * tz;
    const armTb = rbz * tx - rbx * tz;
    let friction = -slide / (invMa + invMb + armTa * armTa * invIa + armTb * armTb * invIb);
    const limit = CAR_FRICTION * impulse;
    if (friction > limit) friction = limit;
    else if (friction < -limit) friction = -limit;
    a.vel.x += tx * friction * invMa;
    a.vel.z += tz * friction * invMa;
    a.yawRate += armTa * friction * invIa;
    b.vel.x -= tx * friction * invMb;
    b.vel.z -= tz * friction * invMb;
    b.yawRate -= armTb * friction * invIb;

    if (a.dynamics.sleeping) vehicles.wake(a);
    if (b.dynamics.sleeping) vehicles.wake(b);
    // A hit that sets a car turning is allowed to spin it: the driving assists stand aside briefly.
    if (Math.abs(armA * impulse * invIa) > 0.25) a.dynamics.spinFreedom = SPIN_FREEDOM;
    if (Math.abs(armB * impulse * invIb) > 0.25) b.dynamics.spinFreedom = SPIN_FREEDOM;
    if (closing > IMPACT_SPEED) {
      // One event per crash, told from the side of the faster vehicle (the one doing the ramming).
      const aFaster = a.vel.lengthSq() >= b.vel.lengthSq();
      const hitter = aFaster ? a : b;
      const struck = aFaster ? b : a;
      const sign = aFaster ? 1 : -1;
      // Each car's share of the closing speed goes by the other's mass: a bus shrugs off a compact.
      const y = Math.max(a.pos.y, b.pos.y) + 0.6;
      const hitterShare = aFaster ? shareA : 1 - shareA;
      crash(hitter, struck, struck, closing * hitterShare, impulse, closing, hit.px, y, hit.pz, nx * sign, nz * sign, true);
      crash(struck, hitter, hitter, closing * (1 - hitterShare), impulse, closing, hit.px, y, hit.pz, -nx * sign, -nz * sign, false);
    }
  }

  /**
   * Oriented boxes a and b on the ground plane: false when apart, else true with the overlap, the
   * normal (from b toward a) and the contact point written into `out`.
   */
  function overlapBoxes(a, b, out) {
    const pa = a.dynamics.profile;
    const pb = b.dynamics.profile;
    if (a.pos.y + pa.height < b.pos.y + 0.15 || b.pos.y + pb.height < a.pos.y + 0.15) return false;
    const dx = a.pos.x - b.pos.x;
    const dz = a.pos.z - b.pos.z;
    const reach = pa.halfLength + pa.halfWidth + pb.halfLength + pb.halfWidth;
    if (dx * dx + dz * dz > reach * reach) return false;
    const sa = Math.sin(a.heading);
    const ca = Math.cos(a.heading);
    const sb = Math.sin(b.heading);
    const cb = Math.cos(b.heading);
    let best = Infinity;
    let bestAxis = -1;
    let ux = 0;
    let uz = 0;
    for (let axis = 0; axis < 4; axis += 1) {
      if (axis === 0) { ux = sa; uz = ca; } else if (axis === 1) { ux = ca; uz = -sa; } else if (axis === 2) { ux = sb; uz = cb; } else { ux = cb; uz = -sb; }
      const radiusA = pa.halfLength * Math.abs(sa * ux + ca * uz) + pa.halfWidth * Math.abs(ca * ux - sa * uz);
      const radiusB = pb.halfLength * Math.abs(sb * ux + cb * uz) + pb.halfWidth * Math.abs(cb * ux - sb * uz);
      const overlap = radiusA + radiusB - Math.abs(dx * ux + dz * uz);
      if (overlap <= 0) return false;
      if (overlap < best) {
        best = overlap;
        bestAxis = axis;
      }
    }
    if (bestAxis === 0) { ux = sa; uz = ca; } else if (bestAxis === 1) { ux = ca; uz = -sa; } else if (bestAxis === 2) { ux = sb; uz = cb; } else { ux = cb; uz = -sb; }
    if (dx * ux + dz * uz < 0) {
      ux = -ux;
      uz = -uz;
    }
    out.overlap = best;
    out.nx = ux;
    out.nz = uz;
    // The contact: the corner of one box pushed deepest into the other (two corners on a flat hit).
    if (bestAxis < 2) deepestCorners(b, pb, ux, uz, 1, out);
    else deepestCorners(a, pa, ux, uz, -1, out);
    return true;
  }

  /** Average of the corners of `v` lying furthest along (direction * sign). */
  function deepestCorners(v, profile, nx, nz, sign, out) {
    const s = Math.sin(v.heading);
    const c = Math.cos(v.heading);
    let most = -Infinity;
    for (let k = 0; k < 4; k += 1) {
      cornerOf(v, profile, s, c, k);
      const d = (corner.x * nx + corner.z * nz) * sign;
      if (d > most) most = d;
    }
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (let k = 0; k < 4; k += 1) {
      cornerOf(v, profile, s, c, k);
      if ((corner.x * nx + corner.z * nz) * sign >= most - 0.08) {
        sumX += corner.x;
        sumZ += corner.z;
        count += 1;
      }
    }
    out.px = sumX / count;
    out.pz = sumZ / count;
  }

  function cornerOf(v, profile, s, c, k) {
    const f = k < 2 ? profile.halfLength : -profile.halfLength;
    const l = (k & 1) === 0 ? profile.halfWidth : -profile.halfWidth;
    corner.x = v.pos.x + s * f + c * l;
    corner.z = v.pos.z + c * f - s * l;
  }

  /**
   * People on foot against vehicles: a car faster than walking pace knocks them down and launches
   * them; slower, it nudges them aside, and a creeping car is held back by someone standing in front.
   */
  function resolveCharacterCollisions(list, now) {
    const characters = game.characters;
    if (!characters || !characters.list || list.length === 0) return;
    const people = characters.list;
    for (let i = 0; i < people.length; i += 1) {
      const person = people[i];
      if (!person || person.vehicle || person.alive === false) continue;
      const state = person.state;
      if (state === 'dead' || state === 'ragdoll' || state === 'enterVehicle' || state === 'exitVehicle' || state === 'driving' || state === 'passenger') continue;
      const count = grid.vehiclesNear(person.pos.x, person.pos.z, PERSON_RADIUS, list, nearby);
      for (let k = 0; k < count; k += 1) {
        const vehicle = list[nearby[k]];
        if (!circleAgainstVehicle(vehicle, person.pos.x, person.pos.y, person.pos.z, PERSON_RADIUS, touch)) continue;
        strikePerson(vehicle, person, touch, now);
      }
    }
  }

  function strikePerson(vehicle, person, contact, now) {
    const profile = vehicle.dynamics.profile;
    const sinH = Math.sin(vehicle.heading);
    const cosH = Math.cos(vehicle.heading);
    const rx = person.pos.x - (vehicle.pos.x + sinH * profile.cgOffset);
    const rz = person.pos.z - (vehicle.pos.z + cosH * profile.cgOffset);
    const pointVx = vehicle.vel.x + vehicle.yawRate * rz;
    const pointVz = vehicle.vel.z - vehicle.yawRate * rx;
    const personVn = person.vel ? person.vel.x * contact.nx + person.vel.z * contact.nz : 0;
    const closing = pointVx * contact.nx + pointVz * contact.nz - personVn;
    const characters = game.characters;
    const hurt = personHitDamage(closing);
    if (hurt > 0) {
      if (recentlyHit(vehicle, person, now, 1.2)) return;
      const launchUp = Math.min(7.5, 1.6 + 0.17 * closing);
      const vx = pointVx * 0.85 + contact.nx * 1.5;
      const vz = pointVz * 0.85 + contact.nz * 1.5;
      const source = vehicle.driver || null;
      if (characters.knockDown) characters.knockDown(person, vx, launchUp, vz, { source });
      if (characters.damage) {
        characters.damage(person, hurt, { source, kind: 'vehicle', dirX: contact.nx, dirZ: contact.nz });
      }
      // The car loses a little speed to the body it hit.
      const loss = (PERSON_MASS * closing) / (profile.mass + PERSON_MASS);
      vehicle.vel.x -= contact.nx * loss;
      vehicle.vel.z -= contact.nz * loss;
      game.events.emit('vehicle:hitCharacter', { vehicle, character: person, speed: closing });
      return;
    }
    // Walking pace: the person is shoved aside; a car barely moving is held back by them.
    const moving = Math.abs(vehicle.speed) > 0.2 || vehicle.vel.y * vehicle.vel.y > 0.04;
    const personShare = moving ? 0.6 : 1;
    person.pos.x += contact.nx * contact.depth * personShare;
    person.pos.z += contact.nz * contact.depth * personShare;
    if (moving) {
      vehicle.pos.x -= contact.nx * contact.depth * (1 - personShare);
      vehicle.pos.z -= contact.nz * contact.depth * (1 - personShare);
      const into = vehicle.vel.x * contact.nx + vehicle.vel.z * contact.nz;
      if (into > 0) {
        vehicle.vel.x -= contact.nx * into;
        vehicle.vel.z -= contact.nz * into;
      }
    }
  }

  /** Remember a struck person for a moment so one hit is not counted every frame. */
  function recentlyHit(vehicle, person, now, cooldown) {
    const dyn = vehicle.dynamics;
    const ring = dyn.struckPeople;
    for (let k = 0; k < ring.length; k += 2) {
      if (ring[k] === person.id && now - ring[k + 1] < cooldown) return true;
    }
    ring[dyn.struckCursor] = person.id;
    ring[dyn.struckCursor + 1] = now;
    dyn.struckCursor = (dyn.struckCursor + 2) % ring.length;
    return false;
  }

  /**
   * Circle (x, z, radius, at height y) against a vehicle's box. Fills `out` with the normal from the
   * vehicle toward the circle and the depth.
   */
  function circleAgainstVehicle(vehicle, x, y, z, radius, out) {
    const profile = vehicle.dynamics.profile;
    if (y < vehicle.pos.y - 0.6 || y > vehicle.pos.y + profile.height) return false;
    const s = Math.sin(vehicle.heading);
    const c = Math.cos(vehicle.heading);
    const dx = x - vehicle.pos.x;
    const dz = z - vehicle.pos.z;
    const lf = dx * s + dz * c;
    const ll = dx * c - dz * s;
    const hl = profile.halfLength;
    const hw = profile.halfWidth;
    if (lf > hl + radius || lf < -hl - radius || ll > hw + radius || ll < -hw - radius) return false;
    const qf = lf < -hl ? -hl : lf > hl ? hl : lf;
    const ql = ll < -hw ? -hw : ll > hw ? hw : ll;
    const df = lf - qf;
    const dl = ll - ql;
    const d2 = df * df + dl * dl;
    if (d2 >= radius * radius) return false;
    let nf;
    let nl;
    let depth;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      nf = df / d;
      nl = dl / d;
      depth = radius - d;
    } else {
      // Inside the box: leave through the nearest side.
      const toEnd = hl - Math.abs(lf);
      const toSide = hw - Math.abs(ll);
      if (toEnd < toSide) {
        nf = lf >= 0 ? 1 : -1;
        nl = 0;
        depth = toEnd + radius;
      } else {
        nf = 0;
        nl = ll >= 0 ? 1 : -1;
        depth = toSide + radius;
      }
    }
    out.nx = s * nf + c * nl;
    out.nz = c * nf - s * nl;
    out.depth = depth;
    out.vehicle = vehicle;
    return true;
  }

  /**
   * Move `pos` (x, z) out of any vehicle a circle of `radius` between heights y0..y1 overlaps; for
   * people walking into parked cars. Returns {nx, nz, depth, vehicle} (reused) or null.
   */
  function pushOutCircle(pos, radius, y0, y1, list) {
    let found = null;
    const y = (y0 + y1) * 0.5;
    const count = grid.vehiclesNear(pos.x, pos.z, radius, list, nearby);
    for (let k = 0; k < count; k += 1) {
      if (!circleAgainstVehicle(list[nearby[k]], pos.x, y, pos.z, radius, touch)) continue;
      pos.x += touch.nx * touch.depth;
      pos.z += touch.nz * touch.depth;
      found = touch;
    }
    return found;
  }

  /**
   * One impact between a vehicle and one thing (a wall, a post, the ground, another car): the
   * 'vehicle:collision' event (when `announce`) and damage from `severity`, the speed (m/s) at which
   * this vehicle met it along the contact normal. Every touch of the same thing within
   * EVENT_COOLDOWN counts as the same impact: a harder follow-up only adds the difference, so a car
   * leaning on a palm or wedged between posts is never hurt again and again.
   */
  function crash(vehicle, other, key, severity, impulse, speed, x, y, z, nx, nz, announce) {
    const dyn = vehicle.dynamics;
    const now = game.time ? game.time.elapsed : 0;
    const harm = crashDamageFromSpeed(severity, vehicle.maxHealth);
    const ring = dyn.impactKeys;
    let slot = -1;
    for (let k = 0; k < ring.length; k += 1) {
      if (ring[k] === key && now - dyn.impactTimes[k] < EVENT_COOLDOWN) {
        slot = k;
        break;
      }
    }
    let dealt = harm;
    let fresh = true;
    if (slot >= 0) {
      dealt = harm > dyn.impactDamage[slot] ? harm - dyn.impactDamage[slot] : 0;
      if (harm > dyn.impactDamage[slot]) dyn.impactDamage[slot] = harm;
      fresh = impulse >= dyn.impactSizes[slot] * 2;
      if (fresh) dyn.impactSizes[slot] = impulse;
    } else {
      slot = dyn.impactCursor;
      ring[slot] = key;
      dyn.impactTimes[slot] = now;
      dyn.impactSizes[slot] = impulse;
      dyn.impactDamage[slot] = harm;
      dyn.impactCursor = (slot + 1) % ring.length;
    }
    if (fresh && announce) {
      dyn.lastImpactTime = now;
      const collider = other ? null : key === GROUND_KEY ? null : key;
      game.events.emit('vehicle:collision', { vehicle, other, collider, impulse, speed, x, y, z, nx, nz });
    }
    if (dealt > 0) {
      const source = other && other.driver ? other.driver : null;
      vehicles.applyDamage(vehicle, dealt, { kind: 'crash', source, other });
    }
  }

  /** Report a sheer face of ground the car drove into, gathered during the physics step. */
  function reportTerrainImpact(vehicle, speed) {
    if (speed <= IMPACT_SPEED) return;
    crash(vehicle, null, GROUND_KEY, speed, speed * vehicle.dynamics.profile.mass, speed, vehicle.pos.x, vehicle.pos.y + 0.5,
      vehicle.pos.z, -Math.sin(vehicle.heading), -Math.cos(vehicle.heading), true);
  }

  return {
    resolveStaticCollisions,
    resolveVehicleCollisions,
    resolveCharacterCollisions,
    reportTerrainImpact,
    pushOutCircle,
    circleAgainstVehicle,
    grid,
  };
}

/**
 * A uniform grid over the ground for the broad phase: each vehicle is filed under every 8 m cell its
 * box touches (hashed into a fixed table, no allocation per frame).
 */
export function createVehicleGrid() {
  let capacity = 256;
  const heads = new Int32Array(GRID_BUCKETS);
  let next = new Int32Array(capacity);
  let items = new Int32Array(capacity);
  let marks = new Uint32Array(capacity);
  let stamp = 1;
  let used = 0;
  let built = 0;
  const cellRange = { x0: 0, x1: 0, z0: 0, z1: 0 };

  function build(list) {
    heads.fill(-1);
    used = 0;
    built = list.length;
    if (marks.length < list.length) marks = new Uint32Array(list.length * 2);
    for (let i = 0; i < list.length; i += 1) {
      rangeOfVehicle(list[i], cellRange);
      for (let cx = cellRange.x0; cx <= cellRange.x1; cx += 1) {
        for (let cz = cellRange.z0; cz <= cellRange.z1; cz += 1) insert(bucketOf(cx, cz), i);
      }
    }
  }

  function insert(bucket, index) {
    if (used === capacity) {
      capacity *= 2;
      const grownNext = new Int32Array(capacity);
      grownNext.set(next);
      next = grownNext;
      const grownItems = new Int32Array(capacity);
      grownItems.set(items);
      items = grownItems;
    }
    items[used] = index;
    next[used] = heads[bucket];
    heads[bucket] = used;
    used += 1;
  }

  /** Fill `out` with every vehicle index j > i that shares a cell with vehicle i; returns the count. */
  function neighboursOf(i, list, out) {
    if (i >= built) return 0;
    rangeOfVehicle(list[i], cellRange);
    return gather(cellRange.x0, cellRange.x1, cellRange.z0, cellRange.z1, i, list.length, out);
  }

  /** Fill `out` with every vehicle index filed near the circle (x, z, radius); returns the count. */
  function vehiclesNear(x, z, radius, list, out) {
    if (built === 0) return 0;
    return gather(Math.floor((x - radius) / GRID_CELL), Math.floor((x + radius) / GRID_CELL),
      Math.floor((z - radius) / GRID_CELL), Math.floor((z + radius) / GRID_CELL), -1, list.length, out);
  }

  function gather(x0, x1, z0, z1, after, length, out) {
    stamp += 1;
    let count = 0;
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        for (let e = heads[bucketOf(cx, cz)]; e !== -1; e = next[e]) {
          const j = items[e];
          if (j <= after || j >= built || j >= length || marks[j] === stamp) continue;
          marks[j] = stamp;
          if (count < out.length) {
            out[count] = j;
            count += 1;
          }
        }
      }
    }
    return count;
  }

  return { build, neighboursOf, vehiclesNear };
}

function rangeOfVehicle(vehicle, out) {
  const profile = vehicle.dynamics.profile;
  const s = Math.abs(Math.sin(vehicle.heading));
  const c = Math.abs(Math.cos(vehicle.heading));
  const ex = s * profile.halfLength + c * profile.halfWidth;
  const ez = c * profile.halfLength + s * profile.halfWidth;
  out.x0 = Math.floor((vehicle.pos.x - ex) / GRID_CELL);
  out.x1 = Math.floor((vehicle.pos.x + ex) / GRID_CELL);
  out.z0 = Math.floor((vehicle.pos.z - ez) / GRID_CELL);
  out.z1 = Math.floor((vehicle.pos.z + ez) / GRID_CELL);
}

function bucketOf(cx, cz) {
  return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & (GRID_BUCKETS - 1);
}

/** Bounce off a wall: low, so cars thud and scrape rather than ping-pong. */
const WALL_RESTITUTION = 0.12;
const WALL_FRICTION = 0.3;
const CAR_RESTITUTION = 0.2;
const CAR_FRICTION = 0.4;
/** Closing speed (m/s) that counts as a real impact worth an event. */
const IMPACT_SPEED = 1.5;
/** Seconds within which touches of the same thing are one impact (one event, one damage). */
const EVENT_COOLDOWN = 0.3;
/** Stands in for the ground itself (a sheer face of terrain) in the impact memory. */
const GROUND_KEY = { ground: true };
const PERSON_RADIUS = 0.35;
const PERSON_MASS = 80;
/** Seconds after a spinning hit during which a car's slide is not caught by the driving assists. */
const SPIN_FREEDOM = 1.5;
/** The broad-phase grid: cell size (m) and hash table size (a power of two). */
const GRID_CELL = 8;
const GRID_BUCKETS = 512;
