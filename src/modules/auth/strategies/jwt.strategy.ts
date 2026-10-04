import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type StrategyOptionsWithRequest } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { AUTH_COOKIE_NAME } from '../auth.constants';
import type { RequestUser } from '../../../common/guards/permissions.guard';

interface JwtPayload {
  sub: number;
}

export function extractFromCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[AUTH_COOKIE_NAME] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const options: StrategyOptionsWithRequest = {
      jwtFromRequest: extractFromCookie,
      secretOrKey: process.env.JWT_SECRET ?? '',
      passReqToCallback: true,
    };
    super(options);
  }

  async validate(_req: Request, payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isDeleted: false },
    });

    if (!user) throw new UnauthorizedException('User not found.');

    return {
      id: user.id,
      email: user.email,
      isVerified: user.isVerified,
      createdViaInvite: user.createdViaInvite,
    };
  }
}
