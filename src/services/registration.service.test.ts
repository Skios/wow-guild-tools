import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { handleRegistrationCallback, handleRegistrationMessage } from './registration.service.js';

let nextId = 1000;
type Person = { id: number; username: string };
const newUser = (): Person => ({ id: nextId++, username: 'thrall' });
const say = (from: Person, text: string) => handleRegistrationMessage({ from, text });
const press = (from: Person, data: string) => handleRegistrationCallback({ from, data });
const buttons = (reply: Awaited<ReturnType<typeof say>>) => reply?.keyboard?.inline_keyboard.flat().map(b => b.callback_data) ?? [];

const slot = (id: string, name: string, cls = 'WARRIOR', spec = 'PROTECTION') => ({ id, name, realm: 'Silvermoon', class: cls, spec, role: 'TANK' });
const CLAIM_ID = '3f2b8c1e-8a4d-4c55-9d7e-000000000001';

/** Walks the manual path up to the class question. */
async function toClassStep(me: Person, name = 'Thrall', realm = 'Silvermoon') {
  await say(me, '/start');
  await say(me, name);
  return say(me, realm);
}

beforeEach(() => {
  resetPrismaMock();
  prismaMock.identity.upsert.mockResolvedValue({ user: { id: 'u1' } });
  prismaMock.character.findMany.mockResolvedValue([]); // nothing unclaimed unless a test says so
  prismaMock.character.findFirst.mockResolvedValue(null);
  prismaMock.character.create.mockResolvedValue({});
});

describe('claiming a roster name', () => {
  beforeEach(() => {
    prismaMock.character.findMany.mockResolvedValue([slot(CLAIM_ID, 'Brannock'), slot('c2', 'Aurelion', 'PALADIN', 'HOLY')]);
  });

  test('/start offers the names officers left empty, plus a way out', async () => {
    const reply = await say(newUser(), '/start');

    expect(reply?.text).toMatch(/roster/i);
    expect(buttons(reply)).toEqual([`reg_claim_${CLAIM_ID}`, 'reg_claim_c2', 'reg_claim_none']);
    expect(reply?.keyboard?.inline_keyboard[0]?.[0]?.text).toMatch(/Brannock.*Protection.*Warrior/);
  });

  test('picking a name claims it for the player', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.character.findUnique.mockResolvedValue(slot(CLAIM_ID, 'Brannock'));
    const me = newUser();
    await say(me, '/start');

    const reply = await press(me, `reg_claim_${CLAIM_ID}`);

    expect(reply?.text).toMatch(/Brannock/);
    expect(prismaMock.character.updateMany.mock.calls[0]![0].where).toEqual({ id: CLAIM_ID, inRoster: true, userId: null });
    expect(prismaMock.character.updateMany.mock.calls[0]![0].data.userId).toBe('u1');
  });

  test('if somebody took the name a second earlier, says so and lists what is still free', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 0 });
    const me = newUser();
    await say(me, '/start');

    const reply = await press(me, `reg_claim_${CLAIM_ID}`);

    expect(reply?.text).toMatch(/just (been )?(taken|claimed)/i);
    expect(buttons(reply)).toContain('reg_claim_none');
  });

  test('"my character is not listed" moves on to typing the name', async () => {
    const me = newUser();
    await say(me, '/start');

    expect((await press(me, 'reg_claim_none'))?.text).toMatch(/name/i);
    expect((await say(me, 'Thrall'))?.text).toMatch(/realm/i);
  });

  test.each(['reg_claim_', 'reg_claim_not-a-uuid', 'reg_claim_../../x'])('ignores the forged button %j', async (data) => {
    const reply = await press(newUser(), data);
    expect(reply?.text).toMatch(/invalid/i);
    expect(prismaMock.character.updateMany).not.toHaveBeenCalled();
  });

  test('a claim button works even if the bot restarted since /start', async () => {
    prismaMock.character.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.character.findUnique.mockResolvedValue(slot(CLAIM_ID, 'Brannock'));

    expect((await press(newUser(), `reg_claim_${CLAIM_ID}`))?.text).toMatch(/Brannock/);
  });

  test('when there is nothing to claim, /start goes straight to the name question', async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    expect((await say(newUser(), '/start'))?.text).toMatch(/name/i);
  });
});

describe('registering a new character by hand', () => {
  test('walks name, realm, class and specialization, then saves the main character', async () => {
    const me = newUser();

    expect((await say(me, '/start register'))?.text).toMatch(/name/i);
    expect((await say(me, 'Thrall'))?.text).toMatch(/realm/i);
    const classStep = await say(me, 'Silvermoon');
    expect(classStep?.text).toMatch(/class/i);
    expect(buttons(classStep)).toContain('reg_class_SHAMAN');
    const specStep = await press(me, 'reg_class_SHAMAN');
    expect(buttons(specStep)).toEqual(['reg_spec_ELEMENTAL', 'reg_spec_ENHANCEMENT', 'reg_spec_RESTORATION']);
    const done = await press(me, 'reg_spec_RESTORATION');

    expect(prismaMock.character.create).toHaveBeenCalledWith({
      data: { userId: 'u1', name: 'Thrall', realm: 'Silvermoon', class: 'SHAMAN', spec: 'RESTORATION', role: 'HEALER', isMain: true },
    });
    expect(done?.text).toMatch(/registered.*Restoration.*Shaman/i);
  });

  test('the role follows the spec: a Hunter can be melee (Survival) or ranged', async () => {
    const me = newUser();
    await toClassStep(me);
    await press(me, 'reg_class_HUNTER');
    await press(me, 'reg_spec_SURVIVAL');

    expect(prismaMock.character.create.mock.calls[0]![0].data.role).toBe('DPS');
  });

  test('updates the existing main character instead of creating a second one', async () => {
    prismaMock.character.findFirst.mockResolvedValue({ id: 'c1' });
    const me = newUser();
    await toClassStep(me);
    await press(me, 'reg_class_SHAMAN');
    await press(me, 'reg_spec_ENHANCEMENT');

    expect(prismaMock.character.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' } }));
    expect(prismaMock.character.create).not.toHaveBeenCalled();
  });

  test('offers every class, including Demon Hunter', async () => {
    const step = await toClassStep(newUser());
    expect(buttons(step)).toContain('reg_class_DEMONHUNTER');
    expect(buttons(step)).toHaveLength(13);
  });

  test('Druid has four specializations', async () => {
    const me = newUser();
    await toClassStep(me);
    expect(buttons(await press(me, 'reg_class_DRUID'))).toHaveLength(4);
  });

  test('rejects a forged specialization that the class does not have (Mage with Arms)', async () => {
    const me = newUser();
    await toClassStep(me);
    await press(me, 'reg_class_MAGE');

    const result = await press(me, 'reg_spec_ARMS');

    expect(result?.text).toMatch(/not a|invalid/i);
    expect(prismaMock.character.create).not.toHaveBeenCalled();
  });

  test.each(['reg_class_NINJA', 'reg_class_', 'reg_class___proto__'])('rejects the unknown class button %j', async (data) => {
    const me = newUser();
    await toClassStep(me);
    expect((await press(me, data))?.text).toMatch(/invalid/i);
  });

  test('the old role buttons are treated as out of date', async () => {
    const me = newUser();
    await toClassStep(me);
    await press(me, 'reg_class_MAGE');
    expect((await press(me, 'reg_role_RANGED_DPS'))?.text).toMatch(/out of date|invalid/i);
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

  test('normalises the name, trims, and accepts apostrophes in realm names', async () => {
    const me = newUser();
    await say(me, '/start');
    await say(me, '  tHRALL  ');
    await say(me, "  Mal'Ganis ");
    await press(me, 'reg_class_SHAMAN');
    await press(me, 'reg_spec_ELEMENTAL');

    expect(prismaMock.character.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Thrall', realm: "Mal'Ganis" }),
    });
  });

  test('restarting with /start in the middle discards the old draft', async () => {
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
    await press(a, 'reg_spec_ELEMENTAL');
    await press(b, 'reg_spec_FIRE');

    const created = prismaMock.character.create.mock.calls.map(c => `${c[0].data.name}-${c[0].data.spec}`).sort();
    expect(created).toEqual(['Jaina-FIRE', 'Thrall-ELEMENTAL']);
  });

  test('falls back to first_name when the user has no @username', async () => {
    const me = { id: nextId++, first_name: 'Cairne' } as unknown as Person;
    await toClassStep(me, 'Cairne', 'Thunderbluff');
    await press(me, 'reg_class_DRUID');
    await press(me, 'reg_spec_GUARDIAN');

    expect(prismaMock.identity.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ user: { create: { username: 'Cairne' } } }) }),
    );
  });

  test.each(['', '   ', '\n', '/'])('treats %j from a user without a draft as a request to /start', async (text) => {
    expect((await say(newUser(), text))?.text).toMatch(/\/start/);
  });

  test('a stale button from a user who never started points them to /start', async () => {
    expect((await press(newUser(), 'reg_spec_FIRE'))?.text).toMatch(/\/start/);
  });

  test('a stale button in the middle of the flow says it is out of date', async () => {
    const me = newUser();
    await say(me, '/start');
    expect((await press(me, 'reg_class_SHAMAN'))?.text).toMatch(/out of date/i);
  });

  test('text while a button is expected asks again instead of crashing', async () => {
    const me = newUser();
    await toClassStep(me);
    expect((await say(me, 'shaman please'))?.text).toMatch(/\/start|button/i);
  });

  test('tells the user when somebody else already registered that character', async () => {
    prismaMock.character.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '5' }),
    );
    const me = newUser();
    await toClassStep(me);
    await press(me, 'reg_class_SHAMAN');

    const result = await press(me, 'reg_spec_ELEMENTAL');

    expect(result?.text).toMatch(/already registered/i);
    expect((await say(me, 'Jaina'))?.text).toMatch(/\/start/);
  });

  test('other database errors are not swallowed', async () => {
    prismaMock.character.create.mockRejectedValue(new Error('db down'));
    const me = newUser();
    await toClassStep(me);
    await press(me, 'reg_class_SHAMAN');

    await expect(press(me, 'reg_spec_ELEMENTAL')).rejects.toThrow('db down');
  });
});
