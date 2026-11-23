// The sound engine under Port Sarab: one AudioContext, opened by the player's first click or key; the
// mix (effects, engines and the city's ambience into a world bus that a pause can muffle, the radio and
// the interface beside it, all into a master with a gentle limiter); a budget of 24 one-shot voices that
// steals the quietest; and placing each sound by its distance and bearing from the camera.
import { getSoundKit } from './synthPrimitives.js';

/** At most this many one-shot sounds play at once; a louder newcomer steals the quietest. */
export const VOICE_BUDGET = 24;

/** Metres beyond which an ordinary sound is inaudible. */
export const AUDIBLE_RANGE = 180;

/** Base levels of the mix (linear gain). Music sits about 8 dB under the effects. */
export const MIX_LEVELS = { master: 0.85, effects: 1.0, engine: 0.62, ambience: 0.3, music: 0.37, ui: 0.9 };

/**
 * Create the engine. Nothing makes a sound until unlock() runs inside a user gesture; until then every
 * call is a silent no-op, and nothing throws when the browser has no Web Audio at all.
 * @param {Object} game  the shared game object (its camera is the listener)
 */
export function createAudioEngine(game) {
  const voices = [];
  const spot = { gain: 1, pan: 0, cutoff: 20000, distance: 0 };
  let failed = false;
  let listenersAttached = false;
  let worldMuffle = 0;
  let musicDuck = 1;

  const engine = {
    /** @type {AudioContext|null} */
    ctx: null,
    kit: null,
    buses: null,
    volumes: { master: 1, music: 1, effects: 1 },
    muted: false,
    /** Where the camera (the listener) is and how fast it moves, for Doppler. */
    listener: { x: 0, y: 0, z: 0, vx: 0, vz: 0 },
    unlock,
    attachUnlockListeners,
    isLive,
    startVoice,
    spatialize,
    setVolumes,
    setMuted,
    setWorldMuffle,
    setMusicDuck,
    update,
    activeVoices: () => voices.length,
  };

  /** Open (or resume) the audio context. Call from a click or key handler. */
  function unlock() {
    if (failed) return false;
    try {
      if (!engine.ctx) {
        const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!Ctor) {
          failed = true;
          return false;
        }
        engine.ctx = new Ctor({ latencyHint: 'interactive' });
        engine.kit = getSoundKit(engine.ctx);
        engine.buses = buildMixBuses(engine.ctx, engine.ctx.destination);
        applyVolumes();
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', followPageVisibility);
      }
      if (engine.ctx.state === 'suspended' && !document.hidden) {
        const resumed = engine.ctx.resume();
        if (resumed && resumed.catch) resumed.catch(() => {});
      }
      return true;
    } catch (error) {
      failed = true;
      console.warn('Sound is unavailable in this browser', error);
      return false;
    }
  }

  /** Resume the sound on the first pointer press or key, then stop listening. */
  function attachUnlockListeners() {
    if (listenersAttached || typeof window === 'undefined') return;
    listenersAttached = true;
    const onGesture = () => {
      unlock();
      if (failed || isLive()) detach();
    };
    function detach() {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      window.removeEventListener('touchstart', onGesture, true);
    }
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    window.addEventListener('touchstart', onGesture, true);
  }

  /** True once the context is running and sounds may be scheduled. */
  function isLive() {
    return !!engine.ctx && engine.ctx.state === 'running';
  }

  function followPageVisibility() {
    if (!engine.ctx) return;
    if (document.hidden) {
      if (engine.ctx.state === 'running') engine.ctx.suspend().catch(() => {});
    } else if (engine.ctx.state === 'suspended') {
      engine.ctx.resume().catch(() => {});
    }
  }

  /**
   * Open a voice for one sound on a bus ('effects', 'engine', 'ambience', 'music' or 'ui'), placed at
   * (x, y, z) when given. Returns the voice, whose `input` the recipe connects to, or null when the
   * sound would be inaudible or every voice is busy with something louder.
   */
  function startVoice(busName, options) {
    if (!isLive()) return null;
    const ctx = engine.ctx;
    const now = ctx.currentTime;
    const positional = options && typeof options.x === 'number' && typeof options.z === 'number';
    let gain = options && typeof options.volume === 'number' ? options.volume : 1;
    if (positional) {
      spatialize(options.x, options.y, options.z, options.range || AUDIBLE_RANGE, spot);
      gain *= spot.gain;
      if (gain < 0.003) return null;
    }
    if (voices.length >= VOICE_BUDGET) {
      const quietest = findQuietestVoice(now);
      if (!quietest || quietest.score > gain) return null;
      silenceVoice(quietest.voice, now);
    }
    const bus = engine.buses[busName] || engine.buses.effects;
    const input = ctx.createGain();
    input.gain.value = gain;
    let output = input;
    if (positional) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = spot.cutoff;
      filter.Q.value = 0.5;
      input.connect(filter);
      output = filter;
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = spot.pan;
        output.connect(panner);
        output = panner;
      }
    }
    output.connect(bus);
    const voice = { input, output, loudness: gain, startTime: now, endTime: now + 4, distance: positional ? spot.distance : 0 };
    voices.push(voice);
    return voice;
  }

  function findQuietestVoice(now) {
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < voices.length; i += 1) {
      const v = voices[i];
      const life = Math.max(0.01, v.endTime - v.startTime);
      const remaining = Math.max(0, Math.min(1, (v.endTime - now) / life));
      const score = v.loudness * (0.2 + 0.8 * remaining);
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best ? { voice: best, score: bestScore } : null;
  }

  function silenceVoice(voice, now) {
    voice.input.gain.cancelScheduledValues(now);
    voice.input.gain.setTargetAtTime(0, now, 0.012);
    voice.endTime = now + 0.06;
    voice.loudness = 0;
  }

  /**
   * Where a world position sits for the listener (the camera): gain by distance (silent beyond
   * `range`), stereo pan by bearing, and a low-pass cutoff that drops with distance.
   */
  function spatialize(x, y, z, range, out) {
    const camera = game && game.camera;
    if (!camera || !camera.matrixWorld) {
      out.gain = 1;
      out.pan = 0;
      out.cutoff = 20000;
      out.distance = 0;
      return out;
    }
    const e = camera.matrixWorld.elements;
    const dx = x - e[12];
    const dy = (typeof y === 'number' ? y : 1) - e[13];
    const dz = z - e[14];
    const flat = Math.sqrt(dx * dx + dz * dz);
    const distance = Math.sqrt(flat * flat + dy * dy);
    const reach = range || AUDIBLE_RANGE;
    const near = 1 / (1 + Math.max(0, distance - 4) / 18);
    const edge = Math.max(0, 1 - (distance / reach) * (distance / reach));
    out.gain = near * edge;
    const rightX = e[0];
    const rightZ = e[2];
    const rightLength = Math.sqrt(rightX * rightX + rightZ * rightZ) || 1;
    const side = flat > 0.001 ? (dx * rightX + dz * rightZ) / (flat * rightLength) : 0;
    out.pan = Math.max(-1, Math.min(1, side * 0.85 * Math.min(1, flat / 3)));
    out.cutoff = 600 + 17400 * Math.exp(-distance / (reach * 0.2));
    out.distance = distance;
    return out;
  }

  /** Set the player's volume settings, each 0..1. */
  function setVolumes(volumes) {
    if (!volumes) return;
    for (const key of ['master', 'music', 'effects']) {
      if (typeof volumes[key] === 'number' && Number.isFinite(volumes[key])) {
        engine.volumes[key] = Math.max(0, Math.min(1, volumes[key]));
      }
    }
    applyVolumes();
  }

  function setMuted(muted) {
    engine.muted = !!muted;
    applyVolumes();
  }

  function applyVolumes() {
    const b = engine.buses;
    if (!b) return;
    const t = engine.ctx.currentTime;
    const v = engine.volumes;
    b.master.gain.setTargetAtTime(engine.muted ? 0 : MIX_LEVELS.master * v.master, t, 0.05);
    b.music.gain.setTargetAtTime(MIX_LEVELS.music * v.music, t, 0.05);
    b.effects.gain.setTargetAtTime(MIX_LEVELS.effects * v.effects, t, 0.05);
    b.engine.gain.setTargetAtTime(MIX_LEVELS.engine * v.effects, t, 0.05);
    b.ambience.gain.setTargetAtTime(MIX_LEVELS.ambience * v.effects, t, 0.05);
    b.ui.gain.setTargetAtTime(MIX_LEVELS.ui * v.effects, t, 0.05);
  }

  /** Muffle the world (0 clear .. 1 heavily muffled and quiet), for pause screens and being knocked out. */
  function setWorldMuffle(amount) {
    const a = Math.max(0, Math.min(1, amount || 0));
    if (!engine.buses || Math.abs(a - worldMuffle) < 0.002) return;
    worldMuffle = a;
    const t = engine.ctx.currentTime;
    engine.buses.worldFilter.frequency.setTargetAtTime(20000 * Math.pow(500 / 20000, a), t, 0.08);
    engine.buses.world.gain.setTargetAtTime(1 - 0.65 * a, t, 0.08);
  }

  /** Duck the radio under a story sting: `level` 1 is untouched, 0.3 is well under. */
  function setMusicDuck(level) {
    const l = Math.max(0, Math.min(1, level));
    if (!engine.buses || Math.abs(l - musicDuck) < 0.002) return;
    musicDuck = l;
    engine.buses.musicDuck.gain.setTargetAtTime(l, engine.ctx.currentTime, 0.12);
  }

  /** Follow the listener and release finished voices. Call once a frame. */
  function update(dt) {
    if (!engine.ctx) return;
    const camera = game && game.camera;
    if (camera && camera.matrixWorld) {
      const e = camera.matrixWorld.elements;
      const l = engine.listener;
      if (dt > 0) {
        const k = Math.min(1, dt * 6);
        l.vx += ((e[12] - l.x) / dt - l.vx) * k;
        l.vz += ((e[14] - l.z) / dt - l.vz) * k;
        if (!Number.isFinite(l.vx) || Math.abs(l.vx) > 200) l.vx = 0;
        if (!Number.isFinite(l.vz) || Math.abs(l.vz) > 200) l.vz = 0;
      }
      l.x = e[12];
      l.y = e[13];
      l.z = e[14];
    }
    const now = engine.ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i -= 1) {
      const v = voices[i];
      if (v.endTime < now - 0.05) {
        try {
          v.output.disconnect();
        } catch (error) {
          /* already disconnected */
        }
        voices[i] = voices[voices.length - 1];
        voices.pop();
      }
    }
  }

  return engine;
}

/**
 * The mix on any audio context, live or offline: effects, engine and ambience feed a world bus with a
 * muffling filter; music (through a ducker) and interface sounds join them at the master, which runs
 * through a compressor and a soft clipper so nothing ever reaches full scale.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} destination
 */
export function buildMixBuses(ctx, destination) {
  const master = ctx.createGain();
  master.gain.value = MIX_LEVELS.master;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 6;
  limiter.ratio.value = 10;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  const clipper = ctx.createWaveShaper();
  clipper.curve = SOFT_CLIP_CURVE;
  clipper.oversample = '2x';
  master.connect(limiter);
  limiter.connect(clipper);
  clipper.connect(destination);

  const world = ctx.createGain();
  const worldFilter = ctx.createBiquadFilter();
  worldFilter.type = 'lowpass';
  worldFilter.frequency.value = 20000;
  worldFilter.Q.value = 0.4;
  world.connect(worldFilter);
  worldFilter.connect(master);

  const effects = makeBus(ctx, MIX_LEVELS.effects, world);
  const engineBus = makeBus(ctx, MIX_LEVELS.engine, world);
  const ambience = makeBus(ctx, MIX_LEVELS.ambience, world);
  const musicDuck = makeBus(ctx, 1, master);
  const music = makeBus(ctx, MIX_LEVELS.music, musicDuck);
  const ui = makeBus(ctx, MIX_LEVELS.ui, master);
  return { master, limiter, world, worldFilter, effects, engine: engineBus, ambience, music, musicDuck, ui };
}

function makeBus(ctx, level, destination) {
  const bus = ctx.createGain();
  bus.gain.value = level;
  bus.connect(destination);
  return bus;
}

/** Straight through below 0.6, then an ever softer knee that never passes 0.9. */
const SOFT_CLIP_CURVE = (() => {
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax <= 0.6 ? ax : 0.6 + 0.3 * Math.tanh((ax - 0.6) / 0.3);
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
})();
