/**
 * Marketplace module — listings and bids.
 * Emits events on bid acceptance; orders module listens on the bus.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../shared/db';
import { bus } from '../../shared/events/bus';
import type { Listing, Bid, Currency, Country, ListingStatus, BidStatus } from '../../shared/types';

// ── Helpers ───────────────────────────────────

function rowToListing(r: Record<string, unknown>): Listing {
  return {
    id: r['id'] as string,
    farmerId: r['farmer_id'] as string,
    cropType: r['crop_type'] as string,
    quantityKg: r['quantity_kg'] as number,
    pricePerKg: r['price_per_kg'] as number,
    currency: r['currency'] as Currency,
    country: r['country'] as Country,
    location: r['location'] as string,
    description: r['description'] as string,
    status: r['status'] as ListingStatus,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function rowToBid(r: Record<string, unknown>): Bid {
  return {
    id: r['id'] as string,
    listingId: r['listing_id'] as string,
    buyerId: r['buyer_id'] as string,
    offerPricePerKg: r['offer_price_per_kg'] as number,
    status: r['status'] as BidStatus,
    ficoCreditScore: r['fico_credit_score'] as number | null,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

// ── Listings ──────────────────────────────────

export interface CreateListingInput {
  farmerId: string;
  cropType: string;
  quantityKg: number;
  pricePerKg: number;
  currency: Currency;
  country: Country;
  location: string;
  description?: string;
}

export interface SearchListingsInput {
  crop?: string;
  country?: Country;
  currency?: Currency;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
}

export const MarketplaceService = {
  createListing(input: CreateListingInput): Listing {
    const db = getDb();
    const now = new Date().toISOString();
    const listing: Listing = {
      id: randomUUID(),
      farmerId: input.farmerId,
      cropType: input.cropType.toLowerCase().trim(),
      quantityKg: input.quantityKg,
      pricePerKg: input.pricePerKg,
      currency: input.currency,
      country: input.country,
      location: input.location,
      description: input.description ?? '',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO listings
        (id, farmer_id, crop_type, quantity_kg, price_per_kg, currency, country, location, description, status, created_at, updated_at)
      VALUES
        (@id, @farmerId, @cropType, @quantityKg, @pricePerKg, @currency, @country, @location, @description, @status, @createdAt, @updatedAt)
    `).run({
      id: listing.id,
      farmerId: listing.farmerId,
      cropType: listing.cropType,
      quantityKg: listing.quantityKg,
      pricePerKg: listing.pricePerKg,
      currency: listing.currency,
      country: listing.country,
      location: listing.location,
      description: listing.description,
      status: listing.status,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    });

    return listing;
  },

  searchListings(input: SearchListingsInput): Listing[] {
    const db = getDb();
    const conditions: string[] = ["status = 'ACTIVE'"];
    const params: Record<string, unknown> = {};

    if (input.crop) {
      conditions.push("crop_type LIKE @crop");
      params['crop'] = `%${input.crop.toLowerCase()}%`;
    }
    if (input.country) {
      conditions.push("country = @country");
      params['country'] = input.country;
    }
    if (input.currency) {
      conditions.push("currency = @currency");
      params['currency'] = input.currency;
    }
    if (input.minPrice !== undefined) {
      conditions.push("price_per_kg >= @minPrice");
      params['minPrice'] = input.minPrice;
    }
    if (input.maxPrice !== undefined) {
      conditions.push("price_per_kg <= @maxPrice");
      params['maxPrice'] = input.maxPrice;
    }

    const limit = Math.min(input.limit ?? 20, 100);
    const offset = input.offset ?? 0;

    const rows = db.prepare(`
      SELECT * FROM listings
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `).all(params) as Record<string, unknown>[];

    return rows.map(rowToListing);
  },

  getListing(id: string): Listing | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? rowToListing(row) : null;
  },

  expireListing(id: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("UPDATE listings SET status = 'EXPIRED', updated_at = ? WHERE id = ? AND status = 'ACTIVE'")
      .run(now, id);
    bus.emit('listing.expired', { listingId: id });
  },

  // ── Bids ────────────────────────────────────

  placeBid(listingId: string, buyerId: string, offerPricePerKg: number, ficoCreditScore?: number): Bid {
    const db = getDb();
    const listing = this.getListing(listingId);
    if (!listing) throw new Error('Listing not found');
    if (listing.status !== 'ACTIVE') throw new Error('Listing is no longer active');
    if (listing.farmerId === buyerId) throw new Error('Farmers cannot bid on their own listings');
    if (offerPricePerKg <= 0) throw new Error('Offer price must be positive');

    const now = new Date().toISOString();
    const bid: Bid = {
      id: randomUUID(),
      listingId,
      buyerId,
      offerPricePerKg,
      status: 'PENDING',
      ficoCreditScore: ficoCreditScore ?? null,
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO bids (id, listing_id, buyer_id, offer_price_per_kg, status, fico_credit_score, created_at, updated_at)
      VALUES (@id, @listingId, @buyerId, @offerPricePerKg, @status, @ficoCreditScore, @createdAt, @updatedAt)
    `).run({
      id: bid.id,
      listingId: bid.listingId,
      buyerId: bid.buyerId,
      offerPricePerKg: bid.offerPricePerKg,
      status: bid.status,
      ficoCreditScore: bid.ficoCreditScore,
      createdAt: bid.createdAt,
      updatedAt: bid.updatedAt,
    });

    return bid;
  },

  acceptBid(bidId: string, farmerId: string): Bid {
    const db = getDb();

    const bidRow = db.prepare(`
      SELECT b.*, l.farmer_id as listing_farmer_id, l.status as listing_status
      FROM bids b JOIN listings l ON b.listing_id = l.id
      WHERE b.id = ?
    `).get(bidId) as (Record<string, unknown> & { listing_farmer_id: string; listing_status: string }) | undefined;

    if (!bidRow) throw new Error('Bid not found');
    if (bidRow['listing_farmer_id'] !== farmerId) throw new Error('Only the listing owner can accept bids');
    if (bidRow['status'] !== 'PENDING') throw new Error('Bid is not pending');
    if (bidRow['listing_status'] !== 'ACTIVE') throw new Error('Listing is no longer active');

    const now = new Date().toISOString();

    // Accept this bid, reject all others on same listing
    db.prepare("UPDATE bids SET status = 'ACCEPTED', updated_at = ? WHERE id = ?").run(now, bidId);
    db.prepare(`
      UPDATE bids SET status = 'REJECTED', updated_at = ?
      WHERE listing_id = ? AND id != ? AND status = 'PENDING'
    `).run(now, bidRow['listing_id'] as string, bidId);

    // Mark listing as sold
    db.prepare("UPDATE listings SET status = 'SOLD', updated_at = ? WHERE id = ?")
      .run(now, bidRow['listing_id'] as string);

    const updatedBid = rowToBid({ ...bidRow, status: 'ACCEPTED', updated_at: now });
    const listing = this.getListing(bidRow['listing_id'] as string)!;

    bus.emit('bid.accepted', { bid: updatedBid, listing });

    return updatedBid;
  },

  rejectBid(bidId: string, farmerId: string): Bid {
    const db = getDb();
    const bidRow = db.prepare(`
      SELECT b.*, l.farmer_id as listing_farmer_id
      FROM bids b JOIN listings l ON b.listing_id = l.id
      WHERE b.id = ?
    `).get(bidId) as (Record<string, unknown> & { listing_farmer_id: string }) | undefined;

    if (!bidRow) throw new Error('Bid not found');
    if (bidRow['listing_farmer_id'] !== farmerId) throw new Error('Only the listing owner can reject bids');
    if (bidRow['status'] !== 'PENDING') throw new Error('Bid is not pending');

    const now = new Date().toISOString();
    db.prepare("UPDATE bids SET status = 'REJECTED', updated_at = ? WHERE id = ?").run(now, bidId);

    return rowToBid({ ...bidRow, status: 'REJECTED', updated_at: now });
  },

  getBidsForListing(listingId: string): Bid[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM bids WHERE listing_id = ? ORDER BY created_at DESC')
      .all(listingId) as Record<string, unknown>[];
    return rows.map(rowToBid);
  },

  getBidsForBuyer(buyerId: string): Bid[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM bids WHERE buyer_id = ? ORDER BY created_at DESC')
      .all(buyerId) as Record<string, unknown>[];
    return rows.map(rowToBid);
  },
};
