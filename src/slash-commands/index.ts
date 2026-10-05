import type { Command } from '../framework/command.ts';
import noroles from './Admin/noroles.ts';
import post from './Admin/post.ts';
import rolesince from './Admin/rolesince.ts';
import simulate from './Admin/simulate.ts';
import config from './Config/config.ts';
import about from './Info/about.ts';
import mybirthday from './Info/mybirthday.ts';
import ping from './Info/ping.ts';
import profile from './Info/profile.ts';

/** Every slash command the bot registers. Add new commands here. */
export const commands: Command[] = [noroles, post, rolesince, simulate, config, about, mybirthday, ping, profile];
