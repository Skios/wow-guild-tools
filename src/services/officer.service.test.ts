import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { ConflictError, NotFoundError } from '../lib/errors.js';
import { OfficerService, generatePassword, officerEmail, parseOfficerName, supabaseAuthAdmin, type AuthAdmin } from './officer.service.js';

const AUTH_ID = '92826cde-f38c-453e-9bec-a641710b1a55';
let admin: { [K in keyof AuthAdmin]: ReturnType<typeof vi.fn> };
let service: OfficerService;

beforeEach(() => {
  resetPrismaMock();
  prismaMock.role.findFirst.mockResolvedValue({ id: 'owner-role' });
  admin = { createUser: vi.fn().mockResolvedValue(AUTH_ID), setPassword: vi.fn(), deleteUser: vi.fn() };
  service = new OfficerService(admin as unknown as AuthAdmin);
});

describe('parseOfficerName', () => {
  test.each([['raidlead', 'raidlead'], ['  RaidLead ', 'raidlead'], ['gm.2', 'gm.2'], ['a_b-c', 'a_b-c'], ['x'.repeat(24), 'x'.repeat(24)]])(
    'accepts %j as %j',
    (raw, name) => expect(parseOfficerName(raw)).toBe(name),
  );

  test.each(['', 'ab', 'x'.repeat(25), 'raid lead', 'raid@lead', '.hidden', '-dash', 'èlite', 'a/b', undefined, 42])(
    'refuses %j',
    (raw) => expect(() => parseOfficerName(raw)).toThrow(/name/i),
  );
});

describe('officerEmail', () => {
  test('is an address on the reserved .invalid domain, which never receives mail', () => {
    expect(officerEmail('raidlead')).toBe('raidlead@wgt.invalid');
  });
});

describe('generatePassword', () => {
  test('is long, URL-safe and different every time', () => {
    const passwords = new Set(Array.from({ length: 50 }, generatePassword));
    expect(passwords.size).toBe(50);
    for (const password of passwords) expect(password).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });
});

describe('OfficerService.create', () => {
  test('the script only makes Owners: everyone else signs up and gets promoted in the site', async () => {
    prismaMock.user.create.mockResolvedValue({ id: 'u1' });

    await service.create('guildmaster');

    expect(prismaMock.role.findFirst).toHaveBeenCalledWith({ where: { isOwner: true }, select: { id: true } });
    expect(prismaMock.user.create.mock.calls[0]![0].data).toMatchObject({ username: 'guildmaster', roleId: 'owner-role' });
  });

  test('without the Owner role (migrations not applied) nothing is created', async () => {
    prismaMock.role.findFirst.mockResolvedValue(null);
    await expect(service.create('guildmaster')).rejects.toThrow(/Owner role/);
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  test('creates the login and an account backed by it, and returns the one-time password', async () => {
    prismaMock.user.create.mockResolvedValue({ id: 'u1' });

    const result = await service.create('RaidLead');

    expect(result).toEqual({ name: 'raidlead', password: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/) });
    expect(admin.createUser).toHaveBeenCalledWith('raidlead@wgt.invalid', result.password);
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { username: 'raidlead', roleId: 'owner-role', identities: { create: { platform: 'supabase', platformUserId: AUTH_ID } } },
    });
  });

  test('refuses a name already taken, before touching Supabase', async () => {
    prismaMock.identity.findFirst.mockResolvedValue({ platformUserId: AUTH_ID });

    await expect(service.create('raidlead')).rejects.toBeInstanceOf(ConflictError);
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  test('removes the login again if the officer row cannot be written (no orphan accounts)', async () => {
    prismaMock.user.create.mockRejectedValue(new Error('db down'));

    await expect(service.create('raidlead')).rejects.toThrow('db down');
    expect(admin.deleteUser).toHaveBeenCalledWith(AUTH_ID);
  });

  test('if the clean-up fails too, the original error is still the one reported', async () => {
    prismaMock.user.create.mockRejectedValue(new Error('db down'));
    admin.deleteUser.mockRejectedValue(new Error('supabase down'));

    await expect(service.create('raidlead')).rejects.toThrow('db down');
  });

  test('a bad name never reaches Supabase', async () => {
    await expect(service.create('raid lead')).rejects.toThrow(/name/i);
    expect(admin.createUser).not.toHaveBeenCalled();
  });
});

describe('OfficerService.resetPassword', () => {
  test('sets a fresh password on the login and returns it', async () => {
    prismaMock.identity.findFirst.mockResolvedValue({ platformUserId: AUTH_ID });

    const password = await service.resetPassword('raidlead');

    expect(password).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(admin.setPassword).toHaveBeenCalledWith(AUTH_ID, password);
  });

  test('404 for an unknown officer', async () => {
    prismaMock.identity.findFirst.mockResolvedValue(null);
    await expect(service.resetPassword('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('OfficerService.revoke', () => {
  beforeEach(() => {
    prismaMock.identity.findFirst.mockResolvedValue({ id: 'i1', platformUserId: AUTH_ID, userId: 'u1', user: { role: { isOwner: false } } });
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.identity.count.mockResolvedValue(2);
  });

  test('removes the role, deletes the login and its link', async () => {
    await service.revoke('raidlead');

    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { roleId: null } });
    expect(prismaMock.identity.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    expect(admin.deleteUser).toHaveBeenCalledWith(AUTH_ID);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  test('deletes the login first, so a failure can simply be retried', async () => {
    admin.deleteUser.mockRejectedValue(new Error('supabase down'));

    await expect(service.revoke('raidlead')).rejects.toThrow('supabase down');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.identity.delete).not.toHaveBeenCalled();
  });

  test('refuses to remove the last account that can sign in', async () => {
    prismaMock.identity.count.mockResolvedValue(1);

    await expect(service.revoke('raidlead')).rejects.toBeInstanceOf(ConflictError);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  test('refuses to remove the last Owner (nobody could run the site any more)', async () => {
    prismaMock.identity.findFirst.mockResolvedValue({ id: 'i1', platformUserId: AUTH_ID, userId: 'u1', user: { role: { isOwner: true } } });
    prismaMock.user.count.mockResolvedValue(1);

    await expect(service.revoke('guildmaster')).rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.user.count).toHaveBeenCalledWith({ where: { role: { isOwner: true } } });
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  test('an Owner can go when another Owner remains', async () => {
    prismaMock.identity.findFirst.mockResolvedValue({ id: 'i1', platformUserId: AUTH_ID, userId: 'u1', user: { role: { isOwner: true } } });
    prismaMock.user.count.mockResolvedValue(2);

    await service.revoke('guildmaster');
    expect(admin.deleteUser).toHaveBeenCalledWith(AUTH_ID);
  });

  test('404 for an unknown officer', async () => {
    prismaMock.identity.findFirst.mockResolvedValue(null);
    await expect(service.revoke('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('OfficerService.list', () => {
  test('lists every account that can sign in, highest role first', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ username: 'gm', role: { name: 'Owner' } }, { username: 'raidlead', role: null }]);

    await expect(service.list()).resolves.toEqual([{ name: 'gm', role: 'Owner' }, { name: 'raidlead', role: null }]);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { identities: { some: { platform: 'supabase' } } },
      select: { username: true, role: { select: { name: true } } },
      orderBy: [{ role: { position: 'asc' } }, { username: 'asc' }],
    });
  });
});

describe('supabaseAuthAdmin', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const fail = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  test('creates a confirmed user with the secret key and returns its id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ id: AUTH_ID }));
    const api = supabaseAuthAdmin('http://127.0.0.1:54321/', 'sb_secret_x', fetchImpl);

    await expect(api.createUser('raidlead@wgt.invalid', 'pw')).resolves.toBe(AUTH_ID);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:54321/auth/v1/admin/users');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: 'sb_secret_x', authorization: 'Bearer sb_secret_x' });
    expect(JSON.parse(init.body)).toEqual({ email: 'raidlead@wgt.invalid', password: 'pw', email_confirm: true });
  });

  test('an existing login is a conflict', async () => {
    const api = supabaseAuthAdmin('http://x', 'k', vi.fn().mockResolvedValue(fail(422, { error_code: 'email_exists' })));
    await expect(api.createUser('a@wgt.invalid', 'pw')).rejects.toBeInstanceOf(ConflictError);
  });

  test('other failures name the status, never the key', async () => {
    const api = supabaseAuthAdmin('http://x', 'sb_secret_x', vi.fn().mockResolvedValue(fail(401, { msg: 'bad key' })));
    const error = await api.createUser('a@wgt.invalid', 'pw').catch((e: Error) => e);
    expect(String(error)).toMatch(/401/);
    expect(String(error)).not.toMatch(/sb_secret_x/);
  });

  test('a response without an id is an error', async () => {
    const api = supabaseAuthAdmin('http://x', 'k', vi.fn().mockResolvedValue(ok({})));
    await expect(api.createUser('a@wgt.invalid', 'pw')).rejects.toThrow();
  });

  test('sets a password and deletes a user by id', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok({ id: AUTH_ID }));
    const api = supabaseAuthAdmin('http://x', 'k', fetchImpl);

    await api.setPassword(AUTH_ID, 'new');
    await api.deleteUser(AUTH_ID);

    expect(fetchImpl.mock.calls[0]![0]).toBe(`http://x/auth/v1/admin/users/${AUTH_ID}`);
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ password: 'new' }) });
    expect(fetchImpl.mock.calls[1]![1]).toMatchObject({ method: 'DELETE' });
  });

  test('a failed password change is an error', async () => {
    const api = supabaseAuthAdmin('http://x', 'k', vi.fn().mockResolvedValue(fail(422, { error_code: 'weak_password' })));
    await expect(api.setPassword(AUTH_ID, 'x')).rejects.toThrow(/422/);
  });

  test('deleting a login that is already gone is fine', async () => {
    const api = supabaseAuthAdmin('http://x', 'k', vi.fn().mockResolvedValue(fail(404, {})));
    await expect(api.deleteUser(AUTH_ID)).resolves.toBeUndefined();
  });
});
