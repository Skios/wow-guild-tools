import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../test/prisma-mock.js';
import { buildOfficerRouteApp, buildRouteAppAs } from '../test/helpers.js';

vi.mock('../config/db.js', () => ({ prisma: prismaMock }));

import { adminRoutes } from './admin.controller.js';

const app = () => buildOfficerRouteApp(adminRoutes);
beforeEach(() => resetPrismaMock());

describe('GET /meta/wow', () => {
  test('serves colours, labels and valid roles for every class, plus the role labels', async () => {
    const body = (await (await app()).inject('/meta/wow')).json();

    expect(body.classes).toHaveLength(13);
    expect(body.classes.find((c: { id: string }) => c.id === 'DEMONHUNTER')).toMatchObject({
      label: 'Demon Hunter', color: '#A330C9', roles: ['TANK', 'DPS', 'RANGED_DPS'],
    });
    expect(body.classes.find((c: { id: string }) => c.id === 'DRUID').specs).toEqual([
      { id: 'BALANCE', label: 'Balance', role: 'RANGED_DPS' },
      { id: 'FERAL', label: 'Feral', role: 'DPS' },
      { id: 'GUARDIAN', label: 'Guardian', role: 'TANK' },
      { id: 'RESTORATION', label: 'Restoration', role: 'HEALER' },
    ]);
    expect(body.classes.every((c: { specs: unknown[] }) => c.specs.length >= 3)).toBe(true);
    expect(body.roles).toEqual([
      { id: 'TANK', label: 'Tank' },
      { id: 'HEALER', label: 'Healer' },
      { id: 'DPS', label: 'Melee DPS' },
      { id: 'RANGED_DPS', label: 'Ranged DPS' },
    ]);
  });
});
