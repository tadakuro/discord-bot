# DCBot

A multi-server Discord bot (MEE6/Carl-bot style). **Everything is configured in
Discord itself via slash commands** — no web dashboard needed.

**Modules:**
- **Leveling / XP** — XP per message, level-up messages, level role rewards, `/rank`, `/leaderboard`
- **Moderation** — `/kick`, `/ban`, `/unban`, `/timeout`, `/warn`, `/warns`, `/purge`, warn limits with auto-punishment
- **Welcome / Goodbye** — customizable join/leave messages with embed
- **Logging** — message edits/deletes, member joins/leaves/updates
- **Reaction roles** — emoji → role on a panel message
- **AI / Ask** — `/ai ask` one-shot questions answered by a cloud-hosted LLM (Ollama Cloud, default `nemotron-3-super:cloud`)

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
| `OLLAMA_API_KEY` | Ollama Cloud API key (for `/ai ask`; create at `ollama.com/settings`) |
| `AI_MODEL` | *(optional)* Model tag, default `nemotron-3-super:cloud` |

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
   - `OLLAMA_API_KEY` — *(optional)* enables `/ai ask` via Ollama Cloud

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
| `/welcome set/enable/preview/status` | Welcome & goodbye messages, channel, toggles, live preview |
| `/logging channel/enable/events/status` | Logging channel, master switch, per-event toggles (`messageDelete`, `messageEdit`, `memberJoin`, `memberLeave`, `memberUpdate`) |
| `/autorole add/remove/list` | Roles assigned automatically on join |
| `/automod toggle` | Turn auto-mod on/off |
| `/automod words add/remove/list` | Blocked words |
| `/automod invite <enabled>` | Block Discord invite links |
| `/automod caps <enabled> [percent]` | Block excessive caps (default ≥70%) |
| `/automod action <delete|warn>` | What happens on violation (delete only, or delete + warn via the warn system) |
| `/automod status` | Show auto-mod config |
| `/warnconfig set/status` | Warn limit + auto-action (timeout/kick/ban), mod-log channel, DM members |
| `/prefix set/status` | Change the message prefix (default `!`) — prefix commands mirror slash commands, e.g. `!rank`, `!kick @user reason`, `!antispam toggle true` |
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

> 76 commands in total. Every command works as `/command` **and** as a prefix command (`!command`), see [Prefix commands](#prefix-commands).

### Leveling & XP
| Command | Description | Permissions |
|---|---|---|
| `/rank [user]` | Your (or another's) XP & level | anyone |
| `/leaderboard` | Top 10 by XP | anyone |
| `/levelroles add\|remove\|list` | Level role rewards | Manage Roles |
| `/levelconfig set\|status` | Leveling settings | Manage Guild |
| `/givexp <user> <amount>` | Add/remove XP | Manage Guild |

### Moderation
| Command | Description | Permissions |
|---|---|---|
| `/kick`, `/ban`, `/unban` | Kick / ban / unban | Moderate Members |
| `/timeout`, `/mute`, `/unmute` | Timeout a member | Moderate Members |
| `/warn`, `/warns list\|clear` | Warn / list / clear warnings | Moderate Members |
| `/warnconfig set\|status` | Warn limits & mod behavior | Moderate Members |
| `/purge` | Bulk delete messages | Moderate Members |
| `/slowmode`, `/lock`, `/unlock` | Channel tools | Manage Channels |
| `/nick`, `/dehoist` | Nicknames; remove hoist characters (`[dm]` marker, reversible) | Manage Nicknames |
| `/role add\|remove` | Assign/remove roles | Manage Roles |
| `/embed`, `/say` | Bots as the bot / send custom embeds | Manage Messages |
| `/emoji add\|rename\|delete\|list` | Manage server emoji | Manage Emojis |
| `/steal` | Copy emoji from any message | Manage Emojis |
| `/sticker add\|list\|delete` | Manage stickers | Manage Emojis |
| `/thread create\|archive\|lock\|rename` | Thread control panel | Manage Channels |
| `/channel create\|delete\|rename\|topic` | Channel control panel | Manage Channels |
| `/voice disconnect\|move\|mute\|deafen` | Voice moderation | Move Members |
| `/lockdown on\|off` | Slowlock every text channel (raid mode) | Manage Channels |
| `/roleinfo`, `/channelinfo`, `/emojiinfo`, `/inrole` | Inspect roles, channels, emoji, role members | anyone |
| `/note add\|list\|clear` | Private moderation notes | Moderate Members |
| `/report <user> <reason>` | Let members report users (posts to reports channel) | anyone |

### Utility
| Command | Description | Permissions |
|---|---|---|
| `/serverinfo`, `/userinfo`, `/avatar` | Information | anyone |
| `/servericon`, `/banner` | Server icon / banner | anyone |
| `/boosts`, `/botinfo`, `/uptime`, `/ping` | Server stats, bot stats | anyone |
| `/quote <message link>` | Quote any message | anyone |
| `/invite` | Bot invite link | anyone |
| `/weather <city>` | Current weather (Open-Meteo) | anyone |
| `/crypto <symbol>` | Live crypto price (CoinGecko) | anyone |
| `/dictionary <word>` | Word definitions | anyone |
| `/afk [reason]` | Set AFK — auto-clears when you chat, notifies often-mentioned | anyone |
| `/remind set\|list\|delete` | Personal reminders (DMs you) | anyone |
| `/announce`, `/poll` | Announcements, polls | Manage Guild / any |
| `/ai ask <prompt>` | Ask a cloud-hosted AI (Ollama Cloud) | anyone |
| `/settings`, `/help`, `/prefix set\|status` | Overview / help / prefix config | Manage Guild / any |

### Engagement
| Command | Description | Permissions |
|---|---|---|
| `/starboard set\|status\|remove` | Repost messages at a ⭐ threshold | Manage Guild |
| `/snipe`, `/editsnipe` | Last deleted / edited message | Manage Messages |
| `/suggest <idea>` | Submit a suggestion (starboard-style voting) | anyone |
| `/giveaway start\|end\|reroll` | Giveaways with 🎉 reaction pick | Manage Guild |
| `/ticket setup\|close\|add\|remove\|status` | Button-based support tickets in threads | Manage Guild |
| `/verify setup\|remove` | Button verification for a role | Manage Guild |
| `/birthday set\|remove\|list\|channel` | Birthday list + announcements | anyone |
| `/tempvoice setup\|disable\|status` | Joining the lobby spawns your own voice channel | Manage Guild |
| `/antialt <days>` | Kick accounts newer than N days on join | Manage Guild |

### Feeds & Automation
| Command | Description | Permissions |
|---|---|---|
| `/rss add\|remove\|list` | Post RSS/Atom feeds (YouTube, GitHub…) to a channel | Manage Guild |
| `/welcome set\|enable\|preview\|status` | Welcome/goodbye config + rendered preview | Manage Guild |
| `/logging channel\|enable\|events\|status` | Message & member logging | Manage Guild |
| `/autorole add\|remove\|list` | Roles on join | Manage Roles |
| `/automod *` | Word filter, invites, caps | Manage Guild |
| `/antispam *` | Anti-spam thresholds | Manage Guild |
| `/reactionrole setup\|add\|list\|remove` | Reaction role panels | Manage Roles |

## Prefix commands

Every slash command can also be run as a message command with the server
prefix (default `!`, configurable with `/prefix set`):

- `!help`, `!rank`, `!ping`, `!serverinfo`, `!userinfo`, `!avatar`
- `!kick @user reason`, `!ban @user reason`, `!warn @user reason`, `!purge 20`
- `!levelconfig set enabled true`, `!automod toggle true`, `!antispam toggle true`
- `!weather london`, `!crypto btc`, `!remind set 10m "do the dishes"`, `!afk grab snacks`
- `!ai ask your question here` (ditto for Ollama Cloud)

Non-command words resolve to server **tags** (see `/tags add`) — `!docs <args>` works too.

Text with spaces is tokenized per argument — quote multi-word values:
`!welcome set #chat "Hi {user}!" "Bye {user}."`. Prefix commands enforce the
same permissions as their slash counterparts.