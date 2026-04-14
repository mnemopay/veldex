/**
 * Payments module — orchestrates Stripe (USD) and Paystack (NGN).
 * Both providers are STUBBED: no real API calls in MVP.
 * Listens on order events to initiate and release escrow.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../shared/db';
import { bus } from '../../shared/events/bus';
import type { Payment, PaymentProvider, PaymentStatus, Currency, Country } from '../../shared/types';

function rowToPayment(r: Record<string, unknown>): Payment {
  return {
    id: r['id'] as string,
    orderId: r['order_id'] as string,
    provider: r['provider'] as PaymentProvider,
    externalRef: r['external_ref'] as string,
    amount: r['amount'] as number,
    currency: r['currency'] as Currency,
    status: r['status'] as PaymentStatus,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

// ── Provider detection ────────────────────────
function detectProvider(country: Country, currency: Currency): PaymentProvider {
  if (country === 'NG' || currency === 'NGN') return 'PAYSTACK';
  return 'STRIPE';
}

// ── Stub implementations ──────────────────────

function stripeInitiateEscrow(amount: number, currency: string, metadata: Record<string, string>): string {
  // In production: create a PaymentIntent with capture_method: 'manual'
  console.log(`[stripe stub] Initiate escrow — ${amount} ${currency}`, metadata);
  return `pi_stub_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function stripeCapture(paymentIntentId: string): void {
  // In production: stripe.paymentIntents.capture(paymentIntentId)
  console.log(`[stripe stub] Capture — ${paymentIntentId}`);
}

function stripeRelease(paymentIntentId: string): void {
  // In production: stripe.paymentIntents.cancel(paymentIntentId) or transfer to farmer
  console.log(`[stripe stub] Release — ${paymentIntentId}`);
}

function paystackInitiate(amount: number, currency: string, metadata: Record<string, string>): string {
  // In production: paystack.transaction.initialize({ amount: amount * 100, currency, ... })
  console.log(`[paystack stub] Initiate — ${amount} ${currency}`, metadata);
  return `ps_stub_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function paystackRelease(reference: string): void {
  // In production: initiate a transfer to farmer's Paystack recipient
  console.log(`[paystack stub] Release — ${reference}`);
}

// ── Service ───────────────────────────────────

export const PaymentService = {
  initiateEscrow(
    orderId: string,
    amount: number,
    currency: Currency,
    country: Country,
    buyerId: string,
    farmerId: string
  ): Payment {
    const db = getDb();
    const provider = detectProvider(country, currency);
    const now = new Date().toISOString();

    let externalRef: string;
    if (provider === 'STRIPE') {
      externalRef = stripeInitiateEscrow(amount, currency, { orderId, buyerId, farmerId });
    } else {
      externalRef = paystackInitiate(amount, currency, { orderId, buyerId, farmerId });
    }

    const payment: Payment = {
      id: randomUUID(),
      orderId,
      provider,
      externalRef,
      amount,
      currency,
      status: 'INITIATED',
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO payments (id, order_id, provider, external_ref, amount, currency, status, created_at, updated_at)
      VALUES (@id, @orderId, @provider, @externalRef, @amount, @currency, @status, @createdAt, @updatedAt)
    `).run({
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      externalRef: payment.externalRef,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    });

    // Capture immediately in stub (production would wait for buyer confirmation)
    if (provider === 'STRIPE') stripeCapture(externalRef);

    const updatedNow = new Date().toISOString();
    db.prepare("UPDATE payments SET status = 'CAPTURED', updated_at = ? WHERE id = ?")
      .run(updatedNow, payment.id);

    bus.emit('payment.captured', { orderId, amount, currency });
    return { ...payment, status: 'CAPTURED', updatedAt: updatedNow };
  },

  releaseEscrow(orderId: string): Payment {
    const db = getDb();
    const row = db.prepare("SELECT * FROM payments WHERE order_id = ? AND status = 'CAPTURED'")
      .get(orderId) as Record<string, unknown> | undefined;
    if (!row) throw new Error('No captured payment found for this order');

    const payment = rowToPayment(row);

    if (payment.provider === 'STRIPE') {
      stripeRelease(payment.externalRef);
    } else {
      paystackRelease(payment.externalRef);
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE payments SET status = 'RELEASED', updated_at = ? WHERE id = ?")
      .run(now, payment.id);

    bus.emit('payment.released', { orderId });
    return { ...payment, status: 'RELEASED', updatedAt: now };
  },

  getPaymentsForOrder(orderId: string): Payment[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM payments WHERE order_id = ?')
      .all(orderId) as Record<string, unknown>[];
    return rows.map(rowToPayment);
  },
};

// ── Bus subscriptions ─────────────────────────

// When escrow funds captured, mark order as ACTIVE
bus.on('payment.captured', ({ orderId }) => {
  try {
    const { OrderService } = require('../orders/service');
    OrderService.markEscrowHeld(orderId);
    console.log(`[payments] Escrow held for order ${orderId}`);
  } catch (err) {
    console.error('[payments] Failed to mark escrow:', err);
  }
});

// When order delivered, release escrow
bus.on('order.delivered', ({ order }) => {
  try {
    PaymentService.releaseEscrow(order.id);
    console.log(`[payments] Escrow released for order ${order.id}`);
  } catch (err) {
    console.error('[payments] Failed to release escrow:', err);
  }
});

// When order created, initiate escrow automatically
bus.on('order.created', ({ order }) => {
  try {
    PaymentService.initiateEscrow(
      order.id,
      order.totalValue,
      order.currency,
      order.currency === 'NGN' ? 'NG' : 'US',
      order.buyerId,
      order.farmerId
    );
  } catch (err) {
    console.error('[payments] Failed to initiate escrow for new order:', err);
  }
});
