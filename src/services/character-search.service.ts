import type { WoWClass } from '@prisma/client';
import { GUILD } from '../config/guild.js';
import { findClass, raiderIoGuild, type GuildMember } from './roster-import.service.js';

// Suggestions while typing a character name: the guild's members first, then Raider.IO's search (EU only),
// so names and realms come back spelled exactly as the game spells them.
export type Suggestion = { name: string; realm: string; class: WoWClass | null; inGuild: boolean };
type Found = { name: string; realm: string; class: WoWClass | null };

const TIMEOUT_MS = 5_000;
const MAX_RESULTS = 8;
const GUILD_TTL_MS = 60 * 60_000;

/** Raider.IO's site search. ponytail: not a documented API; if it changes, only the guild suggestions remain. */
export async function raiderIoSearch(term: string, fetchImpl: typeof fetch = fetch): Promise<Found[]> {
  const res = await fetchImpl(`https://raider.io/api/search?${new URLSearchParams({ term })}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Raider.IO search answered HTTP ${res.status}`);
  const body = (await res.json()) as { matches?: { type?: string; data?: { name?: unknown; region?: { slug?: unknown }; realm?: { name?: unknown }; class?: { name?: unknown } } | null }[] };
  return (body.matches ?? []).flatMap(({ type, data }) =>
    type === 'character' && data?.region?.slug === GUILD.region && typeof data.name === 'string' && typeof data.realm?.name === 'string'
      ? [{ name: data.name, realm: data.realm.name, class: typeof data.class?.name === 'string' ? findClass(data.class.name) : null }]
      : []);
}

// One fetch of the guild per hour per instance.
let guildCache: { at: number; members: GuildMember[] } | null = null;
async function cachedGuild() {
  if (!guildCache || Date.now() - guildCache.at > GUILD_TTL_MS) guildCache = { at: Date.now(), members: await raiderIoGuild(GUILD) };
  return guildCache.members;
}

export async function searchCharacters(
  term: string,
  deps: { guild: () => Promise<GuildMember[]>; search: (term: string) => Promise<Found[]> } = { guild: cachedGuild, search: raiderIoSearch },
): Promise<Suggestion[]> {
  const prefix = term.toLowerCase();
  const [guild, others] = await Promise.all([deps.guild().catch(() => []), deps.search(term).catch(() => [])]);
  const members = guild.filter(m => m.name.toLowerCase().startsWith(prefix))
    .map(m => ({ name: m.name, realm: m.realm, class: findClass(m.class), inGuild: true }));
  const seen = new Set(members.map(m => `${m.name}|${m.realm}`.toLowerCase()));
  const rest = others.filter(o => !seen.has(`${o.name}|${o.realm}`.toLowerCase())).map(o => ({ ...o, inGuild: false }));
  return [...members, ...rest].slice(0, MAX_RESULTS);
}
