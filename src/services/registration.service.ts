import { Prisma, WoWClass, WoWRole } from '@prisma/client';
import { prisma } from '../config/db.js';
import { CLASS_INFO, ROLE_LABEL, parseClassRole, rolesFor } from '../domain/wow.js';
import { UserRepository } from '../repositories/user.repository.js';
import { CharacterNameSchema, RealmSchema } from '../validators/character.validator.js';

export interface Reply {
  text: string;
  keyboard?: { inline_keyboard: { text: string; callback_data: string }[][] };
}
interface Sender {
  id: number;
  username?: string | undefined;
  first_name?: string | undefined;
}

type Draft =
  | { step: 'name' }
  | { step: 'realm'; name: string }
  | { step: 'class'; name: string; realm: string }
  | { step: 'role'; name: string; realm: string; class: WoWClass };

// ponytail: drafts live in memory and are lost on restart (user just sends /start again).
// Move to a table if the bot runs on more than one instance.
const drafts = new Map<number, Draft>();
const userRepo = new UserRepository();

const START_HINT = 'Send /start to register your main character.';
const ROLE_BUTTON_LABEL = (role: WoWRole) => ROLE_LABEL[role];
const CLASS_BUTTON_LABEL = (cls: WoWClass) => CLASS_INFO[cls].label;

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}

function keyboard<T extends string>(
  prefix: string,
  values: readonly T[],
  perRow: number,
  label: (value: T) => string,
): NonNullable<Reply['keyboard']> {
  const buttons = values.map(v => ({ text: label(v), callback_data: `${prefix}_${v}` }));
  return { inline_keyboard: chunk(buttons, perRow) };
}

async function saveCharacter(from: Sender, draft: { name: string; realm: string; class: WoWClass; role: WoWRole }) {
  const user = await userRepo.upsertFromIdentity('telegram', String(from.id), from.username ?? from.first_name ?? String(from.id));
  const existing = await prisma.character.findFirst({ where: { userId: user.id, isMain: true } });
  if (existing) {
    await prisma.character.update({ where: { id: existing.id }, data: draft });
  } else {
    await prisma.character.create({ data: { userId: user.id, ...draft, isMain: true } });
  }
}

export async function handleRegistrationMessage(msg: { from: Sender; text: string }): Promise<Reply> {
  const text = msg.text.trim();
  const id = msg.from.id;

  if (text.startsWith('/start')) {
    drafts.set(id, { step: 'name' });
    return { text: 'Welcome! Send me the name of your main character.' };
  }

  const draft = drafts.get(id);
  if (draft?.step === 'name') {
    const name = CharacterNameSchema.safeParse(text);
    if (!name.success) return { text: 'Character names are 2 to 12 letters. Try again.' };
    drafts.set(id, { step: 'realm', name: name.data });
    return { text: 'Which realm?' };
  }
  if (draft?.step === 'realm') {
    const realm = RealmSchema.safeParse(text);
    if (!realm.success) return { text: 'That is not a valid realm name (2 to 40 letters, digits, spaces or apostrophes). Try again.' };
    drafts.set(id, { step: 'class', name: draft.name, realm: realm.data });
    return { text: 'Pick your class:', keyboard: keyboard('reg_class', Object.values(WoWClass), 3, CLASS_BUTTON_LABEL) };
  }
  return { text: START_HINT };
}

export async function handleRegistrationCallback(query: { from: Sender; data: string }): Promise<Reply> {
  const id = query.from.id;
  const draft = drafts.get(id);

  if (query.data.startsWith('reg_class_') && draft?.step === 'class') {
    const picked = query.data.slice('reg_class_'.length);
    if (!(picked in WoWClass)) return { text: 'Invalid class.' };
    drafts.set(id, { ...draft, step: 'role', class: picked as WoWClass });
    return { text: 'Pick your role:', keyboard: keyboard('reg_role', rolesFor(picked), 2, ROLE_BUTTON_LABEL) };
  }

  if (query.data.startsWith('reg_role_') && draft?.step === 'role') {
    const picked = query.data.slice('reg_role_'.length);
    const { name, realm, class: wowClass } = draft;
    let pair;
    try {
      pair = parseClassRole(wowClass, picked);
    } catch (error) {
      return { text: error instanceof Error && /cannot play/.test(error.message) ? `${error.message}.` : 'Invalid role.' };
    }
    try {
      await saveCharacter(query.from, { name, realm, ...pair });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        drafts.delete(id);
        return { text: `${name}-${realm} is already registered by someone else. Send /start to try another character.` };
      }
      throw error;
    }
    drafts.delete(id);
    return { text: `Registered: ${name}-${realm} (${CLASS_INFO[wowClass].label}, ${ROLE_LABEL[pair.role]}). You can now answer raid invites.` };
  }

  if (query.data.startsWith('reg_class_') || query.data.startsWith('reg_role_')) {
    return { text: draft ? 'That button is out of date. Continue from the last question.' : START_HINT };
  }
  return { text: 'Invalid action.' };
}
