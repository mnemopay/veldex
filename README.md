# Veldex

Dual US + Nigeria agricultural marketplace. US-first launch. Nigeria as second vertical. The cross-border Nigeria→US export corridor is the long-term moat.

## Architecture

Modular monolith — single Node.js/TypeScript/Fastify server with strict module boundaries. Modules communicate only through a typed internal event bus; no module imports from another module directly.

```
src/
  modules/
    auth/          JWT register, login, role-based (FARMER | BUYER | ADMIN)
    marketplace/   Listings, search, bids (place / accept / reject)
    orders/        Order lifecycle — PENDING → ACTIVE → DELIVERED | CANCELLED
    payments/      Stripe (USD) + Paystack (NGN) orchestration, escrow-style
    compliance/    PACA trust tracking for US produce transactions
    intelligence/  Price feed — USDA AMS (US) + NAERLS (NG), cross-border arbitrage
  shared/
    events/        Typed EventEmitter bus (internal only)
    db/            SQLite (dev) / Postgres (prod) + schema migrations
    auth/          JWT middleware helpers
    types/         Shared TypeScript interfaces
  api/             Fastify route registration (thin, delegates to modules)
  index.ts         Server entry point
```

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev
```

Server starts on `http://localhost:3000`.

## Key Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register (FARMER or BUYER) |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | JWT | Current user |
| GET | `/api/marketplace/listings` | — | Search listings (`?crop=maize&country=NG`) |
| POST | `/api/marketplace/listings` | FARMER | Create listing |
| POST | `/api/marketplace/listings/:id/bids` | BUYER | Place bid |
| PATCH | `/api/marketplace/bids/:bidId/accept` | FARMER | Accept bid → triggers order + escrow |
| PATCH | `/api/marketplace/bids/:bidId/reject` | FARMER | Reject bid |
| GET | `/api/orders` | JWT | My orders |
| POST | `/api/orders/:id/deliver` | JWT | Confirm delivery → releases escrow |
| POST | `/api/orders/:id/cancel` | JWT | Cancel order |
| GET | `/api/payments/orders/:orderId` | JWT | Payment records for an order |
| GET | `/api/compliance/paca/pending` | ADMIN | Pending PACA trust notices |
| GET | `/api/intelligence/prices?crop=maize&country=NG` | — | Price feed |
| GET | `/api/intelligence/crops` | — | Available crop list |
| GET | `/health` | — | Health check |

## Domain Rules

- **Listings**: `cropType`, `quantityKg`, `pricePerKg`, `currency` (USD|NGN), `country` (US|NG), status (ACTIVE|SOLD|EXPIRED)
- **Bids**: Buyer places offer; farmer accepts or rejects. Accepting auto-creates an order and rejects all other pending bids.
- **Orders**: Escrow-style — funds held on `ACTIVE`, released on `DELIVERED`.
- **PACA**: US produce transactions >$1,343 total value auto-flagged for PACA trust notice.
- **Payments**: Region detected from user country/currency → routed to Stripe (USD) or Paystack (NGN). Both stubbed in MVP.
- **MnemoPay Agent FICO**: Buyer creditworthiness scored and recalled via `@mnemopay/sdk` before large bids are approved.

## Environment Variables

```env
DATABASE_URL=./veldex.db          # path for SQLite (dev), postgres:// for prod
JWT_SECRET=...                     # min 32 chars, use openssl rand -base64 64
STRIPE_SECRET_KEY=sk_test_...
PAYSTACK_SECRET_KEY=sk_test_...
PORT=3000
NODE_ENV=development
```

## Scripts

```bash
npm run dev      # ts-node-dev with hot reload
npm run build    # compile to dist/
npm start        # run compiled dist/index.js
npm run migrate  # run schema migrations standalone
```

## License

Apache 2.0 — see LICENSE.
