/**
 * Intelligence module — price feed and market data.
 *
 * MVP: returns mock/static price data.
 * Production path: integrate USDA AMS (US) and NAERLS (Nigeria) APIs.
 *
 * USDA AMS endpoint: https://marsapi.ams.usda.gov/services/v1.2/reports
 * NAERLS: National Agricultural Extension and Research Liaison Services, Nigeria
 */

import type { PriceFeedEntry, Country } from '../../shared/types';

// ── Static mock price table (USD/kg and NGN/kg) ───────────────────────
// Sources: USDA AMS weekly terminal market reports + NAERLS quarterly estimates
const MOCK_PRICES: PriceFeedEntry[] = [
  // US crops
  { crop: 'corn', country: 'US', currency: 'USD', avgPricePerKg: 0.22, minPricePerKg: 0.18, maxPricePerKg: 0.27, dataSource: 'USDA AMS (stub)', asOf: '2026-04-01' },
  { crop: 'soybeans', country: 'US', currency: 'USD', avgPricePerKg: 0.45, minPricePerKg: 0.40, maxPricePerKg: 0.52, dataSource: 'USDA AMS (stub)', asOf: '2026-04-01' },
  { crop: 'wheat', country: 'US', currency: 'USD', avgPricePerKg: 0.28, minPricePerKg: 0.23, maxPricePerKg: 0.33, dataSource: 'USDA AMS (stub)', asOf: '2026-04-01' },
  { crop: 'tomatoes', country: 'US', currency: 'USD', avgPricePerKg: 1.45, minPricePerKg: 1.10, maxPricePerKg: 1.90, dataSource: 'USDA AMS (stub)', asOf: '2026-04-01' },
  { crop: 'cassava', country: 'US', currency: 'USD', avgPricePerKg: 0.90, minPricePerKg: 0.75, maxPricePerKg: 1.10, dataSource: 'USDA AMS (stub)', asOf: '2026-04-01' },
  { crop: 'yam', country: 'US', currency: 'USD', avgPricePerKg: 2.20, minPricePerKg: 1.80, maxPricePerKg: 2.75, dataSource: 'USDA AMS (stub)', asOf: '2026-04-01' },
  // Nigeria crops
  { crop: 'maize', country: 'NG', currency: 'NGN', avgPricePerKg: 420, minPricePerKg: 350, maxPricePerKg: 510, dataSource: 'NAERLS (stub)', asOf: '2026-04-01' },
  { crop: 'cassava', country: 'NG', currency: 'NGN', avgPricePerKg: 180, minPricePerKg: 140, maxPricePerKg: 230, dataSource: 'NAERLS (stub)', asOf: '2026-04-01' },
  { crop: 'yam', country: 'NG', currency: 'NGN', avgPricePerKg: 950, minPricePerKg: 750, maxPricePerKg: 1200, dataSource: 'NAERLS (stub)', asOf: '2026-04-01' },
  { crop: 'tomatoes', country: 'NG', currency: 'NGN', avgPricePerKg: 680, minPricePerKg: 500, maxPricePerKg: 900, dataSource: 'NAERLS (stub)', asOf: '2026-04-01' },
  { crop: 'sorghum', country: 'NG', currency: 'NGN', avgPricePerKg: 390, minPricePerKg: 320, maxPricePerKg: 470, dataSource: 'NAERLS (stub)', asOf: '2026-04-01' },
  { crop: 'rice', country: 'NG', currency: 'NGN', avgPricePerKg: 780, minPricePerKg: 650, maxPricePerKg: 950, dataSource: 'NAERLS (stub)', asOf: '2026-04-01' },
  { crop: 'groundnuts', country: 'NG', currency: 'NGN', avgPricePerKg: 1100, minPricePerKg: 900, maxPricePerKg: 1350, dataSource: 'NAERLS (stub)', asOf: '2026-04-01' },
  { crop: 'soybeans', country: 'NG', currency: 'NGN', avgPricePerKg: 620, minPricePerKg: 520, maxPricePerKg: 760, dataSource: 'NAERLS (stub)', asOf: '2026-04-01' },
];

// Exchange rate stub: 1 USD ≈ 1560 NGN (April 2026 estimate)
const USD_TO_NGN = 1560;

export interface PriceQuery {
  crop: string;
  country?: Country;
}

export interface PriceResponse {
  crop: string;
  results: PriceFeedEntry[];
  crossBorderArbitrage?: {
    usdPerKg: number;
    ngnPerKg: number;
    impliedExchangeRate: number;
    note: string;
  };
}

export const IntelligenceService = {
  getPrices(query: PriceQuery): PriceResponse {
    const cropNorm = query.crop.toLowerCase().trim();

    let results = MOCK_PRICES.filter(p => p.crop === cropNorm);

    if (query.country) {
      results = results.filter(p => p.country === query.country);
    }

    if (results.length === 0) {
      // Fuzzy fallback: partial match
      results = MOCK_PRICES.filter(p => p.crop.includes(cropNorm) || cropNorm.includes(p.crop));
      if (query.country) results = results.filter(p => p.country === query.country);
    }

    // Compute cross-border arbitrage if both markets exist
    const usEntry = MOCK_PRICES.find(p => p.crop === cropNorm && p.country === 'US');
    const ngEntry = MOCK_PRICES.find(p => p.crop === cropNorm && p.country === 'NG');

    let crossBorderArbitrage: PriceResponse['crossBorderArbitrage'];
    if (usEntry && ngEntry) {
      const impliedRate = ngEntry.avgPricePerKg / usEntry.avgPricePerKg;
      crossBorderArbitrage = {
        usdPerKg: usEntry.avgPricePerKg,
        ngnPerKg: ngEntry.avgPricePerKg,
        impliedExchangeRate: parseFloat(impliedRate.toFixed(2)),
        note: `Implied rate: 1 USD = ${impliedRate.toFixed(0)} NGN. Spot: ~${USD_TO_NGN} NGN/USD. ` +
          (impliedRate > USD_TO_NGN
            ? 'Nigeria price premium vs FX — export opportunity.'
            : 'US price premium — import opportunity.'),
      };
    }

    return { crop: cropNorm, results, crossBorderArbitrage };
  },

  getAllCrops(): string[] {
    return [...new Set(MOCK_PRICES.map(p => p.crop))].sort();
  },
};
