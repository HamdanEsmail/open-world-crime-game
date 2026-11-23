// The ten jobs of KHAMSIN's story at a glance: who gives each, where, what must come first and what
// it pays. The job runner decides what is on offer and fills the pause menu's job list from it.

/** The jobs on offer: not done, everything they require done, open at this hour. */
export function jobsOnOffer(completedIds, hour) {
  const done = new Set(completedIds || []);
  return STORY_JOBS.filter((job) => !done.has(job.id) && job.requires.every((id) => done.has(id)) && openAt(job.hours, hour));
}

/** The job told after this one, or null after the finale. */
export function nextJobAfter(jobId) {
  const job = STORY_JOBS.find((entry) => entry.id === jobId);
  return job ? STORY_JOBS.find((entry) => entry.order === job.order + 1) || null : null;
}

/** What a job pays, {money, rep}, or null for a job the story does not know. */
export function rewardForJob(jobId) {
  const job = STORY_JOBS.find((entry) => entry.id === jobId);
  return job ? { money: job.reward.money, rep: job.reward.rep } : null;
}

/** True for the last job: the heist at the top of the Vane Spire. */
export function jobIsFinale(jobId) {
  return jobId === STORY_JOBS[STORY_JOBS.length - 1].id;
}

/** Within [from, to) of a job's hours, which may wrap past midnight; null is any hour. */
function openAt(hours, hour) {
  if (!hours) return true;
  return hours[0] <= hours[1] ? hour >= hours[0] && hour < hours[1] : hour >= hours[0] || hour < hours[1];
}

/** The story in order. */
export const STORY_JOBS = [
  { id: 'shakedown_run', order: 1, title: 'Shakedown Run', giver: 'faris', contact: 'contact_faris', requires: [], hours: null, reward: { money: 500, rep: 60 } },
  { id: 'borrowed_wheels', order: 2, title: 'Borrowed Wheels', giver: 'mina', contact: 'contact_mina', requires: ['shakedown_run'], hours: null, reward: { money: 1200, rep: 90 } },
  { id: 'market_day', order: 3, title: 'Market Day', giver: 'mina', contact: 'contact_mina', requires: ['borrowed_wheels'], hours: null, reward: { money: 1500, rep: 110 } },
  { id: 'dock_shift', order: 4, title: 'Dock Shift', giver: 'tavi', contact: 'contact_tavi', requires: ['market_day'], hours: null, reward: { money: 2500, rep: 140 } },
  { id: 'paper_trail', order: 5, title: 'Paper Trail', giver: 'mina', contact: 'contact_mina', requires: ['dock_shift'], hours: null, reward: { money: 2000, rep: 130 } },
  { id: 'sand_tax', order: 6, title: 'Sand Tax', giver: 'faris', contact: 'contact_faris', requires: ['paper_trail'], hours: null, reward: { money: 3000, rep: 170 } },
  { id: 'dress_rehearsal', order: 7, title: 'Dress Rehearsal', giver: 'mina', contact: 'contact_mina', requires: ['sand_tax'], hours: null, reward: { money: 3500, rep: 190 } },
  { id: 'golden_goose', order: 8, title: 'Golden Goose', giver: 'tavi', contact: 'contact_tavi', requires: ['dress_rehearsal'], hours: null, reward: { money: 6000, rep: 240 } },
  { id: 'khamsin_rising', order: 9, title: 'Khamsin Rising', giver: 'mina', contact: 'contact_mina', requires: ['golden_goose'], hours: null, reward: { money: 2000, rep: 150 } },
  { id: 'the_vane_job', order: 10, title: 'The Vane Job', giver: 'mina', contact: 'vane_spire_door', requires: ['khamsin_rising'], hours: null, reward: { money: 25000, rep: 500 } },
];
