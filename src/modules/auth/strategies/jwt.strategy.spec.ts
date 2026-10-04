import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { extractFromCookie, JwtStrategy } from './jwt.strategy';
import type { PrismaService } from '../../../prisma/prisma.service';

// passport-jwt's Strategy throws at construction time if no secret is
// configured — this stands in for the real JWT_SECRET env var.
process.env.JWT_SECRET = 'test-secret';

describe('JwtStrategy construction', () => {
  it('falls back to an empty string for an unset JWT_SECRET (which passport-jwt then rejects)', () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    const prisma = {
      user: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    expect(() => new JwtStrategy(prisma)).toThrow();

    process.env.JWT_SECRET = original;
  });
});

describe('extractFromCookie', () => {
  it('reads the auth cookie when present', () => {
    const req = { cookies: { ticketing_auth: 'a-jwt' } } as unknown as Request;
    expect(extractFromCookie(req)).toBe('a-jwt');
  });

  it('returns null when the cookie is missing', () => {
    const req = { cookies: {} } as unknown as Request;
    expect(extractFromCookie(req)).toBeNull();
  });

  it('returns null when there are no cookies at all', () => {
    const req = {} as unknown as Request;
    expect(extractFromCookie(req)).toBeNull();
  });
});

describe('JwtStrategy.validate', () => {
  it('returns the mapped RequestUser for an existing, non-deleted user', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 1,
      email: 'jane@example.com',
      isVerified: true,
      createdViaInvite: false,
    });
    const prisma = { user: { findFirst } } as unknown as PrismaService;
    const strategy = new JwtStrategy(prisma);

    const result = await strategy.validate({} as Request, { sub: 1 });

    expect(result).toEqual({
      id: 1,
      email: 'jane@example.com',
      isVerified: true,
      createdViaInvite: false,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 1, isDeleted: false },
    });
  });

  it('throws UnauthorizedException when no matching user exists', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const strategy = new JwtStrategy(prisma);

    await expect(
      strategy.validate({} as Request, { sub: 999 }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
