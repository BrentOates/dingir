import { Sequelize } from 'sequelize-typescript';
import { Logger } from '../../utilities/Logger';

import { ServerConfig } from '../models/ServerConfig';
import { UserProfile } from '../models/UserProfile';

export function createSequelize(storage: string): Sequelize {
  return new Sequelize({
    dialect: 'sqlite',
    storage,
    models: [ServerConfig, UserProfile],
    logging: (msg) => Logger.writeLog(msg),
  });
}
