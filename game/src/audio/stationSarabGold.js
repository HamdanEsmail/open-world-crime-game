// Sarab Gold 98.6: sunset synth-funk for the coast road. Four-on-the-floor with claps, a popping
// octave bass, bright brass-synth stabs on the off-beats and a singing lead in the choruses, written
// fresh for every song from seeded chord progressions, bass rhythms and motifs.
import {
  SCALES, scaleChord, scaleNote, voiceChord, makeMotif, varyMotif, motifBar, buildForm, sectionAt, setTempo, nameSong,
} from './musicSequencer.js';

/** The station and its composer. */
export const SARAB_GOLD = {
  id: 'sarab_gold',
  name: 'Sarab Gold 98.6',
  frequency: '98.6 FM',
  host: 'Samira "Golden Hour" Qasim',
  tagline: 'Sunset funk for the long drive home.',
  color: '#e9b44c',
  kind: 'music',
  mix: { level: 0.95, drums: 0.85, bass: 0.9, keys: 0.6, lead: 0.55, fx: 0.5, reverb: 0.16, delay: 0.2, delaySteps: 3, tone: 15000 },
  makeSong,
  composeBar,
};

const DORIAN_PROGRESSIONS = [[0, 3], [0, 3, 6, 3], [0, 2, 3, 0], [0, 6, 2, 3], [0, 4, 3, 3]];
const MAJOR_PROGRESSIONS = [[0, 5, 1, 4], [3, 2, 1, 0], [1, 4, 0, 5], [3, 4, 2, 5], [0, 2, 3, 4]];
const FORMS = [
  [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['break', 4], ['build', 2], ['chorus', 8], ['outro', 4]],
  [['intro', 4], ['verse', 8], ['build', 2], ['chorus', 8], ['break', 4], ['chorus', 8], ['outro', 4]],
  [['intro', 2], ['verse', 8], ['chorus', 8], ['break', 4], ['build', 2], ['chorus', 8], ['chorus', 4], ['outro', 4]],
];
const TITLE_FIRST = ['Saffron', 'Velvet', 'Golden', 'Coral', 'Neon', 'Honey', 'Amber', 'Slow', 'Sunset', 'Silk'];
const TITLE_SECOND = ['Boulevard', 'Corniche', 'Heatwave', 'Mirage', 'Skyline', 'Lagoon', 'Cruise', 'Palms', 'Overdrive', 'Hour'];
const ARTISTS = ['Lumen & the Lagoons', 'Dahlia Vex', 'The Coral Motors', 'Sami Starlight', 'Velvet Dhow', 'Nadia Neon'];

/** Plan one song: mode, key, tempo, progressions, form, bass rhythm, stab rhythm and lead motifs. */
function makeSong(rng) {
  const mode = rng.chance(0.55) ? 'dorian' : 'major';
  const progressions = mode === 'dorian' ? DORIAN_PROGRESSIONS : MAJOR_PROGRESSIONS;
  const verseIndex = rng.int(0, progressions.length - 1);
  const chorusIndex = (verseIndex + rng.int(1, progressions.length - 1)) % progressions.length;
  const song = {
    ...buildForm(rng.pick(FORMS)),
    ...nameSong(rng, TITLE_FIRST, TITLE_SECOND, ARTISTS),
    mode,
    scale: SCALES[mode],
    avoid: mode === 'dorian' ? [5] : [3, 6],
    root: rng.pick([38, 40, 41, 43, 45, 47]),
    verse: progressions[verseIndex],
    chorus: progressions[chorusIndex],
    bassRhythm: makeFunkBassRhythm(rng),
    stabSteps: rng.pick([[2, 10], [3, 6, 11], [2, 7, 10, 14], [6, 14], [3, 10, 13]]),
    motif: makeMotif(rng, { length: 32, density: 0.55, span: 5, start: rng.pick([0, 2, 4]), syncopation: 0.3 }),
    sounds: {
      bass: { wave: rng.pick(['sawtooth', 'pulse']), cutoff: 300, env: 2200, decay: 0.13, q: 5, sub: 0.6 },
      lead: { wave: rng.pick(['pulse', 'sawtooth']), duty: 0.3, cutoff: 3000, vibrato: 5.6, vibratoDepth: 0.009, glide: 0.06, detune: 6, release: 0.16 },
      stab: { cutoff: 1900, decay: 0.16 },
      pad: { cutoff: 1300, detune: 9, attack: 0.5, release: 0.9 },
      arp: { duty: 0.3, decay: 0.14 },
    },
  };
  song.answer = varyMotif(rng, song.motif, 0.45);
  return setTempo(song, rng.int(104, 114), rng.range(0.03, 0.09));
}

/** A funk bass bar: roots on the one, octave pops on the off-beats, a fifth, a chromatic lead-in. */
function makeFunkBassRhythm(rng) {
  const roles = new Array(16).fill(null);
  roles[0] = 'R';
  const options = [[3, 'R', 0.55], [4, 'O', 0.25], [6, 'O', 0.6], [7, 'R', 0.35], [8, 'R', 0.45], [10, '5', 0.55], [11, 'R', 0.3], [12, 'O', 0.3], [13, '7', 0.2], [14, 'O', 0.5], [15, 'A', 0.4]];
  for (const [step, role, chance] of options) if (rng.chance(chance)) roles[step] = role;
  for (let s = 1; s < 16; s += 1) if (!roles[s] && !roles[s - 1] && rng.chance(0.12)) roles[s] = 'G';
  return roles;
}

/** Write one bar: drums, bass, stabs, pad, lead and arpeggio, by where the bar sits in the song. */
function composeBar(song, bar, rng) {
  const sec = sectionAt(song, bar);
  const name = sec.name;
  const progression = name === 'chorus' || name === 'build' ? song.chorus : song.verse;
  const degree = progression[sec.barIn % progression.length];
  const nextDegree = progression[(sec.barIn + 1) % progression.length];
  const chord = scaleChord(song.root, song.scale, degree, 4);
  const nextRoot = scaleNote(song.root, song.scale, nextDegree);
  const s = song.sounds;
  const ev = [];
  const chorus = name === 'chorus';
  const quietStart = name === 'intro' && sec.barIn < Math.min(2, sec.bars - 1);

  // Drums: four on the floor with claps on two and four; open hats lift the choruses.
  if (name === 'break') {
    for (let st = 0; st < 16; st += 2) ev.push({ step: st, inst: 'shaker', vel: st % 4 === 0 ? 0.55 : 0.35 });
    if (sec.barIn % 2 === 1) ev.push({ step: 12, inst: 'rim', vel: 0.5 });
  } else {
    const dropKick = name === 'build' && sec.sectionEnd;
    if (!quietStart && !dropKick) {
      for (const st of [0, 4, 8, 12]) ev.push({ step: st, inst: 'kick', vel: st === 0 ? 1 : 0.9 });
      if (rng.chance(0.25)) ev.push({ step: rng.pick([7, 14]), inst: 'kick', vel: 0.55 });
    }
    if (!quietStart && name !== 'build') {
      ev.push({ step: 4, inst: 'clap', vel: 0.8 });
      ev.push({ step: 12, inst: 'clap', vel: 0.85 });
    }
    for (let st = 0; st < 16; st += 2) {
      if (chorus && st % 4 === 2) ev.push({ step: st, inst: 'openHat', vel: 0.45 });
      else ev.push({ step: st, inst: 'hat', vel: st % 4 === 0 ? 0.5 : 0.38 });
    }
    if (chorus || (name === 'verse' && sec.barIn >= 4)) {
      for (let st = 1; st < 16; st += 2) if (rng.chance(0.4)) ev.push({ step: st, inst: 'hat', vel: 0.2 });
    }
  }
  if (sec.barIn === 0 && (chorus || (name === 'verse' && sec.index > 1))) ev.push({ step: 0, inst: 'crash', vel: 0.65 });
  if (sec.phraseEnd && (name === 'verse' || chorus) && rng.chance(0.7)) {
    if (rng.chance(0.5)) for (const st of [13, 14, 15]) ev.push({ step: st, inst: 'clap', vel: 0.45 + (st - 13) * 0.15 });
    else [12, 13, 14, 15].forEach((st, i) => ev.push({ step: st, inst: 'tom', midi: 57 - i * 4, vel: 0.6 }));
  }
  if (name === 'build') {
    const rate = sec.sectionEnd ? 1 : 2;
    for (let st = 0; st < 16; st += rate) ev.push({ step: st, inst: 'snare', vel: 0.3 + 0.5 * ((sec.barIn * 16 + st) / (sec.bars * 16)) });
    if (sec.barIn === 0) ev.push({ step: 0, inst: 'riser', len: sec.bars * 16, vel: 0.9 });
  }

  // Bass: the song's funk rhythm on the chord, with whole notes under the break.
  if (name === 'break') {
    ev.push({ step: 0, inst: 'bass', midi: chord[0], len: 14, vel: 0.55, p: s.bass });
  } else if (!quietStart) {
    const rhythm = song.bassRhythm;
    for (let st = 0; st < 16; st += 1) {
      const role = rhythm[st];
      if (!role) continue;
      if (role === 'A' && nextRoot === chord[0]) continue;
      let len = 1;
      while (len < 3 && st + len < 16 && !rhythm[st + len]) len += 1;
      if (role === 'O' || role === 'G') len = Math.min(len, role === 'G' ? 0.5 : 1);
      const midi = role === 'R' ? chord[0] : role === 'O' ? chord[0] + 12 : role === '5' ? chord[2] : role === '7' ? chord[3] : role === 'A' ? nextRoot - 1 : chord[0];
      ev.push({ step: st, inst: 'bass', midi, len, vel: role === 'G' ? 0.3 : st === 0 ? 1 : 0.8, p: s.bass });
    }
  }

  // Stabs on the off-beats in verses and choruses.
  if (name === 'verse' || chorus) {
    const stabNotes = voiceChord(chord.slice(1), 65);
    for (const st of song.stabSteps) ev.push({ step: st, inst: 'stab', notes: stabNotes, vel: chorus ? 0.8 : 0.65, p: s.stab });
  }

  // A pad holds the harmony in the intro, the break, the outro, and softly under the choruses.
  if (name === 'intro' || name === 'break' || name === 'outro' || chorus) {
    ev.push({ step: 0, inst: 'pad', notes: voiceChord(chord, 60), len: 16, vel: chorus ? 0.45 : 0.8, p: s.pad });
  }

  // The lead sings the motif and its answer in the choruses, and a gentler line over the break.
  if (chorus) {
    const phrase = Math.floor(sec.barIn / 2) % 2 === 0 ? song.motif : song.answer;
    motifBar(ev, phrase, sec.barIn % 2, song, degree, 24, 'lead', s.lead, 0.75, true);
  } else if (name === 'break' && sec.barIn >= 2) {
    motifBar(ev, song.answer, sec.barIn % 2, song, degree, 12, 'lead', s.lead, 0.5, true);
  }

  // A bright arpeggio rises through the second half of each verse and the outro.
  if ((name === 'verse' && sec.barIn >= 4) || name === 'outro') {
    const arp = voiceChord(chord, 74);
    const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
    for (let st = 0; st < 16; st += 2) ev.push({ step: st, inst: 'blip', midi: arp[pattern[st / 2] % arp.length], vel: 0.4 + (st % 4 === 0 ? 0.15 : 0), p: s.arp });
  }
  return ev;
}
