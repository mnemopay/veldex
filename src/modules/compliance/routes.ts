/**
 * Compliance routes — PACA records, ADMIN only for sensitive ops.
 */

import type { FastifyInstance } from 'fastify';
import { ComplianceService } from './service';
import { requireAuth, requireRole } from '../../shared/auth/middleware';

export async function complianceRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/compliance/paca/pending — ADMIN: list all pending PACA notices
  app.get('/paca/pending', { preHandler: requireRole('ADMIN') }, async (_request, reply) => {
    const records = ComplianceService.getPendingNotices();
    return reply.send({ records, count: records.length });
  });

  // GET /api/compliance/paca/orders/:orderId — get PACA record for an order
  app.get('/paca/orders/:orderId', { preHandler: requireAuth }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const record = ComplianceService.getRecord(orderId);
    if (!record) return reply.code(404).send({ error: 'No PACA record for this order' });
    return reply.send({ record });
  });

  // POST /api/compliance/paca/orders/:orderId/issue-notice — ADMIN: mark notice issued
  app.post('/paca/orders/:orderId/issue-notice', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    try {
      const record = ComplianceService.issueNotice(orderId);
      return reply.send({ record });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
