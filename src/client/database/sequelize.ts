import { env } from '../../config/env';
import { createSequelize } from './createSequelize';

export const sequelize = createSequelize(env.dbPath);
