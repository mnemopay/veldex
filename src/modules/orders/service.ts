/**
 * Orders module — created when a bid is accepted.
 * Listens on the event bus; never imported by marketplace directly.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../shared/db';
import { bus } from '../../shared/events/bus';
import type { Order, OrderStatus, Currency } from '../../shared/types';

function rowToOrder(r: Record<string, unknown>): Order {
  return {
    id: r['id'] as string,
    listingId: r['listing_id'] as string,
    bidId: r['bid_id'] as string,
    buyerId: r['buyer_id'] as string,
    farmerId: r['farmer_id'] as string,
    quantityKg: r['quantity_kg'] as number,
    agreedPricePerKg: r['agreed_price_per_kg'] as number,
    currency: r['currency'] as Currency,
    totalValue: r['total_value'] as number,
    status: r['status'] as OrderStatus,
    escrowHeld: Boolean(r['escrow_held']),
    pacaFlagged: Boolean(r['paca_flagged']),
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

export const OrderService = {
  createFromBid(
    bidId: string,
    listingId: string,
    buyerId: string,
    farmerId: string,
    quantityKg: number,
    agreedPricePerKg: number,
    currency: Currency,
    pacaFlagged: boolean
  ): Order {
    const db = getDb();
    const now = new Date().toISOString();
    const totalValue = quantityKg * agreedPricePerKg;

    const order: Order = {
      id: randomUUID(),
      listingId,
      bidId,
      buyerId,
      farmerId,
      quantityKg,
      agreedPricePerKg,
      currency,
      totalValue,
      status: 'PENDING',
      escrowHeld: false,
      pacaFlagged,
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO orders
        (id, listing_id, bid_id, buyer_id, farmer_id, quantity_kg, agreed_price_per_kg,
         currency, total_value, status, escrow_held, paca_flagged, created_at, updated_at)
      VALUES
        (@id, @listingId, @bidId, @buyerId, @farmerId, @quantityKg, @agreedPricePerKg,
         @currency, @totalValue, @status, @escrowHeld, @pacaFlagged, @createdAt, @updatedAt)
    `).run({
      id: order.id,
      listingId: order.listingId,
      bidId: order.bidId,
      buyerId: order.buyerId,
      farmerId: order.farmerId,
      quantityKg: order.quantityKg,
      agreedPricePerKg: order.agreedPricePerKg,
      currency: order.currency,
      totalValue: order.totalValue,
      status: order.status,
      escrowHeld: order.escrowHeld ? 1 : 0,
      pacaFlagged: order.pacaFlagged ? 1 : 0,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });

    bus.emit('order.created', { order });
    return order;
  },

  getOrder(id: string): Order | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? rowToOrder(row) : null;
  },

  getOrdersForBuyer(buyerId: string): Order[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC')
      .all(buyerId) as Record<string, unknown>[];
    return rows.map(rowToOrder);
  },

  getOrdersForFarmer(farmerId: string): Order[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM orders WHERE farmer_id = ? ORDER BY created_at DESC')
      .all(farmerId) as Record<string, unknown>[];
    return rows.map(rowToOrder);
  },

  markEscrowHeld(orderId: string): Order {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("UPDATE orders SET escrow_held = 1, status = 'ACTIVE', updated_at = ? WHERE id = ?")
      .run(now, orderId);
    const updated = this.getOrder(orderId);
    if (!updated) throw new Error('Order not found after update');
    return updated;
  },

  confirmDelivery(orderId: string, userId: string): Order {
    const db = getDb();
    const order = this.getOrder(orderId);
    if (!order) throw new Error('Order not found');
    if (order.buyerId !== userId && order.farmerId !== userId) {
      throw new Error('Not authorized to confirm this order');
    }
    if (order.status !== 'ACTIVE') throw new Error('Order must be ACTIVE to confirm delivery');

    const now = new Date().toISOString();
    db.prepare("UPDATE orders SET status = 'DELIVERED', updated_at = ? WHERE id = ?").run(now, orderId);

    const updated = { ...order, status: 'DELIVERED' as OrderStatus, updatedAt: now };
    bus.emit('order.delivered', { order: updated });
    return updated;
  },

  cancelOrder(orderId: string, userId: string): Order {
    const db = getDb();
    const order = this.getOrder(orderId);
    if (!order) throw new Error('Order not found');
    if (order.buyerId !== userId && order.farmerId !== userId) {
      throw new Error('Not authorized to cancel this order');
    }
    if (order.status === 'DELIVERED') throw new Error('Cannot cancel a delivered order');
    if (order.status === 'CANCELLED') throw new Error('Order already cancelled');

    const now = new Date().toISOString();
    db.prepare("UPDATE orders SET status = 'CANCELLED', updated_at = ? WHERE id = ?").run(now, orderId);

    const updated = { ...order, status: 'CANCELLED' as OrderStatus, updatedAt: now };
    bus.emit('order.cancelled', { order: updated });
    return updated;
  },
};

// ── Bus subscription: create order when bid accepted ─────────────────
bus.on('bid.accepted', ({ bid, listing }) => {
  // PACA threshold: US produce transactions > $1343 total value
  const totalValue = listing.quantityKg * bid.offerPricePerKg;
  const pacaFlagged =
    listing.country === 'US' &&
    listing.currency === 'USD' &&
    totalValue > 1343;

  try {
    const order = OrderService.createFromBid(
      bid.id,
      bid.listingId,
      bid.buyerId,
      listing.farmerId,
      listing.quantityKg,
      bid.offerPricePerKg,
      listing.currency,
      pacaFlagged
    );
    console.log(`[orders] Order ${order.id} created from bid ${bid.id}${pacaFlagged ? ' — PACA flagged' : ''}`);
  } catch (err) {
    console.error('[orders] Failed to create order from bid.accepted event:', err);
  }
});
