// Dune FM 101.1: driving desert rock-electro, broadcast from the mast out in the Amber Dunes. A
// galloping bass, distorted power chords, a gritty lead riff, tom fills that tumble into each new
// phrase, snare rolls that build into the drop, all written fresh for every song.
import {
  SCALES, scaleChord, scaleNote, makeMotif, varyMotif, motifBar, buildForm, sectionAt, setTempo, nameSong, fitRegister,
} from './musicSequencer.js';
import { RADIO_STATION_GUIDE } from './radioAndSoundGuide.js';

/** The station (its name, host and tagline come from the guide) and its composer. */
export const DUNE_FM = {
  ...RADIO_STATION_GUIDE.find((s) => s.id === 'dune_fm'),
  color: '#e4572e',
  kind: 'music',
  mix: { level: 0.17, drums: 0.9, bass: 0.85, keys: 0.55, lead: 0.5, fx: 0.5, reverb: 0.12, delay: 0.12, delaySteps: 4, tone: 13000 },
  makeSong,
  composeBar,
};

const MINOR_PROGRESSIONS = [[0, 5, 6, 0], [0, 6, 5, 6], [0, 3, 5, 6], [0, 2, 6, 5], [0, 0, 5, 6], [5, 6, 0, 0]];
const FORMS = [
  [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['break', 4], ['build', 4], ['chorus', 8], ['outro', 4]],
  [['intro', 4], ['chorus', 8], ['verse', 8], ['build', 2], ['chorus', 8], ['break', 4], ['chorus', 8], ['outro', 2]],
];
const TITLE_FIRST = ['Sidewinder', 'Red Dune', 'Iron Wadi', 'Scorpion', 'Burning', 'Dust Devil', 'Sand Cannon', 'Nightrider', 'Copper'];
const TITLE_SECOND = ['Run', 'Highway', 'Gallop', 'Engine', 'Storm', 'Mile', 'Thunder', 'Horizon', 'Machine'];
const ARTISTS = ['Scorpion Halo', 'The Wadi Wolves', 'Rust Caravan', 'Ghost Camel', 'Hammer of the Dunes', 'Mirage Engine'];

function makeSong(rng) {
  const mode = rng.chance(0.7) ? 'minor' : 'dorian';
  const verse = rng.pick(MINOR_PROGRESSIONS);
  let chorus = rng.pick(MINOR_PROGRESSIONS);
  if (chorus === verse) chorus = MINOR_PROGRESSIONS[(MINOR_PROGRESSIONS.indexOf(verse) + 2) % MINOR_PROGRESSIONS.length];
  const song = {
    ...buildForm(rng.pick(FORMS)),
    ...nameSong(rng, TITLE_FIRST, TITLE_SECOND, ARTISTS),
    mode,
    scale: SCALES[mode],
    avoid: [1, 5],
    root: rng.pick([38, 40, 42, 43, 45]),
    verse,
    chorus,
    gallop: rng.pick([[0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15], [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14], [0, 2, 3, 6, 7, 8, 10, 11, 14, 15]]),
    kickPattern: rng.pick([[0, 8, 10], [0, 6, 8], [0, 3, 8, 11], [0, 8, 11, 14]]),
    chordHits: rng.pick([[0, 6, 8, 14], [0, 3, 6, 8, 11, 14], [0, 8], [0, 6, 10]]),
    riff: makeMotif(rng, { length: 32, density: 0.7, span: 4, start: 0, syncopation: 0.35 }),
    sounds: {
      bass: { wave: 'sawtooth', cutoff: 700, env: 900, decay: 0.08, q: 2, sub: 0.55, drive: 2.5 },
      lead: { wave: 'sawtooth', cutoff: 2600, q: 3, vibrato: 6.2, vibratoDepth: 0.012, glide: 0.04, drive: 5, release: 0.1, detune: 9 },
      power: { drive: 7, cutoff: 2400 },
      pad: { cutoff: 900, detune: 12, attack: 0.8, release: 1.2 },
    },
  };
  song.riffAnswer = varyMotif(rng, song.riff, 0.5);
  return setTempo(song, rng.int(124, 134), 0);
}

function composeBar(song, bar, rng) {
  const sec = sectionAt(song, bar);
  const name = sec.name;
  const progression = name === 'chorus' ? song.chorus : song.verse;
  const degree = progression[sec.barIn % progression.length];
  const nextDegree = progression[(sec.barIn + 1) % progression.length];
  const chord = scaleChord(song.root, song.scale, degree, 3);
  const root = fitRegister(chord[0], 33, 45);
  const fifth = root + 7;
  const s = song.sounds;
  const ev = [];
  const chorus = name === 'chorus';
  const half = name === 'break';

  // Drums: a rock beat, ride in the choruses, half-time in the break, toms tumbling into new phrases.
  if (name === 'intro' && sec.barIn < 2) {
    for (let st = 0; st < 16; st += 4) ev.push({ step: st, inst: 'tom', midi: 45, vel: 0.5 + st / 40 });
  } else if (half) {
    ev.push({ step: 0, inst: 'kick', vel: 0.95 });
    ev.push({ step: 8, inst: 'snare', vel: 0.8 });
    for (let st = 0; st < 16; st += 4) ev.push({ step: st, inst: 'ride', vel: 0.5 });
  } else if (name === 'build') {
    const progress = (sec.barIn + 1) / sec.bars;
    const rate = progress > 0.75 ? 1 : progress > 0.4 ? 2 : 4;
    for (let st = 0; st < 16; st += rate) ev.push({ step: st, inst: 'snare', vel: 0.35 + 0.55 * ((sec.barIn * 16 + st) / (sec.bars * 16)) });
    if (!sec.sectionEnd) for (let st = 0; st < 16; st += 4) ev.push({ step: st, inst: 'kick', vel: 0.9 });
    if (sec.barIn === 0) ev.push({ step: 0, inst: 'riser', len: sec.bars * 16, vel: 1 });
  } else {
    // The drummer never plays the same bar twice: a pushed kick, ghost notes, a hat left open.
    for (const st of song.kickPattern) ev.push({ step: st, inst: 'kick', vel: st === 0 ? 1 : 0.85 });
    if (rng.chance(0.35)) ev.push({ step: rng.pick([3, 7, 13, 15]), inst: 'kick', vel: 0.6 });
    ev.push({ step: 4, inst: 'snare', vel: 0.9 });
    ev.push({ step: 12, inst: 'snare', vel: 0.95 });
    if (rng.chance(0.4)) ev.push({ step: rng.pick([7, 9, 10, 15]), inst: 'snare', vel: 0.25 });
    const openAt = rng.chance(0.3) ? rng.pick([6, 14]) : -1;
    for (let st = 0; st < 16; st += 2) {
      if (st === openAt) ev.push({ step: st, inst: 'openHat', vel: 0.45 });
      else ev.push({ step: st, inst: chorus ? 'ride' : 'hat', vel: (st % 4 === 0 ? 0.6 : 0.42) + rng.next() * 0.08 });
    }
  }
  if (sec.barIn === 0 && name !== 'intro' && name !== 'build') ev.push({ step: 0, inst: 'crash', vel: 0.8 });
  else if (chorus && sec.barIn % 4 === 0) ev.push({ step: 0, inst: 'crash', vel: 0.55 });
  if (sec.phraseEnd && !half && name !== 'build' && !(name === 'intro' && sec.barIn < 2)) {
    const start = rng.pick([8, 10, 12]);
    for (let st = start; st < 16; st += 1) ev.push({ step: st, inst: 'tom', midi: 57 - Math.floor(((st - start) / (16 - start)) * 3) * 5, vel: 0.55 + (st - start) * 0.05 });
  }

  // Bass: the gallop on the root, jumping the octave mid-bar and walking into the next chord.
  if (!(name === 'intro' && sec.barIn < 2)) {
    if (half) {
      ev.push({ step: 0, inst: 'bass', midi: root, len: 6, vel: 0.8, p: s.bass });
      ev.push({ step: 8, inst: 'bass', midi: root, len: 4, vel: 0.7, p: s.bass });
    } else {
      const walk = sec.phraseEnd && nextDegree !== degree;
      const nextRoot = fitRegister(scaleNote(song.root, song.scale, nextDegree), 33, 45);
      for (const st of song.gallop) {
        if (walk && st >= 12) {
          ev.push({ step: st, inst: 'bass', midi: root + Math.round(((nextRoot - root) * (st - 11)) / 5), len: 1, vel: 0.85, p: s.bass });
          continue;
        }
        const octave = chorus && (st === 8 || st === 10);
        ev.push({ step: st, inst: 'bass', midi: octave ? root + 12 : root, len: 1, vel: st % 4 === 0 ? 1 : 0.75, p: s.bass });
      }
    }
  }

  // Power chords: hits in the choruses, long held chords in the second half of the verses.
  const power = [root + 12, fifth + 12, root + 24];
  if (chorus) {
    for (let i = 0; i < song.chordHits.length; i += 1) {
      const st = song.chordHits[i];
      const next = song.chordHits[i + 1] ?? 16;
      ev.push({ step: st, inst: 'powerChord', notes: power, len: Math.max(1, next - st - 0.5), vel: 0.85, p: s.power });
    }
  } else if (name === 'verse' && sec.barIn >= 4) {
    ev.push({ step: 0, inst: 'powerChord', notes: power, len: 15, vel: 0.65, p: s.power });
  } else if (name === 'verse') {
    const chugs = rng.pick([[0, 3, 6], [0, 3, 6, 10], [0, 2, 3, 6], [0, 6, 8, 11]]);
    for (const st of chugs) ev.push({ step: st, inst: 'powerChord', notes: power, len: 0.6, vel: 0.5 + rng.next() * 0.1, p: s.power });
  }

  // Lead: the riff and its answer in the choruses, call-and-response in the verses, a dark pad in the break.
  if (chorus) {
    const phrase = Math.floor(sec.barIn / 2) % 2 === 0 ? song.riff : song.riffAnswer;
    motifBar(ev, phrase, sec.barIn % 2, song, degree, 24, 'lead', s.lead, 0.7, true);
  } else if (name === 'verse' && sec.barIn % 4 >= 2) {
    motifBar(ev, song.riffAnswer, sec.barIn % 2, song, degree, 24, 'lead', s.lead, 0.55, true);
  } else if (name === 'intro' && sec.barIn >= 2) {
    motifBar(ev, song.riff, sec.barIn % 2, song, degree, 24, 'lead', s.lead, 0.4, true);
  }
  if (half || name === 'outro') {
    ev.push({ step: 0, inst: 'pad', notes: [root + 12, fifth + 12, fitRegister(chord[1], 57, 68)], len: 16, vel: 0.9, p: s.pad });
  }
  return ev;
}
