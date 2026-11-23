// The car radio of Port Sarab: five stations on the dial, each with its host and tagline, four of them
// generating endless original music and one listening in on the police. The radio plays while the
// player drives, fades in on getting in and out on getting out, crackles with static between stations,
// remembers the station each car was tuned to, and every station keeps "broadcasting" while you are
// away: tune back in and it has moved on to wherever it would be.
import { SARAB_GOLD } from './stationSarabGold.js';
import { DUNE_FM } from './stationDuneFm.js';
import { RADIO_KHAMSIN } from './stationRadioKhamsin.js';
import { MARINA_LOUNGE } from './stationMarinaLounge.js';
import { PSPD_SCANNER } from './stationPspdScanner.js';
import { createSequencer, mixSeed } from './musicSequencer.js';
import { getReverbImpulse, startNoiseLoop } from './synthPrimitives.js';
import { playSoundRecipe } from './soundEffects.js';

/** Every station on the dial, in dial order. */
export const RADIO_STATIONS = [SARAB_GOLD, DUNE_FM, RADIO_KHAMSIN, MARINA_LOUNGE, PSPD_SCANNER];

/**
 * The radio for game.audio.radio: { stations, index, current, next(), previous(), off(), select(i) }.
 * Emits 'radio:changed' {station, index} on every change (station is null when off) and
 * 'radio:nowPlaying' {station, title, artist} when a new song starts while the player listens.
 * @param {ReturnType<import('./audioEngine.js').createAudioEngine>} engine
 * @param {Object} game
 */
export function createRadioDial(engine, game) {
  const seed = game.rng && game.rng.fork ? game.rng.fork('radio').int(1, 2000000000) : 20261124;
  const memory = new WeakMap();
  let index = 0;
  let listening = false;
  let vehicle = null;
  let player = null;
  let fader = null;
  let epoch = null;

  const dial = {
    /** Public facts about each station for the HUD and menus. */
    stations: RADIO_STATIONS.map(stationInfo),
    get index() {
      return index;
    },
    get current() {
      return index >= 0 ? dial.stations[index] : null;
    },
    /** True while a station is actually sounding. */
    get playing() {
      return listening && index >= 0 && !!player;
    },
    nowPlaying: null,
    next: () => select(index + 1 >= RADIO_STATIONS.length ? -1 : index + 1),
    previous: () => select(index - 1 < -1 ? RADIO_STATIONS.length - 1 : index - 1),
    off: () => select(-1),
    select,
    setListening,
    update,
  };

  /** Tune to station `i` (-1 turns the radio off), with a burst of static. */
  function select(i) {
    const target = Number.isInteger(i) && i >= -1 && i < RADIO_STATIONS.length ? i : -1;
    index = target;
    if (vehicle) memory.set(vehicle, index);
    dial.nowPlaying = null;
    game.events?.emit('radio:changed', { station: dial.current, index });
    if (listening) restartStation(true);
    return dial.current;
  }

  /**
   * The player got in (`car` given) or out (null). Getting in picks the car's own station: the one it
   * was last tuned to, the scanner in a police car, otherwise one that suits it.
   */
  function setListening(on, car) {
    if (!engine.isLive()) return;
    if (on && !listening) {
      listening = true;
      vehicle = car || null;
      index = chooseStationFor(vehicle);
      ensureFader();
      const t = engine.ctx.currentTime;
      fader.gain.cancelScheduledValues(t);
      fader.gain.setValueAtTime(0, t);
      fader.gain.linearRampToValueAtTime(1, t + 1.4);
      restartStation(false);
      game.events?.emit('radio:changed', { station: dial.current, index });
    } else if (!on && listening) {
      listening = false;
      vehicle = null;
      const t = engine.ctx.currentTime;
      if (fader) {
        fader.gain.cancelScheduledValues(t);
        fader.gain.setTargetAtTime(0, t, 0.18);
      }
      if (player) {
        const finished = player;
        player = null;
        finished.stop(t + 0.9);
      }
    }
  }

  function chooseStationFor(car) {
    if (car && memory.has(car)) return memory.get(car);
    const className = car?.spec?.className;
    let choice;
    if (className === 'police' || className === 'policeSuv') choice = RADIO_STATIONS.indexOf(PSPD_SCANNER);
    else if (className === 'buggy' || className === 'truck' || className === 'pickup') choice = RADIO_STATIONS.indexOf(DUNE_FM);
    else if (className === 'classic' || className === 'super') choice = RADIO_STATIONS.indexOf(SARAB_GOLD);
    else choice = Math.abs(mixSeed(seed, car?.id || 0)) % 4;
    if (car) memory.set(car, choice);
    return choice;
  }

  function ensureFader() {
    if (fader) return;
    fader = engine.ctx.createGain();
    fader.gain.value = 0;
    fader.connect(engine.buses.music);
    epoch = engine.ctx.currentTime;
  }

  function restartStation(withStatic) {
    ensureFader();
    const ctx = engine.ctx;
    const t = ctx.currentTime;
    if (player) {
      player.stop(t);
      player = null;
    }
    if (withStatic) playSoundRecipe(ctx, fader, 'radioStatic', t, null);
    if (index < 0) return;
    const station = RADIO_STATIONS[index];
    const offset = mixSeed(seed, index + 1) % 900;
    player = createStationPlayer(ctx, fader, station, {
      elapsed: t - epoch + offset,
      startTime: t + (withStatic ? 0.32 : 0.05),
      seed,
      wantedLevel: () => game.wanted?.level || 0,
      onSong: (song) => announce(station, song),
    });
  }

  function announce(station, song) {
    if (!listening || RADIO_STATIONS[index] !== station) return;
    dial.nowPlaying = { title: song.title, artist: song.artist };
    game.events?.emit('radio:nowPlaying', { station: dial.current, title: song.title, artist: song.artist });
  }

  /** Keep the playing station scheduled a little ahead. Call once a frame. */
  function update() {
    if (!player || !engine.isLive()) return;
    const now = engine.ctx.currentTime;
    player.scheduleAhead(now + 0.3, now);
  }

  return dial;
}

/**
 * Start one station on any context, joining its broadcast `elapsed` seconds in.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} destination
 * @param {Object} station  one of RADIO_STATIONS
 * @param {{elapsed?:number, startTime?:number, seed?:number, wantedLevel?:()=>number, onSong?:(song:Object)=>void}} [options]
 * @returns {{scheduleAhead:(until:number, now?:number)=>void, stop:(when:number)=>void}}
 */
export function createStationPlayer(ctx, destination, station, options = {}) {
  const startTime = options.startTime ?? ctx.currentTime;
  const output = ctx.createGain();
  output.gain.setValueAtTime(0, ctx.currentTime);
  output.gain.setValueAtTime(0, startTime);
  output.gain.linearRampToValueAtTime(station.mix.level, startTime + 0.25);
  output.connect(destination);
  const sources = [];

  let schedule;
  if (station.kind === 'scanner') {
    const chatter = station.createPlayer(ctx, output, options.wantedLevel);
    schedule = chatter.scheduleAhead;
    sources.push(chatter);
  } else {
    const mixer = createStationMixer(ctx, output, station.mix);
    const sequencer = createSequencer(ctx, mixer.channels, station, mixSeed(options.seed || 1, hashText(station.id)), (song) => {
      mixer.setTempo(song.stepSeconds);
      if (options.onSong) options.onSong(song);
    });
    sequencer.seek(Math.max(0, options.elapsed || 0), startTime + 0.02);
    schedule = sequencer.scheduleAhead;
    if (station.dust) {
      const dust = startNoiseLoop(ctx, 'dust', startTime);
      const dustGain = ctx.createGain();
      dustGain.gain.value = station.dust;
      dust.connect(dustGain).connect(output);
      sources.push(dust);
    }
  }

  return {
    scheduleAhead: (until, now) => schedule(until, now),
    stop(when) {
      output.gain.cancelScheduledValues(when);
      output.gain.setTargetAtTime(0, when, 0.06);
      for (const source of sources) source.stop(when + 0.5);
      setTimeout(() => output.disconnect(), Math.max(100, (when - ctx.currentTime + 1.5) * 1000));
    },
  };
}

/**
 * A station's mixing desk: drum, bass, keys, lead and effects channels, each with sends to a shared
 * reverb and a tempo-synced echo, summed through the station's tone filter.
 */
function createStationMixer(ctx, destination, mix) {
  const master = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = mix.tone || 16000;
  tone.Q.value = 0.5;
  master.connect(tone).connect(destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = getReverbImpulse(ctx);
  reverb.connect(master);
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = 'lowpass';
  delayTone.frequency.value = 2600;
  delay.connect(delayTone).connect(feedback).connect(delay);
  delayTone.connect(master);

  const channels = {};
  for (const name of ['drums', 'bass', 'keys', 'lead', 'fx']) {
    const channel = ctx.createGain();
    channel.gain.value = mix[name] ?? 0.7;
    channel.connect(master);
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = (mix.reverb || 0) * REVERB_SENDS[name];
    channel.connect(reverbSend).connect(reverb);
    if (DELAY_SENDS[name] > 0) {
      const delaySend = ctx.createGain();
      delaySend.gain.value = (mix.delay || 0) * DELAY_SENDS[name];
      channel.connect(delaySend).connect(delay);
    }
    channels[name] = channel;
  }
  return {
    channels,
    setTempo(stepSeconds) {
      delay.delayTime.setValueAtTime(Math.min(1.9, (mix.delaySteps || 3) * stepSeconds), ctx.currentTime);
    },
  };
}

const REVERB_SENDS = { drums: 0.5, bass: 0, keys: 1, lead: 1, fx: 1 };
const DELAY_SENDS = { drums: 0, bass: 0, keys: 0.4, lead: 1, fx: 0.5 };

function stationInfo(station) {
  return { id: station.id, name: station.name, frequency: station.frequency, host: station.host, tagline: station.tagline, color: station.color, kind: station.kind };
}

function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
