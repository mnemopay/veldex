const knex = require('knex');

// Environment defaults (as requested)
const DB_HOST = process.env.DB_HOST || 'postgres';
const DB_USER = process.env.DB_USER || 'admin';
const DB_PASSWORD = process.env.DB_PASSWORD || 'password';

function makeKnex(database) {
  return knex({
    client: 'pg',
    connection: {
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database
    }
  });
}

async function seedMarketplace(marketplaceDb) {
  // Insert sample commodities
  const commodities = [
    { name: 'Tomatoes', category: 'tomatoes', unit: 'lb', price_per_unit: 1.2 },
    { name: 'Peppers', category: 'peppers', unit: 'lb', price_per_unit: 1.5 },
    { name: 'Onions', category: 'onions', unit: 'lb', price_per_unit: 0.7 },
    { name: 'Avocados', category: 'avocados', unit: 'ea', price_per_unit: 2.0 },
    { name: 'Strawberries', category: 'strawberries', unit: 'lb', price_per_unit: 3.5 }
  ];

  await marketplaceDb('commodities').insert(commodities).catch((err) => {
    // If unique constraints exist and the seed is re-run, try upsert-like fallback.
    // If your schema differs, update this logic.
    throw err;
  });

  // Insert sample users
  const users = [
    { name: 'Test Buyer', email: 'buyer@example.com', role: 'buyer' },
    { name: 'Test Seller', email: 'seller@example.com', role: 'seller' },
    { name: 'Test Driver', email: 'driver@example.com', role: 'driver' }
  ];

  await marketplaceDb('users').insert(users).catch((err) => {
    throw err;
  });
}

async function seedLogistics(logisticsDb) {
  const drivers = [
    { name: 'Driver One', vehicle_type: 'Truck', is_available: true },
    { name: 'Driver Two', vehicle_type: 'Van', is_available: true }
  ];

  await logisticsDb('drivers').insert(drivers).catch((err) => {
    throw err;
  });
}

async function verifyPayment(paymentDb) {
  // Insert nothing, just verify connection and basic query
  const res = await paymentDb.raw('SELECT 1 as ok');
  if (!res?.rows?.[0]?.ok && res?.[0]?.ok !== 1) {
    throw new Error('Payment DB verification query did not return expected result');
  }
}

async function seed() {
  const marketplaceDb = makeKnex('marketplace_db');
  const logisticsDb = makeKnex('logistics_db');
  const paymentDb = makeKnex('payment_db');

  try {
    await seedMarketplace(marketplaceDb);
    await seedLogistics(logisticsDb);
    await verifyPayment(paymentDb);

    console.log('Seed complete for marketplace/logistics (payment verified).');
  } finally {
    await marketplaceDb.destroy();
    await logisticsDb.destroy();
    await paymentDb.destroy();
  }
}

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
