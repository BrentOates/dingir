import { QueryInterface } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { SequelizeStorage, Umzug } from 'umzug';
import { migrations } from './migrations';

export function createMigrator(sequelize: Sequelize): Umzug<QueryInterface> {
  return new Umzug<QueryInterface>({
    migrations,
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize, tableName: 'SequelizeMeta' }),
    logger: undefined,
  });
}

export async function migrate(sequelize: Sequelize): Promise<string[]> {
  const applied = await createMigrator(sequelize).up();
  return applied.map((migration) => migration.name);
}
