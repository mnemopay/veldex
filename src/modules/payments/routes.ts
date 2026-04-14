/**
 * Payments routes — query only. Escrow is triggered automatically via bus.
 */

import type { FastifyInstance } from 'fastify';
import { PaymentService } from './service';
import { requireAuth } from '../../shared/auth/middleware';
import { OrderService } from '../orders/service';

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/payments/orders/:orderId — get payments for an order
  app.get('/orders/:orderId', { preHandler: requireAuth }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };

    // Verify the caller has access to this order
    const order = OrderService.getOrder(orderId);
    if (!order) return reply.code(404).send({ error: 'Order not found' });

    const user = request.user!;
    if (order.buyerId !== user.sub && order.farmerId !== user.sub && user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const payments = PaymentService.getPaymentsForOrder(orderId);
    return reply.send({ payments });
  });
}
