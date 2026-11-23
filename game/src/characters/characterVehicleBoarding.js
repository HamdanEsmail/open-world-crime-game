// Getting in and out of Port Sarab's cars: where each seat and door sits on every model, running to the
// door, dragging out whoever is in the seat, climbing in (reach, duck, sit), riding along with the car's
// pitch and roll, and stepping out beside the right door at a free spot, or being thrown out at speed.
// Seat 0 is the driver at the front left (+X in model space), 1 front right, 2 and 3 behind them.
import * as THREE from 'three';

/** Seconds the moves take. */
export const BOARDING_TIMES = { enter: 0.75, jackPull: 0.4, exit: 0.6, approachGiveUp: 3.5 };

/**
 * Start climbing into `vehicle` at `seat`. With `instant` the person is seated at once; otherwise
 * they run to the door first. Reserves the seat on both sides straight away.
 */
export function beginBoarding(character, body, vehicle, seat, instant, api) {
  const boarding = body.boarding || createBoardingState();
  body.boarding = boarding;
  boarding.vehicle = vehicle;
  boarding.seat = seat;
  boarding.doorSide = seat % 2 === 0 ? 1 : -1;
  boarding.u = 0;
  boarding.time = 0;
  boarding.jacked = false;
  character.vehicle = vehicle;
  character.seat = seat;
  claimSeat(vehicle, character, seat, api);
  body.wheel = wheelFor(vehicle.spec);
  if (instant) {
    boarding.phase = 'seated';
    boarding.u = 1;
    body.mode = 'seated';
    followSeat(character, body, vehicle, seat, api.rig(body));
    return;
  }
  doorWorld(vehicle, seat, boarding.door);
  const dx = boarding.door.x - character.pos.x;
  const dz = boarding.door.z - character.pos.z;
  boarding.phase = dx * dx + dz * dz > 0.16 ? 'approach' : 'enter';
  if (boarding.phase === 'enter') startEntering(character, body, api);
}

/** Start getting out. options.thrown (or a fast-moving car) throws the person out as a ragdoll. */
export function beginExit(character, body, options, api) {
  const boarding = body.boarding;
  const vehicle = character.vehicle;
  if (!vehicle) return false;
  const seat = character.seat;
  releaseSeat(vehicle, character, api);
  character.vehicle = null;
  const speed = Math.sqrt(vehicle.vel ? vehicle.vel.x * vehicle.vel.x + vehicle.vel.z * vehicle.vel.z : 0);
  const side = seat % 2 === 0 ? 1 : -1;
  if (options.thrown || options.jacked || speed > 6 || options.instant) {
    const outX = Math.cos(vehicle.heading) * side;
    const outZ = -Math.sin(vehicle.heading) * side;
    if (options.instant && !options.thrown && !options.jacked) {
      placeAtDoor(character, body, vehicle, seat, api);
      body.mode = 'foot';
      if (boarding) boarding.phase = null;
      return true;
    }
    const push = options.jacked ? 2.4 : 3 + speed * 0.15;
    if (boarding) boarding.phase = null;
    seatWorld(vehicle, seat, api.rig(body), _seatPoint);
    character.pos.set(_seatPoint.x + outX * 0.6, vehicle.pos.y, _seatPoint.z + outZ * 0.6);
    character.vel.set(vehicle.vel ? vehicle.vel.x : 0, 0, vehicle.vel ? vehicle.vel.z : 0);
    api.throwOut(character, outX * push, options.jacked ? 1.2 : 2 + speed * 0.05, outZ * push, options);
    return true;
  }
  if (!boarding) return false;
  boarding.vehicle = vehicle;
  boarding.seat = seat;
  boarding.doorSide = side;
  boarding.phase = 'exit';
  boarding.u = 0;
  boarding.time = 0;
  findExitSpot(vehicle, seat, api.game, boarding.exitSpot);
  body.mode = 'unboarding';
  return true;
}

/**
 * Run the boarding phases for one person; returns the phase ('approach', 'enter', 'seated', 'exit')
 * or null when there is nothing to do. Keeps character.pos, heading and vel glued to the car.
 */
export function updateBoarding(character, body, dt, api) {
  const boarding = body.boarding;
  if (!boarding || !boarding.phase) return null;
  const vehicle = boarding.vehicle;
  if (!vehicle || vehicle.removed || (api.isGone && api.isGone(vehicle))) {
    abandon(character, body, api);
    return null;
  }
  const rig = api.rig(body);
  boarding.time += dt;
  if (boarding.phase === 'approach') {
    doorWorld(vehicle, boarding.seat, boarding.door);
    const dx = boarding.door.x - character.pos.x;
    const dz = boarding.door.z - character.pos.z;
    const near = dx * dx + dz * dz < 0.12;
    body.motion.autoTargetX = boarding.door.x;
    body.motion.autoTargetZ = boarding.door.z;
    body.motion.autoTarget = !near;
    if (near || boarding.time > BOARDING_TIMES.approachGiveUp) {
      body.motion.autoTarget = false;
      startEntering(character, body, api);
    }
    return boarding.phase;
  }
  if (boarding.phase === 'enter') {
    const duration = BOARDING_TIMES.enter + (boarding.jacked ? BOARDING_TIMES.jackPull : 0);
    boarding.u = Math.min(1, boarding.time / duration);
    const u = boarding.jacked ? Math.max(0, (boarding.time - BOARDING_TIMES.jackPull) / BOARDING_TIMES.enter) : boarding.u;
    blendFrames(character, body, vehicle, boarding, smooth(clamp((u - 0.18) / 0.62, 0, 1)), rig, true);
    boarding.poseU = boarding.jacked && boarding.time < BOARDING_TIMES.jackPull ? 0.12 : u;
    if (boarding.u >= 1) {
      boarding.phase = 'seated';
      body.mode = 'seated';
    }
    return boarding.phase;
  }
  if (boarding.phase === 'seated') {
    body.mode = 'seated';
    followSeat(character, body, vehicle, boarding.seat, rig);
    return boarding.phase;
  }
  if (boarding.phase === 'exit') {
    boarding.u = Math.min(1, boarding.time / BOARDING_TIMES.exit);
    blendFrames(character, body, vehicle, boarding, 1 - smooth(clamp(boarding.u / 0.8, 0, 1)), rig, false);
    boarding.poseU = 1 - boarding.u;
    if (boarding.u >= 1) {
      character.pos.set(boarding.exitSpot.x, api.groundAt(boarding.exitSpot.x, boarding.exitSpot.z), boarding.exitSpot.z);
      character.heading = boarding.exitHeading;
      character.vel.set(0, 0, 0);
      boarding.phase = null;
      body.mode = 'foot';
      api.exited(character, vehicle);
      return null;
    }
    return boarding.phase;
  }
  return boarding.phase;
}

/** Model-space hip point of a seat (x left, y up from the wheels' contact plane, z forward). */
export function seatLocal(spec, seat, out) {
  const width = spec.width || 1.8;
  const length = spec.length || 4.5;
  const height = spec.height || 1.45;
  const wheelbase = spec.wheelbase || length * 0.6;
  const cab = CAB_FORWARD[spec.className];
  const tall = cab ? 0.36 : 0.3;
  const frontZ = cab ? wheelbase * 0.5 + 0.25 : (spec.seats || 4) <= 2 ? -length * 0.07 : -length * 0.03;
  const rear = seat >= 2;
  const z = rear ? frontZ - Math.min(0.92, length * 0.2) : frontZ;
  const x = (seat % 2 === 0 ? 1 : -1) * width * (spec.className === 'buggy' ? 0.2 : 0.23);
  const y = clamp(height * tall, 0.33, 1.3);
  return out.set(x, y, z);
}

/** Model-space point where a person stands to open the door of `seat`. */
export function doorLocal(spec, seat, out) {
  seatLocal(spec, seat, out);
  const side = seat % 2 === 0 ? 1 : -1;
  return out.set(side * ((spec.width || 1.8) * 0.5 + 0.42), 0, out.z + 0.22);
}

/** World matrix of a vehicle from its position, heading, pitch and roll. */
export function vehicleMatrix(vehicle, out) {
  _euler.set(vehicle.pitch || 0, vehicle.heading || 0, vehicle.roll || 0, 'YXZ');
  _quat.setFromEuler(_euler);
  return out.compose(vehicle.pos, _quat, _one);
}

/** World position of a seat's hip point. */
export function seatWorld(vehicle, seat, rig, out) {
  seatLocal(vehicle.spec || {}, seat, out);
  vehicleMatrix(vehicle, _matrix);
  return out.applyMatrix4(_matrix);
}

/** World position of the standing point outside a door (on the vehicle's ground plane). */
export function doorWorld(vehicle, seat, out) {
  doorLocal(vehicle.spec || {}, seat, out);
  const c = Math.cos(vehicle.heading || 0);
  const s = Math.sin(vehicle.heading || 0);
  const x = out.x;
  const z = out.z;
  return out.set(vehicle.pos.x + x * c + z * s, vehicle.pos.y, vehicle.pos.z - x * s + z * c);
}

/** Seat 0 goes through game.vehicles.setDriver when it exists; the rest join vehicle.passengers. */
function claimSeat(vehicle, character, seat, api) {
  if (seat === 0) {
    const vehicles = api.game.vehicles;
    if (vehicles && typeof vehicles.setDriver === 'function') {
      try { vehicles.setDriver(vehicle, character); } catch (error) { /* keep going with the field */ }
    }
    vehicle.driver = character;
  } else {
    if (!Array.isArray(vehicle.passengers)) vehicle.passengers = [];
    if (vehicle.passengers.indexOf(character) === -1) vehicle.passengers.push(character);
  }
}

function releaseSeat(vehicle, character, api) {
  if (vehicle.driver === character) {
    const vehicles = api.game.vehicles;
    if (vehicles && typeof vehicles.setDriver === 'function') {
      try { vehicles.setDriver(vehicle, null); } catch (error) { /* keep going with the field */ }
    }
    vehicle.driver = null;
  }
  if (Array.isArray(vehicle.passengers)) {
    const index = vehicle.passengers.indexOf(character);
    if (index !== -1) vehicle.passengers.splice(index, 1);
  }
}

/** The seat is reached: drag out whoever is in it, then begin the climb. */
function startEntering(character, body, api) {
  const boarding = body.boarding;
  const vehicle = boarding.vehicle;
  const occupant = occupantOf(vehicle, boarding.seat, character);
  if (occupant) {
    boarding.jacked = true;
    api.exitVehicle(occupant, { jacked: true, by: character });
    claimSeat(vehicle, character, boarding.seat, api);
    api.emit('character:jacked', { character: occupant, by: character, vehicle });
  }
  boarding.phase = 'enter';
  boarding.time = 0;
  boarding.u = 0;
  boarding.startX = character.pos.x;
  boarding.startZ = character.pos.z;
  body.mode = 'boarding';
}

function occupantOf(vehicle, seat, except) {
  if (seat === 0) return vehicle.driver && vehicle.driver !== except && vehicle.driver.alive !== false ? vehicle.driver : null;
  const list = vehicle.passengers || [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] !== except && list[i].seat === seat && list[i].vehicle === vehicle) return list[i];
  }
  return null;
}

/** Seated: the body frame is the seat; the person's position, heading and velocity are the car's. */
function followSeat(character, body, vehicle, seat, rig) {
  seatFloorMatrix(vehicle, seat, rig, body.base);
  seatWorld(vehicle, seat, rig, _seatPoint);
  character.pos.set(_seatPoint.x, vehicle.pos.y, _seatPoint.z);
  character.heading = vehicle.heading;
  if (vehicle.vel) character.vel.copy(vehicle.vel);
  character.grounded = true;
}

/** The seat's frame dropped by the hip height, so a zero root offset puts the pelvis on the seat. */
function seatFloorMatrix(vehicle, seat, rig, out) {
  seatLocal(vehicle.spec || {}, seat, _local);
  _local.y -= rig.hipHeight;
  vehicleMatrix(vehicle, _matrix);
  _offset.makeTranslation(_local.x, _local.y, _local.z);
  return out.multiplyMatrices(_matrix, _offset);
}

/**
 * Blend the body frame between standing at the door (facing the car, s = 0) and sitting in the seat
 * (s = 1); entering starts from where the person actually stood.
 */
function blendFrames(character, body, vehicle, boarding, s, rig, entering) {
  doorWorld(vehicle, boarding.seat, _door);
  if (entering && boarding.startX !== undefined) {
    const settle = smooth(clamp(boarding.u * 4, 0, 1));
    _door.x = boarding.startX + (_door.x - boarding.startX) * settle;
    _door.z = boarding.startZ + (_door.z - boarding.startZ) * settle;
  }
  if (!entering) {
    const out = smooth(clamp((boarding.u - 0.35) / 0.65, 0, 1));
    _door.x += (boarding.exitSpot.x - _door.x) * out;
    _door.z += (boarding.exitSpot.z - _door.z) * out;
  }
  seatFloorMatrix(vehicle, boarding.seat, rig, _seatFrame);
  _seatFrame.decompose(_seatPos, _seatQuat, _scale);
  const side = boarding.doorSide;
  boarding.exitHeading = vehicle.heading + side * 0.65;
  const standYaw = entering ? vehicle.heading - side * Math.PI / 2 : boarding.exitHeading;
  _euler.set(0, standYaw, 0, 'YXZ');
  _standQuat.setFromEuler(_euler);
  _standPos.set(_door.x, vehicle.pos.y, _door.z);
  _blendQuat.slerpQuaternions(_standQuat, _seatQuat, s);
  _blendPos.lerpVectors(_standPos, _seatPos, s);
  body.base.compose(_blendPos, _blendQuat, _one);
  character.pos.set(_blendPos.x, vehicle.pos.y, _blendPos.z);
  character.heading = s > 0.5 ? vehicle.heading : standYaw;
  if (vehicle.vel) character.vel.copy(vehicle.vel);
}

/** Stand the person beside the door (or the nearest free side) at once. */
function placeAtDoor(character, body, vehicle, seat, api) {
  findExitSpot(vehicle, seat, api.game, _spot);
  character.pos.set(_spot.x, api.groundAt(_spot.x, _spot.z), _spot.z);
  character.heading = vehicle.heading + (seat % 2 === 0 ? 0.65 : -0.65);
  character.vel.set(0, 0, 0);
}

/** A free place to stand: the seat's own door, else the other side, else behind or ahead of the car. */
function findExitSpot(vehicle, seat, game, out) {
  const spec = vehicle.spec || {};
  const colliders = game.colliders;
  const half = (spec.width || 1.8) * 0.5 + 0.5;
  const halfLength = (spec.length || 4.5) * 0.5 + 0.6;
  seatLocal(spec, seat, _local);
  const side = seat % 2 === 0 ? 1 : -1;
  const candidates = _candidates;
  candidates[0] = side * half; candidates[1] = _local.z + 0.2;
  candidates[2] = -side * half; candidates[3] = _local.z + 0.2;
  candidates[4] = side * half * 0.6; candidates[5] = -halfLength;
  candidates[6] = side * half * 0.6; candidates[7] = halfLength;
  const c = Math.cos(vehicle.heading || 0);
  const s = Math.sin(vehicle.heading || 0);
  for (let i = 0; i < candidates.length; i += 2) {
    const x = candidates[i];
    const z = candidates[i + 1];
    out.set(vehicle.pos.x + x * c + z * s, vehicle.pos.y, vehicle.pos.z - x * s + z * c);
    if (!colliders || typeof colliders.pushOutCircle !== 'function') return out;
    _probe.copy(out);
    const contact = colliders.pushOutCircle(_probe, 0.32, vehicle.pos.y + 0.2, vehicle.pos.y + 1.7);
    if (!contact || contact.depth < 0.08) return out;
  }
  out.set(vehicle.pos.x + candidates[0] * c + candidates[1] * s, vehicle.pos.y, vehicle.pos.z - candidates[0] * s + candidates[1] * c);
  return out;
}

/** The car vanished mid-move: put the person on their feet where they are. */
function abandon(character, body, api) {
  const boarding = body.boarding;
  const vehicle = boarding.vehicle;
  if (vehicle) releaseSeat(vehicle, character, api);
  boarding.phase = null;
  boarding.vehicle = null;
  character.vehicle = null;
  character.seat = 0;
  character.pos.y = api.groundAt(character.pos.x, character.pos.z);
  body.mode = 'foot';
  body.motion.autoTarget = false;
}

/** Steering wheel placement for the cab: buses and trucks sit closer to a flatter wheel. */
function wheelFor(spec) {
  const cab = spec && CAB_FORWARD[spec.className];
  return { reach: cab ? 0.92 : 1 };
}

function createBoardingState() {
  return {
    vehicle: null, seat: 0, phase: null, u: 0, poseU: 0, time: 0, doorSide: 1, jacked: false,
    door: new THREE.Vector3(), exitSpot: new THREE.Vector3(), exitHeading: 0, startX: undefined, startZ: undefined,
  };
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function smooth(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

const CAB_FORWARD = { van: true, truck: true, bus: true, armored: true };
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _offset = new THREE.Matrix4();
const _seatFrame = new THREE.Matrix4();
const _local = new THREE.Vector3();
const _seatPoint = new THREE.Vector3();
const _door = new THREE.Vector3();
const _spot = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _seatPos = new THREE.Vector3();
const _standPos = new THREE.Vector3();
const _blendPos = new THREE.Vector3();
const _seatQuat = new THREE.Quaternion();
const _standQuat = new THREE.Quaternion();
const _blendQuat = new THREE.Quaternion();
const _candidates = new Float32Array(8);
