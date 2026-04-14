// ─────────────────────────────────────────────
// Shared domain types — consumed by all modules
// No module may import from another module directly;
// cross-module communication goes through the event bus.
// ─────────────────────────────────────────────

export type UserRole = 'FARMER' | 'BUYER' | 'ADMIN';
export type Country = 'US' | 'NG';
export type Currency = 'USD' | 'NGN';

// ── Users ────────────────────────────────────
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  country: Country;
  name: string;
  createdAt: string;
}

export interface UserPublic {
  id: string;
  email: string;
  role: UserRole;
  country: Country;
  name: string;
  createdAt: string;
}

// ── Listings ─────────────────────────────────
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'EXPIRED';

export interface Listing {
  id: string;
  farmerId: string;
  cropType: string;
  quantityKg: number;
  pricePerKg: number;
  currency: Currency;
  country: Country;
  location: string;
  description: string;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
}

// ── Bids ─────────────────────────────────────
export type BidStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface Bid {
  id: string;
  listingId: string;
  buyerId: string;
  offerPricePerKg: number;
  status: BidStatus;
  ficoCreditScore: number | null;
  createdAt: string;
  updatedAt: string;
}

// ── Orders ────────────────────────────────────
export type OrderStatus = 'PENDING' | 'ACTIVE' | 'DELIVERED' | 'CANCELLED';

export interface Order {
  id: string;
  listingId: string;
  bidId: string;
  buyerId: string;
  farmerId: string;
  quantityKg: number;
  agreedPricePerKg: number;
  currency: Currency;
  totalValue: number;
  status: OrderStatus;
  escrowHeld: boolean;
  pacaFlagged: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Payments ──────────────────────────────────
export type PaymentProvider = 'STRIPE' | 'PAYSTACK';
export type PaymentStatus = 'INITIATED' | 'CAPTURED' | 'RELEASED' | 'REFUNDED' | 'FAILED';

export interface Payment {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  externalRef: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

// ── PACA Compliance ───────────────────────────
export interface PacaRecord {
  id: string;
  orderId: string;
  buyerId: string;
  farmerId: string;
  totalValue: number;
  currency: Currency;
  noticeRequired: boolean;
  noticeIssuedAt: string | null;
  createdAt: string;
}

// ── Intelligence / Price Feed ─────────────────
export interface PriceFeedEntry {
  crop: string;
  country: Country;
  currency: Currency;
  avgPricePerKg: number;
  minPricePerKg: number;
  maxPricePerKg: number;
  dataSource: string;
  asOf: string;
}

// ── JWT payload ───────────────────────────────
export interface JwtPayload {
  sub: string;       // userId
  email: string;
  role: UserRole;
  country: Country;
  iat?: number;
  exp?: number;
}
