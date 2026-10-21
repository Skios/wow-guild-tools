import { Prisma, WoWClass, type WoWRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { CLASS_INFO, SPECS, parseClassSpec } from '../domain/wow.js';
import { ConflictError } from '../lib/errors.js';
import { draftStore } from '../repositories/draft.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { CharacterNameSchema, RealmSchema } from '../validators/character.validator.js';
import { RosterService } from './roster.service.js';

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
  | { step: 'spec'; name: string; realm: string; class: WoWClass };

// Stored in the database: on serverless the next message may reach another instance.
const drafts = draftStore<Draft>('registration');
const userRepo = new UserRepository();
const roster = new RosterService();

const START_HINT = 'Send /start to register your main character.';
const NAME_PROMPT = 'Send me the name of your main character.';
const CLAIM_PREFIX = 'reg_claim_';
const Uuid = z.string().uuid();

const displayName = (from: Sender) => from.username ?? from.first_name ?? String(from.id);
const specLabel = (cls: WoWClass, spec: string | null) => SPECS[cls].find(s => s.id === spec)?.label;
const describe = (cls: WoWClass, spec: string | null) => [specLabel(cls, spec), CLASS_INFO[cls].label].filter(Boolean).join(' ');

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}

function keyboard(prefix: string, options: { id: string; label: string }[], perRow: number): NonNullable<Reply['keyboard']> {
  const buttons = options.map(o => ({ text: o.label, callback_data: `${prefix}_${o.id}` }));
  return { inline_keyboard: chunk(buttons, perRow) };
}

/** The roster names officers left empty, as buttons. Null when there is nothing to claim. */
async function claimList(text: string): Promise<Reply | null> {
  const free = await roster.listUnclaimed();
  if (free.length === 0) return null;
  const rows = free.map(c => [{ text: `${c.name} · ${describe(c.class, c.spec)}`, callback_data: `${CLAIM_PREFIX}${c.id}` }]);
  rows.push([{ text: 'My character is not listed', callback_data: `${CLAIM_PREFIX}none` }]);
  return { text, keyboard: { inline_keyboard: rows } };
}

async function saveCharacter(from: Sender, data: { name: string; realm: string; class: WoWClass; spec: string; role: WoWRole }) {
  const user = await userRepo.upsertFromIdentity('telegram', String(from.id), displayName(from));
  const existing = await prisma.character.findFirst({ where: { userId: user.id, isMain: true } });
  if (existing) {
    await prisma.character.update({ where: { id: existing.id }, data });
  } else {
    await prisma.character.create({ data: { userId: user.id, ...data, isMain: true } });
  }
}

async function claim(from: Sender, characterId: string): Promise<Reply> {
  const user = await userRepo.upsertFromIdentity('telegram', String(from.id), displayName(from));
  try {
    const claimed = await roster.claim(characterId, user.id);
    await drafts.delete(from.id);
    const detail = claimed ? ` (${describe(claimed.class, claimed.spec)})` : '';
    return { text: `Registered: ${claimed?.name}-${claimed?.realm}${detail}. You can now answer raid invites.` };
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    const list = await claimList('That name was just taken by someone else. Pick another:');
    if (list) return list;
    await drafts.set(from.id, { step: 'name' });
    return { text: `That name was just taken by someone else. ${NAME_PROMPT}` };
  }
}

export async function handleRegistrationMessage(msg: { from: Sender; text: string }): Promise<Reply> {
  const text = msg.text.trim();
  const id = msg.from.id;

  if (text.startsWith('/start')) {
    await drafts.delete(id);
    const list = await claimList('Welcome! Which roster character is yours?');
    if (list) return list;
    await drafts.set(id, { step: 'name' });
    return { text: `Welcome! ${NAME_PROMPT}` };
  }

  const draft = await drafts.get(id);
  if (draft?.step === 'name') {
    const name = CharacterNameSchema.safeParse(text);
    if (!name.success) return { text: 'Character names are 2 to 12 letters. Try again.' };
    await drafts.set(id, { step: 'realm', name: name.data });
    return { text: 'Which realm?' };
  }
  if (draft?.step === 'realm') {
    const realm = RealmSchema.safeParse(text);
    if (!realm.success) return { text: 'That is not a valid realm name (2 to 40 letters, digits, spaces or apostrophes). Try again.' };
    await drafts.set(id, { step: 'class', name: draft.name, realm: realm.data });
    const classes = (Object.keys(CLASS_INFO) as WoWClass[]).map(c => ({ id: c, label: CLASS_INFO[c].label }));
    return { text: 'Pick your class:', keyboard: keyboard('reg_class', classes, 3) };
  }
  return { text: START_HINT };
}

export async function handleRegistrationCallback(query: { from: Sender; data: string }): Promise<Reply> {
  const id = query.from.id;
  const draft = await drafts.get(id);

  if (query.data.startsWith(CLAIM_PREFIX)) {
    const target = query.data.slice(CLAIM_PREFIX.length);
    if (target === 'none') {
      await drafts.set(id, { step: 'name' });
      return { text: NAME_PROMPT };
    }
    if (!Uuid.safeParse(target).success) return { text: 'Invalid action.' };
    return claim(query.from, target);
  }

  if (query.data.startsWith('reg_class_') && draft?.step === 'class') {
    const picked = query.data.slice('reg_class_'.length);
    if (!Object.hasOwn(WoWClass, picked)) return { text: 'Invalid class.' };
    const cls = picked as WoWClass;
    await drafts.set(id, { step: 'spec', name: draft.name, realm: draft.realm, class: cls });
    const specs = SPECS[cls].map(s => ({ id: s.id, label: s.label }));
    return { text: `Pick your ${CLASS_INFO[cls].label} specialization:`, keyboard: keyboard('reg_spec', specs, 2) };
  }

  if (query.data.startsWith('reg_spec_') && draft?.step === 'spec') {
    const picked = query.data.slice('reg_spec_'.length);
    let chosen;
    try {
      chosen = parseClassSpec(draft.class, picked);
    } catch (error) {
      return { text: `${error instanceof Error ? error.message : 'Invalid specialization'}.` };
    }
    try {
      await saveCharacter(query.from, { name: draft.name, realm: draft.realm, ...chosen });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await drafts.delete(id);
        return { text: `${draft.name}-${draft.realm} is already registered by someone else. Send /start to try another character.` };
      }
      throw error;
    }
    await drafts.delete(id);
    return { text: `Registered: ${draft.name}-${draft.realm} (${describe(chosen.class, chosen.spec)}). You can now answer raid invites.` };
  }

  if (/^reg_(class|spec|role)_/.test(query.data)) {
    return { text: draft ? 'That button is out of date. Continue from the last question.' : START_HINT };
  }
  return { text: 'Invalid action.' };
}
