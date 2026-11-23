// Radio Khamsin 94.3: the old quarter's own groove. Goblet-drum patterns of deep doums and ringing
// teks, a jingling frame drum, a drone of tonic and fifth, and an oud-like pluck winding through a
// Hijaz-style scale with grace notes, tremolo and runs that fall home to the tonic; a breathy reed flute
// takes the quiet middle. Every pattern and phrase is generated here, fresh for each song.
import {
  SCALES, scaleNote, makeMotif, varyMotif, buildForm, sectionAt, setTempo, nameSong, snapToChord, fitRegister,
} from './musicSequencer.js';
import { RADIO_STATION_GUIDE } from './radioAndSoundGuide.js';

/** The station (its name, host and tagline come from the guide) and its composer. */
export const RADIO_KHAMSIN = {
  ...RADIO_STATION_GUIDE.find((s) => s.id === 'radio_khamsin'),
  color: '#1ba39c',
  kind: 'music',
  mix: { level: 0.27, drums: 0.95, bass: 0.7, keys: 0.6, lead: 0.75, fx: 0.4, reverb: 0.26, delay: 0.14, delaySteps: 3, tone: 14000 },
  makeSong,
  composeBar,
};

/** Hand-drum skeletons, one character per sixteenth: D a doum, T a tek, dots for the ka strokes to fill. */
const SKELETONS = [
  'D...T.T.D...T...',
  'D..D..T.D...T.T.',
  'D...T..TD.D.T...',
  'D..T..T.D.T.T...',
  'D.....T.D..TT...',
  'D..D.T..D.T...T.',
];
const BASS_MOVES = [[0, 0, 1, 0], [0, 6, 1, 0], [0, 0, 6, 0], [0, 3, 1, 0]];
const FORMS = [
  [['intro', 4], ['verse', 8], ['chorus', 8], ['break', 4], ['verse', 8], ['chorus', 8], ['outro', 4]],
  [['intro', 4], ['verse', 8], ['verse', 4], ['chorus', 8], ['break', 4], ['chorus', 8], ['outro', 4]],
];
const TITLE_FIRST = ['Lantern', 'Wind Tower', 'Old Sarab', 'Spice Road', 'Moonlit', 'Saffron', 'Caravan', 'Courtyard', 'Silver'];
const TITLE_SECOND = ['Dance', 'Nights', 'of the Souk', 'Procession', 'over the Dhow', 'Wedding', 'Mirage', 'Steps', 'Breeze'];
const ARTISTS = ['Ensemble Al Wadi', 'Hala & the Lanterns', 'Qasr Rhythm Club', 'Farida Sahel', 'The Dhow Players', 'Brothers of the Souk'];

function makeSong(rng) {
  const skeleton = rng.pick(SKELETONS);
  const melody = makeMotif(rng, { length: 32, density: 0.6, span: 4, start: 4, syncopation: 0.2 });
  melody[melody.length - 1].degree = 0;
  const song = {
    ...buildForm(rng.pick(FORMS)),
    ...nameSong(rng, TITLE_FIRST, TITLE_SECOND, ARTISTS),
    scale: SCALES.hijaz,
    root: rng.pick([43, 45, 47, 50, 52]),
    skeleton,
    altSkeleton: rng.pick(SKELETONS),
    kaDensity: rng.range(0.25, 0.45),
    bassMoves: rng.pick(BASS_MOVES),
    melody,
    answer: varyMotif(rng, melody, 0.4),
    chorusMelody: makeMotif(rng, { length: 32, density: 0.65, span: 5, start: 2, syncopation: 0.3 }),
    neyLine: makeMotif(rng, { length: 32, density: 0.22, span: 4, start: 4, syncopation: 0 }),
    sounds: {
      bass: { wave: 'triangle', cutoff: 520, env: 500, decay: 0.12, q: 2, sub: 0.7 },
      pluck: { bright: 9, decay: 0.6 },
      drone: { cutoff: 560 },
      ney: {},
    },
  };
  song.chorusAnswer = varyMotif(rng, song.chorusMelody, 0.45);
  return setTempo(song, rng.int(94, 104), rng.range(0.04, 0.1));
}

function composeBar(song, bar, rng) {
  const sec = sectionAt(song, bar);
  const name = sec.name;
  const s = song.sounds;
  const ev = [];
  const chorus = name === 'chorus';
  const bassDegree = song.bassMoves[sec.barIn % song.bassMoves.length];

  // The drone: tonic and fifth, renewed every four bars.
  if (sec.barIn % 4 === 0 && name !== 'break') {
    ev.push({ step: 0, inst: 'drone', notes: [song.root + 12, song.root + 19], len: 64, vel: name === 'intro' ? 0.9 : 0.7, p: s.drone });
  } else if (name === 'break' && sec.barIn === 0) {
    ev.push({ step: 0, inst: 'drone', notes: [song.root + 12, song.root + 19, song.root + 24], len: sec.bars * 16, vel: 0.85, p: s.drone });
  }

  // Hand drums: the skeleton on the goblet drum, ka strokes filling the gaps, a roll into each new phrase.
  const skeleton = chorus && sec.barIn % 2 === 1 ? song.altSkeleton : song.skeleton;
  const drums = name !== 'break' && !(name === 'intro' && sec.barIn < 2);
  if (drums) {
    for (let st = 0; st < 16; st += 1) {
      const mark = skeleton[st];
      if (mark === 'D') ev.push({ step: st, inst: 'doum', vel: st === 0 ? 1 : 0.85 });
      else if (mark === 'T') ev.push({ step: st, inst: 'tek', vel: st % 4 === 0 ? 0.85 : 0.7 });
      else if (rng.chance(chorus ? song.kaDensity + 0.15 : song.kaDensity)) ev.push({ step: st, inst: 'ka', vel: 0.35 + rng.next() * 0.25 });
    }
    if (sec.phraseEnd) {
      for (let st = 12; st < 16; st += 0.5) ev.push({ step: st, inst: st % 1 === 0 ? 'tek' : 'ka', vel: 0.4 + (st - 12) * 0.12 });
    }
  }
  // The frame drum marks the cycle; its jingles shimmer on the eighths in the choruses.
  if (name !== 'break' || sec.barIn % 2 === 0) ev.push({ step: 0, inst: 'frameDrum', vel: 0.85 });
  if (chorus || name === 'verse') ev.push({ step: rng.pick([10, 12]), inst: 'frameSlap', vel: 0.6 });
  if (chorus) {
    ev.push({ step: 8, inst: 'frameDrum', vel: 0.6 });
    for (let st = 0; st < 16; st += 2) ev.push({ step: st, inst: 'shaker', vel: st % 4 === 0 ? 0.45 : 0.3 });
    ev.push({ step: 4, inst: 'clap', vel: 0.45 });
    ev.push({ step: 12, inst: 'clap', vel: 0.5 });
    if (sec.phraseEnd) for (const st of [13, 14, 15]) ev.push({ step: st, inst: 'clap', vel: 0.4 });
  }

  // Bass: round plucks under the doums, moving between the tonic and its neighbours.
  if (drums) {
    const bassRoot = fitRegister(scaleNote(song.root, song.scale, bassDegree), 36, 47);
    for (let st = 0; st < 16; st += 1) {
      if (skeleton[st] !== 'D') continue;
      const midi = st === 0 ? bassRoot : rng.chance(0.3) ? bassRoot + 7 : bassRoot;
      ev.push({ step: st, inst: 'bass', midi, len: 2, vel: 0.85, p: s.bass });
    }
  }

  // The pluck: verse melody and answer, a livelier chorus line; tremolo on long notes, grace notes,
  // and a falling run home at the end of each phrase.
  if (name === 'verse' || chorus || (name === 'outro' && sec.barIn < 2) || (name === 'intro' && sec.barIn >= 2)) {
    const pair = chorus ? [song.chorusMelody, song.chorusAnswer] : [song.melody, song.answer];
    const phrase = Math.floor(sec.barIn / 2) % 2 === 0 ? pair[0] : pair[1];
    const half = sec.barIn % 2;
    for (const n of phrase) {
      const local = n.step - half * 16;
      if (local < 0 || local >= 16) continue;
      if (sec.phraseEnd && half === 1 && local >= 12) continue;
      const degree = n.step % 8 === 0 ? snapToChord(n.degree, bassDegree) : n.degree;
      const midi = scaleNote(song.root + 24, song.scale, degree);
      if (n.step % 8 === 0 && rng.chance(0.3)) ev.push({ step: Math.max(0, local - 0.5), inst: 'pluck', midi: scaleNote(song.root + 24, song.scale, degree + 1), vel: 0.35, p: s.pluck });
      ev.push({ step: local, inst: 'pluck', midi, vel: 0.8, p: s.pluck });
      if (n.len >= 4) {
        for (let k = 0.5; k < n.len - 0.5 && local + k < 16; k += 0.5) ev.push({ step: local + k, inst: 'pluck', midi, vel: 0.42, p: s.pluck });
      }
    }
    if (sec.phraseEnd && half === 1) {
      [4, 3, 2, 1].forEach((degree, i) => ev.push({ step: 12 + i, inst: 'pluck', midi: scaleNote(song.root + 24, song.scale, degree), vel: 0.6 + i * 0.08, p: s.pluck }));
    }
  }

  // The reed flute sings the quiet middle and the close.
  if (name === 'break' || (name === 'outro' && sec.barIn >= 2) || (name === 'intro' && sec.barIn < 2)) {
    let previous = null;
    for (const n of song.neyLine) {
      const local = n.step - (sec.barIn % 2) * 16;
      const midi = scaleNote(song.root + 24, song.scale, n.degree);
      if (local >= 0 && local < 16) ev.push({ step: local, inst: 'ney', midi, len: Math.max(2, n.len), vel: 0.75, from: previous !== null && previous !== midi ? previous : undefined });
      previous = midi;
    }
  }
  return ev;
}
