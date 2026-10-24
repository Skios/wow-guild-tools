import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendError } from '../lib/http-error.js';
import { MAX_LATE_MINUTES } from '../validators/event.validator.js';
import { DashboardService } from '../services/dashboard.service.js';

const DEFAULT_SPAN = 10;
const MAX_NOTE_LENGTH = 200;
const SpanQuery = z.object({
  span: z.union([z.literal('season'), z.coerce.number().int().min(1).max(100)]).default(DEFAULT_SPAN),
});
const AnswerParams = z.object({ id: z.uuid() });
const AnswerBody = z.object({
  characterId: z.uuid(),
  // BENCH is an officer's call, not an answer.
  status: z.enum(['IN', 'LATE', 'TENTATIVE', 'OUT']),
  lateMinutes: z.number().int().min(0).max(MAX_LATE_MINUTES).optional(),
  note: z.string().max(MAX_NOTE_LENGTH).optional(),
}).refine(a => a.lateMinutes === undefined || a.status === 'LATE', { message: 'Late minutes only apply to LATE', path: ['lateMinutes'] });

// The home page for any site user; officer sections only for the capabilities that open them.
export async function dashboardRoutes(fastify: FastifyInstance) {
  const dashboard = new DashboardService();

  fastify.get('/dashboard', async (request, reply) => {
    try {
      const { span } = SpanQuery.parse(request.query);
      const { userId, capabilities } = request.officer!;
      const can = (c: string) => capabilities.includes(c);
      const officer = can('events.manage');
      const [me, composition, todo, attendance] = await Promise.all([
        dashboard.myEvents(userId),
        officer ? dashboard.composition() : undefined,
        officer || can('roster.approve') ? dashboard.todo(capabilities) : undefined,
        officer ? dashboard.attendance(span) : undefined,
      ]);
      return reply.send({ me, ...(composition && { composition }), ...(todo && { todo }), ...(attendance && { attendance }) });
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  fastify.put('/me/events/:id/answer', async (request, reply) => {
    try {
      const { id } = AnswerParams.parse(request.params);
      const body = AnswerBody.parse(request.body);
      await dashboard.answer(request.officer!.userId, id, body);
      return reply.code(204).send();
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
