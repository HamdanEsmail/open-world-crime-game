// Things lying around Port Sarab to be picked up: guns, ammunition, first-aid cases, body armour and
// cash, each a small icon spinning and bobbing over a soft glowing ring. Twenty-five are placed for
// good (armour at the police yards and the docks, first aid by the food stalls and the hospitals,
// guns in back lots and at the desert landmarks) and come back five minutes after they are taken;
// the fallen drop their guns and loose cash, which lie for two minutes. Two draw calls for all of it.
import * as THREE from 'three';
import { ICON_SHAPE, RING_COLORS, buildPickupIconGeometry, buildGlowRingTexture, selectIconPerInstance } from './pickupIconShapes.js';

const MAX_PICKUPS = 128;
const COLLECT_RADIUS = 1.3;
const COLLECT_RADIUS_DRIVING = 2.4;
const RESPAWN_SECONDS = 300;
const DROPPED_LIFETIME = 120;
const DRAW_DISTANCE = 170;
/** A pickup shows on the minimap only within this distance of the player (and hides beyond BLIP_LEAVE). */
const BLIP_RANGE = 120;
const BLIP_LEAVE = 130;
const HEALTH_AMOUNT = 50;
const ARMOR_AMOUNT = 100;

/**
 * Create the pickups, place the fixed ones and start listening for deaths.
 * `arsenal` is the weapon system's {give, current, catalog} used when a weapon or ammo is taken.
 * @returns {{drop: Function, update: Function, list: Object[], activeCount: number, clearDropped: Function}}
 */
export function createWeaponPickups(game, arsenal) {
  const pool = [];
  for (let i = 0; i < MAX_PICKUPS; i += 1) pool.push(makeRecord());
  const icons = createIconMeshes(game);
  const collectedEvent = { kind: '', weaponId: null, amount: 0, x: 0, z: 0 };
  const soundOptions = { x: 0, y: 0, z: 0, volume: 1 };
  let spin = 0;

  const pickups = {
    list: pool,
    drop,
    update,
    clearDropped,
    get activeCount() {
      let n = 0;
      for (let i = 0; i < pool.length; i += 1) if (pool[i].active) n += 1;
      return n;
    },
  };

  /**
   * Put a pickup on the ground at (x, z). kind 'weapon' {weaponId, amount: rounds}, 'ammo' {weaponId?,
   * amount}, 'health' {amount}, 'armor' {amount}, 'cash' {amount}. options.fixed makes it come back
   * five minutes after it is taken; otherwise it vanishes after two minutes. Returns the record or null.
   */
  function drop(kind, x, z, options = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !RING_COLORS[kind]) return null;
    let record = null;
    for (let i = 0; i < pool.length; i += 1) {
      if (!pool[i].active && !pool[i].fixed) {
        record = pool[i];
        break;
      }
    }
    if (!record) record = oldestDropped();
    if (!record) return null;
    const spec = options.weaponId ? arsenal.catalog(options.weaponId) : null;
    if (kind === 'weapon' && !spec) return null;
    record.active = true;
    record.kind = kind;
    record.weaponId = spec ? spec.id : null;
    record.amount = amountFor(kind, spec, options.amount);
    record.x = x;
    record.z = z;
    record.y = game.terrain ? game.terrain.heightAt(x, z) : 0;
    record.fixed = !!options.fixed;
    record.respawnAt = 0;
    record.expiresAt = record.fixed ? Infinity : game.time.elapsed + DROPPED_LIFETIME;
    record.phase = Math.random() * Math.PI * 2;
    record.shape = shapeFor(kind, spec);
    record.ringColor = RING_COLORS[kind];
    record.label = labelFor(kind, spec);
    hideBlip(record);
    return record;
  }

  /** A minimap blip for a pickup the player has come near (never pinned to the minimap's rim). */
  function showBlip(record) {
    if (record.marker || !game.markers) return;
    record.blipPos.x = record.x;
    record.blipPos.y = record.y;
    record.blipPos.z = record.z;
    record.marker = game.markers.add({ kind: 'pickup', pos: record.blipPos, label: record.label, color: record.ringColor, edge: false });
  }

  function hideBlip(record) {
    if (!record.marker) return;
    if (game.markers) game.markers.remove(record.marker);
    record.marker = null;
  }

  /** Spin, bob and glow what is near the camera; collect what the player touches; respawn and expire. */
  function update(dt) {
    const now = game.time.elapsed;
    spin += dt;
    const player = game.player;
    const character = player && player.character;
    const canCollect = character && character.alive !== false && player.state !== 'down' && game.mode === 'playing';
    const px = canCollect ? player.pos.x : 0;
    const pz = canCollect ? player.pos.z : 0;
    const py = canCollect ? player.pos.y : 0;
    const reach = player && player.vehicle ? COLLECT_RADIUS_DRIVING : COLLECT_RADIUS;
    // Blips only for what is near: shown inside BLIP_RANGE, hidden again a little further out.
    const hasPlayer = !!character;
    const bx = hasPlayer ? player.pos.x : 0;
    const bz = hasPlayer ? player.pos.z : 0;

    for (let i = 0; i < pool.length; i += 1) {
      const record = pool[i];
      if (!record.active) {
        if (record.marker) hideBlip(record);
        if (record.fixed && record.respawnAt > 0 && now >= record.respawnAt) respawn(record);
        continue;
      }
      if (now >= record.expiresAt) {
        record.active = false;
        hideBlip(record);
        continue;
      }
      if (hasPlayer) {
        const ex = record.x - bx;
        const ez = record.z - bz;
        const d2 = ex * ex + ez * ez;
        if (!record.marker && d2 < BLIP_RANGE * BLIP_RANGE) showBlip(record);
        else if (record.marker && d2 > BLIP_LEAVE * BLIP_LEAVE) hideBlip(record);
      } else if (record.marker) {
        hideBlip(record);
      }
      if (canCollect) {
        const dx = record.x - px;
        const dz = record.z - pz;
        if (dx * dx + dz * dz < reach * reach && Math.abs(record.y - py) < 2.4) tryCollect(record, character);
      }
    }
    icons.draw(pool, spin, game.camera.position, DRAW_DISTANCE);
  }

  /** The player takes a pickup if it does them any good. */
  function tryCollect(record, character) {
    let text = '';
    let amount = record.amount;
    let sound = 'pickup';
    let tone = 'good';
    if (record.kind === 'weapon') {
      const had = hasWeapon(character, record.weaponId);
      arsenal.give(character, record.weaponId, amount);
      text = had ? `${record.label} ammo  +${amount}` : `Picked up the ${record.label}`;
    } else if (record.kind === 'ammo') {
      const slot = ammoSlot(character, record.weaponId);
      if (!slot) return;
      const spec = arsenal.catalog(slot.id);
      amount = record.weaponId === slot.id ? amount : Math.max(spec.clipSize, Math.round(spec.startAmmo * 0.5));
      slot.ammo += amount;
      text = `${spec.name} ammo  +${amount}`;
    } else if (record.kind === 'health') {
      if (character.health >= character.maxHealth) return;
      const before = character.health;
      character.health = Math.min(character.maxHealth, character.health + amount);
      amount = Math.round(character.health - before);
      text = `First aid  +${amount} health`;
    } else if (record.kind === 'armor') {
      const most = (game.config.player && game.config.player.maxArmor) || 100;
      if ((character.armor || 0) >= most) return;
      const before = character.armor || 0;
      character.armor = Math.min(most, before + amount);
      amount = Math.round(character.armor - before);
      text = `Body armour  +${amount}`;
    } else if (record.kind === 'cash') {
      // The wallet's 'money:changed' rings the till; without a wallet, ring it here.
      if (game.economy && game.economy.addMoney) {
        game.economy.addMoney(amount, 'Found cash');
        sound = null;
      } else {
        sound = 'cash';
      }
      text = `+$${amount}`;
      tone = 'cash';
    }
    record.active = false;
    hideBlip(record);
    if (record.fixed) record.respawnAt = game.time.elapsed + RESPAWN_SECONDS;
    soundOptions.x = record.x;
    soundOptions.y = record.y + 0.8;
    soundOptions.z = record.z;
    if (sound) game.audio?.play?.(sound, soundOptions);
    collectedEvent.kind = record.kind;
    collectedEvent.weaponId = record.weaponId;
    collectedEvent.amount = amount;
    collectedEvent.x = record.x;
    collectedEvent.z = record.z;
    game.events.emit('pickup:collected', collectedEvent);
    game.events.emit('notify', { text, kind: tone });
  }

  function respawn(record) {
    record.active = true;
    record.respawnAt = 0;
    record.phase = Math.random() * Math.PI * 2;
  }

  /** The fallen let go of their gun, and sometimes of some cash. */
  function onCharacterDied(event) {
    const character = event && event.character;
    if (!character || !character.pos) return;
    if (game.player && character === game.player.character) return;
    const index = character.weaponIndex;
    const weapons = character.weapons;
    if (weapons && index >= 0 && index < weapons.length) {
      const held = weapons[index];
      const spec = arsenal.catalog(held.id);
      if (spec) {
        const reserve = Number.isFinite(held.ammo) ? held.ammo : spec.startAmmo;
        const rounds = spec.melee ? 0 : Math.max(spec.clipSize, Math.min(spec.startAmmo, (held.clip || 0) + Math.round(reserve * 0.5)));
        const angle = Math.random() * Math.PI * 2;
        drop('weapon', character.pos.x + Math.sin(angle) * 0.7, character.pos.z + Math.cos(angle) * 0.7, { weaponId: spec.id, amount: rounds });
        character.weaponIndex = -1;
      }
    }
    const kind = character.kind;
    const chance = kind === 'gang' ? 0.7 : kind === 'civilian' ? 0.35 : kind === 'target' ? 0.9 : 0;
    if (Math.random() < chance) {
      const amount = kind === 'gang' ? 20 + Math.round(Math.random() * 70) : kind === 'target' ? 150 + Math.round(Math.random() * 250) : 5 + Math.round(Math.random() * 35);
      const angle = Math.random() * Math.PI * 2;
      drop('cash', character.pos.x + Math.sin(angle) * 0.9, character.pos.z + Math.cos(angle) * 0.9, { amount });
    }
  }

  /** Take every dropped pickup off the street (a loaded game). */
  function clearDropped() {
    for (let i = 0; i < pool.length; i += 1) {
      if (pool[i].fixed) continue;
      pool[i].active = false;
      hideBlip(pool[i]);
    }
  }

  function oldestDropped() {
    let oldest = null;
    for (let i = 0; i < pool.length; i += 1) {
      const record = pool[i];
      if (record.fixed || !record.active) continue;
      if (!oldest || record.expiresAt < oldest.expiresAt) oldest = record;
    }
    return oldest;
  }

  function hasWeapon(character, id) {
    const weapons = character.weapons;
    for (let i = 0; i < weapons.length; i += 1) if (weapons[i].id === id) return true;
    return false;
  }

  /** The carried gun a box of ammunition goes to: its own weapon, else the gun in hand, else any gun. */
  function ammoSlot(character, weaponId) {
    const weapons = character.weapons;
    let fallback = null;
    for (let i = 0; i < weapons.length; i += 1) {
      const spec = arsenal.catalog(weapons[i].id);
      if (!spec || spec.melee) continue;
      if (weapons[i].id === weaponId) return weapons[i];
      if (i === character.weaponIndex || !fallback) fallback = weapons[i];
    }
    return fallback;
  }

  function amountFor(kind, spec, amount) {
    if (Number.isFinite(amount) && amount > 0) return Math.round(amount);
    if (kind === 'weapon') return spec.melee ? 0 : spec.startAmmo;
    if (kind === 'ammo') return spec ? spec.ammoBox : 30;
    if (kind === 'health') return HEALTH_AMOUNT;
    if (kind === 'armor') return ARMOR_AMOUNT;
    return 50;
  }

  function labelFor(kind, spec) {
    if (kind === 'weapon') return spec.name;
    if (kind === 'ammo') return spec ? `${spec.name} ammo` : 'Ammunition';
    if (kind === 'health') return 'First aid';
    if (kind === 'armor') return 'Body armour';
    return 'Cash';
  }

  game.events.on('character:died', onCharacterDied);
  placeFixedPickups(game, drop);
  return pickups;
}

/** One pooled pickup. */
function makeRecord() {
  return {
    active: false, kind: '', weaponId: null, amount: 0, x: 0, y: 0, z: 0, fixed: false,
    respawnAt: 0, expiresAt: 0, phase: 0, shape: 0, ringColor: 0xffffff, label: '', marker: null, blipPos: { x: 0, y: 0, z: 0 },
  };
}

function shapeFor(kind, spec) {
  if (kind === 'weapon') return ICON_SHAPE[spec.id] !== undefined ? ICON_SHAPE[spec.id] : ICON_SHAPE.pistol;
  return ICON_SHAPE[kind] !== undefined ? ICON_SHAPE[kind] : ICON_SHAPE.ammo;
}

/**
 * The two instanced meshes: the icons (one geometry holding every icon, each instance showing its own)
 * and the additive glow rings on the ground.
 */
function createIconMeshes(game) {
  const iconGeometry = buildPickupIconGeometry();
  const shapeAttribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PICKUPS), 1);
  shapeAttribute.setUsage(THREE.DynamicDrawUsage);
  iconGeometry.setAttribute('instanceShape', shapeAttribute);
  const iconMaterial = selectIconPerInstance(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a4220 }));
  const iconMesh = new THREE.InstancedMesh(iconGeometry, iconMaterial, MAX_PICKUPS);
  iconMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  iconMesh.frustumCulled = false;
  iconMesh.count = 0;
  iconMesh.name = 'combat-pickup-icons';

  const ringGeometry = new THREE.PlaneGeometry(1, 1);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({
    map: buildGlowRingTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const ringMesh = new THREE.InstancedMesh(ringGeometry, ringMaterial, MAX_PICKUPS);
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ringMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  ringMesh.frustumCulled = false;
  ringMesh.count = 0;
  ringMesh.renderOrder = 2;
  ringMesh.name = 'combat-pickup-rings';
  game.scene.add(iconMesh, ringMesh);

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  /** Write the visible pickups into the instance buffers. */
  function draw(pool, time, camera, distance) {
    let n = 0;
    const limit = distance * distance;
    for (let i = 0; i < pool.length; i += 1) {
      const record = pool[i];
      if (!record.active) continue;
      const dx = record.x - camera.x;
      const dz = record.z - camera.z;
      if (dx * dx + dz * dz > limit) continue;
      const t = time + record.phase;
      const weapon = record.kind === 'weapon';
      // Guns lie tilted as they turn; boxes stand upright.
      euler.set(weapon ? 0.25 : 0, t * 1.7, weapon ? 0.35 : 0, 'YXZ');
      rotation.setFromEuler(euler);
      position.set(record.x, record.y + 0.78 + Math.sin(t * 2.3) * 0.1, record.z);
      const size = weapon ? 1.9 : 1.8;
      scale.set(size, size, size);
      matrix.compose(position, rotation, scale);
      iconMesh.setMatrixAt(n, matrix);
      shapeAttribute.array[n] = record.shape;

      const pulse = 1.55 + Math.sin(t * 3.1) * 0.12;
      rotation.identity();
      position.set(record.x, record.y + 0.06, record.z);
      scale.set(pulse, 1, pulse);
      matrix.compose(position, rotation, scale);
      ringMesh.setMatrixAt(n, matrix);
      color.setHex(record.ringColor);
      ringMesh.setColorAt(n, color);
      n += 1;
    }
    iconMesh.count = n;
    ringMesh.count = n;
    if (n > 0) {
      iconMesh.instanceMatrix.needsUpdate = true;
      ringMesh.instanceMatrix.needsUpdate = true;
      if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
      shapeAttribute.needsUpdate = true;
    }
  }

  return { draw, iconMesh, ringMesh };
}

/**
 * The twenty-five pickups that are always somewhere in Port Sarab, placed the same way every game
 * (game.rng.fork('pickups')), never inside a building.
 */
function placeFixedPickups(game, drop) {
  const city = game.city;
  if (!city || !city.openLots) return;
  const rng = game.rng.fork('pickups');
  const lots = city.openLots;
  const lotsWhere = (test) => lots.filter(test);
  const put = (kind, spot, options) => {
    if (spot) drop(kind, spot.x, spot.z, { fixed: true, ...options });
  };

  // Body armour: the police yards and the docks' container and truck yards.
  const policeYards = lotsWhere((lot) => lot.use === 'policeYard');
  const dockYards = rng.shuffle(lotsWhere((lot) => lot.district === 'docks' && (lot.use === 'containerYard' || lot.use === 'truckYard')));
  for (let i = 0; i < Math.min(2, policeYards.length); i += 1) put('armor', spotInLot(game, policeYards[i], rng), {});
  for (let i = 0; i < Math.min(3, dockYards.length); i += 1) put('armor', spotInLot(game, dockYards[i], rng), {});

  // First aid: by the food stalls and outside the hospitals.
  const food = city.places.filter((place) => place.kind === 'food').slice(0, 4);
  const hospitals = city.places.filter((place) => place.kind === 'hospital').slice(0, 2);
  for (const place of food.concat(hospitals)) put('health', spotNearPlace(game, place, rng), {});

  // Guns in Southgate's back lots, the docks and out at the desert landmarks.
  const southgate = rng.shuffle(lotsWhere((lot) => lot.district === 'southgate'));
  const southgateGuns = ['pistol', 'shotgun', 'smg', 'bat'];
  for (let i = 0; i < Math.min(southgateGuns.length, southgate.length); i += 1) {
    put('weapon', spotInLot(game, southgate[i], rng), { weaponId: southgateGuns[i] });
  }
  const dockGuns = ['smg', 'rifle'];
  for (let i = 0; i < dockGuns.length && 3 + i < dockYards.length; i += 1) {
    put('weapon', spotInLot(game, dockYards[3 + i], rng), { weaponId: dockGuns[i] });
  }
  const desertGuns = [['falconRock', 'marksman'], ['shipwreck', 'shotgun'], ['airfieldHangar', 'rifle'], ['oasis', 'pistol']];
  for (const [id, weaponId] of desertGuns) {
    const landmark = city.landmarks.find((mark) => mark.id === id);
    if (landmark) put('weapon', spotNearLandmark(game, landmark, rng), { weaponId });
  }

  // Ammunition and cash where the city's rougher trade happens.
  for (let i = 4; i < Math.min(6, southgate.length); i += 1) put('ammo', spotInLot(game, southgate[i], rng), {});
  const flats = rng.shuffle(lotsWhere((lot) => lot.district === 'wadi'));
  if (flats.length) put('ammo', spotInLot(game, flats[0], rng), {});
  const market = rng.shuffle(lotsWhere((lot) => lot.district === 'oldsarab' || lot.district === 'lantern'));
  for (let i = 0; i < Math.min(2, market.length); i += 1) put('cash', spotInLot(game, market[i], rng), { amount: 150 + rng.int(0, 6) * 25 });
}

/** A clear point well inside an open lot, or null. */
function spotInLot(game, lot, rng) {
  if (!lot) return null;
  const inset = 3;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const x = lot.x0 + inset + (lot.x1 - lot.x0 - inset * 2) * rng.next();
    const z = lot.z0 + inset + (lot.z1 - lot.z0 - inset * 2) * rng.next();
    if (isClearGround(game, x, z)) return { x, z };
  }
  return null;
}

/** A clear point on the pavement in front of a place (a food stall's counter, a hospital's door). */
function spotNearPlace(game, place, rng) {
  const baseX = Number.isFinite(place.curbX) ? (place.x + place.curbX) / 2 : place.x;
  const baseZ = Number.isFinite(place.curbZ) ? (place.z + place.curbZ) / 2 : place.z;
  for (let ring = 0; ring < 4; ring += 1) {
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2 + rng.next() * 0.4;
      const reach = ring * 2.2;
      const x = baseX + Math.sin(angle) * reach;
      const z = baseZ + Math.cos(angle) * reach;
      if (isClearGround(game, x, z)) return { x, z };
      if (ring === 0) break;
    }
  }
  return null;
}

/** A clear point on dry ground just outside a landmark's footprint. */
function spotNearLandmark(game, landmark, rng) {
  const size = landmark.radius || Math.max(landmark.w || 10, landmark.d || 10) * 0.5;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const angle = rng.next() * Math.PI * 2;
    const reach = size + 4 + rng.next() * 6;
    const x = landmark.x + Math.sin(angle) * reach;
    const z = landmark.z + Math.cos(angle) * reach;
    if (isClearGround(game, x, z)) return { x, z };
  }
  return null;
}

const _nearby = [];
/** Nothing static stands on (x, z) within a metre, and it is not in the sea. */
function isClearGround(game, x, z) {
  if (game.terrain && game.terrain.isWater && game.terrain.isWater(x, z)) return false;
  const colliders = game.colliders;
  if (!colliders) return true;
  colliders.query(x, z, 1.0, _nearby);
  for (let i = 0; i < _nearby.length; i += 1) {
    const c = _nearby[i];
    if (c.type === 'post') {
      if (Math.hypot(x - c.x, z - c.z) < c.radius + 1.0) return false;
    } else if (x > c.minX - 1.0 && x < c.maxX + 1.0 && z > c.minZ - 1.0 && z < c.maxZ + 1.0) {
      return false;
    }
  }
  return true;
}
