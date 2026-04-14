/**
 * Compliance module — PACA trust tracking for US produce transactions.
 *
 * PACA (Perishable Agricultural Commodities Act) requires buyers who owe
 * money to sellers for US produce to maintain a trust. Transactions > $1343
 * in total value trigger a PACA trust notice requirement.
 *
 * This module listens for order.created events and handles flagged records.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../shared/db';
import { bus } from '../../shared/events/bus';
import type { PacaRecord, Currency } from '../../shared/types';

function rowToRecord(r: Record<string, unknown>): PacaRecord {
  return {
    id: r['id'] as string,
    orderId: r['order_id'] as string,
    buyerId: r['buyer_id'] as string,
    farmerId: r['farmer_id'] as string,
    totalValue: r['total_value'] as number,
    currency: r['currency'] as Currency,
    noticeRequired: Boolean(r['notice_required']),
    noticeIssuedAt: r['notice_issued_at'] as string | null,
    createdAt: r['created_at'] as string,
  };
}

export const ComplianceService = {
  createPacaRecord(orderId: string, buyerId: string, farmerId: string, totalValue: number, currency: Currency): PacaRecord {
    const db = getDb();
    const noticeRequired = currency === 'USD' && totalValue > 1343;
    const now = new Date().toISOString();

    const record: PacaRecord = {
      id: randomUUID(),
      orderId,
      buyerId,
      farmerId,
      totalValue,
      currency,
      noticeRequired,
      noticeIssuedAt: null,
      createdAt: now,
    };

    db.prepare(`
      INSERT INTO paca_records
        (id, order_id, buyer_id, farmer_id, total_value, currency, notice_required, notice_issued_at, created_at)
      VALUES
        (@id, @orderId, @buyerId, @farmerId, @totalValue, @currency, @noticeRequired, @noticeIssuedAt, @createdAt)
    `).run({
      id: record.id,
      orderId: record.orderId,
      buyerId: record.buyerId,
      farmerId: record.farmerId,
      totalValue: record.totalValue,
      currency: record.currency,
      noticeRequired: record.noticeRequired ? 1 : 0,
      noticeIssuedAt: record.noticeIssuedAt,
      createdAt: record.createdAt,
    });

    if (noticeRequired) {
      console.log(
        `[compliance] PACA trust notice required — Order ${orderId}, ` +
        `Value: $${totalValue.toFixed(2)} USD (threshold: $1,343.00)`
      );
    }

    return record;
  },

  issueNotice(orderId: string): PacaRecord {
    const db = getDb();
    const row = db.prepare('SELECT * FROM paca_records WHERE order_id = ?')
      .get(orderId) as Record<string, unknown> | undefined;
    if (!row) throw new Error('No PACA record for this order');

    const now = new Date().toISOString();
    db.prepare('UPDATE paca_records SET notice_issued_at = ? WHERE order_id = ?').run(now, orderId);
    console.log(`[compliance] PACA trust notice issued for order ${orderId} at ${now}`);
    return rowToRecord({ ...row, notice_issued_at: now });
  },

  getRecord(orderId: string): PacaRecord | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM paca_records WHERE order_id = ?')
      .get(orderId) as Record<string, unknown> | undefined;
    return row ? rowToRecord(row) : null;
  },

  getPendingNotices(): PacaRecord[] {
    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM paca_records WHERE notice_required = 1 AND notice_issued_at IS NULL ORDER BY created_at ASC"
    ).all() as Record<string, unknown>[];
    return rows.map(rowToRecord);
  },
};

// ── Bus subscription ──────────────────────────
bus.on('order.created', ({ order }) => {
  // Only track US produce (USD currency) — PACA applies to US perishables
  if (order.currency !== 'USD') return;

  try {
    ComplianceService.createPacaRecord(
      order.id,
      order.buyerId,
      order.farmerId,
      order.totalValue,
      order.currency as Currency
    );
  } catch (err) {
    console.error('[compliance] Failed to create PACA record:', err);
  }
});
