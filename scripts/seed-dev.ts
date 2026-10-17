// Fills a LOCAL database with a believable raid so the admin site has something to show.
// Safe to re-run: it rebuilds the roster and the demo event.
import type { ResponseStatus, WoWClass } from '@prisma/client';
import { prisma } from '../src/config/db.js';
import { parseClassSpec } from '../src/domain/wow.js';

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

// name, class, spec, claimed by a player?, answer (null = no answer yet), confirmed, minutes late
type Seed = [string, WoWClass, string, boolean, ResponseStatus | null, boolean?, number?];

const ROSTER: Seed[] = [
  ['Brannock', 'WARRIOR', 'PROTECTION', true, 'IN', true],
  ['Velthira', 'DEMONHUNTER', 'VENGEANCE', true, 'IN', false],
  ['Aurelion', 'PALADIN', 'HOLY', true, 'IN', true],
  ['Sunnyva', 'PRIEST', 'DISCIPLINE', true, 'IN', true],
  ['Mosswhisper', 'DRUID', 'RESTORATION', true, 'TENTATIVE'],
  ['Kaelen', 'ROGUE', 'OUTLAW', true, 'IN', true],
  ['Grimtooth', 'DEATHKNIGHT', 'UNHOLY', true, 'IN', true],
  ['Zenfist', 'MONK', 'WINDWALKER', true, 'LATE', true, 15],
  ['Thorgrim', 'SHAMAN', 'ENHANCEMENT', true, 'OUT'],
  ['Pyrelle', 'MAGE', 'FIRE', true, 'IN', true],
  ['Nyxara', 'WARLOCK', 'AFFLICTION', true, 'IN', true],
  ['Windrunner', 'HUNTER', 'MARKSMANSHIP', true, 'IN', false],
  ['Emberwing', 'EVOKER', 'AUGMENTATION', true, 'BENCH'],
  ['Stormcaller', 'SHAMAN', 'ELEMENTAL', true, 'TENTATIVE'],
  ['Lunaris', 'DRUID', 'BALANCE', true, null],
  ['Ironhide', 'PALADIN', 'PROTECTION', true, null],
  ['Shadowmend', 'PRIEST', 'HOLY', false, null],
  ['Voidreaver', 'DEMONHUNTER', 'HAVOC', false, null],
  ['Frostbane', 'DEATHKNIGHT', 'FROST', false, null],
];

const claimer = (index: number) =>
  prisma.identity.upsert({
    where: { platform_platformUserId: { platform: 'telegram', platformUserId: String(910000 + index) } },
    update: {},
    create: { platform: 'telegram', platformUserId: String(910000 + index), user: { create: { username: `player${index + 1}` } } },
    include: { user: true },
  }).then(i => i.user);

await prisma.event.deleteMany({ where: { title: 'Mythic Raid Night (demo)' } });

const start = new Date(Date.now() + 26 * 3_600_000);
start.setMinutes(0, 0, 0);
const event = await prisma.event.create({
  data: {
    title: 'Mythic Raid Night (demo)',
    description: 'Bring flasks and potions. Pull at 21:00 sharp.',
    startTime: start,
    endTime: new Date(start.getTime() + 3 * 3_600_000),
  },
});

for (const [index, [name, cls, specId, claimed, answer, confirmed, late]] of ROSTER.entries()) {
  const { spec, role } = parseClassSpec(cls, specId);
  const owner = claimed ? await claimer(index) : null;
  const character = await prisma.character.upsert({
    where: { name_realm: { name, realm: 'Silvermoon' } },
    update: { class: cls, spec, role, inRoster: true, userId: owner?.id ?? null },
    create: { name, realm: 'Silvermoon', class: cls, spec, role, inRoster: true, userId: owner?.id ?? null, isMain: claimed },
  });
  if (answer) {
    await prisma.response.create({
      data: {
        eventId: event.id,
        characterId: character.id,
        status: answer,
        isConfirmed: confirmed ?? false,
        ...(late !== undefined && { arrivalTime: new Date(start.getTime() + late * 60_000) }),
      },
    });
  }
}

console.log(`Seeded demo event ${event.id} and a roster of ${ROSTER.length} characters`);
await prisma.$disconnect();
