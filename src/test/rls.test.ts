import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// Supabase serves the public schema through its Data API: a table without RLS is readable with the
// public key shipped in the web bundle. Every table Prisma creates must be locked down by a migration.
const root = join(import.meta.dirname, '../..');
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const migrationsDir = join(root, 'prisma/migrations');
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => readFileSync(join(migrationsDir, entry.name, 'migration.sql'), 'utf8'))
  .join('\n');

const tables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map(match => match[1]!);

describe('row level security', () => {
  test('the schema maps every model to a table name', () => {
    const models = [...schema.matchAll(/^model \w+ \{/gm)].length;
    expect(tables).toHaveLength(models);
  });

  test.each([...tables, '_prisma_migrations'])('%s has RLS enabled by a migration', (table) => {
    expect(migrations).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
  });
});
