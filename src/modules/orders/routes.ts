/**
 * Orders routes.
 */

import type { FastifyInstance } from 'fastify';
import { OrderService } from './service';
import { requireAuth } from '../../shared/auth/middleware';

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/orders — returns orders for the authenticated user
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    const orders =
      user.role === 'FARMER'
        ? OrderService.getOrdersForFarmer(user.sub)
        : OrderService.getOrdersForBuyer(user.sub);
    return reply.send({ orders, count: orders.length });
  });

  // GET /api/orders/:id
  app.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = OrderService.getOrder(id);
    if (!order) return reply.code(404).send({ error: 'Order not found' });

    const user = request.user!;
    if (order.buyerId !== user.sub && order.farmerId !== user.sub && user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    return reply.send({ order });
  });

  // POST /api/orders/:id/deliver — confirm delivery
  app.post('/:id/deliver', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const order = OrderService.confirmDelivery(id, request.user!.sub);
      return reply.send({ order, message: 'Delivery confirmed. Escrow will be released.' });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // POST /api/orders/:id/cancel
  app.post('/:id/cancel', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const order = OrderService.cancelOrder(id, request.user!.sub);
      return reply.send({ order });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
