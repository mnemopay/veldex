/**
 * JWT middleware helpers.
 * Fastify routes import `requireAuth` and optionally `requireRole`.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload, UserRole } from '../types';

// Extend @fastify/jwt's type so jwtVerify() populates request.user as JwtPayload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAuth(request, reply);
    if (reply.sent) return;
    if (!request.user || !roles.includes(request.user.role)) {
      reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
