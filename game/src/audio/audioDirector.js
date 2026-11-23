// game.audio, the conductor of everything Port Sarab sounds like: plays one-shots by name at world
// positions, answers the game's events (crashes, gunfire, fists, explosions, wanted stars, missions,
// cash, arrests, deaths), follows the player's car and radio, sirens, traffic and footsteps, keeps the
// city's ambience under it all, and muffles the world for pauses and close calls.
import { createAudioEngine } from './audioEngine.js';
import { playSoundRecipe, soundBusFor, SOUND_IDS, SOUND_ALIASES } from './soundEffects.js';
import { gunSoundForWeaponModel } from './radioAndSoundGuide.js';
import { createPlayerCarSound, createTrafficEngines } from './engineSound.js';
import { createSirenChorus } from './sirenSound.js';
import { createRadioDial } from './radioStations.js';
import { createCityAmbience, ambienceMixFor } from './cityAmbience.js';

export { SOUND_IDS };

/**
 * Create game.audio.
 * @param {Object} game
 * @returns {{unlock:()=>boolean, play:(id:string, options?:Object)=>boolean, radio:Object,
 *           setVolumes:(v:{master?:number, music?:number, effects?:number})=>void, setMuted:(m:boolean)=>void,
 *           duckMusic:(seconds:number, level?:number)=>void, update:(dt:number)=>void, sounds:readonly string[], ready:boolean}}
 */
export function createAudio(game) {
  const engine = createAudioEngine(game);
  const carSound = createPlayerCarSound(engine, game);
  const traffic = createTrafficEngines(engine, game);
  const sirens = createSirenChorus(engine, game);
  const radio = createRadioDial(engine, game);
  const known = new Set(SOUND_IDS);
  const voiceOptions = { x: undefined, y: undefined, z: undefined, volume: 1, range: 0 };
  const recipeParams = { intensity: 1, pitch: 1, variant: undefined, surface: undefined, className: undefined, distance: 0, level: 0 };
  const ambienceMix = {};
  const crashCooldown = new Map();
  const hornCooldown = new Map();
  const hitCooldown = new Map();
  let ambience = null;
  let ambienceClock = 0;
  let listeningCar = null;
  let musicDuckUntil = 0;
  let musicDuckLevel = 1;
  let deafness = 0;
  let downed = false;
  let footPhase = 0;
  let wasGrounded = true;
  let lastCash = 0;
  let lastNotify = 0;
  let crowdWindowStart = -10;
  let crowdVoices = 0;
  let warned = false;

  const audio = {
    unlock,
    play,
    radio,
    setVolumes: (volumes) => engine.setVolumes(volumes),
    setMuted: (muted) => engine.setMuted(muted),
    duckMusic,
    update,
    sounds: SOUND_IDS,
    /** When true the director changes station itself on the 'nextRadio' key while driving. */
    handleRadioKey: true,
    get ready() {
      return engine.isLive();
    },
    get volumes() {
      return { ...engine.volumes };
    },
    engine,
  };

  engine.attachUnlockListeners();
  wireGameEvents();

  /** Start the sound; safe to call from any click or key handler, as often as you like. */
  function unlock() {
    return engine.unlock();
  }

  /**
   * Play a one-shot by id. Options: x, y, z (world position; omit for a sound in the player's head),
   * volume, pitch, intensity (how hard: a crash, an explosion), variant / surface / className, level,
   * range (metres it carries), delay (seconds). Aliases (menuOpen, purchase, jobDone, jobBlown,
   * knockedOut) play their sound; unknown ids are ignored. Returns true if it sounded.
   */
  function play(id, options) {
    const sound = SOUND_ALIASES[id] || id;
    if (!engine.isLive() || !known.has(sound)) return false;
    if ((sound === 'scream' || sound === 'shout') && !crowdVoiceAllowed()) return false;
    try {
      const o = options || NO_OPTIONS;
      const bus = soundBusFor(sound);
      const placed = bus !== 'ui' && options && typeof options.x === 'number' && typeof options.z === 'number';
      voiceOptions.x = placed ? options.x : undefined;
      voiceOptions.y = placed ? options.y : undefined;
      voiceOptions.z = placed ? options.z : undefined;
      voiceOptions.volume = options && typeof options.volume === 'number' ? options.volume : 1;
      voiceOptions.range = options && options.range ? options.range : 0;
      const voice = engine.startVoice(bus, voiceOptions);
      if (!voice) return false;
      recipeParams.intensity = typeof o.intensity === 'number' ? o.intensity : 1;
      recipeParams.pitch = typeof o.pitch === 'number' ? o.pitch : 1;
      recipeParams.variant = o.variant;
      recipeParams.surface = o.surface;
      recipeParams.className = o.className;
      recipeParams.level = o.level || 0;
      recipeParams.distance = voice.distance || 0;
      const when = engine.ctx.currentTime + 0.005 + (options && options.delay ? options.delay : 0);
      voice.endTime = playSoundRecipe(engine.ctx, voice.input, sound, when, recipeParams);
      return true;
    } catch (error) {
      warnOnce(error);
      return false;
    }
  }

  /** At most a few screams and shouts a second across the whole city, however many people panic. */
  function crowdVoiceAllowed() {
    const now = engine.ctx.currentTime;
    if (now - crowdWindowStart >= 1) {
      crowdWindowStart = now;
      crowdVoices = 0;
    }
    if (crowdVoices >= CROWD_VOICES_PER_SECOND) return false;
    crowdVoices += 1;
    return true;
  }

  /** People bolting together: a few screams, staggered and scattered around where it started. */
  function panicCluster(x, z, count) {
    const n = Math.max(2, Math.min(3, Math.round(count) - 1 || 2));
    for (let i = 0; i < n; i += 1) {
      play('scream', { x: x + (Math.random() - 0.5) * 8, y: 1.6, z: z + (Math.random() - 0.5) * 8, volume: 0.85, pitch: 0.85 + Math.random() * 0.4, delay: i * 0.13 + Math.random() * 0.1 });
    }
  }

  /** Pull the radio under a story moment for `seconds`. */
  function duckMusic(seconds, level = 0.3) {
    if (!engine.ctx) return;
    musicDuckUntil = Math.max(musicDuckUntil, engine.ctx.currentTime + seconds);
    musicDuckLevel = level;
  }

  /** Call once a frame with the frame's time step. */
  function update(dt) {
    if (!engine.ctx) return;
    try {
      engine.update(dt);
      if (!engine.isLive()) return;
      const now = engine.ctx.currentTime;
      carSound.update();
      followRadio();
      radio.update();
      sirens.update(dt);
      traffic.update();
      hornsOfOthers(now);
      playerFootsteps(dt);
      if (!ambience) ambience = createCityAmbience(engine.ctx, engine.buses.ambience);
      ambienceClock -= dt;
      if (ambienceClock <= 0) {
        ambienceClock = 0.05;
        ambience.apply(ambienceMixFor(game, radio.playing, ambienceMix), now);
      }
      const inMenu = game.mode === 'menu';
      const paused = !!game.time?.paused || game.mode === 'paused' || inMenu;
      deafness = Math.max(0, deafness - dt * 0.45);
      engine.setWorldMuffle(Math.max(paused ? 0.85 : 0, downed ? 0.7 : 0, deafness * 0.75));
      engine.setMusicDuck(now < musicDuckUntil ? musicDuckLevel : paused && !inMenu ? 0.55 : 1);
    } catch (error) {
      warnOnce(error);
    }
  }

  /**
   * The radio plays while the player sits in a running car (and behind the main menu), and changes
   * station on the radio key.
   */
  function followRadio() {
    const car = carSound.vehicle && !carSound.vehicle.wrecked ? carSound.vehicle : null;
    const listener = car || (game.mode === 'menu' ? MENU_LISTENER : null);
    if (listener !== listeningCar) {
      if (listeningCar) radio.setListening(false);
      if (listener) radio.setListening(true, listener);
      listeningCar = listener;
    }
    if (car && audio.handleRadioKey && game.input?.pressed?.('nextRadio')) radio.next();
  }

  /** Other drivers lean on their horns now and then. */
  function hornsOfOthers(now) {
    const list = game.vehicles?.list;
    if (!list) return;
    const own = game.player?.vehicle;
    for (let i = 0; i < list.length; i += 1) {
      const v = list[i];
      if (!v || v === own || !v.controls || !v.controls.horn || !v.pos) continue;
      if ((hornCooldown.get(v.id) || 0) > now) continue;
      hornCooldown.set(v.id, now + 1.1);
      play('horn', { x: v.pos.x, y: 1, z: v.pos.z, className: v.spec?.className, intensity: 1 + Math.random() });
    }
  }

  /** Footsteps of the player on foot: pace from speed, the sound from the ground underfoot. */
  function playerFootsteps(dt) {
    const ch = game.player?.character;
    if (!ch || ch.vehicle || ch.alive === false || !ch.pos) {
      footPhase = 0;
      return;
    }
    const grounded = ch.grounded !== false;
    const surface = game.terrain?.surfaceAt ? game.terrain.surfaceAt(ch.pos.x, ch.pos.z) : 'road';
    if (grounded && !wasGrounded) {
      play('footstep', { x: ch.pos.x, y: ch.pos.y, z: ch.pos.z, surface, intensity: 1.2 });
      play('footstep', { x: ch.pos.x, y: ch.pos.y, z: ch.pos.z, surface, intensity: 0.9, delay: 0.05 });
    }
    wasGrounded = grounded;
    if (!grounded || !ch.vel) return;
    const speed = Math.sqrt(ch.vel.x * ch.vel.x + ch.vel.z * ch.vel.z);
    if (speed < 0.6) {
      footPhase = 0.6;
      return;
    }
    footPhase += dt * (1.2 + speed * 0.28);
    if (footPhase >= 1) {
      footPhase -= 1;
      play('footstep', { x: ch.pos.x, y: ch.pos.y, z: ch.pos.z, surface, intensity: 0.45 + speed / 14, volume: 0.85 });
    }
  }

  /** Answer the game's events with sound. */
  function wireGameEvents() {
    const events = game.events;
    if (!events) return;
    const on = (name, handler) => events.on(name, (payload) => {
      try {
        handler(payload || {});
      } catch (error) {
        warnOnce(error);
      }
    });

    on('vehicle:collision', (e) => {
      const v = e.vehicle;
      if (!v || !engine.isLive()) return;
      const mass = v.spec?.mass || 1500;
      const k = Math.max(Math.abs(e.impulse || 0) / (mass * 9), (e.speed || 0) / 22);
      if (k < 0.04) return;
      const now = engine.ctx.currentTime;
      if ((crashCooldown.get(v.id) || 0) > now) return;
      crashCooldown.set(v.id, now + 0.15);
      play('crash', { x: num(e.x, v.pos?.x), y: num(e.y, 0.6), z: num(e.z, v.pos?.z), intensity: Math.min(1, k), range: 240 });
    });
    on('vehicle:landed', (e) => {
      const v = e.vehicle;
      if (!v || !v.pos) return;
      const hit = num(e.impact, num(e.speed, num(e.fallSpeed, 5)));
      play('landingThud', { x: v.pos.x, y: 0.4, z: v.pos.z, intensity: Math.min(1, Math.abs(hit) / 12) });
    });
    on('vehicle:sunk', (e) => {
      const p = e.vehicle?.pos;
      if (p) play('splash', { x: p.x, y: 0, z: p.z, intensity: 1.1 });
    });
    on('vehicle:hitCharacter', (e) => {
      const c = e.character;
      if (!c || !c.pos || Math.abs(e.speed || 0) < 3 || !engine.isLive()) return;
      const now = engine.ctx.currentTime;
      if ((hitCooldown.get(c.id) || 0) > now) return;
      hitCooldown.set(c.id, now + 0.6);
      play('bodyHit', { x: c.pos.x, y: 1, z: c.pos.z, intensity: Math.min(1, Math.abs(e.speed) / 15) });
    });
    on('prop:broken', (e) => {
      const kind = String(e.collider?.kind || '').toLowerCase();
      const id = kind.includes('palm') || kind.includes('tree') || kind.includes('wood') || kind.includes('fence') ? 'woodCrack' : kind.includes('glass') ? 'glass' : 'metalClank';
      play(id, { x: num(e.x, 0), y: 1, z: num(e.z, 0), intensity: 0.9 });
    });
    on('explosion', (e) => {
      const x = num(e.x, 0);
      const z = num(e.z, 0);
      play('explosion', { x, y: num(e.y, 1), z, intensity: Math.max(0.5, Math.min(1.3, num(e.radius, 6) / 7)), range: 420 });
      const l = engine.listener;
      const d = Math.sqrt((l.x - x) * (l.x - x) + (l.z - z) * (l.z - z));
      deafness = Math.max(deafness, Math.max(0, 1 - d / 35));
    });
    on('shot:fired', onShotFired);
    on('character:damaged', (e) => {
      const c = e.character;
      if (e.kind === 'melee' && c && c.pos) play(Math.random() < 0.25 ? 'kick' : 'punch', { x: c.pos.x, y: 1.2, z: c.pos.z, intensity: Math.min(1.2, 0.6 + num(e.amount, 10) / 40) });
    });
    on('character:knockedDown', (e) => {
      const c = e.character;
      if (c && c.pos) play('bodyFall', { x: c.pos.x, y: 0.3, z: c.pos.z, delay: 0.35 });
    });
    on('wanted:changed', (e) => {
      const level = num(e.level, 0);
      const previous = num(e.previous, 0);
      if (level > previous) play('wantedUp', { level });
      else if (level === 0 && previous > 0) play('wantedClear');
    });
    on('mission:started', () => {
      play('missionStart');
      duckMusic(1.8, 0.45);
    });
    on('mission:completed', () => {
      play('missionPassed');
      duckMusic(3.4, 0.2);
    });
    on('mission:failed', () => {
      play('missionFailed');
      duckMusic(2.8, 0.25);
    });
    on('money:changed', (e) => {
      if (!(num(e.delta, 0) > 0) || !engine.isLive()) return;
      const now = engine.ctx.currentTime;
      if (now - lastCash < 0.3) return;
      lastCash = now;
      play('cash');
    });
    on('player:arrested', () => {
      play('arrested');
      duckMusic(3, 0.3);
      deafness = Math.max(deafness, 0.6);
    });
    on('player:died', () => {
      play('death');
      duckMusic(4, 0.2);
      downed = true;
    });
    on('player:respawned', () => {
      downed = false;
      deafness = 0;
    });
    on('notify', (e) => {
      if (e.kind === 'cash' || e.kind === 'wanted' || !engine.isLive()) return;
      const now = engine.ctx.currentTime;
      if (now - lastNotify < 0.15) return;
      lastNotify = now;
      play('notify', { variant: e.kind === 'good' || e.kind === 'bad' ? e.kind : 'info' });
    });
    on('weather:changed', (e) => {
      const storm = num(e.sandstorm, num(e.intensity, game.weather?.sandstorm || 0));
      if (storm > 0.2) play('windGust', { intensity: Math.min(1, 0.5 + storm) });
    });
    on('pedestrians:panic', (e) => {
      const x = num(e.x, NaN);
      const z = num(e.z, NaN);
      if (Number.isFinite(x) && Number.isFinite(z)) panicCluster(x, z, num(e.count, 3));
    });
    on('player:enteredVehicle', (e) => carSound.vehicleEntered(e.vehicle));
    on('player:exitedVehicle', (e) => carSound.vehicleExited(e.vehicle));
  }

  /**
   * A gunshot at the shooter, an impact where it landed (none for a miss into the sky), now and then a
   * ricochet, and a whiz if it passed close. The event object is pooled: only its numbers are read here.
   */
  function onShotFired(e) {
    const x = num(e.x, NaN);
    const z = num(e.z, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const y = num(e.y, 1.4);
    const hit = e.hit;
    const material = hit ? impactMaterial(hit, e.target, num(e.hitX, x), num(e.hitZ, z)) : null;
    const byPlayer = !!e.isPlayer || (!!e.shooter && e.shooter === game.player?.character);
    play(gunSoundForWeaponModel(e.model || weaponModelOf(e.weaponId)), { x, y, z, range: 340, volume: byPlayer ? 1 : 0.9 });
    const hx = num(e.hitX, NaN);
    const hz = num(e.hitZ, NaN);
    if (!Number.isFinite(hx) || !Number.isFinite(hz)) return;
    const hy = num(e.hitY, 1);
    if (material) {
      play('bulletImpact', { x: hx, y: hy, z: hz, variant: material, volume: 0.8 });
      if ((material === 'concrete' || material === 'metal') && Math.random() < 0.18) play('ricochet', { x: hx, y: hy, z: hz, volume: 0.7, delay: 0.01 });
    }
    if (!byPlayer) bulletWhizPast(x, y, z, hx, hy, hz);
  }

  /** The weapon's class from the catalogue, for events that carry only the weapon's id. */
  function weaponModelOf(weaponId) {
    const lookup = game.catalog?.weaponById;
    const spec = typeof lookup === 'function' ? lookup(weaponId) : lookup && typeof lookup.get === 'function' ? lookup.get(weaponId) : null;
    return spec?.model || spec?.className || spec?.kind || weaponId;
  }

  /** What a round struck: a car's metal, a person, or the world's ground (sand, water, else concrete). */
  function impactMaterial(hit, target, x, z) {
    if (hit === 'vehicle' || (target && target.spec)) return 'metal';
    if (hit === 'character') return 'flesh';
    if (game.terrain?.isWater && game.terrain.isWater(x, z)) return 'water';
    const surface = game.terrain?.surfaceAt ? game.terrain.surfaceAt(x, z) : 'road';
    return surface === 'sand' || surface === 'beach' ? 'sand' : surface === 'water' ? 'water' : 'concrete';
  }

  /** When a bullet's path passes within a few metres of the player, play the crack-whiz of its passing. */
  function bulletWhizPast(ax, ay, az, bx, by, bz) {
    const p = game.player?.pos || game.player?.character?.pos;
    if (!p) return;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const lengthSq = dx * dx + dy * dy + dz * dz;
    if (lengthSq < 1) return;
    const py = (p.y || 0) + 1.5;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (py - ay) * dy + (p.z - az) * dz) / lengthSq));
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    const cz = az + dz * t;
    const miss = Math.sqrt((cx - p.x) * (cx - p.x) + (cy - py) * (cy - py) + (cz - p.z) * (cz - p.z));
    if (miss < 3.5 && t > 0.05 && t < 0.98) play('bulletWhiz', { x: cx, y: cy, z: cz, intensity: 1 - miss / 4 });
  }

  function warnOnce(error) {
    if (warned) return;
    warned = true;
    console.warn('Sound hiccup (the game carries on):', error);
  }

  return audio;
}

const NO_OPTIONS = Object.freeze({});

/** The most screams and shouts that may start in any one second. */
const CROWD_VOICES_PER_SECOND = 4;

/** Stands in for a car while the main menu is up, so the radio tunes Sarab Gold behind it. */
const MENU_LISTENER = Object.freeze({ id: 0, spec: Object.freeze({ className: 'classic' }) });

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
