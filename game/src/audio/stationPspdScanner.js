// PSPD Scanner: no music, just the Port Sarab Police Department's radio traffic. A bed of static,
// the click of a key-up, garbled dispatcher and unit voices squeezed through a radio band, alert tones,
// data bursts, and the squelch tail that ends every call. The hotter the player's wanted level, the
// busier the channel gets.
import { startNoiseLoop, playNoise, playTone, makeDrive } from './synthPrimitives.js';

/** The station: tuning it starts a chatter player instead of a music composer. */
export const PSPD_SCANNER = {
  id: 'pspd_scanner',
  name: 'PSPD Scanner',
  frequency: '460.2 MHz',
  host: 'Port Sarab Dispatch',
  tagline: 'Unit chatter from the Port Sarab Police Department.',
  color: '#2f6bff',
  kind: 'scanner',
  mix: { level: 1.0 },
  createPlayer: createScannerChatter,
};

/** Vowel colours for the garbled voices: the first two resonances of the vocal tract, in Hz. */
const VOWELS = [[730, 1090], [530, 1840], [300, 2200], [570, 840], [330, 870], [660, 1720], [440, 1020]];

/**
 * Run the scanner on any context.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} output
 * @param {() => number} [wantedLevel]  the player's wanted level, 0..5
 */
export function createScannerChatter(ctx, output, wantedLevel = () => 0) {
  const start = ctx.currentTime;
  const bed = startNoiseLoop(ctx, 'white', start);
  const bedBand = ctx.createBiquadFilter();
  bedBand.type = 'bandpass';
  bedBand.frequency.value = 2300;
  bedBand.Q.value = 0.5;
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.035;
  bed.connect(bedBand).connect(bedGain).connect(output);

  // Everything said on the channel goes through a narrow, slightly overdriven radio band.
  const band = ctx.createBiquadFilter();
  band.type = 'highpass';
  band.frequency.value = 380;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 2700;
  const grit = makeDrive(ctx, 2.5);
  const radio = ctx.createGain();
  radio.gain.value = 0.9;
  radio.connect(band).connect(top).connect(grit).connect(output);

  let nextCall = start + 0.4;
  let speakerToggle = false;

  /** Schedule every call that starts before `until`. */
  function scheduleAhead(until, now = ctx.currentTime) {
    for (let guard = 0; guard < 16 && nextCall < until; guard += 1) {
      if (nextCall < now - 0.1) {
        nextCall = now + 0.3;
        continue;
      }
      const level = Math.max(0, Math.min(5, wantedLevel() || 0));
      const length = Math.random() < 0.14 ? dataBurst(nextCall) : transmission(nextCall, level);
      const gap = Math.max(0.4, rand(6 - level * 1.0, 12 - level * 1.9));
      nextCall += length + gap;
    }
  }

  /** One call: key-up click, maybe an alert, a few seconds of voice, the squelch tail. */
  function transmission(t, level) {
    playNoise(ctx, radio, t, { filter: 'highpass', freq: 1500, attack: 0.0005, decay: 0.012, gain: 0.4 });
    let cursor = t + 0.06;
    if (level >= 2 && Math.random() < 0.25 + level * 0.1) {
      playTone(ctx, radio, cursor, { type: 'square', freq: 1050, attack: 0.003, hold: 0.11, decay: 0.01, gain: 0.07 });
      playTone(ctx, radio, cursor + 0.14, { type: 'square', freq: 1400, attack: 0.003, hold: 0.11, decay: 0.01, gain: 0.07 });
      cursor += 0.34;
    }
    speakerToggle = !speakerToggle;
    const dispatcher = speakerToggle;
    const pitch = dispatcher ? rand(185, 215) : rand(100, 135);
    const length = rand(1.1, 2.6 + level * 0.25);
    babble(cursor, length, pitch);
    cursor += length;
    playNoise(ctx, output, cursor, { filter: 'bandpass', freq: 2500, q: 0.4, attack: 0.002, hold: rand(0.1, 0.18), decay: 0.008, gain: 0.16 });
    return cursor + 0.2 - t;
  }

  /** A burst of quick data tones, like a terminal answering a query. */
  function dataBurst(t) {
    const count = 6 + Math.floor(Math.random() * 10);
    const tones = [1200, 1800, 2200];
    for (let i = 0; i < count; i += 1) {
      playTone(ctx, radio, t + i * 0.035, { type: 'sine', freq: tones[Math.floor(Math.random() * tones.length)], attack: 0.002, hold: 0.025, decay: 0.006, gain: 0.07 });
    }
    return count * 0.035 + 0.1;
  }

  /**
   * Unintelligible speech: a buzzing voice source through two resonances that jump between vowel
   * colours syllable by syllable, with consonant hiss at the starts and a falling end to each phrase.
   */
  function babble(t, length, pitch) {
    const source = ctx.createOscillator();
    source.type = 'sawtooth';
    const hiss = startNoiseLoop(ctx, 'white', t);
    const hissBand = ctx.createBiquadFilter();
    hissBand.type = 'bandpass';
    hissBand.frequency.value = 3200;
    hissBand.Q.value = 1.2;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 7;
    const f2Gain = ctx.createGain();
    f2Gain.gain.value = 0.7;
    const mouth = ctx.createGain();
    mouth.gain.value = 0;
    source.connect(f1).connect(mouth);
    source.connect(f2).connect(f2Gain).connect(mouth);
    hiss.connect(hissBand).connect(hissGain).connect(radio);
    const level = ctx.createGain();
    level.gain.value = 1.6;
    mouth.connect(level).connect(radio);

    let s = t;
    const end = t + length;
    source.frequency.setValueAtTime(pitch, t);
    while (s < end - 0.05) {
      const syllable = rand(0.08, 0.21);
      const vowel = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      const phraseFall = 1 - 0.18 * ((s - t) / length);
      f1.frequency.setTargetAtTime(vowel[0], s, 0.012);
      f2.frequency.setTargetAtTime(vowel[1], s, 0.012);
      source.frequency.setTargetAtTime(pitch * phraseFall * rand(0.94, 1.08), s, 0.03);
      if (Math.random() < 0.6) {
        hissGain.gain.setValueAtTime(0.0001, s);
        hissGain.gain.linearRampToValueAtTime(rand(0.08, 0.2), s + 0.008);
        hissGain.gain.linearRampToValueAtTime(0.0001, s + 0.04);
      }
      mouth.gain.setValueAtTime(0.0001, s + 0.02);
      mouth.gain.linearRampToValueAtTime(rand(0.5, 1), s + 0.045);
      mouth.gain.setValueAtTime(rand(0.4, 0.8), s + syllable * 0.75);
      mouth.gain.linearRampToValueAtTime(0.0001, s + syllable);
      s += syllable;
      if (Math.random() < 0.12) s += rand(0.08, 0.22);
    }
    source.start(t);
    source.stop(end + 0.05);
    hiss.stop(end + 0.05);
  }

  return {
    scheduleAhead,
    stop(when) {
      bed.stop(when + 0.5);
    },
  };
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}
