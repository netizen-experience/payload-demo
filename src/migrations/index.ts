import * as migration_20260701_062838_initial from './20260701_062838_initial';

export const migrations = [
  {
    up: migration_20260701_062838_initial.up,
    down: migration_20260701_062838_initial.down,
    name: '20260701_062838_initial'
  },
];
