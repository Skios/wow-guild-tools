import { randomBytes } from 'node:crypto';
import { prisma } from '../config/db.js';
import { passwordProblem } from '../domain/password.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';
import type { Officer } from '../plugins/auth.js';

// Officers sign in with a nickname and a password. Supabase Auth needs an email, so the nickname is
// mapped to an address on the reserved .invalid domain: no real email (or person) is ever stored,
// and nothing can be mailed to it. The admin site's login builds the same address: keep both in sync.
export const OFFICER_EMAIL_DOMAIN = 'wgt.invalid';
const NAME = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const PASSWORD_BYTES = 18; // 24 base64url characters
// Names a Raider could use to pass for staff. The Owner script may still use them.
const RESERVED = new Set(['admin', 'administrator', 'owner', 'officer', 'guildmaster', 'raidleader', 'system', 'support', 'moderator']);
// All instances together (the per-IP limit is per serverless instance): bounds account spam.
const SIGNUPS_PER_HOUR_TOTAL = 30;
const HOUR_MS = 60 * 60 * 1000;

export function parseOfficerName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!NAME.test(name)) {
    throw new AppError('Nickname: 3-24 characters, a-z 0-9 . _ -, starting with a letter or digit', 400);
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
  /** True if the password is right; a wrong one is false, an outage throws. */
  verifyPassword(email: string, password: string): Promise<boolean>;
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
      if (res.status === 422) {
        // Only the error code: the message could echo request details.
        const { error_code: code } = (await res.json().catch(() => ({}))) as { error_code?: unknown };
        if (code === 'weak_password') throw new AppError('Password refused as too weak by the sign-in service', 400);
        if (code === 'email_exists' || code === 'user_already_exists') throw new ConflictError('That nickname is already taken');
      }
      if (!res.ok) throw failure('create user', res);
      const { id } = (await res.json()) as { id?: unknown };
      if (typeof id !== 'string') throw new Error('Supabase Auth returned a user without an id');
      return id;
    },
    async setPassword(id, password) {
      const res = await call(`/${id}`, 'PUT', { password });
      if (!res.ok) throw failure('update password', res);
    },
    async verifyPassword(email, password) {
      // The password sign-in endpoint (the secret key works as apikey); the session it opens is simply unused.
      const res = await fetchImpl(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: secretKey, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) return true;
      if (res.status === 400) return false;
      throw failure('check password', res);
    },
    async deleteUser(id) {
      const res = await call(`/${id}`, 'DELETE');
      if (!res.ok && res.status !== 404) throw failure('delete user', res);
    },
  };
}

export class OfficerService {
  constructor(private readonly admin: AuthAdmin) {}

  /**
   * Creates an Owner (bootstrap or recovery; everyone else signs up and is promoted in the site).
   * Returns the password, which is shown once and never stored by us.
   */
  async create(rawName: unknown) {
    const name = parseOfficerName(rawName);
    const password = generatePassword();
    await this.createAccount(name, password, { isOwner: true });
    return { name, password };
  }

  /** Open sign-up from the site: the player picks the password, the account gets the default role. */
  async signup(rawName: unknown, rawPassword: unknown) {
    const name = parseOfficerName(rawName);
    if (typeof rawPassword !== 'string') throw new AppError('Password: required', 400);
    if (RESERVED.has(name)) throw new AppError('That nickname is reserved', 400);
    const problem = passwordProblem(rawPassword, name);
    if (problem) throw new AppError(problem, 400);
    // Any player, not only accounts: a Telegram-only "brannock" must not get a look-alike account.
    if (await prisma.user.findFirst({ where: { username: name }, select: { id: true } })) {
      throw new ConflictError('That nickname is already taken');
    }
    const recent = await prisma.identity.count({ where: { platform: 'supabase', createdAt: { gte: new Date(Date.now() - HOUR_MS) } } });
    if (recent >= SIGNUPS_PER_HOUR_TOTAL) throw new AppError('Too many new accounts right now. Try again in an hour.', 429);
    await this.createAccount(name, rawPassword, { isDefault: true });
    return { name };
  }

  private async createAccount(name: string, password: string, role: { isOwner: true } | { isDefault: true }) {
    const found = await prisma.role.findFirst({ where: role, select: { id: true } });
    if (!found) throw new Error('Base roles missing in this database: apply the migrations first');
    if (await this.findLogin(name)) throw new ConflictError('That nickname is already taken');

    const authId = await this.admin.createUser(officerEmail(name), password);
    try {
      await prisma.user.create({
        data: { username: name, roleId: found.id, identities: { create: { platform: 'supabase', platformUserId: authId } } },
      });
    } catch (error) {
      // A login without an account row would be a dead account. If even the clean-up fails, the
      // original error matters more; the orphan login only blocks this name until removed by hand.
      try {
        await this.admin.deleteUser(authId);
      } catch {
        // keep the original error
      }
      throw error;
    }
  }

  /** Script: new temporary password for an account (e.g. a locked-out Owner). */
  async resetPassword(rawName: unknown) {
    const login = await this.requireLogin(parseOfficerName(rawName));
    return this.setTemporaryPassword(login);
  }

  /** Accounts that can sign in, for the Users page. */
  listAccounts() {
    return prisma.user.findMany({
      where: { identities: { some: { platform: 'supabase' } } },
      select: {
        id: true, username: true, mustChangePassword: true,
        role: { select: { id: true, name: true, position: true, isOwner: true } },
        characters: { select: { name: true, realm: true, class: true }, orderBy: { name: 'asc' } },
      },
      orderBy: [{ role: { position: 'asc' } }, { username: 'asc' }],
    });
  }

  /** Users page: a temporary password for someone below the actor (the Owner: anyone else). Shown once. */
  async resetPasswordFor(actor: Officer, userId: string) {
    if (actor.userId === userId) throw new AppError('Change your own password from your account page', 403);
    const login = await prisma.identity.findFirst({
      where: { platform: 'supabase', userId },
      select: { platformUserId: true, userId: true, user: { select: { role: { select: { position: true, isOwner: true } } } } },
    });
    if (!login) throw new NotFoundError('No account with a login');
    const role = login.user.role;
    if (!actor.isOwner && role && (role.isOwner || role.position <= actor.position)) {
      throw new AppError('You can only reset the password of someone below you', 403);
    }
    return this.setTemporaryPassword(login);
  }

  /**
   * Anyone signed in, for themselves; also lifts the temporary-password lock. The current password is
   * required (after a reset: the temporary one), so a stolen session alone cannot take the account over.
   */
  async changeOwnPassword(userId: string, username: string, currentPassword: string, rawPassword: unknown) {
    if (typeof rawPassword !== 'string') throw new AppError('Password: required', 400);
    const problem = passwordProblem(rawPassword, username);
    if (problem) throw new AppError(problem, 400);
    if (rawPassword === currentPassword) throw new AppError('Choose a different password from the current one', 400);
    if (!(await this.admin.verifyPassword(officerEmail(username), currentPassword))) {
      throw new AppError('The current password is wrong', 400);
    }
    const login = await prisma.identity.findFirst({ where: { platform: 'supabase', userId }, select: { platformUserId: true } });
    if (!login) throw new NotFoundError('No account with a login');
    await this.admin.setPassword(login.platformUserId, rawPassword);
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
  }

  // Supabase also revokes the user's refresh tokens; an access token already issued lives until it expires (1h).
  private async setTemporaryPassword(login: { platformUserId: string; userId: string }) {
    const password = generatePassword();
    await this.admin.setPassword(login.platformUserId, password);
    await prisma.user.update({ where: { id: login.userId }, data: { mustChangePassword: true } });
    return password;
  }

  async revoke(rawName: unknown) {
    const login = await this.requireLogin(parseOfficerName(rawName));
    await this.keepAnOwner(login.user.role);
    if ((await prisma.identity.count({ where: { platform: 'supabase' } })) <= 1) {
      throw new ConflictError('Refusing to remove the last account that can sign in');
    }
    // Login first: if Supabase fails nothing has changed and the revoke can be retried.
    await this.admin.deleteUser(login.platformUserId);
    await prisma.$transaction([
      prisma.user.update({ where: { id: login.userId }, data: { roleId: null } }),
      prisma.identity.delete({ where: { id: login.id } }),
    ]);
  }

  async list() {
    const users = await prisma.user.findMany({
      where: { identities: { some: { platform: 'supabase' } } },
      select: { username: true, role: { select: { name: true } } },
      orderBy: [{ role: { position: 'asc' } }, { username: 'asc' }],
    });
    return users.map(user => ({ name: user.username, role: user.role?.name ?? null }));
  }

  // ponytail: count-then-write isn't atomic; fine for a script one person runs.
  private async keepAnOwner(currentRole: { isOwner: boolean } | null) {
    if (currentRole?.isOwner && (await prisma.user.count({ where: { role: { isOwner: true } } })) <= 1) {
      throw new ConflictError('Refusing to remove the last Owner');
    }
  }

  private findLogin(name: string) {
    return prisma.identity.findFirst({
      where: { platform: 'supabase', user: { username: name } },
      include: { user: { select: { role: { select: { isOwner: true } } } } },
    });
  }

  private async requireLogin(name: string) {
    const login = await this.findLogin(name);
    if (!login) throw new NotFoundError(`No officer named ${name}`);
    return login;
  }
}
