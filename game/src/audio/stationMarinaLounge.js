// Marina Lounge 88.8: laid-back lo-fi for slow nights on the Crescent. Soft electric-piano chords in
// sevenths and ninths, a round bass, a lazy kick and rim under swung hats, a sparse bell melody, all
// behind the dust and crackle of an old record and a gently wobbling tape. Written fresh every song.
import {
  SCALES, scaleChord, scaleNote, voiceChord, makeMotif, varyMotif, motifBar, buildForm, sectionAt, setTempo, nameSong,
} from './musicSequencer.js';

/** The station and its composer. `dust` asks the radio for the record's crackle under everything. */
export const MARINA_LOUNGE = {
  id: 'marina_lounge',
  name: 'Marina Lounge 88.8',
  frequency: '88.8 FM',
  host: 'Teo Varga',
  tagline: 'Slow tides, soft keys, no hurry.',
  color: '#8fd3c8',
  kind: 'music',
  dust: 0.06,
  mix: { level: 1.25, drums: 0.8, bass: 0.85, keys: 0.8, lead: 0.55, fx: 0.4, reverb: 0.22, delay: 0.18, delaySteps: 6, tone: 4800 },
  makeSong,
  composeBar,
};

const PROGRESSIONS = [[1, 4, 0, 5], [0, 5, 1, 4], [3, 2, 1, 0], [0, 3, 2, 5], [3, 4, 2, 5], [1, 4, 0, 0]];
const FORMS = [
  [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['outro', 4]],
  [['intro', 2], ['verse', 8], ['chorus', 8], ['break', 4], ['chorus', 8], ['outro', 4]],
];
const TITLE_FIRST = ['Low', 'Slow', 'Teal', 'Salt', '4 AM', 'Harbour', 'Quiet', 'Paper', 'Late'];
const TITLE_SECOND = ['Tide', 'Ferry', 'Hours', '& Glass', 'Lights', 'Rain', 'Moorings', 'Lanterns', 'Corniche'];
const ARTISTS = ['mellow dhow', 'saltwater tapes', 'Kaiyo Sands', 'quiet marina', 'lofi lighthouse', 'Noor & the Night Ferry'];

function makeSong(rng) {
  const verse = rng.pick(PROGRESSIONS);
  let chorus = rng.pick(PROGRESSIONS);
  if (chorus === verse) chorus = PROGRESSIONS[(PROGRESSIONS.indexOf(verse) + 1) % PROGRESSIONS.length];
  const song = {
    ...buildForm(rng.pick(FORMS)),
    ...nameSong(rng, TITLE_FIRST, TITLE_SECOND, ARTISTS),
    scale: SCALES.major,
    avoid: [3, 6],
    root: rng.pick([39, 41, 43, 44, 46, 48]),
    verse,
    chorus,
    kickSteps: rng.pick([[0, 10], [0, 7, 10], [0, 3, 10], [0, 10, 11]]),
    compSteps: rng.pick([[0, 10], [0, 6, 14], [0, 11], [2, 10]]),
    melody: makeMotif(rng, { length: 32, density: 0.35, span: 4, start: rng.pick([2, 4]), syncopation: 0.4 }),
    sounds: {
      bass: { wave: 'sine', cutoff: 600, env: 300, decay: 0.2, q: 1, sub: 0.4 },
      keys: { bright: 1.6, wow: 9 },
      bell: { decay: 1.1 },
    },
  };
  song.answer = varyMotif(rng, song.melody, 0.4);
  return setTempo(song, rng.int(74, 86), rng.range(0.16, 0.26));
}

function composeBar(song, bar, rng) {
  const sec = sectionAt(song, bar);
  const name = sec.name;
  const progression = name === 'chorus' ? song.chorus : song.verse;
  const degree = progression[sec.barIn % progression.length];
  const nextDegree = progression[(sec.barIn + 1) % progression.length];
  const chord = scaleChord(song.root, song.scale, degree, 5);
  const s = song.sounds;
  const ev = [];
  const drums = !(name === 'intro' || name === 'break' || (name === 'outro' && sec.barIn >= 2));

  // Lazy drums: the kick behind the beat, a soft rim and snare, swung hats with a hand-played sway.
  if (drums) {
    for (const st of song.kickSteps) ev.push({ step: st, inst: 'kick', vel: st === 0 ? 0.8 : 0.6, p: LOFI_KICK });
    ev.push({ step: 4, inst: sec.barIn % 2 ? 'snare' : 'rim', vel: 0.55, p: LOFI_SNARE });
    ev.push({ step: 12, inst: 'snare', vel: 0.6, p: LOFI_SNARE });
    for (let st = 0; st < 16; st += 2) ev.push({ step: st, inst: 'hat', vel: (st % 4 === 0 ? 0.36 : 0.24) + rng.next() * 0.08 });
    if (rng.chance(0.4)) ev.push({ step: rng.pick([7, 15]), inst: 'hat', vel: 0.16 });
    if (rng.chance(0.25)) ev.push({ step: 15, inst: 'snare', vel: 0.18, p: LOFI_SNARE });
  } else if (name !== 'intro' || sec.barIn > 0) {
    ev.push({ step: 0, inst: 'shaker', vel: 0.25 });
    ev.push({ step: 8, inst: 'shaker', vel: 0.2 });
  }

  // Keys: extended chords comped on the song's rhythm, voiced smoothly around middle C.
  const voicing = voiceChord(chord.slice(1), 62);
  for (let i = 0; i < song.compSteps.length; i += 1) {
    const st = song.compSteps[i];
    const next = song.compSteps[i + 1] ?? 16;
    ev.push({ step: st, inst: 'keys', notes: voicing, len: next - st, vel: i === 0 ? 0.75 : 0.55, p: s.keys });
  }

  // Bass: the root on the one, a fifth on the off-beat, a step toward the next chord.
  if (name !== 'intro' || sec.barIn >= 1) {
    const root = chord[0];
    ev.push({ step: 0, inst: 'bass', midi: root, len: 6, vel: 0.85, p: s.bass });
    ev.push({ step: rng.pick([7, 10]), inst: 'bass', midi: chord[2] - 12 >= 28 ? chord[2] - 12 : chord[2], len: 3, vel: 0.6, p: s.bass });
    if (nextDegree !== degree && rng.chance(0.6)) {
      const nextRoot = scaleNote(song.root, song.scale, nextDegree);
      ev.push({ step: 14, inst: 'bass', midi: nextRoot + (nextRoot > root ? -1 : 1), len: 2, vel: 0.5, p: s.bass });
    }
  }

  // A sparse bell melody in the choruses, and a few notes over the intro and break.
  if (name === 'chorus') {
    const phrase = Math.floor(sec.barIn / 2) % 2 === 0 ? song.melody : song.answer;
    motifBar(ev, phrase, sec.barIn % 2, song, degree, 36, 'bell', s.bell, 0.7, false);
  } else if ((name === 'break' || name === 'intro') && sec.barIn % 2 === 1) {
    motifBar(ev, song.answer, 1, song, degree, 36, 'bell', s.bell, 0.5, false);
  }
  return ev;
}

const LOFI_KICK = { tune: 0.85, decay: 1.2, click: 0.2 };
const LOFI_SNARE = { tune: 0.9, decay: 0.8 };
