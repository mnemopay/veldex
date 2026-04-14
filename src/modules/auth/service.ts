/**
 * Auth module — service layer.
 * Handles registration, login, and password hashing.
 * Uses a simple PBKDF2 approach with Node's built-in crypto (no bcrypt dep).
 */

import { randomUUID, pbkdf2Sync, randomBytes } from 'crypto';
import { getDb } from '../../shared/db';
import type { User, UserPublic, UserRole, Country } from '../../shared/types';

const ITERATIONS = 100_000;
const KEYLEN = 64;
const DIGEST = 'sha512';

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
}

function makePasswordHash(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return hashPassword(password, salt) === hash;
}

function toPublic(u: User): UserPublic {
  const { passwordHash: _pw, ...pub } = u;
  return pub as UserPublic;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  country: Country;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const AuthService = {
  register(input: RegisterInput): UserPublic {
    const db = getDb();

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(input.email);
    if (existing) throw new Error('Email already registered');

    if (!['FARMER', 'BUYER'].includes(input.role)) {
      throw new Error('Role must be FARMER or BUYER');
    }

    const user: User = {
      id: randomUUID(),
      email: input.email.toLowerCase().trim(),
      passwordHash: makePasswordHash(input.password),
      role: input.role,
      country: input.country,
      name: input.name,
      createdAt: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, country, name, created_at)
      VALUES (@id, @email, @passwordHash, @role, @country, @name, @createdAt)
    `).run({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      country: user.country,
      name: user.name,
      createdAt: user.createdAt,
    });

    return toPublic(user);
  },

  login(input: LoginInput): User {
    const db = getDb();
    const row = db
      .prepare('SELECT id, email, password_hash as passwordHash, role, country, name, created_at as createdAt FROM users WHERE email = ?')
      .get(input.email.toLowerCase().trim()) as User | undefined;

    if (!row) throw new Error('Invalid credentials');
    if (!verifyPassword(input.password, row.passwordHash)) {
      throw new Error('Invalid credentials');
    }
    return row;
  },

  findById(id: string): UserPublic | null {
    const db = getDb();
    const row = db
      .prepare('SELECT id, email, password_hash as passwordHash, role, country, name, created_at as createdAt FROM users WHERE id = ?')
      .get(id) as User | undefined;
    return row ? toPublic(row) : null;
  },
};
