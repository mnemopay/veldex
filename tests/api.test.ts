/**
 * Veldex API integration tests.
 * Uses Fastify's .inject() — no HTTP server needed.
 */
import { buildApp } from '../src/index';
import { closeDb, getDb } from '../src/shared/db';
import { clearRefreshTokens } from '../src/modules/auth/routes';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.DATABASE_URL = ':memory:';
  process.env.NODE_ENV = 'test';
  // Disable rate limiting for tests
  process.env.RATE_LIMIT_DISABLED = '1';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDb();
});

afterEach(() => {
  clearRefreshTokens();
});

// ── Helpers ─────────────────────────────────────

async function registerUser(overrides: Record<string, unknown> = {}) {
  const body = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPass123!',
    name: 'Test User',
    role: 'FARMER',
    country: 'US',
    ...overrides,
  };
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: body,
  });
  return { res, body };
}

async function loginUser(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
}

// ── Health ──────────────────────────────────────

describe('Health', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.status).toBe('ok');
    expect(json.service).toBe('veldex');
  });
});

// ── Auth ────────────────────────────────────────

describe('Auth', () => {
  it('POST /api/auth/register creates user and returns JWT + refreshToken', async () => {
    const { res } = await registerUser();
    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.token).toBeDefined();
    expect(json.refreshToken).toBeDefined();
    expect(json.user.email).toBeDefined();
    expect(json.user.role).toBe('FARMER');
  });

  it('POST /api/auth/register rejects duplicate email', async () => {
    const email = `dup-${Date.now()}@example.com`;
    await registerUser({ email });
    const { res } = await registerUser({ email });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/auth/register rejects invalid email', async () => {
    const { res } = await registerUser({ email: 'not-an-email' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/auth/register rejects short password', async () => {
    const { res } = await registerUser({ password: 'short' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/auth/login returns JWT for valid credentials', async () => {
    const email = `login-${Date.now()}@example.com`;
    await registerUser({ email });
    const res = await loginUser(email, 'TestPass123!');
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.token).toBeDefined();
    expect(json.refreshToken).toBeDefined();
  });

  it('POST /api/auth/login rejects wrong password', async () => {
    const email = `wrongpw-${Date.now()}@example.com`;
    await registerUser({ email });
    const res = await loginUser(email, 'WrongPassword');
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/auth/refresh rotates tokens', async () => {
    const email = `refresh-${Date.now()}@example.com`;
    const { res: regRes } = await registerUser({ email });
    const { refreshToken } = regRes.json();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.token).toBeDefined();
    expect(json.refreshToken).toBeDefined();
    expect(json.refreshToken).not.toBe(refreshToken); // rotated
  });

  it('POST /api/auth/refresh rejects used token (rotation)', async () => {
    const email = `rot-${Date.now()}@example.com`;
    const { res: regRes } = await registerUser({ email });
    const { refreshToken } = regRes.json();

    // Use it once
    await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken },
    });

    // Try to reuse — should fail
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Marketplace ─────────────────────────────────

describe('Marketplace', () => {
  let farmerToken: string;
  let buyerToken: string;

  beforeAll(async () => {
    // Register a farmer
    const { res: fRes } = await registerUser({
      email: `farmer-${Date.now()}@example.com`,
      role: 'FARMER',
    });
    farmerToken = fRes.json().token;

    // Register a buyer
    const { res: bRes } = await registerUser({
      email: `buyer-${Date.now()}@example.com`,
      role: 'BUYER',
    });
    buyerToken = bRes.json().token;
  });

  it('POST /api/marketplace/listings creates a listing (FARMER)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/marketplace/listings',
      headers: { authorization: `Bearer ${farmerToken}` },
      payload: {
        cropType: 'maize',
        quantityKg: 5000,
        pricePerKg: 0.50,
        currency: 'USD',
        location: 'Dallas, TX',
      },
    });
    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.listing.cropType).toBe('maize');
    expect(json.listing.quantityKg).toBe(5000);
  });

  it('POST /api/marketplace/listings rejects BUYER', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/marketplace/listings',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        cropType: 'rice',
        quantityKg: 1000,
        pricePerKg: 1.0,
        currency: 'USD',
        location: 'Lagos',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/marketplace/listings rejects invalid data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/marketplace/listings',
      headers: { authorization: `Bearer ${farmerToken}` },
      payload: {
        cropType: '',
        quantityKg: -100,
        pricePerKg: 0,
        currency: 'EUR',
        location: '',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/marketplace/listings returns listings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/marketplace/listings',
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().listings)).toBe(true);
  });

  it('POST /api/marketplace/listings/:id/bids places a bid (BUYER)', async () => {
    // Create listing first
    const listRes = await app.inject({
      method: 'POST',
      url: '/api/marketplace/listings',
      headers: { authorization: `Bearer ${farmerToken}` },
      payload: {
        cropType: 'cassava',
        quantityKg: 2000,
        pricePerKg: 0.30,
        currency: 'NGN',
        location: 'Ibadan',
      },
    });
    const listingId = listRes.json().listing.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/marketplace/listings/${listingId}/bids`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { offerPricePerKg: 0.28 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().bid.offerPricePerKg).toBe(0.28);
  });

  it('Accept bid creates order via event bus', async () => {
    // Create listing
    const listRes = await app.inject({
      method: 'POST',
      url: '/api/marketplace/listings',
      headers: { authorization: `Bearer ${farmerToken}` },
      payload: {
        cropType: 'yam',
        quantityKg: 1000,
        pricePerKg: 1.50,
        currency: 'USD',
        location: 'Abuja',
      },
    });
    const listingId = listRes.json().listing.id;

    // Place bid
    const bidRes = await app.inject({
      method: 'POST',
      url: `/api/marketplace/listings/${listingId}/bids`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { offerPricePerKg: 1.40 },
    });
    const bidId = bidRes.json().bid.id;

    // Accept bid
    const acceptRes = await app.inject({
      method: 'PATCH',
      url: `/api/marketplace/bids/${bidId}/accept`,
      headers: { authorization: `Bearer ${farmerToken}` },
    });
    expect(acceptRes.statusCode).toBe(200);
    expect(acceptRes.json().message).toContain('accepted');

    // Check that order was created
    const ordersRes = await app.inject({
      method: 'GET',
      url: '/api/orders',
      headers: { authorization: `Bearer ${buyerToken}` },
    });
    expect(ordersRes.statusCode).toBe(200);
    const orders = ordersRes.json().orders;
    expect(orders.length).toBeGreaterThan(0);
  });
});
