// The PSPD radio over a chase, shown as subtitles: dispatch, the patrol units and the crew of
// Shaheen-1 talking about what is really happening. It hears the pursuit (a new star, the suspect
// lost or seen again, a roadblock, the helicopter coming and going, a car switch, an officer down,
// a burning car, a red light run) and composes lines from the radio script with the real street,
// district, heading and car, about one every seven seconds, each with a burst of static.
// Becomes game.policeRadio.
import { RADIO_LINES, RADIO_REPLIES, RADIO_SPEAKERS, RADIO_PRIORITY, UNIT_CALLSIGNS } from './policeRadioScript.js';
import { colourWordForPaint, compassWordForBearing } from './policeHeavyResponseRules.js';

const MIN_GAP = 7;
const URGENT_GAP = 3.4;
const REPLY_DELAY = 3.7;
const LINE_SECONDS = 3.5;
const LINE_LIFETIME = 6;
const QUEUE_SIZE = 4;
const RECENT_MEMORY = 16;
const NUMBER_WORDS = ['', 'one', 'two', 'three', 'four', 'five'];

/**
 * Create the radio chatter.
 * @returns {{enabled: boolean, lines: {time:number, speaker:string, text:string}[], say: Function,
 *   report: (situation: string, x?: number, z?: number) => void, setEnabled: Function, update: Function}}
 *   report() has dispatch compose and queue a line for a situation ('update', 'roadblock', ...);
 *   reportNow() says it at once.
 */
export function createPoliceRadioChatter(game) {
  const radio = { enabled: true, lines: [], update, say, report: queueLine, reportNow, setEnabled, describeSuspect, updateMs: 0 };
  const queue = [];
  for (let i = 0; i < QUEUE_SIZE; i += 1) queue.push({ active: false, text: '', speaker: '', priority: 0, born: 0, replyText: '', replySpeaker: '' });
  const reply = { pending: false, at: 0, text: '', speaker: '' };
  const recent = [];
  let clock = 0;
  let lastSpoke = -100;
  let othersUntil = 0;
  let lastState = 'clear';
  let lastLevel = 0;
  let updateTimer = 16;
  let lightCheckTimer = 0;
  let redLightCooldown = 0;
  let lastRedNode = null;
  let speedCooldown = 0;
  let shotsCooldown = 0;
  let smokingVehicle = null;

  listen();

  /** Once a frame: notice what is not announced by events, then say the next line when it is time. */
  function update(dt) {
    if (!(dt > 0)) return;
    const started = performance.now();
    clock += dt;
    if (shotsCooldown > 0) shotsCooldown -= dt;
    if (speedCooldown > 0) speedCooldown -= dt;
    if (redLightCooldown > 0) redLightCooldown -= dt;
    const level = wantedLevel();
    const state = game.wanted && game.wanted.state ? game.wanted.state : 'clear';
    if (radio.enabled && level >= 1) watchThePursuit(dt, level, state);
    if (lastState === 'search' && state === 'pursuit' && level >= 1) queueLine('reacquired');
    lastState = state;
    lastLevel = level;
    if (radio.enabled) speakNext();
    radio.updateMs = performance.now() - started;
  }

  /** Position reports, speeding and red lights: things no other system announces. */
  function watchThePursuit(dt, level, state) {
    const player = game.player;
    const body = player && (player.vehicle || player.character);
    if (!body || !body.pos) return;
    const vel = body.vel;
    const speed = vel ? Math.hypot(vel.x, vel.z) : 0;
    if (state === 'pursuit') {
      updateTimer -= dt;
      if (updateTimer <= 0) {
        updateTimer = 15 + Math.random() * 8;
        if (clock - lastSpoke > 8) {
          const heli = game.policeHelicopter;
          if (!player.vehicle) queueLine('updateOnFoot');
          else if (heli && heli.seesPlayer && Math.random() < 0.4) queueLine('heliTracking');
          else queueLine('update');
        }
      }
    }
    if (player.vehicle && speed > 44 && speedCooldown <= 0) {
      speedCooldown = 45;
      queueLine('speeding');
    }
    lightCheckTimer -= dt;
    if (lightCheckTimer > 0 || !player.vehicle || speed < 9 || redLightCooldown > 0) return;
    lightCheckTimer = 0.25;
    const node = signalledJunctionNear(body.pos.x, body.pos.z, 16);
    if (!node || node === lastRedNode || !game.roads.signalPhase) return;
    const phase = game.roads.signalPhase(node);
    const axis = Math.abs(vel.x) > Math.abs(vel.z) ? 'ew' : 'ns';
    if (phase[axis] !== 'red') return;
    lastRedNode = node;
    redLightCooldown = 20;
    queueLine('redLight');
  }

  function listen() {
    const on = (name, handler) => game.events.on(name, handler);
    on('wanted:changed', (e) => {
      const level = number(e && e.level, 0);
      const previous = number(e && e.previous, 0);
      if (level > previous && level >= 1) queueLine(`star${Math.min(5, level)}`);
    });
    on('wanted:search', () => {
      if (wantedLevel() >= 1) queueLine('lost');
    });
    on('wanted:escaped', () => {
      clearQueue();
      queueLine('escaped');
    });
    on('roadblock:placed', (e) => queueLine(e && e.spikes ? 'roadblockSpikes' : 'roadblock', e && e.x, e && e.z));
    on('roadblock:breached', (e) => queueLine('breached', e && e.roadblock && e.roadblock.x, e && e.roadblock && e.roadblock.z));
    on('helicopter:dispatched', () => {
      if (wantedLevel() >= 1) queueLine('heliDispatched');
    });
    on('helicopter:arrived', () => queueLine('heliArrived'));
    on('helicopter:left', (e) => {
      if (e && e.reason === 'damaged') queueLine('heliHit');
      else if (wantedLevel() >= 1) queueLine('heliLeft');
    });
    on('player:enteredVehicle', (e) => {
      if (wantedLevel() < 1) return;
      queueLine(isPoliceVehicle(e && e.vehicle) ? 'stolePolice' : 'switchCar');
    });
    on('player:exitedVehicle', () => {
      if (wantedLevel() >= 2 && game.wanted.state !== 'search') queueLine('onFootNow');
    });
    on('character:died', (e) => {
      const c = e && e.character;
      if (c && c.kind === 'officer' && wantedLevel() >= 1) queueLine('officerDown', c.pos && c.pos.x, c.pos && c.pos.z);
    });
    on('vehicle:tyresBurst', (e) => {
      if (isPlayerVehicle(e && e.vehicle) && wantedLevel() >= 1) queueLine('onRims');
    });
    on('vehicle:onFire', (e) => {
      if (isPlayerVehicle(e && e.vehicle) && wantedLevel() >= 1) queueLine('burning');
    });
    on('vehicle:damaged', (e) => {
      const vehicle = e && e.vehicle;
      if (!isPlayerVehicle(vehicle) || !vehicle.smoking || vehicle === smokingVehicle || wantedLevel() < 1) return;
      smokingVehicle = vehicle;
      queueLine('smoking');
    });
    on('vehicle:destroyed', (e) => {
      const vehicle = e && e.vehicle;
      if (vehicle && vehicle.faction === 'police' && !vehicle.isPlayer && wantedLevel() >= 1) queueLine('unitWrecked', vehicle.pos.x, vehicle.pos.z);
    });
    on('shot:fired', (e) => {
      if (shotsCooldown > 0 || wantedLevel() < 1 || !e || !e.shooter) return;
      if (e.shooter !== (game.player && game.player.character)) return;
      shotsCooldown = 25;
      queueLine('shotsFired');
    });
    on('player:arrested', () => {
      if (Math.max(lastLevel, wantedLevel()) < 1) return;
      clearQueue();
      queueLine('arrest');
    });
    on('player:died', () => {
      if (Math.max(lastLevel, wantedLevel()) < 1) return;
      clearQueue();
      queueLine('death');
    });
    on('subtitle', (e) => {
      if (!e || e.radio) return;
      othersUntil = clock + number(e.seconds, 3.5) + 0.6;
    });
  }

  // ---- composing and speaking ---------------------------------------------------------------------

  /** Compose a line for a situation now (so it describes this moment) and queue it. */
  function queueLine(situation, x, z) {
    if (!radio.enabled) return;
    const template = pickTemplate(RADIO_LINES[situation]);
    if (!template) return;
    const scene = describeScene(x, z);
    const priority = RADIO_PRIORITY[situation] || 1;
    let slot = null;
    for (const candidate of queue) {
      if (!candidate.active) {
        slot = candidate;
        break;
      }
    }
    if (!slot) {
      for (const candidate of queue) if (candidate.priority < priority && (!slot || candidate.priority < slot.priority)) slot = candidate;
    }
    if (!slot) return;
    slot.active = true;
    slot.priority = priority;
    slot.born = clock;
    slot.text = fill(template.slice(2), scene);
    slot.speaker = speakerOf(template[0], scene);
    slot.replyText = '';
    if (template[0] === 'D' && priority <= 3 && Math.random() < 0.35) {
      const answer = pickTemplate(RADIO_REPLIES);
      if (answer) {
        scene.unit = pick(UNIT_CALLSIGNS);
        slot.replyText = fill(answer.slice(2), scene);
        slot.replySpeaker = speakerOf(answer[0], scene);
      }
    }
  }

  /** Say the most important waiting line once the channel has been quiet long enough. */
  function speakNext() {
    if (reply.pending) {
      if (clock >= reply.at) {
        reply.pending = false;
        emitLine(reply.text, reply.speaker);
      }
      return;
    }
    let best = null;
    for (const slot of queue) {
      if (!slot.active) continue;
      if (clock - slot.born > LINE_LIFETIME && slot.priority < 5) {
        slot.active = false;
        continue;
      }
      if (!best || slot.priority > best.priority || (slot.priority === best.priority && slot.born < best.born)) best = slot;
    }
    if (!best) return;
    const mode = game.mode;
    const final = best.priority >= 5;
    if (mode !== 'playing' && mode !== 'shot' && !(final && mode === 'dead')) return;
    const gap = final ? 1.2 : best.priority >= 4 ? URGENT_GAP : MIN_GAP;
    if (clock - lastSpoke < gap) return;
    if (clock < othersUntil && !final) return;
    best.active = false;
    emitLine(best.text, best.speaker);
    if (best.replyText) {
      reply.pending = true;
      reply.at = clock + REPLY_DELAY;
      reply.text = best.replyText;
      reply.speaker = best.replySpeaker;
    }
  }

  function emitLine(text, speaker) {
    lastSpoke = clock;
    radio.lines.push({ time: clock, speaker, text });
    if (radio.lines.length > 8) radio.lines.shift();
    game.events.emit('subtitle', { speaker, text, seconds: LINE_SECONDS, radio: true });
    game.audio?.play?.('radioStatic', { volume: 0.55 });
  }

  /**
   * Put a line on the radio now, outside the queue (missions, scripted moments).
   * @param {string} text
   * @param {string} [speaker] defaults to 'PSPD Dispatch'
   */
  function say(text, speaker) {
    if (!radio.enabled || !text) return;
    emitLine(String(text), speaker || RADIO_SPEAKERS.D);
  }

  /**
   * Have the channel describe a situation this instant, ahead of whatever is waiting: the line is
   * composed from the same script as every other call, for where the suspect is right now.
   */
  function reportNow(situation, x, z) {
    if (!radio.enabled) return;
    const template = pickTemplate(RADIO_LINES[situation]);
    if (!template) return;
    const scene = describeScene(x, z);
    emitLine(fill(template.slice(2), scene), speakerOf(template[0], scene));
  }

  /** Mute (false) or unmute (true) the channel; muting drops whatever was waiting. */
  function setEnabled(on) {
    radio.enabled = !!on;
    if (!radio.enabled) clearQueue();
  }

  function clearQueue() {
    for (const slot of queue) slot.active = false;
    reply.pending = false;
  }

  /** A template not heard lately, skipping the helicopter's lines while it is not up. */
  function pickTemplate(list) {
    if (!list || list.length === 0) return null;
    const heliUp = !!(game.policeHelicopter && game.policeHelicopter.active);
    const fresh = [];
    const usable = [];
    for (const line of list) {
      if (line[0] === 'A' && !heliUp) continue;
      usable.push(line);
      if (recent.indexOf(line) === -1) fresh.push(line);
    }
    const chosen = pick(fresh.length ? fresh : usable);
    if (!chosen) return null;
    recent.push(chosen);
    if (recent.length > RECENT_MEMORY) recent.shift();
    return chosen;
  }

  function speakerOf(code, scene) {
    if (code === 'U') return `Unit ${scene.unit}`;
    return RADIO_SPEAKERS[code] || RADIO_SPEAKERS.D;
  }

  // ---- describing the scene -----------------------------------------------------------------------

  /**
   * Everything a line may mention, read now: where (the given point, else the suspect), which way
   * he is going, what he is driving.
   */
  function describeScene(atX, atZ) {
    const player = game.player;
    const vehicle = player ? player.vehicle : null;
    const body = player ? vehicle || player.character : null;
    const px = body && body.pos ? body.pos.x : 0;
    const pz = body && body.pos ? body.pos.z : 0;
    const x = Number.isFinite(atX) ? atX : px;
    const z = Number.isFinite(atZ) ? atZ : pz;
    const city = game.city;
    const district = city && city.districtAt ? city.districtAt(x, z) : null;
    const districtName = district ? district.name : 'Port Sarab';
    const street = city && city.streetNameAt ? city.streetNameAt(x, z) : '';
    const inDistrict = `in ${midSentence(districtName)}`;
    let on = street ? `on ${midSentence(street)}` : inDistrict;
    if (!street && district && district.id === 'dunes') on = 'out in the dunes';
    if (!street && district && district.id === 'gulf') on = 'out on the water';
    const vel = body && body.vel ? body.vel : null;
    const moving = vel && Math.hypot(vel.x, vel.z) > 2;
    const heading = player ? player.heading || 0 : 0;
    const bearing = moving ? Math.atan2(vel.x, -vel.z) : Math.atan2(Math.sin(heading), -Math.cos(heading));
    const dir = compassWordForBearing(bearing);
    const suspect = describeSuspect(vehicle);
    const lastKnown = game.wanted && game.wanted.lastKnown;
    const lastStreet = lastKnown && city && city.streetNameAt ? city.streetNameAt(lastKnown.x, lastKnown.z) : '';
    const speed = vel ? Math.round((Math.hypot(vel.x, vel.z) * 3.6) / 10) * 10 : 0;
    return {
      inVeh: vehicle ? `in ${suspect.aVeh}` : 'on foot',
      aVeh: vehicle ? suspect.aVeh : 'nothing but his shoes',
      car: suspect.car,
      on,
      street: street ? midSentence(street) : midSentence(districtName),
      district: districtName,
      inDistrict,
      bound: dir.indexOf('-') === -1 ? `${dir}bound` : `heading ${dir}`,
      dir,
      cross: junctionName(px, pz) || (street ? midSentence(street) : midSentence(districtName)),
      near: landmarkNear(x, z) || (street ? midSentence(street) : midSentence(districtName)),
      unit: pick(UNIT_CALLSIGNS),
      speed: String(speed),
      stars: NUMBER_WORDS[Math.min(5, wantedLevel())] || '',
      lastSeen: lastStreet ? midSentence(lastStreet) : midSentence(districtName),
    };
  }

  /**
   * How dispatch describes a vehicle: { aVeh: 'a stolen coral Kestrel Sirocco GT', car: 'coral Kestrel',
   * colour: 'coral', model: 'Kestrel Sirocco GT' }.
   */
  function describeSuspect(vehicle) {
    if (!vehicle) return { aVeh: '', car: 'runner', colour: '', model: '' };
    const spec = vehicle.spec || {};
    const model = spec.name || 'vehicle';
    if (isPoliceVehicle(vehicle)) {
      const kind = spec.className === 'policeSuv' ? 'police SUV' : 'police cruiser';
      return { aVeh: `a stolen ${kind}`, car: kind, colour: 'white', model };
    }
    const colour = colourWordForPaint(typeof vehicle.color === 'number' ? vehicle.color : 0xffffff);
    const owned = vehicle.tags && (vehicle.tags.owned || vehicle.tags.playerOwned);
    const words = `${owned ? '' : 'stolen '}${colour} ${model}`;
    return { aVeh: `${/^[aeiou]/i.test(words) ? 'an' : 'a'} ${words}`, car: `${colour} ${model.split(' ')[0]}`, colour, model };
  }

  /** "Al Noor and Vane": the two roads of the nearest junction within 70 m, or ''. */
  function junctionName(x, z) {
    const roads = game.roads;
    if (!roads || !roads.nodes) return '';
    let best = null;
    let bestSq = 70 * 70;
    for (const node of roads.nodes) {
      if (node.edges.length < 3) continue;
      const d = (node.x - x) * (node.x - x) + (node.z - z) * (node.z - z);
      if (d < bestSq) {
        bestSq = d;
        best = node;
      }
    }
    if (!best) return '';
    let first = '';
    let second = '';
    for (const edge of best.edges) {
      if (!edge.name) continue;
      if (!first) first = edge.name;
      else if (edge.name !== first) {
        second = edge.name;
        break;
      }
    }
    if (!first) return '';
    return second ? `${shortRoadName(first)} and ${shortRoadName(second)}` : midSentence(first);
  }

  function signalledJunctionNear(x, z, radius) {
    const roads = game.roads;
    if (!roads || !roads.nodes) return null;
    for (const node of roads.nodes) {
      if (!node.signal) continue;
      if (Math.abs(node.x - x) < radius && Math.abs(node.z - z) < radius) return node;
    }
    return null;
  }

  /** The nearest named landmark within 260 m, written as it is said: "the Grand Souk", "Haddad Motors". */
  function landmarkNear(x, z) {
    const landmarks = game.city && game.city.landmarks;
    if (!landmarks) return '';
    let best = null;
    let bestSq = 260 * 260;
    for (const landmark of landmarks) {
      if (!landmark.name) continue;
      const d = (landmark.x - x) * (landmark.x - x) + (landmark.z - z) * (landmark.z - z);
      if (d < bestSq) {
        bestSq = d;
        best = landmark;
      }
    }
    if (!best) return '';
    const name = best.name;
    if (/^The /.test(name)) return `the ${name.slice(4)}`;
    if (/^(Haddad|Falcon Rock|Ain |Hangar|Sarab |PSPD |MV )/.test(name)) return name;
    return `the ${name}`;
  }

  // ---- small helpers ------------------------------------------------------------------------------

  function wantedLevel() {
    const wanted = game.wanted;
    return wanted && typeof wanted.level === 'number' ? wanted.level : 0;
  }

  function isPlayerVehicle(vehicle) {
    return !!(vehicle && game.player && game.player.vehicle === vehicle);
  }

  return radio;
}

/** Fill {tokens}, tidy the spacing and capitalise each sentence. */
function fill(template, scene) {
  let text = template.replace(/\{(\w+)\}/g, (match, key) => (scene[key] !== undefined ? scene[key] : ''));
  text = text.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  text = text.replace(/([.!?]\s+)([a-z])/g, (match, stop, letter) => stop + letter.toUpperCase());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "The Spires" becomes "the Spires" inside a sentence. */
function midSentence(name) {
  return /^The /.test(name) ? `the ${name.slice(4)}` : name;
}

/** "Al Noor Boulevard" is "Al Noor" on the radio. */
function shortRoadName(name) {
  return midSentence(name.replace(/ (Street|Boulevard|Avenue|Ring Road|Road)$/, ''));
}

function isPoliceVehicle(vehicle) {
  if (!vehicle) return false;
  const kind = vehicle.spec && vehicle.spec.className;
  return kind === 'police' || kind === 'policeSuv';
}

function pick(list) {
  return list && list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

function number(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
