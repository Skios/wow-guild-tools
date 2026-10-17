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
});
