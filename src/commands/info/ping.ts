import { defineCommand } from '../../framework/command.ts';

export default defineCommand({
  name: 'ping',
  description: 'Ping Dingir',
  defer: 'ephemeral',
  run: async (ctx) => {
    const roundTrip = ctx.app.clock().getTime() - ctx.interaction.createdTimestamp;
    const websocket = Math.round(ctx.interaction.client.ws.ping);
    await ctx.reply(`Pong! WebSocket: ${websocket}ms, round-trip: ${roundTrip}ms`);
  },
});
