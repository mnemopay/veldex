/**
 * Veldex internal event bus.
 * Modules communicate ONLY through this bus — never via direct imports.
 * Typed event map enforced at compile time.
 */

import { EventEmitter } from 'events';
import type { Order, Bid, Listing } from '../types';

// ── Typed event map ───────────────────────────
export interface VeldexEvents {
  'bid.accepted': { bid: Bid; listing: Listing };
  'order.created': { order: Order };
  'order.delivered': { order: Order };
  'order.cancelled': { order: Order };
  'payment.captured': { orderId: string; amount: number; currency: string };
  'payment.released': { orderId: string };
  'listing.expired': { listingId: string };
}

class TypedEventBus extends EventEmitter {
  emit<K extends keyof VeldexEvents>(event: K, payload: VeldexEvents[K]): boolean {
    return super.emit(event as string, payload);
  }

  on<K extends keyof VeldexEvents>(
    event: K,
    listener: (payload: VeldexEvents[K]) => void
  ): this {
    return super.on(event as string, listener);
  }

  once<K extends keyof VeldexEvents>(
    event: K,
    listener: (payload: VeldexEvents[K]) => void
  ): this {
    return super.once(event as string, listener);
  }
}

// Singleton bus — import this in any module
export const bus = new TypedEventBus();
bus.setMaxListeners(50);
