import { MessageFlags } from 'discord.js';
import { type CommandContext, createReply } from '../framework/command.ts';
import { UserError } from '../framework/errors.ts';
import { defineEvent } from '../framework/event.ts';
import { getConfig } from '../services/ConfigService.ts';

export default defineEvent({
  name: 'interactionCreate',
  run: async (app, client, interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'Dingir only works in servers.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const command = client.slashCommands.get(interaction.commandName);
    const resolved = command?.resolve(interaction);
    if (!resolved) {
      app.logger.warn('Unknown command', {
        command: interaction.commandName,
        subcommand: interaction.options.getSubcommand(false),
        guild: interaction.guildId,
        user: interaction.user.id,
      });
      await interaction.reply({ content: 'Unknown command.', flags: MessageFlags.Ephemeral });
      return;
    }

    const reply = createReply(interaction);
    try {
      if (resolved.defer) {
        await interaction.deferReply(
          resolved.defer === 'ephemeral' ? { flags: MessageFlags.Ephemeral } : {}
        );
      }
      const config = await getConfig(app.db, interaction.guildId);
      const ctx: CommandContext = {
        app,
        interaction,
        guild: interaction.guild,
        member: interaction.member,
        config,
        reply,
      };
      await resolved.run(ctx);
    } catch (error) {
      const context = {
        command: interaction.commandName,
        path: resolved.path,
        guild: interaction.guildId,
        user: interaction.user.id,
      };
      let message = 'Something went wrong running this command.';
      if (error instanceof UserError) {
        message = error.message;
        app.logger.info('Command rejected', { ...context, reason: message });
      } else {
        app.logger.error('Command failed', context, error);
      }
      try {
        await reply(message);
      } catch (replyError) {
        app.logger.error('Could not send command error reply', { path: resolved.path }, replyError);
      }
    }
  },
});
