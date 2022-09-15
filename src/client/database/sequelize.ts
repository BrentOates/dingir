import { Sequelize } from 'sequelize-typescript';
import { Logger } from '../../utilities/Logger';

import { ServerConfig } from '../models/ServerConfig';
import { UserProfile } from '../models/UserProfile';

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'data/dingir.sqlite',
  models: [ServerConfig, UserProfile],
  logging: (msg) => Logger.writeLog(msg),
});
