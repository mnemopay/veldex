require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const axios = require('axios');
const cron = require('node-cron');
const eventBus = require('@agri-mvp/shared-events');

// Health Check
fastify.get('/health', async () => ({ status: 'ok', service: 'ingestion-service' }));

// Mock Fetching Logic
async function fetchCommodityPrices() {
  console.log('Ingestion: Fetching commodity prices...');
  // Mock API Call
  const mockPrices = [
    { crop: 'Maize', price: 120, unit: 'bag' },
    { crop: 'Cocoa', price: 2500, unit: 'ton' }
  ];
  
  await eventBus.publish('data.updated', { type: 'PRICES', payload: mockPrices });
}

async function fetchWeatherData() {
  console.log('Ingestion: Fetching weather data...');
  const mockWeather = { location: 'Lagos', temp: 28, forecast: 'Sunny' };
  
  await eventBus.publish('data.updated', { type: 'WEATHER', payload: mockWeather });
}

// Schedule Jobs (Every hour for prices, every 3 hours for weather)
cron.schedule('0 * * * *', fetchCommodityPrices);
cron.schedule('0 */3 * * *', fetchWeatherData);

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3002, host: '0.0.0.0' });
    // Run initial fetch
    fetchCommodityPrices();
    fetchWeatherData();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
