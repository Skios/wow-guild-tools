// One-time roster import from a CSV file. Missing realms come from the guild on Raider.IO.
//   npm run roster:import:dev -- <file.csv>            preview only, writes nothing
//   npm run roster:import:dev -- <file.csv> --apply    adds the new characters
// Columns (header row, ; or ,): Nome/Name, Classe/Class, Spec, Offspec (in order, e.g. Fury/Arms), Reame/Realm, Nickname.
// Cells may be quoted (Excel): "Fury, Arms" is fine.
import { readFileSync } from 'node:fs';
import { prisma } from '../src/config/db.js';
import { RosterService } from '../src/services/roster.service.js';
import { applyImport, parseRosterCsv, planImport, raiderIoGuild, type GuildMember } from '../src/services/roster-import.service.js';

import { GUILD } from '../src/config/guild.js';
const [file, flag] = process.argv.slice(2);
const host = (url: string | undefined) => (url && URL.canParse(url) ? new URL(url).host : '(not set)');

try {
  if (!file || (flag !== undefined && flag !== '--apply')) throw new Error('Usage: npm run roster:import:dev -- <file.csv> [--apply]');
  console.log(`database: ${host(process.env.DATABASE_URL)}`);
  const rows = parseRosterCsv(readFileSync(file, 'utf8'));

  let guild: GuildMember[] = [];
  try {
    guild = await raiderIoGuild(GUILD);
    console.log(`Raider.IO: ${guild.length} members of ${GUILD.name} (${GUILD.realm})`);
  } catch (error) {
    console.warn(`${error instanceof Error ? error.message : error}: rows without a realm will be errors`);
  }

  const plan = await planImport(rows, guild);
  for (const row of plan) {
    const who = row.entry ? `${row.entry.name}-${row.entry.realm}` : '';
    console.log(`line ${row.line}\t${row.status.toUpperCase()}\t${who}${row.notes.length ? `\t(${row.notes.join('; ')})` : ''}`);
  }
  const count = (status: string) => plan.filter(r => r.status === status).length;
  console.log(`\n${count('new')} new, ${count('exists')} already in the roster, ${count('error')} errors`);

  if (flag !== '--apply') {
    console.log('Preview only: nothing was written. Add --apply to import the new ones.');
  } else {
    const result = await applyImport(plan, new RosterService());
    console.log(`Imported ${result.added}.`);
    for (const failure of result.failed) console.error(`line ${failure.line}: ${failure.error}`);
    if (result.failed.length) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
