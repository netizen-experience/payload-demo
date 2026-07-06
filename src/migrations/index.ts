import * as migration_20260701_062838_initial from './20260701_062838_initial';
import * as migration_20260706_084436_remove_jobs_queue from './20260706_084436_remove_jobs_queue';

export const migrations = [
  {
    up: migration_20260701_062838_initial.up,
    down: migration_20260701_062838_initial.down,
    name: '20260701_062838_initial',
  },
  {
    up: migration_20260706_084436_remove_jobs_queue.up,
    down: migration_20260706_084436_remove_jobs_queue.down,
    name: '20260706_084436_remove_jobs_queue'
  },
];
