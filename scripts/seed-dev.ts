// Fills a LOCAL database with a believable raid so the admin site has something to show.
// Safe to re-run: it recreates the demo event and upserts players and characters.
import type { ResponseStatus, WoWClass, WoWRole } from '@prisma/client';
import { prisma } from '../src/config/db.js';

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

type Seed = [name: string, cls: WoWClass, role: WoWRole, answer: ResponseStatus | null, confirmed?: boolean];

const ROSTER: Seed[] = [
  ['Brannock', 'WARRIOR', 'TANK', 'IN', true],
  ['Velthira', 'DEMONHUNTER', 'TANK', 'IN', false],
  ['Aurelion', 'PALADIN', 'HEALER', 'IN', true],
  ['Sunnyva', 'PRIEST', 'HEALER', 'IN', true],
  ['Mosswhisper', 'DRUID', 'HEALER', 'TENTATIVE'],
  ['Kaelen', 'ROGUE', 'DPS', 'IN', true],
  ['Grimtooth', 'DEATHKNIGHT', 'DPS', 'IN', true],
  ['Zenfist', 'MONK', 'DPS', 'IN', false],
  ['Thorgrim', 'SHAMAN', 'DPS', 'OUT'],
  ['Pyrelle', 'MAGE', 'RANGED_DPS', 'IN', true],
  ['Nyxara', 'WARLOCK', 'RANGED_DPS', 'IN', true],
  ['Windrunner', 'HUNTER', 'RANGED_DPS', 'IN', false],
  ['Emberwing', 'EVOKER', 'RANGED_DPS', 'BENCH'],
  ['Stormcaller', 'SHAMAN', 'RANGED_DPS', 'TENTATIVE'],
  ['Lunaris', 'DRUID', 'RANGED_DPS', null],
  ['Ironhide', 'PALADIN', 'TANK', null],
];

const user = (platformUserId: string, username: string) =>
  prisma.identity.upsert({
    where: { platform_platformUserId: { platform: 'telegram', platformUserId } },
    update: {},
    create: { platform: 'telegram', platformUserId, user: { create: { username } } },
    include: { user: true },
  }).then(i => i.user);

const officer = await user('900000', 'raid_leader');
await prisma.event.deleteMany({ where: { title: 'Mythic Raid Night (demo)' } });

const start = new Date(Date.now() + 26 * 3_600_000);
start.setMinutes(0, 0, 0);
const event = await prisma.event.create({
  data: {
    title: 'Mythic Raid Night (demo)',
    description: 'Bring flasks and potions. Pull at 21:00 sharp.',
    startTime: start,
    endTime: new Date(start.getTime() + 3 * 3_600_000),
    createdBy: officer.id,
  },
});

for (const [index, [name, cls, role, answer, confirmed]] of ROSTER.entries()) {
  const owner = await user(String(910000 + index), `${name.toLowerCase()}_player`);
  const character = await prisma.character.upsert({
    where: { name_realm: { name, realm: 'Silvermoon' } },
    update: { class: cls, role },
    create: { userId: owner.id, name, realm: 'Silvermoon', class: cls, role, isMain: true },
  });
  if (answer) {
    await prisma.response.create({
      data: { eventId: event.id, characterId: character.id, status: answer, isConfirmed: confirmed ?? false },
    });
  }
}

console.log(`Seeded demo event ${event.id} with ${ROSTER.length} characters`);
await prisma.$disconnect();
