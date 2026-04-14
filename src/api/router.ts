/**
 * Central route registration — thin delegation layer.
 * All routes are prefixed under /api.
 */

import type { FastifyInstance } from 'fastify';
import { authRoutes } from '../modules/auth/routes';
import { marketplaceRoutes } from '../modules/marketplace/routes';
import { orderRoutes } from '../modules/orders/routes';
import { paymentRoutes } from '../modules/payments/routes';
import { complianceRoutes } from '../modules/compliance/routes';
import { intelligenceRoutes } from '../modules/intelligence/routes';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Auth routes get a stricter rate limit (10/min) to prevent brute force
  if (process.env.RATE_LIMIT_DISABLED !== '1') {
    app.register(async function authScope(scoped) {
      scoped.register(import('@fastify/rate-limit'), {
        max: 10,
        timeWindow: '1 minute',
      });
      scoped.register(authRoutes);
    }, { prefix: '/api/auth' });
  } else {
    app.register(authRoutes, { prefix: '/api/auth' });
  }
  app.register(marketplaceRoutes, { prefix: '/api/marketplace' });
  app.register(orderRoutes,       { prefix: '/api/orders' });
  app.register(paymentRoutes,     { prefix: '/api/payments' });
  app.register(complianceRoutes,  { prefix: '/api/compliance' });
  app.register(intelligenceRoutes,{ prefix: '/api/intelligence' });

  // Health check — unauthenticated
  app.get('/health', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      service: 'veldex',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });
}
