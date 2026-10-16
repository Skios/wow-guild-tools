import { beforeEach, describe, expect, test, vi } from 'vitest';

const db = vi.hoisted(() => ({
  event: { findUnique: vi.fn() },
  response: { upsert: vi.fn() },
}));
vi.mock('../config/db.js', () => ({ prisma: db }));

import { ResponseService } from './response.service.js';

describe('ResponseService.updateResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.event.findUnique.mockResolvedValue({ isPublished: false });
  });

  test('does not reset isConfirmed when a member changes their answer', async () => {
    await new ResponseService().updateResponse('e1', 'c1', 'OUT');

    const call = db.response.upsert.mock.calls[0]![0];
    expect(call.update).toEqual({ status: 'OUT' });
    expect(call.create.isConfirmed).toBe(false);
  });
});
