import type { Command } from '../framework/command.ts';
import noroles from './admin/noroles.ts';
import post from './admin/post.ts';
import rolesince from './admin/rolesince.ts';
import simulate from './admin/simulate.ts';
import config from './config/config.ts';
import about from './info/about.ts';
import mybirthday from './info/mybirthday.ts';
import ping from './info/ping.ts';
import profile from './info/profile.ts';

/** Every slash command the bot registers. Add new commands here. */
export const commands: Command[] = [noroles, post, rolesince, simulate, config, about, mybirthday, ping, profile];
