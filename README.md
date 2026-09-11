# DCBot

A multi-server Discord bot (MEE6/Carl-bot style). **Everything is configured in
Discord itself via slash commands** — no web dashboard needed.

**Modules:**
- **Leveling / XP** — XP per message, level-up messages, level role rewards, `/rank`, `/leaderboard`
- **Moderation** — `/kick`, `/ban`, `/unban`, `/timeout`, `/warn`, `/warns`, `/purge`, warn limits with auto-punishment
- **Welcome / Goodbye** — customizable join/leave messages with embed
- **Logging** — message edits/deletes, member joins/leaves/updates
- **Reaction roles** — emoji → role on a panel message

## Architecture

```
apps/
  bot/    discord.js bot (long-lived gateway process — runs on a VPS)
packages/
  db/     Drizzle schema + Postgres client shared by the bot
```

All per-guild settings live in one shared Postgres database (CockroachDB, Neon,
or any Postgres), read live by the bot — no manual configuration needed.

## Requirements

- Node.js 18+
- A Discord application (bot token enabled)
- A Postgres database (free tier: CockroachDB Basic, Neon, or local)

## Setup

### 1. Create a Discord application

1. Go to https://discord.com/developers/applications → **New Application**
2. **Bot** tab → **Reset Token** → copy the bot token
3. Enable these **Bot intents**: `Server Members`, `Message Content`, `Presence`
4. **OAuth2 → URL Generator**, scopes `bot applications.commands`, permissions `Manage Roles`, `Moderate Members`, `Manage Messages`, `Send Messages`, `Read Message History` → invite the bot

### 2. Create the database

Grab a `DATABASE_URL` from CockroachDB's free Basic tier (or Neon / local Postgres).

Apply the schema with the migration runner (works with CockroachDB, which
vanilla `drizzle-kit push` doesn't):

```bash
npm run db:migrate
```

After any future schema change: `npm run db:generate`, then `npm run db:migrate` again.

### 3. Configure environment

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token |
| `DATABASE_URL` | Postgres connection string |

### 4. Run

```bash
npm install
npm run start
```

The bot registers all slash commands on first run.

## Hosting on Render (free, 24/7)

1. Push this repo to GitHub.
2. In **Render dashboard → New → Background Worker**.
3. Connect the GitHub repo. Settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start`
   - **Plan**: Free
4. Add environment variables:
   - `DISCORD_TOKEN` — your bot token
   - `DATABASE_URL` — your Postgres (CockroachDB) connection string
   - `HEARTBEAT_URL` — *(optional, see below)*

Render free **Background Workers run continuously** — they don't spin down, so your bot is online 24/7.

## Monitoring with Better Stack (optional)

Background bots have no public URL, so URL-style uptime monitors don't fit — use a **Heartbeat** instead:

1. Better Stack → **Monitor → Heartbeat** → create one → copy its monitor URL.
2. Add it as `HEARTBEAT_URL` in Render and redeploy.
3. The bot pings Better Stack every 60s; if the bot ever goes offline, you get an alert.

You can also put the same bot on Render *and* run it locally — they can share one database, but only one instance should run at a time.

## Configuring a server

All settings are managed with slash commands (Manage Guild / Manage Roles permission):

| Command | Purpose |
|---|---|
| `/levelconfig set` | Toggle leveling, XP range, cooldown, level-up channel & message, role stacking |
| `/levelconfig status` | Show leveling settings |
| `/levelroles add/remove/list` | Level role rewards |
| `/givexp <user> <amount>` | Add/remove XP (negative removes) |
| `/welcome set/enable/status` | Welcome & goodbye messages, channel, toggles |
| `/logging channel/enable/events/status` | Logging channel, master switch, per-event toggles (`messageDelete`, `messageEdit`, `memberJoin`, `memberLeave`, `memberUpdate`) |
| `/autorole add/remove/list` | Roles assigned automatically on join |
| `/automod toggle` | Turn auto-mod on/off |
| `/automod words add/remove/list` | Blocked words |
| `/automod invite <enabled>` | Block Discord invite links |
| `/automod caps <enabled> [percent]` | Block excessive caps (default ≥70%) |
| `/automod action <delete|warn>` | What happens on violation (delete only, or delete + warn via the warn system) |
| `/automod status` | Show auto-mod config |
| `/warnconfig set/status` | Warn limit + auto-action (timeout/kick/ban), mod-log channel, DM members |
| `/reactionrole setup/add/list/remove` | Reaction role panels |
| `/kick`, `/ban`, `/unban`, `/timeout`, `/warn`, `/mute`, `/unmute`, `/purge` | Moderation |
| `/warns list <user>` / `/warns clear <user>` | List / clear warnings |
| `/slowmode`, `/lock`, `/unlock`, `/nick`, `/role add|remove` | Channel & member tools |
| `/announce`, `/poll` | Announcements & votes |
| `/serverinfo`, `/userinfo`, `/avatar`, `/ping`, `/settings`, `/help` | Information |

> **Note:** the warn auto-action (`warnLimit`) and per-event logging toggles require
> the schema in `packages/db/drizzle/0001` — make sure `npm run db:push` was run.

## Deploying

- **Bot**: host `apps/bot` on any Node VPS (persistent process needed; `npm run start`
  or build + `pm2`).
- Remember to run `npm run db:push` against the production database after updating
  the schema.

## Commands

| Command | Description | Permissions |
|---|---|---|
| `/rank [user]` | Your (or another's) XP & level | anyone |
| `/leaderboard` | Top 10 by XP | anyone |
| `/levelroles add|remove|list` | Level role rewards | Manage Roles |
| `/levelconfig set|status` | Leveling settings | Manage Guild |
| `/givexp <user> <amount>` | Add/remove XP | Manage Guild |
| `/kick` | Kick a member | Moderate Members |
| `/ban`, `/unban` | Ban / unban | Moderate Members |
| `/timeout`, `/mute`, `/unmute` | Timeout a member | Moderate Members |
| `/warn`, `/warns list|clear` | Warn / list / clear warnings | Moderate Members |
| `/purge` | Bulk delete messages | Moderate Members |
| `/warnconfig set|status` | Warn limits & mod behavior | Moderate Members |
| `/slowmode`, `/lock`, `/unlock` | Channel tools | Manage Channels |
| `/nick` | Change a nickname | Manage Nicknames |
| `/role add|remove` | Assign/remove roles | Manage Roles |
| `/welcome set|enable|status` | Welcome/goodbye config | Manage Guild |
| `/logging channel|enable|events|status` | Message & member logging | Manage Guild |
| `/autorole add|remove|list` | Roles on join | Manage Roles |
| `/automod *` | Word filter, invites, caps | Manage Guild |
| `/reactionrole setup|add|list|remove` | Reaction role panels | Manage Roles |
| `/announce`, `/poll` | Announcements, polls | Manage Guild / any |
| `/serverinfo`, `/userinfo`, `/avatar`, `/ping` | Information | anyone |
| `/settings`, `/help` | Overview / help | Manage Guild / anyone |