/**
 * Auth routes — thin HTTP layer, delegates to AuthService.
 */

import type { FastifyInstance } from 'fastify';
import { AuthService } from './service';
import { requireAuth } from '../../shared/auth/middleware';
import type { JwtPayload } from '../../shared/types';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/register
  app.post('/register', async (request, reply) => {
    const { email, password, name, role, country } = request.body as {
      email: string;
      password: string;
      name: string;
      role: string;
      country: string;
    };

    if (!email || !password || !name || !role || !country) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    try {
      const user = AuthService.register({ email, password, name, role: role as any, country: country as any });
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        country: user.country,
      } satisfies Omit<JwtPayload, 'iat' | 'exp'>);

      return reply.code(201).send({ token, user });
    } catch (err: any) {
      return reply.code(409).send({ error: err.message });
    }
  });

  // POST /api/auth/login
  app.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.code(400).send({ error: 'Missing email or password' });
    }

    try {
      const user = AuthService.login({ email, password });
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        country: user.country,
      } satisfies Omit<JwtPayload, 'iat' | 'exp'>);

      return reply.send({ token, user: { id: user.id, email: user.email, role: user.role, country: user.country, name: user.name } });
    } catch (err: any) {
      return reply.code(401).send({ error: err.message });
    }
  });

  // GET /api/auth/me
  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = AuthService.findById(request.user!.sub);
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return reply.send({ user });
  });
}
