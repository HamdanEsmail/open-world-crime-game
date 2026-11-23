// Swift Camel Couriers: parcel runs in a Sahel Caravan van from the depot in Southgate. Each run is
// four to six doorstep drops across two or three districts against the clock; pull up at a drop's
// marker and the parcel is tossed onto the doorstep. Pay grows with the time left and how gently the
// van was driven. Three runs of rising difficulty, then daily runs for anyone who wants more.
import * as THREE from 'three';
import { courierPayForRun } from './activityRules.js';

const VAN_MODEL = 'sahel_caravan';
const COURIER_SAND = 0xe9b44c;

/** The three runs: where the parcels go, how many, how long they allow, what they pay. */
const COURIER_RUNS = [
  { name: 'Morning Round', districts: ['southgate', 'wadi'], drops: 4, pay: 420, metresPerSecond: 10.5, secondsPerDrop: 24, rep: 12 },
  { name: 'Souk Express', districts: ['oldsarab', 'lantern', 'wadi'], drops: 5, pay: 640, metresPerSecond: 12, secondsPerDrop: 17, rep: 18 },
  { name: 'Spire Rush', districts: ['spires', 'docks', 'marina'], drops: 6, pay: 900, metresPerSecond: 13.5, secondsPerDrop: 12, rep: 28 },
];
/** Seconds the player may leave the van before the run is lost. */
const OUT_OF_VAN_LIMIT = 20;
const PARCEL_POOL = 10;

/**
 * Build the courier job (game.activities.courier).
 * @returns {{id:string, runsDone:boolean[], startRun(index?:number):boolean, stop(reason:string):void, update(dt:number):void,
 *   serialize():Object, deserialize(data:Object):void, run:Object|null}}
 */
export function createCourierRuns(game, activities) {
  const depot = game.city.placesOfKind('courierDepot')[0] || null;
  const depotPose = depot ? activities.kerbPose(depot) : null;
  const runsDone = [false, false, false];
  const stats = { runs: 0, drops: 0, bestCare: 0, dailyRuns: 0 };
  let attempts = 0;
  let run = null;
  let depotVan = null;
  const parcels = createParcelToss(game);
  const card = {
    id: 'courier', title: '', giver: 'activity', kicker: 'COURIER', side: true,
    objectives: [],
    timer: { label: 'Time', seconds: 0 },
    counter: { label: 'Parcels', value: 0, of: 0 },
    courier: { delivered: 0, of: 0, care: 1 },
  };
  const clockTimer = card.timer;
  const outOfVanTimer = { label: 'Back in the van', seconds: OUT_OF_VAN_LIMIT };
  if (depot) {
    game.markers.add({ kind: 'activity', icon: 'courierDepot', owner: 'courierDepot', pos: { x: depotPose.x, y: 0, z: depotPose.z }, edge: false, color: 0xd8b07a, label: 'Swift Camel Couriers' });
  }
  let prompt = '';
  refreshPrompt();

  const module = {
    id: 'courier',
    runsDone,
    stats,
    startRun,
    stop,
    update,
    serialize,
    deserialize,
    get run() {
      return run;
    },
  };

  function update(dt) {
    parcels.update(dt);
    keepDepotVan();
    if (run) {
      updateRun(dt);
      return;
    }
    if (game.mode !== 'playing' || !depotPose) return;
    const van = activities.playerVehicle();
    if (!van || van.spec.id !== VAN_MODEL || Math.abs(van.speed) > 5 || !activities.canStart()) return;
    const dx = van.pos.x - depotPose.x;
    const dz = van.pos.z - depotPose.z;
    if (dx * dx + dz * dz > 30 * 30) return;
    if (activities.offer(22, 'E', prompt)) startRun();
  }

  /**
   * Load the van and set off. `index` picks one of the three runs; by default the first unfinished one,
   * or a daily run once all three are done.
   */
  function startRun(index) {
    const van = activities.playerVehicle();
    if (!van || !activities.canStart()) return false;
    const daily = runsDone.every(Boolean) && index === undefined;
    const runIndex = index !== undefined ? index : daily ? 2 : runsDone.indexOf(false);
    const template = COURIER_RUNS[Math.max(0, runIndex)];
    attempts += 1;
    const rng = game.rng.fork(`courier-${runIndex}-${attempts}`);
    const drops = chooseDrops(template, rng, van.pos.x, van.pos.z);
    if (drops.length === 0) return false;
    let length = 0;
    let fromX = van.pos.x;
    let fromZ = van.pos.z;
    for (const drop of drops) {
      length += game.roads.routeLength(game.roads.findRoute(fromX, fromZ, drop.x, drop.z));
      fromX = drop.x;
      fromZ = drop.z;
    }
    const limit = Math.round(length / template.metresPerSecond + drops.length * template.secondsPerDrop);
    run = {
      index: runIndex, daily, template, van, drops,
      timeLeft: limit, limit,
      delivered: 0,
      care: 1,
      outOfVan: 0,
      bumpCooldown: 0,
      title: daily ? `Swift Camel: Daily ${template.name}` : `Swift Camel: ${template.name}`,
    };
    card.title = run.title;
    card.objectives.length = 0;
    for (const drop of drops) {
      drop.objective = { text: drop.label, done: false };
      card.objectives.push(drop.objective);
      drop.marker = game.markers.add({ kind: 'objective', owner: 'courierRun', pos: { x: drop.x, y: 0, z: drop.z }, beacon: true, route: false, color: COURIER_SAND, radius: 3.5, label: drop.label });
    }
    clockTimer.seconds = limit;
    card.timer = clockTimer;
    card.counter.value = 0;
    card.counter.of = drops.length;
    card.courier.delivered = 0;
    card.courier.of = drops.length;
    card.courier.care = 1;
    routeToNearestDrop();
    activities.begin(module, card);
    activities.say('Swift Camel dispatch', `${drops.length} parcels, ${activities.clock(limit).replace(/\.\d+$/, '')} on the clock. Fragile means fragile.`, 3.6);
    return true;
  }

  function updateRun(dt) {
    const r = run;
    r.bumpCooldown -= dt;
    r.timeLeft -= dt;
    const van = r.van;
    if (van.wrecked || van.despawned) {
      loseRun('The van is wrecked and the parcels with it');
      return;
    }
    const driving = game.player && game.player.vehicle === van;
    if (!driving) {
      r.outOfVan += dt;
      outOfVanTimer.seconds = Math.max(0, OUT_OF_VAN_LIMIT - r.outOfVan);
      card.timer = outOfVanTimer;
      if (r.outOfVan > OUT_OF_VAN_LIMIT) {
        loseRun('You abandoned the van');
        return;
      }
    } else if (r.outOfVan > 0) {
      r.outOfVan = 0;
      card.timer = clockTimer;
    }
    clockTimer.seconds = Math.max(0, r.timeLeft);
    if (r.timeLeft <= 0) {
      loseRun('Out of time: the customers are furious');
      return;
    }
    if (!driving || Math.abs(van.speed) > 4) return;
    for (let i = 0; i < r.drops.length; i += 1) {
      const drop = r.drops[i];
      if (drop.done) continue;
      const dx = van.pos.x - drop.x;
      const dz = van.pos.z - drop.z;
      if (dx * dx + dz * dz < 7 * 7) {
        deliver(drop);
        return;
      }
    }
  }

  /** Toss the parcel onto the doorstep, tick the drop off, and send the GPS to the nearest one left. */
  function deliver(drop) {
    const r = run;
    drop.done = true;
    drop.objective.done = true;
    game.markers.remove(drop.marker);
    drop.marker = null;
    r.delivered += 1;
    stats.drops += 1;
    card.counter.value = r.delivered;
    card.courier.delivered = r.delivered;
    parcels.toss(r.van, drop.doorX, drop.doorZ);
    game.audio?.play?.('pickup');
    game.events.emit('courier:drop', { index: r.delivered, of: r.drops.length });
    if (r.delivered >= r.drops.length) {
      completeRun();
      return;
    }
    activities.toast(`Parcel delivered: ${r.drops.length - r.delivered} to go`, 'good');
    routeToNearestDrop();
  }

  function completeRun() {
    const r = run;
    const care = Math.max(0, Math.min(1, r.care * (0.5 + 0.5 * r.van.health / r.van.maxHealth)));
    const reward = courierPayForRun(r.timeLeft, 1 - care, r.template.pay * (r.daily ? 0.85 : 1));
    const rep = Math.round(r.template.rep * (0.6 + 0.4 * care));
    if (!r.daily) runsDone[r.index] = true;
    else stats.dailyRuns += 1;
    stats.runs += 1;
    stats.bestCare = Math.max(stats.bestCare, care);
    game.economy?.stats?.add?.('courierRuns', 1);
    cleanup();
    activities.complete(module, {
      title: r.title,
      reward,
      rep,
      detail: `${activities.clock(r.timeLeft).replace(/\.\d+$/, '')} to spare · ${Math.round(care * 100)}% care`,
    });
    if (!r.daily && runsDone.every(Boolean)) activities.toast('Every Swift Camel run done: daily runs open at the depot', 'good');
    refreshPrompt();
  }

  function loseRun(reason) {
    const r = run;
    const consolation = r.delivered * 25;
    cleanup();
    if (consolation > 0) game.economy?.addMoney?.(consolation, 'Courier: parcels delivered');
    activities.fail(module, reason);
  }

  /** Stopped from outside: drop the run without pay. */
  function stop() {
    if (run) cleanup();
  }

  function cleanup() {
    game.markers.removeByOwner('courierRun');
    run = null;
  }

  /** The GPS points at whichever undelivered drop is closest to the van. */
  function routeToNearestDrop() {
    const r = run;
    let best = null;
    let bestDistance = Infinity;
    for (const drop of r.drops) {
      if (drop.done) continue;
      if (drop.marker) {
        drop.marker.route = false;
        drop.marker.radius = 3.5;
      }
      const d = Math.hypot(drop.x - r.van.pos.x, drop.z - r.van.pos.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = drop;
      }
    }
    if (best && best.marker) {
      best.marker.route = true;
      best.marker.radius = 5;
    }
  }

  /** Bumps rattle the parcels: every hard knock costs some of the care bonus. */
  game.events.on('vehicle:collision', (event) => {
    const r = run;
    if (!r || event.vehicle !== r.van || r.bumpCooldown > 0) return;
    const hard = typeof event.speed === 'number' ? event.speed : 0;
    if (hard < 3) return;
    r.bumpCooldown = 1;
    r.care = Math.max(0, r.care - (hard > 9 ? 0.15 : 0.06));
    card.courier.care = r.care;
    if (hard > 6) activities.toast('Something in the back went crunch', 'bad');
  });

  /**
   * Pick the drops: kerbside doors in the run's districts, cycling through them, well apart from each
   * other, in the order a sensible driver would take them.
   */
  function chooseDrops(template, rng, startX, startZ) {
    const city = game.city;
    const blocksByDistrict = {};
    for (const district of template.districts) {
      blocksByDistrict[district] = city.blocks.filter((block) => block.district === district && !block.special && block.buildings.length > 0);
    }
    const chosen = [];
    for (let i = 0; i < template.drops; i += 1) {
      const district = template.districts[i % template.districts.length];
      const blocks = blocksByDistrict[district];
      if (!blocks || blocks.length === 0) continue;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const block = rng.pick(blocks);
        const drop = doorstepOf(block, rng.pick(['n', 's', 'e', 'w']), rng.range(0.25, 0.75));
        let clear = Math.hypot(drop.x - startX, drop.z - startZ) > 120;
        for (const other of chosen) if (Math.hypot(drop.x - other.x, drop.z - other.z) < 140) clear = false;
        if (!clear) continue;
        const street = city.streetNameAt(drop.x, drop.z);
        const districtName = city.districtById[district] ? city.districtById[district].name : district;
        drop.label = street ? `${street}, ${districtName}` : districtName;
        chosen.push(drop);
        break;
      }
    }
    // Nearest-first order from the depot.
    const ordered = [];
    let x = startX;
    let z = startZ;
    while (chosen.length > 0) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < chosen.length; i += 1) {
        const d = Math.hypot(chosen[i].x - x, chosen[i].z - z);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
        }
      }
      const next = chosen.splice(bestIndex, 1)[0];
      ordered.push(next);
      x = next.x;
      z = next.z;
    }
    return ordered;
  }

  /** The kerb point and the doorstep on one side of a block. */
  function doorstepOf(block, side, along) {
    const lot = block.lot;
    const sidewalk = game.city.roadKinds.street.sidewalk;
    const kerb = sidewalk + 2.2;
    const walk = sidewalk / 2;
    if (side === 'n' || side === 's') {
      const x = lot.x0 + (lot.x1 - lot.x0) * along;
      const edge = side === 'n' ? lot.z0 : lot.z1;
      const out = side === 'n' ? -1 : 1;
      return { x, z: edge + out * kerb, doorX: x, doorZ: edge + out * walk * 0.4, done: false };
    }
    const z = lot.z0 + (lot.z1 - lot.z0) * along;
    const edge = side === 'w' ? lot.x0 : lot.x1;
    const out = side === 'w' ? -1 : 1;
    return { x: edge + out * kerb, z, doorX: edge + out * walk * 0.4, doorZ: z, done: false };
  }

  /** A Sahel Caravan in Swift Camel colours waiting at the depot kerb whenever the player comes by. */
  function keepDepotVan() {
    if (!depotPose || !game.vehicles || (game.time.frame & 15) !== 7) return;
    const pos = game.player ? game.player.pos : null;
    if (!pos) return;
    const distance = Math.hypot(pos.x - depotPose.x, pos.z - depotPose.z);
    if (distance > 260 || distance < 9) return;
    if (depotVan && !depotVan.despawned && Math.hypot(depotVan.pos.x - depotPose.x, depotVan.pos.z - depotPose.z) < 25) return;
    const nearby = game.vehicles.nearest(depotPose.x, depotPose.z, 14);
    if (nearby && nearby.spec.id === VAN_MODEL) {
      depotVan = nearby;
      return;
    }
    if (nearby) return;
    depotVan = game.vehicles.spawn(VAN_MODEL, { x: depotPose.x, z: depotPose.z, heading: depotPose.heading, color: 0xd9b77a, parked: true });
    if (depotVan) depotVan.tags.depotVan = true;
  }

  function refreshPrompt() {
    const next = runsDone.indexOf(false);
    if (next === -1) {
      prompt = `Daily courier run: ${COURIER_RUNS[2].drops} drops, best pay in town`;
    } else {
      const template = COURIER_RUNS[next];
      prompt = `Courier run ${next + 1}/3: ${template.name} (${template.drops} drops)`;
    }
  }

  function serialize() {
    return { runsDone: runsDone.slice(), ...stats };
  }

  function deserialize(data) {
    stop();
    const saved = (data && data.runsDone) || [];
    for (let i = 0; i < runsDone.length; i += 1) runsDone[i] = Boolean(saved[i]);
    stats.runs = (data && data.runs) || 0;
    stats.drops = (data && data.drops) || 0;
    stats.bestCare = (data && data.bestCare) || 0;
    stats.dailyRuns = (data && data.dailyRuns) || 0;
    refreshPrompt();
  }

  return module;
}

/**
 * Parcels flying from the van's side door to a doorstep in a short arc, then sitting there for a while.
 * One instanced mesh of cardboard boxes with teal Swift Camel tape.
 */
function createParcelToss(game) {
  const geometry = buildParcelGeometry();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geometry, material, PARCEL_POOL);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'courier-parcels';
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < PARCEL_POOL; i += 1) mesh.setMatrixAt(i, hidden);
  mesh.count = PARCEL_POOL;
  game.scene.add(mesh);
  const slots = [];
  for (let i = 0; i < PARCEL_POOL; i += 1) slots.push({ active: false, settled: false, t: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, spin: 0, life: 0 });
  let cursor = 0;
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);

  /** Throw a parcel from `van` to (x, z). */
  function toss(van, x, z) {
    const slot = slots[cursor];
    cursor = (cursor + 1) % PARCEL_POOL;
    const side = Math.sign((x - van.pos.x) * -Math.cos(van.heading) + (z - van.pos.z) * Math.sin(van.heading)) || 1;
    slot.active = true;
    slot.settled = false;
    slot.t = 0;
    slot.life = 30;
    slot.ax = van.pos.x - Math.cos(van.heading) * side * 1.1;
    slot.az = van.pos.z + Math.sin(van.heading) * side * 1.1;
    slot.ay = van.pos.y + 1.3;
    slot.bx = x;
    slot.bz = z;
    slot.by = game.terrain ? game.terrain.heightAt(x, z) : 0;
    slot.spin = (Math.random() - 0.5) * 9;
  }

  function update(dt) {
    let changed = false;
    let flying = false;
    for (let i = 0; i < PARCEL_POOL; i += 1) {
      const slot = slots[i];
      if (!slot.active) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        mesh.setMatrixAt(i, hidden);
        changed = true;
        continue;
      }
      flying = true;
      if (slot.t >= 1 && slot.settled) continue;
      changed = true;
      slot.settled = slot.t >= 1;
      slot.t = Math.min(1, slot.t + dt / 0.7);
      const t = slot.t;
      position.set(
        slot.ax + (slot.bx - slot.ax) * t,
        slot.ay + (slot.by + 0.18 - slot.ay) * t + Math.sin(t * Math.PI) * 1.6,
        slot.az + (slot.bz - slot.az) * t,
      );
      euler.set(t < 1 ? t * slot.spin * 0.4 : 0, t * slot.spin, 0);
      rotation.setFromEuler(euler);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(i, matrix);
    }
    if (changed) mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = flying;
  }

  return { toss, update, mesh };
}

/** A cardboard box (0.55 x 0.36 x 0.42 m) with a band of teal tape round it, as one coloured geometry. */
function buildParcelGeometry() {
  const parts = [
    { geometry: new THREE.BoxGeometry(0.55, 0.36, 0.42), color: new THREE.Color(0xb98a52) },
    { geometry: new THREE.BoxGeometry(0.12, 0.37, 0.43), color: new THREE.Color(0x1ba39c) },
  ];
  const positions = [];
  const normals = [];
  const colors = [];
  for (const part of parts) {
    const geometry = part.geometry.toNonIndexed();
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i += 1) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(part.color.r, part.color.g, part.color.b);
    }
    geometry.dispose();
    part.geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return merged;
}
