/**
 * Auth routes — thin HTTP layer, delegates to AuthService.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from './service';
import { requireAuth } from '../../shared/auth/middleware';
import type { JwtPayload } from '../../shared/types';
import { randomUUID } from 'crypto';

// ── Zod schemas ──────────────────────────────
const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['FARMER', 'BUYER'], { message: 'Role must be FARMER or BUYER' }),
  country: z.enum(['US', 'NG'], { message: 'Country must be US or NG' }),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ── In-memory refresh token store ────────────
// In production, store in DB with expiry
const refreshTokens = new Map<string, { userId: string; email: string; role: string; country: string; expiresAt: number }>();

export function clearRefreshTokens(): void {
  refreshTokens.clear();
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/register
  app.post('/register', async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validation failed' });
    }
    const { email, password, name, role, country } = parsed.data;

    try {
      const user = AuthService.register({ email, password, name, role, country });
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        country: user.country,
      } satisfies Omit<JwtPayload, 'iat' | 'exp'>);

      // Issue refresh token (7 day validity)
      const refreshToken = randomUUID();
      refreshTokens.set(refreshToken, {
        userId: user.id,
        email: user.email,
        role: user.role,
        country: user.country,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      return reply.code(201).send({ token, refreshToken, user });
    } catch (err: any) {
      return reply.code(409).send({ error: err.message });
    }
  });

  // POST /api/auth/login
  app.post('/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validation failed' });
    }
    const { email, password } = parsed.data;

    try {
      const user = AuthService.login({ email, password });
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        country: user.country,
      } satisfies Omit<JwtPayload, 'iat' | 'exp'>);

      // Issue refresh token (7 day validity)
      const refreshToken = randomUUID();
      refreshTokens.set(refreshToken, {
        userId: user.id,
        email: user.email,
        role: user.role,
        country: user.country,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      return reply.send({ token, refreshToken, user: { id: user.id, email: user.email, role: user.role, country: user.country, name: user.name } });
    } catch (err: any) {
      return reply.code(401).send({ error: err.message });
    }
  });

  // POST /api/auth/refresh — exchange refresh token for new JWT
  app.post('/refresh', async (request, reply) => {
    const parsed = RefreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validation failed' });
    }
    const { refreshToken } = parsed.data;

    const stored = refreshTokens.get(refreshToken);
    if (!stored) {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
    if (stored.expiresAt < Date.now()) {
      refreshTokens.delete(refreshToken);
      return reply.code(401).send({ error: 'Refresh token expired' });
    }

    // Rotate: delete old, issue new
    refreshTokens.delete(refreshToken);

    const newToken = app.jwt.sign({
      sub: stored.userId,
      email: stored.email,
      role: stored.role,
      country: stored.country,
    } as Omit<JwtPayload, 'iat' | 'exp'>);

    const newRefreshToken = randomUUID();
    refreshTokens.set(newRefreshToken, {
      ...stored,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return reply.send({ token: newToken, refreshToken: newRefreshToken });
  });

  // GET /api/auth/me
  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = AuthService.findById(request.user!.sub);
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return reply.send({ user });
  });
}
