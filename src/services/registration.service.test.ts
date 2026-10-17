import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const db = vi.hoisted(() => ({
  identity: { upsert: vi.fn() },
  character: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('../config/db.js', () => ({ prisma: db }));

import { handleRegistrationCallback, handleRegistrationMessage } from './registration.service.js';

let nextId = 1000;
const newUser = () => ({ id: nextId++, username: 'thrall' });
const say = (from: { id: number; username: string }, text: string) => handleRegistrationMessage({ from, text });
const press = (from: { id: number; username: string }, data: string) => handleRegistrationCallback({ from, data });

describe('registration conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.identity.upsert.mockResolvedValue({ user: { id: 'u1' } });
    db.character.findFirst.mockResolvedValue(null);
    db.character.create.mockResolvedValue({});
  });

  test('walks name, realm, class and role, then saves the main character', async () => {
    const me = newUser();

    expect((await say(me, '/start register'))?.text).toMatch(/name/i);
    expect((await say(me, 'Thrall'))?.text).toMatch(/realm/i);
    const classStep = await say(me, 'Silvermoon');
    expect(classStep?.text).toMatch(/class/i);
    expect(classStep?.keyboard?.inline_keyboard.flat().map(b => b.callback_data)).toContain('reg_class_SHAMAN');
    const roleStep = await press(me, 'reg_class_SHAMAN');
    expect(roleStep?.keyboard?.inline_keyboard.flat().map(b => b.callback_data)).toContain('reg_role_HEALER');
    const done = await press(me, 'reg_role_HEALER');

    expect(db.character.create).toHaveBeenCalledWith({
      data: { userId: 'u1', name: 'Thrall', realm: 'Silvermoon', class: 'SHAMAN', role: 'HEALER', isMain: true },
    });
    expect(done?.text).toMatch(/registered/i);
  });

  test('updates the existing main character instead of creating a second one', async () => {
    const me = newUser();
    db.character.findFirst.mockResolvedValue({ id: 'c1' });
    await say(me, '/start');
    await say(me, 'Thrall');
    await say(me, 'Silvermoon');
    await press(me, 'reg_class_SHAMAN');
    await press(me, 'reg_role_DPS');

    expect(db.character.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' } }));
    expect(db.character.create).not.toHaveBeenCalled();
  });

  test('rejects an invalid character name and asks again', async () => {
    const me = newUser();
    await say(me, '/start');

    expect((await say(me, 'x'))?.text).toMatch(/2.*12|letters/i);
    expect((await say(me, 'Thrall'))?.text).toMatch(/realm/i);
  });

  test('tells a user who never started to send /start', async () => {
    expect((await say(newUser(), 'hello'))?.text).toMatch(/\/start/);
  });

  test('ignores class buttons pressed outside the matching step', async () => {
    const me = newUser();
    await say(me, '/start');

    expect((await press(me, 'reg_class_SHAMAN'))?.text).toMatch(/out of date/i);
    expect(db.character.create).not.toHaveBeenCalled();
  });

  test('sends a user who never started to /start when they press a stale button', async () => {
    expect((await press(newUser(), 'reg_role_DPS'))?.text).toMatch(/\/start/);
  });

  test('rejects an unknown class value', async () => {
    const me = newUser();
    await say(me, '/start');
    await say(me, 'Thrall');
    await say(me, 'Silvermoon');

    expect((await press(me, 'reg_class_NINJA'))?.text).toMatch(/invalid/i);
  });

  test('only offers the roles the picked class can actually play', async () => {
    const me = newUser();
    await say(me, '/start');
    await say(me, 'Jaina');
    await say(me, 'Silvermoon');

    const mage = await press(me, 'reg_class_MAGE');
    expect(mage?.keyboard?.inline_keyboard.flat().map(b => b.callback_data)).toEqual(['reg_role_RANGED_DPS']);

    await say(me, '/start');
    await say(me, 'Jaina');
    await say(me, 'Silvermoon');
    const druid = await press(me, 'reg_class_DRUID');
    expect(druid?.keyboard?.inline_keyboard.flat().map(b => b.callback_data).sort()).toEqual(
      ['reg_role_DPS', 'reg_role_HEALER', 'reg_role_RANGED_DPS', 'reg_role_TANK'],
    );
  });

  test('rejects a forged role button that the class cannot play (Mage tank)', async () => {
    const me = newUser();
    await say(me, '/start');
    await say(me, 'Jaina');
    await say(me, 'Silvermoon');
    await press(me, 'reg_class_MAGE');

    const result = await press(me, 'reg_role_TANK');

    expect(result?.text).toMatch(/cannot play|invalid/i);
    expect(db.character.create).not.toHaveBeenCalled();
  });

  test('offers Demon Hunter and Ranged DPS', async () => {
    const me = newUser();
    await say(me, '/start');
    await say(me, 'Illidan');
    const step = await say(me, 'Silvermoon');

    expect(step?.keyboard?.inline_keyboard.flat().map(b => b.callback_data)).toContain('reg_class_DEMONHUNTER');
  });

  test.each(['Thr4ll', '<b>Hi</b>', 'Thrall😀', 'A', 'Abcdefghijklm', "x'; DROP TABLE characters;--"])(
    'rejects the character name %j and stays on the name step',
    async (badName) => {
      const me = newUser();
      await say(me, '/start');

      expect((await say(me, badName))?.text).toMatch(/letters/i);
      expect((await say(me, 'Thrall'))?.text).toMatch(/realm/i);
    },
  );

  test.each(['<script>', ' ', 'a'.repeat(41), 'x😀'])('rejects the realm %j', async (badRealm) => {
    const me = newUser();
    await say(me, '/start');
    await say(me, 'Thrall');

    expect((await say(me, badRealm))?.text).toMatch(/realm/i);
    expect((await say(me, 'Silvermoon'))?.keyboard).toBeDefined();
  });

  test('trims name and realm and accepts apostrophes in realm names', async () => {
    const me = newUser();
    await say(me, '/start');
    await say(me, '  Thrall  ');
    await say(me, "  Mal'Ganis ");
    await press(me, 'reg_class_SHAMAN');
    await press(me, 'reg_role_HEALER');

    expect(db.character.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Thrall', realm: "Mal'Ganis" }),
    });
  });

  test('restarting with /start in the middle of the flow discards the old draft', async () => {
    const me = newUser();
    await say(me, '/start');
    await say(me, 'Thrall');
    await say(me, '/start');

    expect((await say(me, 'Jaina'))?.text).toMatch(/realm/i);
  });

  test('two users registering at the same time do not mix their drafts', async () => {
    const a = newUser();
    const b = newUser();
    await say(a, '/start');
    await say(b, '/start');
    await say(a, 'Thrall');
    await say(b, 'Jaina');
    await say(a, 'Silvermoon');
    await say(b, 'Stormrage');
    await press(a, 'reg_class_SHAMAN');
    await press(b, 'reg_class_MAGE');
    await press(a, 'reg_role_HEALER');
    await press(b, 'reg_role_RANGED_DPS');

    const created = db.character.create.mock.calls.map(c => c[0].data.name).sort();
    expect(created).toEqual(['Jaina', 'Thrall']);
  });

  test('falls back to first_name, then to the numeric id, when the user has no @username', async () => {
    const me = { id: nextId++, first_name: 'Cairne' } as unknown as { id: number; username: string };
    await say(me, '/start');
    await say(me, 'Cairne');
    await say(me, 'Thunderbluff');
    await press(me, 'reg_class_DRUID');
    await press(me, 'reg_role_TANK');

    expect(db.identity.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ user: { create: { username: 'Cairne' } } }) }),
    );
  });

  test.each(['', '   ', '\n', '/'])('treats the message %j from a user without a draft as a request to /start', async (text) => {
    expect((await say(newUser(), text))?.text).toMatch(/\/start/);
  });

  test('a text message sent while a button is expected asks again instead of crashing', async () => {
    const me = newUser();
    await say(me, '/start');
    await say(me, 'Thrall');
    await say(me, 'Silvermoon');

    expect((await say(me, 'shaman please'))?.text).toMatch(/\/start|button/i);
  });

  test('tells the user when somebody else already registered that character, and keeps the draft usable', async () => {
    const me = newUser();
    db.character.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '5' }),
    );
    await say(me, '/start');
    await say(me, 'Thrall');
    await say(me, 'Silvermoon');
    await press(me, 'reg_class_SHAMAN');

    const result = await press(me, 'reg_role_HEALER');

    expect(result?.text).toMatch(/already registered/i);
    expect((await say(me, 'Jaina'))?.text).toMatch(/\/start/);
  });

  test('other database errors are not swallowed', async () => {
    const me = newUser();
    db.character.create.mockRejectedValue(new Error('db down'));
    await say(me, '/start');
    await say(me, 'Thrall');
    await say(me, 'Silvermoon');
    await press(me, 'reg_class_SHAMAN');

    await expect(press(me, 'reg_role_HEALER')).rejects.toThrow('db down');
  });
});
