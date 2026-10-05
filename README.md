# Dingir

A Discord bot for the Irkallu server, built with discord.js and TypeScript. Provides member onboarding, birthday management, activity tracking, and moderation tools. Requires Node 24 or newer.

## Getting Started

### Local Development

1. Clone the repository
2. Install dependencies: `npm ci`
3. Copy `.env.example` to `.env` and fill in `TOKEN` and `CLIENT_ID` from the [Discord Developer Portal](https://discord.com/developers/applications)
4. Start: `npm start` (Node runs the TypeScript source directly; there is no build step)

For watch mode during development:
```bash
npm run dev
```

Test and lint:
```bash
npm test        # Run the test suite
npm run typecheck  # Type-check src and tests
npm run lint    # Check code style and errors
```

### Docker

Build and run the bot in a container with a persistent database volume:

```bash
docker build -t dingir .
docker run -d \
  --env-file .env \
  -v dingir-data:/usr/src/app/data \
  --name dingir \
  dingir
```

The database is stored in `/usr/src/app/data` inside the container; mount a volume there to persist it between runs.

## Configuration

All configuration is managed through environment variables in `.env`. See `.env.example` for defaults.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TOKEN` | Yes | — | Discord bot token from the Developer Portal |
| `CLIENT_ID` | Yes | — | Discord application (client) ID from the Developer Portal |
| `JOB_SCHEDULE` | No | `0 9 * * *` | Cron schedule (5 or 6 fields) for daily cleanup, birthday notifications, and calendar updates. Example: `0 9 * * *` = 9:00 AM daily |
| `BOT_TIMEZONE` | No | `Europe/London` | IANA time zone used for scheduling and birthday calculations (e.g. `Europe/London`, `America/New_York`) |
| `DB_PATH` | No | `data/dingir.sqlite` | Path to SQLite database file. Use `:memory:` for throwaway runs (no persistence) |
| `PURGE_MIN_FAILURES` | No | `3` | Minimum number of failed guild access checks before purging orphaned data (see Data & Retention) |
| `PURGE_GRACE_DAYS` | No | `7` | Grace period (days) after first failure before purging. Data is purged only after both thresholds are met |
| `DEV_GUILD_ID` | No | — | Guild ID for instant slash command registration during development (commands update immediately instead of within 1 hour). Omit in production |

## Discord Setup

### Required Intents

The bot declares these gateway intents. The first two are **privileged** and must be enabled in the Developer Portal under "Bot" → "Privileged Gateway Intents":

- **Guilds** (unprivileged)
- **Guild Members** (privileged)
- **Guild Messages** (unprivileged)
- **Message Content** (privileged)

### Bot Permissions

The bot requires specific permissions on a per-feature basis. When inviting the bot, ensure it has:

- **View Channels** — required to see and access channels for all operations
- **Send Messages** — required for welcome messages, announcements, audit logs
- **Embed Links** — required to send embeds (profile, about, audit logs)
- **Attach Files** — required to send welcome images
- **Read Message History** — required to edit birthday calendar messages
- **Manage Roles** — required to assign roles during onboarding
- **Ban Members** — required for honeypot enforcement

The invite URL should include all these permissions. You can generate one in the Developer Portal under "OAuth2" → "URL Generator".

Use `DEV_GUILD_ID` in `.env` to test commands instantly in a single guild instead of waiting 1 hour for global registration.

## Commands

Commands are organized into categories. Only **admin-only** commands require the Administrator permission; all others are available to any member.

### Info Commands

| Command | Who Can Use | Description |
|---------|------------|-------------|
| `/ping` | Everyone | Show WebSocket latency and round-trip time |
| `/about` | Everyone | Display Dingir version, source code link, server info, and uptime |
| `/profile <member>` | Admin | Fetch a member's profile: nickname, username, join date, onboarding status, activity score, and birthday if set |
| `/mybirthday set <day> <month>` | Everyone | Set your birthday for this server |
| `/mybirthday clear` | Everyone | Remove your birthday from this server |

### Admin Commands

| Command | Description |
|---------|-------------|
| `/simulate join [member]` | Audit only: send the "member joined" audit for a member (no roles or welcome message). Defaults to you |
| `/simulate onboard [member]` | Dry run: show what onboarding would do (guest roles, welcome) without applying changes. Defaults to you |
| `/rolesince <role> [days]` | List members in a role who joined the server at least N days ago |
| `/noroles` | List all members with no roles assigned (excluding bots) |
| `/post <channel> [content] [attachment]` | Post a simple message and/or file to a channel. Requires at least one of content or attachment |

### Config Commands

Use `/config <group> <subcommand>` to manage server settings. All are admin-only.

#### `/config announcements` — Announcements Channel

| Subcommand | Description |
|------------|-------------|
| `set <channel>` | Set the announcements channel |
| `get` | Show the currently configured announcements channel |
| `clear` | Clear the announcements channel |

#### `/config audit` — Audit Log Channel

| Subcommand | Description |
|------------|-------------|
| `set <channel>` | Set the audit log channel (where member events are posted) |
| `get` | Show the currently configured audit channel |
| `clear` | Clear the audit channel |

#### `/config sysmsgs` — Bot System Messages

Toggle whether the bot uses Discord's system channel for welcome messages:

| Subcommand | Description |
|------------|-------------|
| `enable` | Enable bot system messages in the server's system channel |
| `disable` | Disable bot system messages in the server's system channel |
| `status` | Show the current status |

#### `/config honeypot` — Honeypot Channel

Configure a channel that automatically bans members who post in it:

| Subcommand | Description |
|------------|-------------|
| `set <channel>` | Set the honeypot channel |
| `get` | Show the currently configured honeypot channel |
| `clear` | Clear the honeypot channel |

#### `/config welcome` — Welcome Messages & Images

| Subcommand | Description |
|------------|-------------|
| `set-message <text>` | Set the welcome message (max 1500 characters). Use `{member}` to mention the new member |
| `set-image <url>` | Set the background image for welcome images (http/https URL) |
| `get` | Show the welcome message and image URL |
| `clear <which>` | Clear the message, image, or both (`which` = `message`, `image`, or `all`) |
| `preview` | Preview the welcome message as it would be sent for you |

#### `/config newroles` — New Member Roles

Roles given to members when they complete onboarding:

| Subcommand | Description |
|------------|-------------|
| `get` | Show the current new-member roles |
| `set <role-one> [role-two] [role-three]` | Set up to three roles to give on onboarding |
| `clear` | Clear the new-member roles |

#### `/config birthdays` — Birthday Calendar

| Subcommand | Description |
|------------|-------------|
| `create <channel>` | Create or recreate a birthday calendar in a text channel (fetches all server birthdays) |
| `sync` | Manually sync the birthday calendar (runs automatically on the scheduled job) |
| `remove` | Remove the birthday calendar message |

#### `/config debug` — Onboarding Diagnostics

Toggle diagnostic audits for onboarding runs:

| Subcommand | Description |
|------------|-------------|
| `enable` | Post a summary of each onboarding run to the audit channel |
| `disable` | Do not post onboarding summaries |
| `status` | Show the current status |

## Behaviour

### Onboarding

When a member joins without screening enabled, or completes server screening:

1. **Audit**: A "member joined" audit is posted to the configured audit channel (if set)
2. **Guest Roles**: Configured new-member roles are assigned (if any are set)
3. **Welcome**: A welcome message is posted to the system channel or audit channel, optionally with a background image
4. **Debug**: If debug mode is enabled, a diagnostic summary is posted to the audit channel showing what succeeded, failed, or was skipped

Roles are only assigned if:
- They are below the bot's highest role in the role hierarchy
- They are not managed by an integration
- They are not `@everyone`

If a role cannot be assigned, the error is logged and the onboarding continues for other roles and steps.

### Audit Log

Member events are posted to the configured audit channel:
- Member joined (join audit)
- Member completed onboarding
- Member left (with member data cleanup status)
- Role changes (new-member roles updated/cleared)
- Messages posted via `/post`
- Any failed or unusual events (role assignment failures, onboarding failures, honeypot triggers)

### Honeypot

If a honeypot channel is configured, any non-administrator member who posts in it is:
1. Immediately banned (with messages from the past 7 days deleted)
2. Removed from the database
3. Logged to the audit channel

### Activity Score

Each message posted by a human (non-bot, non-webhook) in any channel increments the member's activity score by 1. This is used to rank member engagement and is visible in `/profile`.

### Birthdays

Members can set their birthday using `/mybirthday set <day> <month>`. Birthdays are stored per-server.

**Birthday Announcements**: On the configured schedule (default 9:00 AM daily), the bot checks all servers and posts birthday announcements in the announcements channel for members with birthdays today. If a member's birthday is Feb 29 and it's not a leap year, they are celebrated on Feb 28 instead.

**Birthday Calendar**: If configured, a pinned calendar message lists the next upcoming birthdays (up to 10 birthdays). The calendar is automatically updated on the scheduled job. Members can create a new calendar with `/config birthdays create`, and it is recreated if the message or channel is deleted.

**Timezones**: All birthday calculations use the `BOT_TIMEZONE` setting. Members' birthdays are stored as month/day only (no year), and the next occurrence is calculated relative to the bot's configured time zone.

### Scheduled Daily Job

On the schedule defined by `JOB_SCHEDULE` (default: 9:00 AM UTC), three tasks run in order:

1. **Data Check** — Checks access to each configured guild. If unreachable, increments the failure counter. After `PURGE_MIN_FAILURES` failures spanning `PURGE_GRACE_DAYS` days, the guild's data is purged. Transient errors (timeouts, API errors) do not count toward purging.
2. **Birthday Notifications** — Posts birthday announcements in the announcements channel for members with birthdays today
3. **Birthday Calendars** — Updates all configured birthday calendar messages

## Data & Retention

### Storage

All data is persisted in SQLite at the path specified by `DB_PATH` (default: `data/dingir.sqlite`). The database directory is created automatically if it doesn't exist.

Migrations run automatically on startup. Current migrations:

- **001-baseline** — Initial schema (ServerConfigs and UserProfiles tables)
- **002-userprofile-unique** — Adds a unique constraint on (serverId, userId). If duplicates exist, they are merged: the profile with the most recent birthday is kept, and activity scores are summed. **Backups are strongly recommended before upgrading from v2 to v3** because this migration is permanent and irreversible.
- **003-serverconfig-access-tracking** — Adds access failure tracking for orphaned guild detection

### What Gets Deleted

| Event | Data Deleted |
|-------|--------------|
| Member leaves server | User profile (birthday, activity score, settings) for that server |
| Bot removed from server | All configuration and user profiles for that server (immediate) |
| Guild unreachable for `PURGE_MIN_FAILURES` checks spanning `PURGE_GRACE_DAYS` days | All configuration and user profiles for that guild (purge) |

**Note**: Transient errors (network timeouts, API rate limiting, temporary outages) never count toward the purge threshold. Only permanent failures (guild deleted, bot kicked) count.

## Contributing

### Project Layout

```
src/
  client/               # Discord.js client setup and models
    database/           #   Drizzle schema, better-sqlite3 setup, migrations
    NovaClient.ts       #   Main client class (intents, startup)
  config/
    env.ts              # Environment loading and validation
  events/               # Discord event handlers
  framework/
    command.ts          # Command definition and resolution
    event.ts            # Event definition
    settings.ts         # Reusable /config setting groups (channel, boolean)
  services/             # Business logic (onboarding, birthdays, audit, etc.)
  slash-commands/       # Slash command definitions, organized by category
    Info/
    Admin/
    Config/Subcommands/
  utilities/            # Logging, formatting
  index.ts              # Entry point
```

### Adding a Command

Slash commands are defined in `src/slash-commands/`. Here's a minimal example:

```typescript
// src/slash-commands/Info/hello.ts
import { defineCommand } from '../../framework/command';

export default defineCommand({
  name: 'hello',
  description: 'Greet a member',
  options: (b) =>
    b.addUserOption((opt) =>
      opt.setName('member').setDescription('Member to greet').setRequired(true)
    ),
  run: async (ctx) => {
    const user = ctx.interaction.options.getUser('member', true);
    await ctx.reply(`Hello ${user.toString()}!`);
  },
});
```

Commands are auto-loaded from the directory. Set `adminOnly: true` to require Administrator permission. Use `defer: 'ephemeral'` for private replies.

### Adding a Config Setting

Use the helpers in `src/framework/settings.ts`. For a channel setting:

```typescript
// src/slash-commands/Config/config.ts (add to groups array)
channelSetting({
  name: 'myfeature',
  description: 'Set the my feature channel',
  field: 'myFeatureChannelId',           // Must exist in ServerConfig
  label: 'My feature channel',
  channelTypes: [ChannelType.GuildText],
})
```

Then ensure the field is defined in `src/client/database/schema.ts` and add a migration to add the column if needed. For a boolean setting, use `booleanSetting()` instead.

**Migrations**: If adding a new config field, add a column to `serverConfigs` in `src/client/database/schema.ts` and a migration (see [Adding a Migration](#adding-a-migration)). Update settings with `ConfigService.updateConfig(serverId, { field: value })`.

### Adding an Event

Events are defined in `src/events/`. Discord.js events are mapped automatically. Example:

```typescript
// src/events/myevent.ts
import { defineEvent } from '../framework/event';

export default defineEvent({
  name: 'messageCreate',  // discord.js event name
  run: async (client, message) => {
    // Handle the event
  },
});
```

Set `once: true` to only listen once (useful for `clientReady`).

### Adding a Migration

Migrations are plain synchronous functions over the better-sqlite3 handle. Create a new file in `src/client/database/migrations/` and register it in `src/client/database/migrator.ts`:

```typescript
// src/client/database/migrations/004-add-myfeature.ts
import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec('ALTER TABLE `ServerConfigs` ADD COLUMN `myFeatureChannelId` VARCHAR(255)');
}
```

Migrations run on startup in order, each in its own transaction, and applied names are recorded in the `SequelizeMeta` table (kept from earlier versions). See `001-baseline.ts` and `002-userprofile-unique.ts` for examples.
