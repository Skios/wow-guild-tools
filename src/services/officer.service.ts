import { randomBytes } from 'node:crypto';
import { prisma } from '../config/db.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';

// Officers sign in with a nickname and a password. Supabase Auth needs an email, so the nickname is
// mapped to an address on the reserved .invalid domain: no real email (or person) is ever stored,
// and nothing can be mailed to it. The admin site's login builds the same address: keep both in sync.
export const OFFICER_EMAIL_DOMAIN = 'wgt.invalid';
const NAME = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const PASSWORD_BYTES = 18; // 24 base64url characters

export function parseOfficerName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!NAME.test(name)) {
    throw new AppError('Officer name: 3-24 characters, a-z 0-9 . _ -, starting with a letter or digit', 400);
  }
  return name;
}

export const officerEmail = (name: string) => `${name}@${OFFICER_EMAIL_DOMAIN}`;
export const generatePassword = () => randomBytes(PASSWORD_BYTES).toString('base64url');

/** The few Supabase Auth admin calls we need. Uses the project's SECRET key: scripts only, never the app. */
export type AuthAdmin = {
  createUser(email: string, password: string): Promise<string>;
  setPassword(id: string, password: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
};

export function supabaseAuthAdmin(supabaseUrl: string, secretKey: string, fetchImpl: typeof fetch = fetch): AuthAdmin {
  const base = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/admin/users`;
  const call = (path: string, method: string, body?: object) =>
    fetchImpl(`${base}${path}`, {
      method,
      headers: { apikey: secretKey, authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    });
  // Only the status: the body could echo request details, and the key must never end up in a log.
  const failure = (action: string, res: Response) => new Error(`Supabase Auth ${action} failed with HTTP ${res.status}`);

  return {
    async createUser(email, password) {
      const res = await call('', 'POST', { email, password, email_confirm: true });
      if (res.status === 422) throw new ConflictError('That officer name is already taken');
      if (!res.ok) throw failure('create user', res);
      const { id } = (await res.json()) as { id?: unknown };
      if (typeof id !== 'string') throw new Error('Supabase Auth returned a user without an id');
      return id;
    },
    async setPassword(id, password) {
      const res = await call(`/${id}`, 'PUT', { password });
      if (!res.ok) throw failure('update password', res);
    },
    async deleteUser(id) {
      const res = await call(`/${id}`, 'DELETE');
      if (!res.ok && res.status !== 404) throw failure('delete user', res);
    },
  };
}

export class OfficerService {
  constructor(private readonly admin: AuthAdmin) {}

  /** Creates the login and its officer. Returns the password, which is shown once and never stored by us. */
  async create(rawName: unknown) {
    const name = parseOfficerName(rawName);
    if (await this.findLogin(name)) throw new ConflictError('That officer name is already taken');

    const password = generatePassword();
    const authId = await this.admin.createUser(officerEmail(name), password);
    try {
      await prisma.user.create({
        data: { username: name, isOfficer: true, identities: { create: { platform: 'supabase', platformUserId: authId } } },
      });
    } catch (error) {
      // A login without an officer row would be a dead account. If even the clean-up fails, the
      // original error matters more; the orphan login only blocks this name until removed by hand.
      try {
        await this.admin.deleteUser(authId);
      } catch {
        // keep the original error
      }
      throw error;
    }
    return { name, password };
  }

  async resetPassword(rawName: unknown) {
    const login = await this.requireLogin(parseOfficerName(rawName));
    const password = generatePassword();
    // Supabase also revokes the user's refresh tokens; an access token already issued lives until it expires (1h).
    await this.admin.setPassword(login.platformUserId, password);
    return password;
  }

  async revoke(rawName: unknown) {
    const login = await this.requireLogin(parseOfficerName(rawName));
    if ((await prisma.user.count({ where: { isOfficer: true } })) <= 1) {
      throw new ConflictError('Refusing to remove the last officer');
    }
    // Login first: if Supabase fails nothing has changed and the revoke can be retried.
    // ponytail: count-then-write isn't atomic; fine for a script one person runs.
    await this.admin.deleteUser(login.platformUserId);
    await prisma.$transaction([
      prisma.user.update({ where: { id: login.userId }, data: { isOfficer: false } }),
      prisma.identity.delete({ where: { id: login.id } }),
    ]);
  }

  async list() {
    const officers = await prisma.user.findMany({
      where: { isOfficer: true }, select: { username: true }, orderBy: { username: 'asc' },
    });
    return officers.map(officer => officer.username);
  }

  private findLogin(name: string) {
    return prisma.identity.findFirst({ where: { platform: 'supabase', user: { username: name } } });
  }

  private async requireLogin(name: string) {
    const login = await this.findLogin(name);
    if (!login) throw new NotFoundError(`No officer named ${name}`);
    return login;
  }
}
