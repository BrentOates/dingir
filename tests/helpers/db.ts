import type { Sequelize } from 'sequelize-typescript';
import { createSequelize } from '../../src/client/database/createSequelize';
import { migrate } from '../../src/client/database/migrator';

export async function createTestDb(): Promise<Sequelize> {
  const db = createSequelize(':memory:');
  await migrate(db);
  return db;
}
