// The story's jobs, in the order they are told. Each line imports one job module from jobs/ and
// the list below names it; the mission runner sorts them by their own `order` and offers each once
// the jobs it requires are done. To add a job: one import line, one name in JOB_LIST.
import { job as shakedownRun } from './jobs/shakedownRun.js';
import { job as borrowedWheels } from './jobs/borrowedWheels.js';
import { job as marketDay } from './jobs/marketDay.js';
import { job as dockShift } from './jobs/dockShift.js';
import { job as paperTrail } from './jobs/paperTrail.js';
import { job as sandTax } from './jobs/sandTax.js';
import { job as dressRehearsal } from './jobs/dressRehearsal.js';
import { job as goldenGoose } from './jobs/goldenGoose.js';
import { job as khamsinRising } from './jobs/khamsinRising.js';
import { job as theVaneJob } from './jobs/theVaneJob.js';

/** Every job of the story, as the runner registers them. */
export const JOB_LIST = [
  shakedownRun,
  borrowedWheels,
  marketDay,
  dockShift,
  paperTrail,
  sandTax,
  dressRehearsal,
  goldenGoose,
  khamsinRising,
  theVaneJob,
];
