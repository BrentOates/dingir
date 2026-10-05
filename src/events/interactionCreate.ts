import { MessageFlags } from 'discord.js';
import { CommandContext, createReply } from '../framework/command';
import { defineEvent } from '../framework/event';
import { ConfigService } from '../utilities/ConfigService';
import { Logger } from '../utilities/Logger';

export default defineEvent({
  name: 'interactionCreate',
  run: async (client, interaction) => {
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
      Logger.warn('Unknown command', {
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
      const config = await ConfigService.getConfig(interaction.guildId);
      if (resolved.defer) {
        await interaction.deferReply(
          resolved.defer === 'ephemeral' ? { flags: MessageFlags.Ephemeral } : {}
        );
      }
      const ctx: CommandContext = {
        interaction,
        guild: interaction.guild,
        member: interaction.member,
        config,
        reply,
      };
      await resolved.run(ctx);
    } catch (error) {
      Logger.error(
        'Command failed',
        {
          command: interaction.commandName,
          path: resolved.path,
          guild: interaction.guildId,
          user: interaction.user.id,
        },
        error
      );
      try {
        await reply('Something went wrong running this command.');
      } catch (replyError) {
        Logger.error('Could not send command error reply', { path: resolved.path }, replyError);
      }
    }
  },
});
