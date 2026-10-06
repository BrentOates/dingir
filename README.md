# Dingir

A Discord bot for the Irkallu server, built with discord.js and TypeScript. Provides member onboarding, birthday management, activity tracking, and moderation tools. Requires Node 24 or newer.

## Getting Started

### Local Development

1. Clone the repository
2. Install dependencies: `npm ci`
   - Install scripts are disabled via `.npmrc` because the only native dependency (`better-sqlite3`) ships prebuilt binaries; if a future dependency needs a postinstall step, run `npm rebuild <pkg>` or revisit this setting.
3. Copy `.env.example` to `.env` and fill in `TOKEN` and `CLIENT_ID` from the [Discord Developer Portal](https://discord.com/developers/applications)
4. Start: `npm start` (Node runs the TypeScript source directly; there is no build step)

For watch mode during development:

```bash
npm run dev
```

Logs are structured JSON. For human-readable output while developing, use `npm run dev:pretty` (pipes through `pino-pretty`, a dev dependency). In production, pipe `docker logs` or `npm start` through `npx pino-pretty` if you want the same.

Test, lint and format:

```bash
npm test               # Run the test suite
npm run test:coverage  # Run tests and enforce coverage thresholds
npm run typecheck      # Type-check src and tests (TypeScript 7, tsc --noEmit)
npm run lint           # Lint with oxlint (type-aware, via oxlint-tsgolint)
npm run lint:fix       # Apply oxlint auto-fixes
npm run format         # Format with oxfmt
npm run format:check   # Verify formatting without writing
npm run check          # format:check, lint, typecheck and test:coverage (what CI runs)
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

| Variable             | Required | Default              | Description                                                                                                                                   |
| -------------------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOKEN`              | Yes      | —                    | Discord bot token from the Developer Portal                                                                                                   |
| `CLIENT_ID`          | Yes      | —                    | Discord application (client) ID from the Developer Portal                                                                                     |
| `JOB_SCHEDULE`       | No       | `0 9 * * *`          | Cron schedule (5 or 6 fields) for daily cleanup, birthday notifications, and calendar updates. Example: `0 9 * * *` = 9:00 AM daily           |
| `BOT_TIMEZONE`       | No       | `Europe/London`      | IANA time zone used for scheduling and birthday calculations (e.g. `Europe/London`, `America/New_York`)                                       |
| `DB_PATH`            | No       | `data/dingir.sqlite` | Path to SQLite database file. Use `:memory:` for throwaway runs (no persistence)                                                              |
| `PURGE_MIN_FAILURES` | No       | `3`                  | Minimum number of failed guild access checks before purging orphaned data (see Data & Retention)                                              |
| `PURGE_GRACE_DAYS`   | No       | `7`                  | Grace period (days) after first failure before purging. Data is purged only after both thresholds are met                                     |
| `LOG_LEVEL`          | No       | `info`               | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug` or `trace`. Logs are JSON, one object per line                                       |
| `DEV_GUILD_ID`       | No       | —                    | Guild ID for instant slash command registration during development (commands update immediately instead of within 1 hour). Omit in production |

## Discord Setup

### Required Intents

The bot declares these gateway intents. The first two are **privileged** and must be enabled in the Developer Portal under "Bot" → "Privileged Gateway Intents":

- **Guilds** (unprivileged)
- **Guild Members** (privileged)
- **Guild Messages** (unprivileged)
- **Message Content** (privileged)

The **Guild Members** intent is required for membership screening tracking: on startup, the bot fetches all members for each server (one fetch per server) to record members who are pending screening.

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

On startup the bot hashes its command definitions and only re-registers them when the hash differs from the one stored for the target scope (global or `DEV_GUILD_ID`). The hash is stored per application (`CLIENT_ID`) and per scope, so the first start after upgrading re-registers once. The last registered scope is stored in BotState (`commandsScope:<clientId>`). Switching from a dev guild (`DEV_GUILD_ID=X`) to global or another guild automatically clears the old dev guild's commands after the new registration succeeds. Switching from global to a dev guild does NOT remove global commands (they may be production) — remove them via `npm run deploy:commands` without `DEV_GUILD_ID` set or the Developer Portal. `npm run deploy:commands` uses the same logic and opens the database to record the scope/hash. To force a registration without starting the bot, or to clean up orphaned commands, run:

```bash
npm run deploy:commands
```

## Commands

Commands are organized into categories. Only **admin-only** commands require the Administrator permission; all others are available to any member.

### Info Commands

| Command                         | Who Can Use | Description                                                                                                     |
| ------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `/ping`                         | Everyone    | Show WebSocket latency and round-trip time                                                                      |
| `/about`                        | Everyone    | Display Dingir version, source code link, server info, and uptime                                               |
| `/profile <member>`             | Admin       | Fetch a member's profile: nickname, username, join date, onboarding status, activity score, and birthday if set |
| `/mybirthday set <day> <month>` | Everyone    | Set your birthday for this server                                                                               |
| `/mybirthday clear`             | Everyone    | Remove your birthday from this server                                                                           |

### Admin Commands

| Command                                  | Description                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/simulate join [member]`                | Audit only: send the "member joined" audit for a member (no roles or welcome message). Defaults to you  |
| `/simulate onboard [member]`             | Dry run: show what onboarding would do (guest roles, welcome) without applying changes. Defaults to you |
| `/rolesince <role> [days]`               | List members in a role who joined the server at least N days ago                                        |
| `/noroles`                               | List all members with no roles assigned (excluding bots)                                                |
| `/post <channel> [content] [attachment]` | Post a simple message and/or file to a channel. Requires at least one of content or attachment          |

### Config Commands

Use `/config <group> <subcommand>` to manage server settings. All are admin-only.

#### `/config announcements` — Announcements Channel

| Subcommand      | Description                                         |
| --------------- | --------------------------------------------------- |
| `set <channel>` | Set the announcements channel                       |
| `get`           | Show the currently configured announcements channel |
| `clear`         | Clear the announcements channel                     |

#### `/config audit` — Audit Log Channel

| Subcommand      | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `set <channel>` | Set the audit log channel (where member events are posted) |
| `get`           | Show the currently configured audit channel                |
| `clear`         | Clear the audit channel                                    |

#### `/config sysmsgs` — Bot System Messages

Toggle whether the bot uses Discord's system channel for welcome messages:

| Subcommand      | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `set <enabled>` | Enable or disable: bot system messages (`enabled` = true or false) |
| `get`           | Show whether bot system messages are enabled                       |

#### `/config honeypot` — Honeypot Channel

Configure a channel that automatically bans members who post in it:

| Subcommand      | Description                                    |
| --------------- | ---------------------------------------------- |
| `set <channel>` | Set the honeypot channel                       |
| `get`           | Show the currently configured honeypot channel |
| `clear`         | Clear the honeypot channel                     |

#### `/config welcome` — Welcome Messages & Images

| Subcommand           | Description                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `set-message <text>` | Set the welcome message (max 1500 characters). Use `{member}` to mention the new member. Rejected if, after expanding every `{member}` to a mention, the message would exceed Discord's 2000-character limit |
| `set-image <url>`    | Set the background image for welcome images (http/https URL)                                                                                                                                                 |
| `get`                | Show the welcome message and image URL                                                                                                                                                                       |
| `clear <which>`      | Clear the message, image, or both (`which` = `message`, `image`, or `all`)                                                                                                                                   |
| `preview`            | Preview the welcome message as it would be sent for you                                                                                                                                                      |

#### `/config newroles` — New Member Roles

Roles given to members when they complete onboarding:

| Subcommand                               | Description                                 |
| ---------------------------------------- | ------------------------------------------- |
| `get`                                    | Show the current new-member roles           |
| `set <role-one> [role-two] [role-three]` | Set up to three roles to give on onboarding |
| `clear`                                  | Clear the new-member roles                  |

#### `/config birthdays` — Birthday Calendar

| Subcommand         | Description                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create <channel>` | Create or recreate a birthday calendar in a text channel (fetches all server birthdays); the existing calendar is kept until the new one has been posted and saved, then the old message is removed |
| `sync`             | Manually sync the birthday calendar (runs automatically on the scheduled job)                                                                                                                       |
| `remove`           | Remove the birthday calendar message                                                                                                                                                                |

#### `/config debug` — Onboarding Diagnostics

Toggle diagnostic audits for onboarding runs:

| Subcommand      | Description                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `set <enabled>` | Enable or disable: onboarding diagnostics (`enabled` = true posts a summary of each onboarding run to the audit channel) |
| `get`           | Show whether onboarding diagnostics are enabled                                                                          |

## Behaviour

### Onboarding

When a member joins without screening enabled, or completes server screening:

1. **Audit**: A "member joined" audit is posted to the configured audit channel (if set)
2. **Guest Roles**: Configured new-member roles are assigned (if any are set)
3. **Welcome**: A welcome message is posted to the server's system channel, optionally with a background image (only if `/config sysmsgs` is enabled)
4. **Debug**: If debug mode is enabled, a diagnostic summary is posted to the audit channel showing what succeeded, failed, or was skipped

Roles are only assigned if:

- They are below the bot's highest role in the role hierarchy
- They are not managed by an integration
- They are not `@everyone`

If a role cannot be assigned, the error is logged and the onboarding continues for other roles and steps.

**Onboarding Tracking**: The bot records when a member is pending membership screening (when they join pending, on any update showing them pending, and via a startup sweep that fetches each server's members after login). If the bot doesn't have the member's previous state cached, it onboards them only when a pending state was recorded and they haven't been onboarded yet; otherwise it skips (logged). Onboarding clears the pending marker and records `onboardedAt`, so nobody is onboarded twice. Members already in the server before the upgrade are never re-onboarded. Leaving the server deletes the profile, so a rejoin is onboarded again. Known limitation: a member who was already pending at deploy time and completes screening before the startup sweep records them, while not cached, won't be onboarded automatically (an admin can assign roles manually).

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

**Birthday Calendar**: If configured, a calendar message lists the next upcoming birthdays (up to 10 birthdays). The calendar is automatically updated on the scheduled job by editing the message. If the message or channel is missing, the refresh logs a warning and an admin must run `/config birthdays create` again to create a new calendar.

**Timezones**: All birthday calculations use the `BOT_TIMEZONE` setting. Members' birthdays are stored as month/day only (no year), and the next occurrence is calculated relative to the bot's configured time zone.

### Scheduled Daily Job

On the schedule defined by `JOB_SCHEDULE` (default: 9:00 AM in the configured `BOT_TIMEZONE`), three tasks run in order:

1. **Data Check** — Checks access to each configured guild. If unreachable, increments the failure counter. After `PURGE_MIN_FAILURES` failures spanning `PURGE_GRACE_DAYS` days, the guild's data is purged. Transient errors (timeouts, API errors) do not count toward purging. Profiles are snapshotted before fetching the member list, so members who join during the check aren't treated as departed.
2. **Birthday Notifications** — Posts birthday announcements in the announcements channel for members with birthdays today
3. **Birthday Calendars** — Updates all configured birthday calendar messages

## Data & Retention

### Storage

All data is persisted in SQLite at the path specified by `DB_PATH` (default: `data/dingir.sqlite`). The database directory is created automatically if it doesn't exist.

Migrations run automatically on startup. Current migrations:

- **001-baseline** — Initial schema (ServerConfigs and UserProfiles tables)
- **002-userprofile-unique** — Adds a unique constraint on (serverId, userId). If duplicates exist, they are merged: the profile with the most recent birthday is kept, and the maximum activity score is preserved. **Backups are strongly recommended before upgrading from v2 to v3** because this migration is permanent and irreversible.
- **003-serverconfig-access-tracking** — Adds access failure tracking for orphaned guild detection
- **004-bot-state** — Adds the `BotState` key/value table (currently stores the registered command hash)
- **005-userprofile-backfill** — Sets NULL activity scores to 0 and deletes profile rows with no server or user id, logging how many
- **006-userprofile-onboarded-at** — Adds nullable `UserProfiles.onboardedAt`, recording when a member was onboarded
- **007-userprofile-screening-pending** — Adds nullable `UserProfiles.screeningPendingAt`, recording that a member is waiting on membership screening

### What Gets Deleted

| Event                                                                              | Data Deleted                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Member leaves server                                                               | User profile (birthday, activity score, settings) for that server |
| Bot removed from server                                                            | All configuration and user profiles for that server (immediate)   |
| Guild unreachable for `PURGE_MIN_FAILURES` checks spanning `PURGE_GRACE_DAYS` days | All configuration and user profiles for that guild (purge)        |

**Note**: Transient errors (network timeouts, API rate limiting, temporary outages) never count toward the purge threshold. Only permanent failures (guild deleted, bot kicked) count.

## Upgrading from 2.x

When upgrading to v3, note the following:

### Backups

Back up the SQLite file before the first start. Migrations 002 and 005 permanently remove rows:

- **002-userprofile-unique**: Deduplicates UserProfiles and merges activity scores
- **005-userprofile-backfill**: Deletes profiles with no server or user id

```bash
# Before starting v3
cp data/dingir.sqlite data/dingir.sqlite.backup
```

### Container User

The v3 image runs as the non-root `node` user (uid 1000), but v2 ran as root. If you have an existing data volume or bind mount, it is root-owned and SQLite will fail to open it.

Either keep running as root via Docker Compose:

```yaml
services:
  dingir:
    image: ghcr.io/brentoates/dingir:3.0.0
    user: '0:0'
    volumes:
      - ./data:/usr/src/app/data
```

Or (preferred, non-root) fix ownership once:

```bash
# For a bind mount
sudo chown -R 1000:1000 ./data

# For a named volume
docker run --rm -v <volume>:/data alpine chown -R 1000:1000 /data
```

### Command Registration

Commands are re-registered once on the first start after upgrading. The command set changed in v3:

**Renamed subcommands**:

- `/simulate screen` → `/simulate onboard`

**New or changed subcommands**:

- `/mybirthday set|clear` (unchanged)
- `/config welcome set-message|set-image|get|clear|preview` (unchanged)
- `/config newroles set` (now takes up to 3 roles)
- `/config birthdays create|sync|remove` (unchanged)
- `/config sysmsgs set <enabled>|get` (changed from toggle)
- `/config debug set <enabled>|get` (changed from toggle)

### Releases

Docker images are published by pushing a git tag (e.g. `git tag 3.0.0 && git push origin 3.0.0`), not by merging to main.

## Contributing

### Project Layout

```
src/
  client/
    DingirClient.ts     # Main client class (intents, startup)
  commands/             # Slash command definitions, organized by category
    info/
    admin/
    config/groups/      #   /config subcommand groups
  app.ts                # Composition root: the App (env, db, logger, clock, ...)
  config/
    env.ts              # Environment loading and validation
  db/                   # Drizzle schema, better-sqlite3 setup, migrations
  events/               # Discord event handlers
  framework/
    command.ts          # Command definition and resolution
    event.ts            # Event definition
    settings.ts         # Reusable /config setting groups (channel, boolean)
  scripts/
    deploy-commands.ts  # One-off slash command registration (npm run deploy:commands)
  services/             # Business logic (onboarding, birthdays, audit, etc.)
  utilities/            # Logging, formatting
  index.ts              # Entry point
```

### Adding a Command

Slash commands are defined in `src/commands/`. Here's a minimal example:

```typescript
// src/commands/info/hello.ts
import { defineCommand } from '../../framework/command';

export default defineCommand({
  name: 'hello',
  description: 'Greet a member',
  options: (b) =>
    b.addUserOption((opt) =>
      opt.setName('member').setDescription('Member to greet').setRequired(true),
    ),
  run: async (ctx) => {
    const user = ctx.interaction.options.getUser('member', true);
    await ctx.reply(`Hello ${user.toString()}!`);
  },
});
```

Command handlers receive the shared `App` as `ctx.app` (database, logger, clock, env). Register new commands in `src/commands/index.ts`. Set `adminOnly: true` to require Administrator permission. Use `defer: 'ephemeral'` for private replies.

### Adding a Config Setting

Use the helpers in `src/framework/settings.ts`. For a channel setting:

```typescript
// src/commands/config/config.ts (add to groups array)
channelSetting({
  name: 'myfeature',
  description: 'Set the my feature channel',
  field: 'myFeatureChannelId', // Must exist in ServerConfig
  label: 'My feature channel',
  channelTypes: [ChannelType.GuildText],
});
```

Then ensure the field is defined in `src/db/schema.ts` and add a migration to add the column if needed. For a boolean setting, use `booleanSetting()` instead.

**Migrations**: If adding a new config field, add a column to `serverConfigs` in `src/db/schema.ts` and a migration (see [Adding a Migration](#adding-a-migration)). Update settings with `updateConfig(ctx.app.db, serverId, { field: value })`.

### Adding an Event

Events are defined in `src/events/`. Discord.js events are mapped automatically. Example:

```typescript
// src/events/myevent.ts
import { defineEvent } from '../framework/event';

export default defineEvent({
  name: 'messageCreate', // discord.js event name
  run: async (app, client, message) => {
    // `app` carries env, db, logger, clock, honeypot and shutdown; see src/app.ts
  },
});
```

Register new events in `src/events/index.ts`. Set `once: true` to only listen once (useful for `clientReady`).

### Adding a Migration

Migrations are plain synchronous functions over the better-sqlite3 handle. Create a new file in `src/db/migrations/` and register it in `src/db/migrator.ts`:

```typescript
// src/db/migrations/004-add-myfeature.ts
import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec('ALTER TABLE `ServerConfigs` ADD COLUMN `myFeatureChannelId` VARCHAR(255)');
}
```

Migrations run on startup in order, each in its own transaction, and applied names are recorded in the `SequelizeMeta` table (kept from earlier versions). See `001-baseline.ts` and `002-userprofile-unique.ts` for examples.
