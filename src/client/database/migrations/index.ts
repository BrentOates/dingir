import * as baseline from './001-baseline';
import * as userProfileUnique from './002-userprofile-unique';
import * as serverConfigAccessTracking from './003-serverconfig-access-tracking';
import type { MigrationParams } from './types';

export interface MigrationModule {
  name: string;
  up: (params: MigrationParams) => Promise<void>;
  down: (params: MigrationParams) => Promise<void>;
}

export const migrations: MigrationModule[] = [
  { name: '001-baseline', ...baseline },
  { name: '002-userprofile-unique', ...userProfileUnique },
  { name: '003-serverconfig-access-tracking', ...serverConfigAccessTracking },
];
