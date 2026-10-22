// Manage admin-site accounts (nickname + password, no email). Runs against the database and Supabase
// project in your environment, so point it at the right one:
//   npm run officer -- create <name> [--role owner|officer] | role <name> <owner|officer> | reset <name> | revoke <name> | list
// Needs DATABASE_URL, SUPABASE_URL and SUPABASE_SECRET_KEY (scripts only: never give it to the app).
import { prisma } from '../src/config/db.js';
import { OfficerService, supabaseAuthAdmin } from '../src/services/officer.service.js';

const USAGE = 'Usage: npm run officer -- create <name> [--role owner|officer] | role <name> <owner|officer> | reset <name> | revoke <name> | list';
const [command, name, ...rest] = process.argv.slice(2);
// A mistyped flag must not silently create an officer (or worse, the wrong role).
if (command === 'create' && rest.length > 0 && (rest[0] !== '--role' || !rest[1] || rest.length > 2)) {
  console.error(USAGE);
  process.exit(1);
}
const roleFlag = rest[1];
const { SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL } = process.env;
const host = (url: string | undefined) => (url && URL.canParse(url) ? new URL(url).host : '(not set)');

try {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY');
  // Both must be the same environment, or the login and the officer row end up in different places.
  console.log(`Supabase: ${host(SUPABASE_URL)}  database: ${host(DATABASE_URL)}`);
  const officers = new OfficerService(supabaseAuthAdmin(SUPABASE_URL, SUPABASE_SECRET_KEY));

  switch (command) {
    case 'create': {
      const created = await officers.create(name, roleFlag);
      console.log(`Account "${created.name}" created.\nPassword (shown once, store it now): ${created.password}`);
      break;
    }
    case 'role':
      await officers.setRole(name, rest[0]);
      console.log(`"${name}" is now ${rest[0]}.`);
      break;
    case 'reset':
      console.log(`New password for "${name}" (shown once): ${await officers.resetPassword(name)}`);
      break;
    case 'revoke':
      await officers.revoke(name);
      console.log(`"${name}" no longer has a role and can no longer sign in.`);
      break;
    case 'list':
      console.log((await officers.list()).map(user => `${user.role}\t${user.name}`).join('\n') || '(no accounts)');
      break;
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
