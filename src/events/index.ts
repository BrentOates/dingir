import guildCreate from './guildCreate.ts';
import guildDelete from './guildDelete.ts';
import guildMemberAdd from './guildMemberAdd.ts';
import guildMemberRemove from './guildMemberRemove.ts';
import guildMemberUpdate from './guildMemberUpdate.ts';
import interactionCreate from './interactionCreate.ts';
import messageCreate from './messageCreate.ts';
import messageDelete from './messageDelete.ts';
import messageUpdate from './messageUpdate.ts';
import ready from './ready.ts';
import type { AnyEventDefinition } from '../framework/event.ts';

/** Every gateway event the bot listens to. Add new events here. */
export const events: AnyEventDefinition[] = [
  guildCreate,
  guildDelete,
  guildMemberAdd,
  guildMemberRemove,
  guildMemberUpdate,
  interactionCreate,
  messageCreate,
  messageDelete,
  messageUpdate,
  ready,
];
