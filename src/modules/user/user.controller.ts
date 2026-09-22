import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // This is the login lookup, and it's unauthenticated (no real auth
  // exists yet — see auth-provider.tsx) — without a tighter limit than
  // the app-wide default, it lets anyone enumerate which emails exist in
  // the system by brute-forcing this endpoint.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('by-email/:email')
  findByEmail(@Param('email') email: string) {
    return this.userService.findByEmailWithMemberships(
      decodeURIComponent(email),
    );
  }
}
