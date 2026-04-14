const path = require('path');

const knexConfig = require('./knexfile');

async function run() {
  const knex = require('knex')(knexConfig);
  const migrationsDir = path.resolve(__dirname, 'migrations');

  try {
    await knex.migrate.latest({ directory: migrationsDir });
    console.log('AI service migrations ran successfully.');
  } finally {
    await knex.destroy();
  }
}

run().catch((err) => {
  console.error('AI migration failed:', err);
  process.exit(1);
});
