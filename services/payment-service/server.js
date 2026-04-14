require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const knex = require('knex')(require('./knexfile'));
const { v4: uuidv4 } = require('uuid');
const eventBus = require('@agri-mvp/shared-events');

// Health Check
fastify.get('/health', async () => ({ status: 'ok', service: 'payment-service' }));

// Event Consumers
async function startConsumers() {
  // bid.placed -> trigger escrow hold (mock)
  await eventBus.subscribe('bid.placed', 'payment-group', 'payment-consumer-1', async (data) => {
    console.log('Payment: Holding funds for bid:', data.id);
    const transactionId = uuidv4();
    await knex('transactions').insert({
      id: transactionId,
      listing_id: data.listing_id,
      buyer_id: data.buyer_id,
      farmer_id: 'mock-farmer', // In real life, fetch from marketplace
      amount: data.bid_price,
      status: 'HELD'
    });
    
    await eventBus.publish('payment.escrow.success', { bid_id: data.id, transaction_id: transactionId });
    await eventBus.publish('transaction.paid', { listing_id: data.listing_id, amount: data.bid_price });
  });

  // shipment.delivered -> release funds
  await eventBus.subscribe('shipment.delivered', 'payment-group', 'payment-consumer-1', async (data) => {
    console.log('Payment: Releasing funds for listing:', data.listing_id);
    await knex('transactions')
      .where('listing_id', data.listing_id)
      .update({ status: 'RELEASED' });
  });
}

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3004, host: '0.0.0.0' });
    await startConsumers();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
