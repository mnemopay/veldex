/**
 * Intelligence routes — price feed and market data.
 * Public endpoints (no auth required for price data — it's a lead magnet).
 */

import type { FastifyInstance } from 'fastify';
import { IntelligenceService } from './service';

export async function intelligenceRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/intelligence/prices?crop=maize&country=NG
  app.get('/prices', async (request, reply) => {
    const q = request.query as Record<string, string>;

    if (!q['crop']) {
      return reply.code(400).send({ error: 'crop query parameter is required' });
    }

    const data = IntelligenceService.getPrices({
      crop: q['crop'],
      country: q['country'] as any,
    });

    if (data.results.length === 0) {
      return reply.code(404).send({
        error: `No price data for crop: ${q['crop']}`,
        availableCrops: IntelligenceService.getAllCrops(),
      });
    }

    return reply.send(data);
  });

  // GET /api/intelligence/crops — list available crops
  app.get('/crops', async (_request, reply) => {
    return reply.send({ crops: IntelligenceService.getAllCrops() });
  });
}
