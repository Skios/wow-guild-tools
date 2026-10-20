const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Throws unless the database is on this machine, or the caller explicitly opts in (ALLOW_SEED=1). */
export function assertLocalDatabase(databaseUrl: string | undefined, allow = process.env.ALLOW_SEED === '1') {
  if (allow) return;
  let host: string;
  try {
    host = new URL(databaseUrl ?? '').hostname;
  } catch {
    throw new Error('DATABASE_URL is missing or not a URL');
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to write demo data to ${host}: set ALLOW_SEED=1 if this is really what you want`);
  }
}
