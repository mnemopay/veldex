/**
 * Schema migration — run once on startup (or via `npm run migrate`).
 * All tables are created with IF NOT EXISTS so this is safe to re-run.
 */

import { getDb } from './index';

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    -- ── Users ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role         TEXT NOT NULL CHECK(role IN ('FARMER','BUYER','ADMIN')),
      country      TEXT NOT NULL CHECK(country IN ('US','NG')),
      name         TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Listings ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS listings (
      id           TEXT PRIMARY KEY,
      farmer_id    TEXT NOT NULL REFERENCES users(id),
      crop_type    TEXT NOT NULL,
      quantity_kg  REAL NOT NULL,
      price_per_kg REAL NOT NULL,
      currency     TEXT NOT NULL CHECK(currency IN ('USD','NGN')),
      country      TEXT NOT NULL CHECK(country IN ('US','NG')),
      location     TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL CHECK(status IN ('ACTIVE','SOLD','EXPIRED'))
                   DEFAULT 'ACTIVE',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_listings_crop    ON listings(crop_type);
    CREATE INDEX IF NOT EXISTS idx_listings_country ON listings(country);
    CREATE INDEX IF NOT EXISTS idx_listings_status  ON listings(status);

    -- ── Bids ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS bids (
      id                 TEXT PRIMARY KEY,
      listing_id         TEXT NOT NULL REFERENCES listings(id),
      buyer_id           TEXT NOT NULL REFERENCES users(id),
      offer_price_per_kg REAL NOT NULL,
      status             TEXT NOT NULL CHECK(status IN ('PENDING','ACCEPTED','REJECTED'))
                         DEFAULT 'PENDING',
      fico_credit_score  INTEGER,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Orders ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS orders (
      id                   TEXT PRIMARY KEY,
      listing_id           TEXT NOT NULL REFERENCES listings(id),
      bid_id               TEXT NOT NULL UNIQUE REFERENCES bids(id),
      buyer_id             TEXT NOT NULL REFERENCES users(id),
      farmer_id            TEXT NOT NULL REFERENCES users(id),
      quantity_kg          REAL NOT NULL,
      agreed_price_per_kg  REAL NOT NULL,
      currency             TEXT NOT NULL CHECK(currency IN ('USD','NGN')),
      total_value          REAL NOT NULL,
      status               TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE','DELIVERED','CANCELLED'))
                           DEFAULT 'PENDING',
      escrow_held          INTEGER NOT NULL DEFAULT 0,
      paca_flagged         INTEGER NOT NULL DEFAULT 0,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Payments ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS payments (
      id           TEXT PRIMARY KEY,
      order_id     TEXT NOT NULL REFERENCES orders(id),
      provider     TEXT NOT NULL CHECK(provider IN ('STRIPE','PAYSTACK')),
      external_ref TEXT NOT NULL,
      amount       REAL NOT NULL,
      currency     TEXT NOT NULL CHECK(currency IN ('USD','NGN')),
      status       TEXT NOT NULL CHECK(status IN ('INITIATED','CAPTURED','RELEASED','REFUNDED','FAILED'))
                   DEFAULT 'INITIATED',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── PACA Compliance ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS paca_records (
      id               TEXT PRIMARY KEY,
      order_id         TEXT NOT NULL REFERENCES orders(id),
      buyer_id         TEXT NOT NULL REFERENCES users(id),
      farmer_id        TEXT NOT NULL REFERENCES users(id),
      total_value      REAL NOT NULL,
      currency         TEXT NOT NULL,
      notice_required  INTEGER NOT NULL DEFAULT 0,
      notice_issued_at TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  console.log('[migrate] Schema up to date');
}

// Allow running directly: ts-node src/shared/db/migrate.ts
if (require.main === module) {
  runMigrations();
  process.exit(0);
}
