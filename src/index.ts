/**
 * Veldex — entry point.
 * Starts the Fastify server, runs migrations, wires all modules.
 */

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import { runMigrations } from './shared/db/migrate';
import { registerRoutes } from './api/router';

// Eagerly import module services so their bus subscriptions are registered
import './modules/orders/service';
import './modules/payments/service';
import './modules/compliance/service';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

async function bootstrap(): Promise<void> {
  // ── Run schema migrations ──────────────────
  runMigrations();

  // ── Create Fastify instance ────────────────
  const app = Fastify({
    logger: {
      level: NODE_ENV === 'development' ? 'info' : 'warn',
      transport:
        NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // ── Plugins ────────────────────────────────
  await app.register(fastifyCors, {
    origin: NODE_ENV === 'development' ? true : (process.env['ALLOWED_ORIGINS'] ?? '').split(','),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(fastifyJwt, {
    secret: JWT_SECRET,
    sign: { expiresIn: '7d' },
  });

  // ── Routes ─────────────────────────────────
  await registerRoutes(app);

  // ── Global error handler ───────────────────
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: NODE_ENV === 'production' && statusCode === 500
        ? 'Internal server error'
        : error.message,
    });
  });

  // ── Start ──────────────────────────────────
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`\n  Veldex API running on http://localhost:${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log(`  Env: ${NODE_ENV}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
