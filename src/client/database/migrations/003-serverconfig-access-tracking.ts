import { DataTypes } from 'sequelize';
import type { MigrationParams } from './types';

export async function up({ context }: MigrationParams): Promise<void> {
  const columns = await context.describeTable('ServerConfigs');

  if (!('accessFailureCount' in columns)) {
    await context.addColumn('ServerConfigs', 'accessFailureCount', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  }
  if (!('firstAccessFailureAt' in columns)) {
    await context.addColumn('ServerConfigs', 'firstAccessFailureAt', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
}

export async function down({ context }: MigrationParams): Promise<void> {
  await context.removeColumn('ServerConfigs', 'firstAccessFailureAt');
  await context.removeColumn('ServerConfigs', 'accessFailureCount');
}
