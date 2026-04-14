/**
 * Marketplace routes — listings and bids.
 */

import type { FastifyInstance } from 'fastify';
import { MarketplaceService } from './service';
import { requireAuth, requireRole } from '../../shared/auth/middleware';
import { MnemoPay } from '@mnemopay/sdk';

export async function marketplaceRoutes(app: FastifyInstance): Promise<void> {
  // ── Listings ────────────────────────────────

  // GET /api/marketplace/listings?crop=maize&country=NG&limit=20&offset=0
  app.get('/listings', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const listings = MarketplaceService.searchListings({
      crop: q['crop'],
      country: q['country'] as any,
      currency: q['currency'] as any,
      minPrice: q['minPrice'] ? Number(q['minPrice']) : undefined,
      maxPrice: q['maxPrice'] ? Number(q['maxPrice']) : undefined,
      limit: q['limit'] ? Number(q['limit']) : 20,
      offset: q['offset'] ? Number(q['offset']) : 0,
    });
    return reply.send({ listings, count: listings.length });
  });

  // GET /api/marketplace/listings/:id
  app.get('/listings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const listing = MarketplaceService.getListing(id);
    if (!listing) return reply.code(404).send({ error: 'Listing not found' });
    return reply.send({ listing });
  });

  // POST /api/marketplace/listings — FARMER only
  app.post('/listings', { preHandler: requireRole('FARMER') }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const { cropType, quantityKg, pricePerKg, currency, location, description } = body;

    if (!cropType || !quantityKg || !pricePerKg || !currency || !location) {
      return reply.code(400).send({ error: 'Missing required fields: cropType, quantityKg, pricePerKg, currency, location' });
    }

    const listing = MarketplaceService.createListing({
      farmerId: request.user!.sub,
      cropType: cropType as string,
      quantityKg: Number(quantityKg),
      pricePerKg: Number(pricePerKg),
      currency: currency as any,
      country: request.user!.country,
      location: location as string,
      description: description as string | undefined,
    });

    return reply.code(201).send({ listing });
  });

  // ── Bids ────────────────────────────────────

  // POST /api/marketplace/listings/:id/bids — BUYER only
  app.post('/listings/:id/bids', { preHandler: requireRole('BUYER') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { offerPricePerKg } = request.body as { offerPricePerKg: number };
    const buyerId = request.user!.sub;

    if (!offerPricePerKg || Number(offerPricePerKg) <= 0) {
      return reply.code(400).send({ error: 'offerPricePerKg must be a positive number' });
    }

    // Recall buyer's MnemoPay FICO score before approving bid
    let ficoScore: number | undefined;
    try {
      const agentMemory = MnemoPay.quick(buyerId, { recall: 'hybrid' });
      const listing = MarketplaceService.getListing(id);
      const totalEstimate = listing
        ? Number(offerPricePerKg) * listing.quantityKg
        : Number(offerPricePerKg);

      // For large bids (>$500 equivalent), recall history first
      if (totalEstimate > 500) {
        const history = await agentMemory.recall(`buyer bid history creditworthiness`);
        console.log(`[marketplace] MnemoPay recall for buyer ${buyerId}:`, history ? 'found' : 'no history');
      }

      // Store this bid attempt in agent memory
      await agentMemory.remember(
        `Buyer ${buyerId} placed bid of ${offerPricePerKg}/kg on listing ${id} — PENDING`
      );
    } catch (err) {
      // MnemoPay is advisory — don't block the bid if it's unavailable
      console.warn('[marketplace] MnemoPay unavailable, proceeding without FICO:', (err as Error).message);
    }

    try {
      const bid = MarketplaceService.placeBid(id, buyerId, Number(offerPricePerKg), ficoScore);
      return reply.code(201).send({ bid });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // GET /api/marketplace/listings/:id/bids
  app.get('/listings/:id/bids', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const bids = MarketplaceService.getBidsForListing(id);
    return reply.send({ bids });
  });

  // GET /api/marketplace/my-bids — BUYER: see own bids
  app.get('/my-bids', { preHandler: requireRole('BUYER') }, async (request, reply) => {
    const bids = MarketplaceService.getBidsForBuyer(request.user!.sub);
    return reply.send({ bids });
  });

  // PATCH /api/marketplace/bids/:bidId/accept — FARMER accepts
  app.patch('/bids/:bidId/accept', { preHandler: requireRole('FARMER') }, async (request, reply) => {
    const { bidId } = request.params as { bidId: string };
    try {
      const bid = MarketplaceService.acceptBid(bidId, request.user!.sub);
      return reply.send({ bid, message: 'Bid accepted. Order will be created.' });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // PATCH /api/marketplace/bids/:bidId/reject — FARMER rejects
  app.patch('/bids/:bidId/reject', { preHandler: requireRole('FARMER') }, async (request, reply) => {
    const { bidId } = request.params as { bidId: string };
    try {
      const bid = MarketplaceService.rejectBid(bidId, request.user!.sub);
      return reply.send({ bid });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
