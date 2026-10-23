import { prisma } from '../config/db.js';
import { getEnv } from '../config/env.js';
import { linkKey, signLinkToken, verifyLinkToken } from '../domain/link-token.js';
import { ConflictError } from '../lib/errors.js';

/** A bot reply: text and optional inline buttons. */
export interface Reply {
  text: string;
  keyboard?: { inline_keyboard: { text: string; callback_data: string }[][] };
}

export type LinkConfig = { key: Buffer | null; siteUrl: string | undefined };

/** Links need the API's Supabase secret key (to sign) and the site's address (for the bot's link). */
export function linkConfig(): LinkConfig {
  const env = getEnv();
  return { key: env.SUPABASE_SECRET_KEY ? linkKey(env.SUPABASE_SECRET_KEY) : null, siteUrl: env.SITE_URL };
}

/**
 * Links this Telegram account to `userId`. Never replaces a link: an account that already has another Telegram,
 * or a Telegram that belongs to another account (one with a login), is refused; unlink first. So a leaked or
 * crafted link cannot silently swap someone's Telegram.
 */
export async function linkTelegram(userId: string, telegramId: string) {
  const [taken, mine] = await Promise.all([
    prisma.identity.findUnique({
      where: { platform_platformUserId: { platform: 'telegram', platformUserId: telegramId } },
      select: { userId: true, user: { select: { identities: { where: { platform: 'supabase' }, select: { id: true } } } } },
    }),
    prisma.identity.findFirst({ where: { userId, platform: 'telegram' }, select: { platformUserId: true } }),
  ]);
  if (taken?.userId === userId) return;
  if (mine) throw new ConflictError('Your account already has a Telegram linked: unlink it on your account page first.');
  if (taken && taken.user.identities.length > 0) throw new ConflictError('This Telegram is linked to another account.');
  // ponytail: a Telegram-only player from the old bot registration keeps their old row (characters, answers);
  // only dev has such rows, and new ones are no longer created.
  await prisma.identity.upsert({
    where: { platform_platformUserId: { platform: 'telegram', platformUserId: telegramId } },
    update: { userId },
    create: { platform: 'telegram', platformUserId: telegramId, userId },
  });
}

export async function unlinkTelegram(userId: string) {
  await prisma.identity.deleteMany({ where: { userId, platform: 'telegram' } });
}

const EXPIRED = 'This link has expired (5 minutes). On the guild site open your account page and press "Link Telegram" again.';

/** /start in the private chat: `param` is what follows it (the deep-link payload). */
export async function handleStart(from: { id: number }, param: string, config: LinkConfig): Promise<Reply> {
  if (param.startsWith('l') && config.key) {
    const target = verifyLinkToken(param.slice(1), config.key);
    const account = target?.kind === 'account'
      ? await prisma.user.findUnique({ where: { id: target.id }, select: { username: true } })
      : null;
    if (!target || !account) return { text: EXPIRED };
    try {
      await linkTelegram(target.id, String(from.id));
    } catch (error) {
      if (error instanceof ConflictError) return { text: error.message };
      throw error;
    }
    return { text: `Linked to ${account.username}. You can answer raid invites here.` };
  }

  const linked = await prisma.identity.findUnique({
    where: { platform_platformUserId: { platform: 'telegram', platformUserId: String(from.id) } },
    select: { user: { select: { username: true } } },
  });
  if (linked) return { text: `This Telegram is linked to ${linked.user.username}. You can answer raid invites here.` };

  if (!config.key || !config.siteUrl) return { text: 'Accounts are not set up yet. Ask an officer.' };
  const token = signLinkToken({ kind: 'telegram', id: String(from.id) }, config.key);
  return {
    text: `Welcome! Open this link to create your guild account (or sign in): your Telegram will be linked to it.\n`
      + `${config.siteUrl.replace(/\/+$/, '')}/link?t=${token}\nThe link works for 15 minutes.`,
  };
}
