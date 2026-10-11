import { FastifyInstance } from 'fastify';
import { UserRepository } from '../repositories/user.repository.js';
import { ResponseService } from '../services/response.service.js';
import { telegramConfig } from '../config/telegram.js';
import { prisma } from '../config/db.js';

export async function telegramRoutes(fastify: FastifyInstance) {
  const userRepo = new UserRepository();
  const responseService = new ResponseService();

  fastify.post(`/webhooks/telegram/${telegramConfig.webhookSecret}`, async (request, reply) => {
    const body = request.body as any;

    if (body.callback_query) {
      const { data, from } = body.callback_query;
      // data format: raid_in_UUID
      const parts = data.split('_');
      const action = parts[0] + '_' + parts[1]; // raid_in, raid_out, etc.
      const eventId = parts[2];

      const statusMap: Record<string, any> = {
        raid_in: 'IN',
        raid_out: 'OUT',
        raid_tent: 'TENTATIVE'
      };
      const status = statusMap[action];

      const user = await userRepo.findByPlatformId(from.id.toString());
      if (!user) return reply.send({ error: 'User not registered' });

      const character = await prisma.character.findFirst({
        where: { userId: user.id, isMain: true }
      });
      if (!character) return reply.send({ error: 'Main character not found' });

      await responseService.updateResponse(eventId, character.id, status);
      return reply.send({ ok: true });
    }

    return reply.send({ ok: true });
  });
}
