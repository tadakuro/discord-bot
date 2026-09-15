import { EmbedBuilder, type ChatInputCommandInteraction, type Message } from "discord.js";
import { commandRegistry } from "../commands/index.js";

type OptJson = {
  type: number;
  name: string;
  description?: string;
  required?: boolean;
  choices?: { value: string | number; name: string }[];
  options?: OptJson[];
};

type Parsed = {
  values: Map<string, unknown>;
  sub: string | null;
  group: string | null;
  error?: string;
};

const OT = {
  SUB: 1,
  GROUP: 2,
  STRING: 3,
  INT: 4,
  BOOL: 5,
  USER: 6,
  CH: 7,
  ROLE: 8,
  MENTION: 9,
  NUM: 10,
} as const;

const RE_USER = /^<@!?(\d+)>$/;
const RE_CHANNEL = /^<#(\d+)>$/;
const RE_ROLE = /^<@&(\d+)>$/;
const ID = /^\d{16,21}$/;

type SendableChannel = { send(payload: unknown): Promise<unknown>; sendTyping?: () => Promise<unknown> };
function channelOf(message: Message): SendableChannel {
  return message.channel as unknown as SendableChannel;
}

function tokenize(content: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

function parseBool(raw: string): boolean | null {
  if (/^(1|true|yes|on|enabled)$/i.test(raw)) return true;
  if (/^(0|false|no|off|disabled)$/i.test(raw)) return false;
  return null;
}

async function resolveUser(message: Message, raw: string) {
  const id = raw.match(RE_USER)?.[1] ?? (ID.test(raw) ? raw : null);
  if (!id) return null;
  const member = await message.guild?.members.fetch(id).catch(() => null);
  if (member) return member.user;
  return message.client.users.fetch(id).catch(() => null);
}

async function resolveTarget(message: Message, type: number, raw: string): Promise<unknown | null> {
  switch (type) {
    case OT.USER:
      return resolveUser(message, raw);
    case OT.CH: {
      const id = raw.match(RE_CHANNEL)?.[1] ?? (ID.test(raw) ? raw : null);
      return id ? (message.guild?.channels.cache.get(id) ?? null) : null;
    }
    case OT.ROLE: {
      const id = raw.match(RE_ROLE)?.[1] ?? (ID.test(raw) ? raw : null);
      return id ? (message.guild?.roles.cache.get(id) ?? null) : null;
    }
    case OT.MENTION: {
      const asUser = await resolveUser(message, raw).catch(() => null);
      if (asUser) return asUser;
      const roleId = raw.match(RE_ROLE)?.[1];
      return roleId ? (message.guild?.roles.cache.get(roleId) ?? null) : null;
    }
    default:
      return null;
  }
}

function typeLabel(type: number): string {
  switch (type) {
    case OT.STRING: return "text";
    case OT.INT:
    case OT.NUM: return "number";
    case OT.BOOL: return "yes/no";
    case OT.USER: return "user";
    case OT.CH: return "channel";
    case OT.ROLE: return "role";
    case OT.MENTION: return "user or role";
    default: return "value";
  }
}

async function fillLeaves(message: Message, leaves: OptJson[], args: string[], values: Map<string, unknown>): Promise<string | null> {
  let i = 0;
  for (let idx = 0; idx < leaves.length; idx++) {
    const leaf = leaves[idx];
    if (leaf.type === OT.SUB || leaf.type === OT.GROUP) continue;
    const isLast = idx === leaves.length - 1;
    values.set(leaf.name, null);
    if (i >= args.length) {
      if (leaf.required) return `Missing required **${leaf.name}** (${typeLabel(leaf.type)}).`;
      continue;
    }
    const raw = args[i];
    if (leaf.type === OT.STRING) {
      values.set(leaf.name, isLast ? args.slice(i).join(" ") : raw);
      i = isLast ? args.length : i + 1;
    } else if (leaf.type === OT.INT) {
      const n = Number(raw);
      if (!Number.isInteger(n)) return `**${leaf.name}** expects a number, got \`${raw}\`.`;
      values.set(leaf.name, n);
      i++;
    } else if (leaf.type === OT.NUM) {
      const n = Number(raw);
      if (Number.isNaN(n)) return `**${leaf.name}** expects a number, got \`${raw}\`.`;
      values.set(leaf.name, n);
      i++;
    } else if (leaf.type === OT.BOOL) {
      const b = parseBool(raw);
      if (b === null) return `**${leaf.name}** expects yes/no, got \`${raw}\`.`;
      values.set(leaf.name, b);
      i++;
    } else {
      const resolved = await resolveTarget(message, leaf.type, raw);
      if (resolved == null) return `Could not find **${typeLabel(leaf.type)}** for \`${raw}\`.`;
      values.set(leaf.name, resolved);
      i++;
    }
  }
  return null;
}

async function parseArgs(message: Message, opts: OptJson[], tokens: string[]): Promise<Parsed> {
  const values = new Map<string, unknown>();
  const subs = opts.filter((o) => o.type === OT.SUB);
  const groups = opts.filter((o) => o.type === OT.GROUP);

  if (subs.length === 0 && groups.length === 0) {
    const error = await fillLeaves(message, opts, tokens, values);
    return { values, sub: null, group: null, error: error ?? undefined };
  }

  if (groups.length > 0) {
    const g = tokens[0];
    const gObj = g ? groups.find((x) => x.name === g) : undefined;
    if (gObj) {
      const subName = tokens[1];
      const subObj = gObj.options?.find((x) => x.name === subName);
      if (!subObj) return { values, sub: null, group: null, error: `Unknown subcommand \`${subName ?? ""}\` under \`${g}\`.` };
      const leaf = subObj.options ?? [];
      const error = await fillLeaves(message, leaf, tokens.slice(2), values);
      return { values, sub: subName, group: g, error: error ?? undefined };
    }
  }

  const subName = tokens[0];
  if (!subName) return { values, sub: null, group: null };
  const subObj = subs.find((x) => x.name === subName);
  if (!subObj) return { values, sub: null, group: null, error: `Unknown subcommand \`${subName}\`.` };
  const leaf = subObj.options ?? [];
  const error = await fillLeaves(message, leaf, tokens.slice(1), values);
  return { values, sub: subName, group: null, error: error ?? undefined };
}

function usageFor(name: string, opts: OptJson[]): string {
  const subs = opts.filter((o) => o.type === OT.SUB);
  const groups = opts.filter((o) => o.type === OT.GROUP);
  const leafs = opts.filter((o) => o.type !== OT.SUB && o.type !== OT.GROUP);
  if (subs.length === 0 && groups.length === 0) {
    const parts = leafs.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`));
    return parts.length ? `!${name} ${parts.join(" ")}` : `!${name}`;
  }
  return `!${name} ${[...groups.map((g) => `<${g.name}>`), ...subs.map((s) => `<${s.name}>`)].join(" ")}`;
}

function buildOptions(parsed: Parsed) {
  const get = (name: string) => parsed.values.get(name) ?? null;
  return {
    getString: (name: string, _r?: boolean) => get(name) as string | null,
    getInteger: (name: string, _r?: boolean) => get(name) as number | null,
    getNumber: (name: string, _r?: boolean) => get(name) as number | null,
    getBoolean: (name: string, _r?: boolean) => get(name) as boolean | null,
    getUser: (name: string, _r?: boolean) => get(name) as { id: string } | null,
    getChannel: (name: string, _r?: boolean) => get(name) as { id: string } | null,
    getRole: (name: string, _r?: boolean) => get(name) as { id: string } | null,
    getMentionable: (name: string, _r?: boolean) => get(name) as { id: string } | null,
    getSubcommand: () => parsed.sub,
    getSubcommandGroup: () => parsed.group,
  };
}

export async function handlePrefixCommand(message: Message, prefix: string): Promise<boolean> {
  if (!message.content.startsWith(prefix)) return false;
  const tokens = tokenize(message.content.slice(prefix.length));
  const name = tokens.shift()?.toLowerCase() ?? "";
  if (!name) return false;

  const cmd = commandRegistry.get(name);
  if (!cmd) {
    await channelOf(message)
      .send({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("Unknown command")
          .setDescription(`No command named \`${name}\`. Use \`${prefix}help\` to see all commands.`)],
      })
      .catch(() => {});
    return true;
  }

  const json = cmd.data.toJSON() as { options?: OptJson[]; default_member_permissions?: string };
  const opts = json.options ?? [];

  if (json.default_member_permissions) {
    const bits = BigInt(json.default_member_permissions);
    const member = message.member;
    if (!member || !member.permissions.has(bits)) {
      await channelOf(message)
        .send({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("Permission denied")
            .setDescription("You don't have permission to run this command.")],
        })
        .catch(() => {});
      return true;
    }
  }

  const parsed = await parseArgs(message, opts, tokens);
  if (parsed.error) {
    await channelOf(message)
      .send({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle(`Usage: ${usageFor(name, opts)}`)
          .setDescription(parsed.error)],
      })
      .catch(() => {});
    return true;
  }

  const state = { replied: false, deferred: false, last: null as { edit(x: unknown): Promise<unknown> } | null };
  const optsApi = buildOptions(parsed);

  const sendPayload = async (payload: Record<string, unknown> & { embeds?: unknown[]; content?: string; files?: unknown[]; ephemeral?: boolean; components?: unknown[] }) => {
    const { ephemeral: _drop, ...rest } = payload;
    if (rest.embeds?.length === 0 && !rest.content && !rest.files) delete rest.embeds;
    const sent = await channelOf(message).send(rest as never);
    state.last = sent as never;
    return sent;
  };

  const interaction = {
    id: `prefix-${message.id}`,
    token: "prefix",
    commandName: cmd.data.name,
    commandGuildId: message.guildId,
    guild: message.guild,
    guildId: message.guildId,
    channel: message.channel,
    user: message.author,
    member: message.member,
    client: message.client,
    createdTimestamp: message.createdTimestamp,
    options: optsApi,
    get replied() { return state.replied; },
    get deferred() { return state.deferred; },
    reply: (payload: Record<string, unknown>) => {
      state.replied = true;
      return sendPayload(payload);
    },
    followUp: (payload: Record<string, unknown>) => sendPayload(payload),
    deferReply: async () => {
      if (!state.replied) {
        state.deferred = true;
        channelOf(message).sendTyping?.().catch(() => {});
      }
    },
    editReply: (payload: Record<string, unknown>) => {
      if (state.last) return state.last.edit(payload as never);
      state.replied = true;
      return sendPayload(payload);
    },
    fetchReply: () => Promise.resolve(state.last),
  };

  try {
    await cmd.execute(interaction as unknown as ChatInputCommandInteraction, message.client);
  } catch (err) {
    console.error(`Prefix command ${name} failed:`, err);
    if (!state.replied && !state.deferred) {
      await channelOf(message)
        .send({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("Something went wrong")
            .setDescription("An error occurred while running this command. Please try again.")],
        })
        .catch(() => {});
    }
  }
  return true;
}