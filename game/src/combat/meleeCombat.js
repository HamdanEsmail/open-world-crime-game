// Fists and the Cedar Slugger: the moment a punch, kick or swing lands, whoever stands within reach in
// the 90 degree arc in front takes the blow and is shoved back; the third hit of a jab-cross-kick chain
// floors them, and so does every bat hit. A bat on a car leaves a dent. The body's own animation says
// when a blow lands ('melee:strike'); without it the blows are timed here.
import { meleeBlow } from './combatRules.js';

const CHAIN = ['jab', 'cross', 'kick'];
/** Half of the arc in front that a blow covers (radians): 90 degrees in all. */
const HALF_ARC = Math.PI / 4;
/** Own timing, used only when the character system does not animate the blows: wind-up, recovery. */
const FALLBACK_TIMING = { jab: [0.12, 0.24], cross: [0.15, 0.26], kick: [0.26, 0.34], bat: [0.28, 0.36] };
const COMBO_WINDOW = 0.45;

/**
 * Create the melee rules. `hooks.onHit(attacker, target, amount, weaponId)` lets the weapon system
 * keep its statistics.
 * @returns {{updateMelee: Function, strike: Function, reset: Function}}
 */
export function createMeleeCombat(game, grid, hooks = {}) {
  const nearby = [];
  const damageInfo = { source: null, weaponId: 'fists', dirX: 0, dirZ: 0, headshot: false, kind: 'melee' };
  const knockInfo = { source: null };
  const vehicleInfo = { source: null, kind: 'crash', x: 0, z: 0 };
  const soundOptions = { x: 0, y: 0, z: 0, volume: 1, pitch: 1 };
  const hitEvent = { attacker: null, target: null, weaponId: '', move: '', combo: 0, knockedDown: false, vehicle: null };

  /** True when the character system animates melee and tells us when each blow lands. */
  function bodyDrivesBlows() {
    const characters = game.characters;
    return !!characters && typeof characters.meleeDamage === 'boolean';
  }

  /**
   * One character's fists or bat for a frame. When the bodies animate melee this only makes sure the
   * blows are resolved here; otherwise it times the chain itself from presses of the trigger.
   */
  function updateMelee(character, arms, weapon, dt, pressed) {
    if (bodyDrivesBlows()) {
      if (game.characters.meleeDamage !== false) game.characters.meleeDamage = false;
      return;
    }
    let m = arms.melee;
    if (!m) {
      m = { move: null, timer: 0, struck: false, index: -1, window: 0, queued: false };
      arms.melee = m;
    }
    if (m.window > 0) m.window -= dt;
    if (!m.move) {
      if (pressed && canSwing(character)) begin(m, weapon);
      return;
    }
    if (pressed) m.queued = true;
    m.timer += dt;
    const timing = FALLBACK_TIMING[m.move];
    if (!m.struck && m.timer >= timing[0]) {
      m.struck = true;
      if (canSwing(character)) strike(character, m.move);
    }
    if (m.timer >= timing[0] + timing[1]) {
      m.move = null;
      m.window = COMBO_WINDOW;
      if (m.queued) begin(m, weapon);
    }
  }

  function begin(m, weapon) {
    if (weapon.id === 'bat') {
      m.move = 'bat';
    } else {
      m.index = m.window > 0 || m.queued ? (m.index + 1) % CHAIN.length : 0;
      m.move = CHAIN[m.index];
    }
    m.timer = 0;
    m.struck = false;
    m.queued = false;
  }

  /**
   * A blow lands now: the nearest person in the arc in front (two with the bat), or a car's panel.
   * `move` is 'jab' | 'cross' | 'kick' | 'bat'.
   */
  function strike(attacker, move) {
    if (!attacker || !attacker.pos || attacker.alive === false || attacker.vehicle) return;
    const blow = meleeBlow(move);
    const weaponId = move === 'bat' ? 'bat' : 'fists';
    const fx = Math.sin(attacker.heading);
    const fz = Math.cos(attacker.heading);
    const maxVictims = move === 'bat' ? 2 : 1;
    let landed = 0;
    grid.gatherNear(attacker.pos.x, attacker.pos.z, blow.reach + 1, nearby, grid.PEOPLE);
    for (let n = 0; n < maxVictims; n += 1) {
      let best = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < nearby.length; i += 1) {
        const person = nearby[i];
        if (!person || person === attacker || person.alive === false || person.vehicle) continue;
        const dx = person.pos.x - attacker.pos.x;
        const dz = person.pos.z - attacker.pos.z;
        const dy = person.pos.y - attacker.pos.y;
        if (dy > 1.3 || dy < -1.3) continue;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance > blow.reach + 0.35 || distance >= bestDistance) continue;
        if (distance > 0.3 && (dx * fx + dz * fz) / distance < Math.cos(HALF_ARC)) continue;
        best = i;
        bestDistance = distance;
      }
      if (best === -1) break;
      hitPerson(attacker, nearby[best], blow, move, weaponId, fx, fz);
      nearby[best] = null;
      landed += 1;
    }
    nearby.length = 0;
    if (landed === 0 && move === 'bat') hitVehiclePanel(attacker, blow, fx, fz);
    if (landed > 0 && isPlayer(attacker) && game.cameraRig) game.cameraRig.shake(move === 'bat' ? 0.24 : blow.knockDown ? 0.18 : 0.1);
  }

  function hitPerson(attacker, victim, blow, move, weaponId, fx, fz) {
    let dirX = victim.pos.x - attacker.pos.x;
    let dirZ = victim.pos.z - attacker.pos.z;
    const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (length > 0.05) {
      dirX /= length;
      dirZ /= length;
    } else {
      dirX = fx;
      dirZ = fz;
    }
    const characters = game.characters;
    damageInfo.source = attacker;
    damageInfo.weaponId = weaponId;
    damageInfo.dirX = dirX;
    damageInfo.dirZ = dirZ;
    if (characters && characters.damage) characters.damage(victim, blow.damage, damageInfo);
    damageInfo.source = null;
    if (hooks.onHit) hooks.onHit(attacker, victim, blow.damage, weaponId);
    if (victim.alive !== false && characters && characters.knockDown) {
      knockInfo.source = attacker;
      if (blow.knockDown) {
        const push = move === 'bat' ? 4.6 : 3.6;
        characters.knockDown(victim, dirX * push, move === 'bat' ? 2.4 : 1.8, dirZ * push, knockInfo);
      } else {
        // Under 3 m/s the body staggers back rather than falling: the shove of a punch.
        characters.knockDown(victim, dirX * 2.1, 0, dirZ * 2.1, knockInfo);
      }
      knockInfo.source = null;
    }
    // The thud itself is the audio system's, on 'character:damaged' with kind 'melee'.
    hitEvent.attacker = attacker;
    hitEvent.target = victim;
    hitEvent.weaponId = weaponId;
    hitEvent.move = move;
    hitEvent.combo = blow.combo;
    hitEvent.knockedDown = blow.knockDown;
    hitEvent.vehicle = null;
    game.events.emit('melee:landed', hitEvent);
  }

  /** A bat to the bodywork: a small dent, a clang, sparks, a nudge. */
  function hitVehiclePanel(attacker, blow, fx, fz) {
    const vehicles = game.vehicles;
    if (!vehicles) return;
    const px = attacker.pos.x + fx * blow.reach * 0.75;
    const pz = attacker.pos.z + fz * blow.reach * 0.75;
    grid.gatherNear(px, pz, 4, nearby, grid.VEHICLES);
    let struck = null;
    for (let i = 0; i < nearby.length; i += 1) {
      const vehicle = nearby[i];
      if (vehicle && vehicle !== attacker.vehicle && pointInVehicle(vehicle, px, pz, 0.4)) {
        struck = vehicle;
        break;
      }
    }
    nearby.length = 0;
    if (!struck) return;
    const bat = game.catalog.weaponById ? game.catalog.weaponById('bat') : null;
    const dent = blow.damage * (bat ? bat.vehicleDamage : 0.7);
    vehicleInfo.source = attacker;
    vehicleInfo.x = px;
    vehicleInfo.z = pz;
    vehicles.applyDamage(struck, dent, vehicleInfo);
    vehicleInfo.source = null;
    if (vehicles.applyImpulse) vehicles.applyImpulse(struck, fx * 420, fz * 420, px, pz);
    const y = struck.pos.y + Math.min(1.0, struck.spec.height * 0.6);
    soundOptions.x = px;
    soundOptions.y = y;
    soundOptions.z = pz;
    soundOptions.volume = 1;
    soundOptions.pitch = 1;
    game.audio?.play?.('metalClank', soundOptions);
    game.effects?.spawn?.('sparks', px, y, pz, null);
    if (isPlayer(attacker) && game.cameraRig) game.cameraRig.shake(0.2);
    hitEvent.attacker = attacker;
    hitEvent.target = null;
    hitEvent.weaponId = 'bat';
    hitEvent.move = 'bat';
    hitEvent.combo = 1;
    hitEvent.knockedDown = false;
    hitEvent.vehicle = struck;
    game.events.emit('melee:landed', hitEvent);
  }

  function canSwing(character) {
    if (character.vehicle || character.alive === false) return false;
    const state = character.state;
    return state !== 'ragdoll' && state !== 'getUp' && state !== 'dead' && state !== 'stumble' && state !== 'swim';
  }

  function isPlayer(character) {
    return !!(game.player && game.player.character === character);
  }

  /** Drop any self-timed swing in progress (weapon change, death). */
  function reset(arms) {
    if (arms && arms.melee) {
      arms.melee.move = null;
      arms.melee.queued = false;
    }
  }

  // The body's animation reports the instant each blow lands.
  game.events.on('melee:strike', (event) => {
    if (!event || !event.attacker || !bodyDrivesBlows()) return;
    if (game.characters.meleeDamage !== false) game.characters.meleeDamage = false;
    strike(event.attacker, event.move);
  });

  return { updateMelee, strike, reset };
}

/** Is the ground point (x, z) within `margin` of the vehicle's footprint? */
function pointInVehicle(vehicle, x, z, margin) {
  if (!vehicle.spec || !vehicle.pos) return false;
  const s = Math.sin(vehicle.heading);
  const c = Math.cos(vehicle.heading);
  const rx = x - vehicle.pos.x;
  const rz = z - vehicle.pos.z;
  const along = rx * s + rz * c;
  const across = rx * c - rz * s;
  return Math.abs(along) <= vehicle.spec.length * 0.5 + margin && Math.abs(across) <= vehicle.spec.width * 0.5 + margin;
}
