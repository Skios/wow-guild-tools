import type { WoWClass } from '@prisma/client';
import { prisma } from '../config/db.js';
import { CLASS_INFO, SPECS } from '../domain/wow.js';
import { RosterEntrySchema, type RosterEntry } from '../validators/roster.validator.js';
import type { RosterService } from './roster.service.js';

// One-time roster import from a CSV file, with missing realms filled in from the guild on Raider.IO.

export interface CsvRow {
  line: number;
  name: string;
  realm: string;
  class: string;
  spec: string;
  offSpecs: string[];
  nickname: string;
}
export interface GuildMember { name: string; realm: string; class: string }
export interface PlannedRow {
  line: number;
  status: 'new' | 'exists' | 'error';
  notes: string[];
  entry?: RosterEntry;
}

const COLUMNS: Record<keyof Omit<CsvRow, 'line'>, string[]> = {
  name: ['name', 'nome'],
  class: ['class', 'classe'],
  spec: ['spec', 'main', 'mainspec'],
  offSpecs: ['offspec', 'offspecs'],
  realm: ['realm', 'reame', 'server'],
  nickname: ['nickname', 'nick', 'soprannome'],
};
const REQUIRED = ['name', 'class', 'spec'] as const;

const squash = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

/** Splits one CSV line; a quoted cell may contain the separator and "" for a quote (what Excel writes). */
function splitCells(line: string, separator: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted && ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === separator && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/** Parses the file. Separator `;` or `,` (from the header), headers in Italian or English, any order. */
export function parseRosterCsv(text: string): CsvRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const headerAt = lines.findIndex(line => line.trim() !== '');
  if (headerAt === -1) throw new Error('The file is empty');

  const separator = lines[headerAt]!.includes(';') ? ';' : ',';
  const headers = splitCells(lines[headerAt]!, separator).map(squash);
  const index = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, names]) => [key, headers.findIndex(h => names.includes(h))]),
  ) as Record<keyof typeof COLUMNS, number>;
  for (const key of REQUIRED) if (index[key] === -1) throw new Error(`Missing column: ${key} (${COLUMNS[key].join(' / ')})`);

  const rows: CsvRow[] = [];
  lines.forEach((line, i) => {
    if (i <= headerAt || line.trim() === '') return;
    const cells = splitCells(line, separator);
    const cell = (key: keyof typeof COLUMNS) => (index[key] === -1 ? '' : cells[index[key]] ?? '');
    rows.push({
      line: i + 1,
      name: cell('name'),
      realm: cell('realm'),
      class: cell('class'),
      spec: cell('spec'),
      offSpecs: cell('offSpecs').split(/[/|,]/).map(s => s.trim()).filter(Boolean),
      nickname: cell('nickname'),
    });
  });
  if (rows.length === 0) throw new Error('The file has no characters below the header');
  return rows;
}

const CLASS_ALIASES: Record<string, WoWClass> = { dk: 'DEATHKNIGHT', dh: 'DEMONHUNTER' };
const SPEC_ALIASES: Record<string, string> = {
  bm: 'BEAST_MASTERY', mm: 'MARKSMANSHIP', prot: 'PROTECTION', resto: 'RESTORATION', disc: 'DISCIPLINE',
  ret: 'RETRIBUTION', enh: 'ENHANCEMENT', ele: 'ELEMENTAL', aff: 'AFFLICTION', destro: 'DESTRUCTION', demo: 'DEMONOLOGY',
};

export function findClass(raw: string): WoWClass | null {
  const key = squash(raw);
  if (CLASS_ALIASES[key]) return CLASS_ALIASES[key];
  const found = (Object.keys(CLASS_INFO) as WoWClass[]).find(cls => squash(cls) === key || squash(CLASS_INFO[cls].label) === key);
  return found ?? null;
}

export function findSpec(cls: WoWClass, raw: string): string | null {
  const key = squash(raw);
  const alias = SPEC_ALIASES[key];
  const found = SPECS[cls].find(s => s.id === alias || squash(s.id) === key || squash(s.label) === key);
  return found?.id ?? null;
}

const keyOf = (name: string, realm: string) => `${name.toLowerCase()}|${realm.toLowerCase()}`;

/** Checks every row and says what --apply would do. Writes nothing. */
export async function planImport(rows: CsvRow[], guild: GuildMember[]): Promise<PlannedRow[]> {
  const characters = await prisma.character.findMany({
    select: { name: true, realm: true, inRoster: true, user: { select: { username: true } } },
  });
  const known = new Map(characters.map(c => [keyOf(c.name, c.realm), c]));
  const byName = new Map<string, GuildMember[]>();
  for (const m of guild) byName.set(m.name.toLowerCase(), [...(byName.get(m.name.toLowerCase()) ?? []), m]);
  const seen = new Map<string, number>();

  return rows.map(row => {
    const error = (message: string): PlannedRow => ({ line: row.line, status: 'error', notes: [message] });
    const cls = findClass(row.class);
    if (!cls) return error(`Unknown class "${row.class}"`);
    const label = CLASS_INFO[cls].label;
    const spec = findSpec(cls, row.spec);
    if (!spec) return error(`"${row.spec}" is not a ${label} spec`);
    const offSpecs = row.offSpecs.map(off => findSpec(cls, off));
    const unknownOff = row.offSpecs.find((_, i) => offSpecs[i] === null);
    if (unknownOff !== undefined) return error(`Unknown offspec "${unknownOff}" for a ${label}`);

    const notes: string[] = [];
    const matches = byName.get(row.name.toLowerCase()) ?? [];
    let realm = row.realm;
    if (!realm) {
      if (matches.length > 1) return error(`"${row.name}" is in the guild on ${matches.map(m => m.realm).join(' and ')}: write the realm in the file`);
      if (matches.length === 0) return error(`"${row.name}" is not in the guild: write the realm in the file`);
      realm = matches[0]!.realm;
      notes.push(`realm from the guild: ${realm}`);
    }
    const member = matches.find(m => m.realm.toLowerCase() === realm.toLowerCase());
    if (member) realm = member.realm; // the guild's spelling: 'nemesis' must not become a second Nemesis
    if (member && findClass(member.class) !== cls) notes.push(`Raider.IO says ${member.class}, the file says ${label}`);

    const parsed = RosterEntrySchema.safeParse({ name: row.name, realm, class: cls, spec, offSpecs, nickname: row.nickname });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      return error(`${issue.path.join('.') || 'row'}: ${issue.message}`);
    }

    const key = keyOf(parsed.data.name, parsed.data.realm);
    if (seen.has(key)) return error(`Same character as line ${seen.get(key)}`);
    seen.set(key, row.line);
    const stored = known.get(key);
    if (stored?.inRoster) return { line: row.line, status: 'exists', notes, entry: parsed.data };
    if (stored?.user) notes.push(`registered by ${stored.user.username}: will be promoted to the roster with these specs`);
    return { line: row.line, status: 'new', notes, entry: parsed.data };
  });
}

/** Adds the "new" rows one by one; one failure does not stop the others. */
export async function applyImport(plan: PlannedRow[], roster: Pick<RosterService, 'add'>) {
  let added = 0;
  const failed: { line: number; error: string }[] = [];
  for (const row of plan) {
    if (row.status !== 'new' || !row.entry) continue;
    try {
      await roster.add(row.entry);
      added++;
    } catch (error) {
      failed.push({ line: row.line, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { added, failed };
}

const RAIDER_IO_TIMEOUT_MS = 10_000;

/** The guild's members from Raider.IO's public API (no key needed). */
export async function raiderIoGuild(guild: { region: string; realm: string; name: string }, fetchImpl: typeof fetch = fetch) {
  const params = new URLSearchParams({ region: guild.region, realm: guild.realm, name: guild.name, fields: 'members' });
  const res = await fetchImpl(`https://raider.io/api/v1/guilds/profile?${params}`, { signal: AbortSignal.timeout(RAIDER_IO_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Raider.IO answered HTTP ${res.status} for ${guild.name} (${guild.realm})`);
  const body = (await res.json()) as { members?: { character?: Partial<GuildMember> | null }[] };
  return (body.members ?? []).flatMap(({ character: c }) =>
    c && typeof c.name === 'string' && typeof c.realm === 'string' && typeof c.class === 'string'
      ? [{ name: c.name, realm: c.realm, class: c.class }]
      : []);
}
