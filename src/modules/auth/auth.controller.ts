import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/guards/permissions.guard';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AUTH_COOKIE_NAME } from './auth.constants';
import {
  getAuthCookieOptions,
  getClearAuthCookieOptions,
} from './cookie.helper';
import type { GoogleProfile } from './strategies/google.strategy';

function frontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

// These two handlers (googleCallback, verifyEmail) take over the response
// via @Res() so they can redirect on success — but that also means an
// exception thrown mid-handler skips the frontend entirely and renders the
// backend's raw JSON error in the browser (this *is* the response the
// browser is sitting on, there's no separate page to redirect to). Extract
// a safe, already-user-facing message the same way AllExceptionsFilter
// does (an HttpException's own message; never a raw Error's), and send the
// browser back to /login with it instead.
function extractSafeErrorMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const payload = exception.getResponse();
    if (typeof payload === 'string') return payload;
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0];
    }
    return exception.message;
  }
  return 'Something went wrong. Please try again.';
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  // Brute-force mitigation — same tighter-than-default pattern as
  // UserController's by-email lookup (see that file's own comment).
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('signup')
  @HttpCode(201)
  async signup(@Body() dto: SignupDto) {
    await this.authService.signup(dto);
    return { message: 'Check your email to verify your account.' };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.authService.login(dto);
    res.cookie(
      AUTH_COOKIE_NAME,
      this.authService.signToken(userId),
      getAuthCookieOptions(),
    );
    return this.userService.findByIdWithMemberships(userId);
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Handled entirely by the Passport strategy — it redirects to Google.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request & { user: GoogleProfile },
    @Res() res: Response,
  ) {
    try {
      const { userId, needsVerification } =
        await this.authService.findOrCreateFromGoogle(req.user);

      if (needsVerification) {
        res.redirect(
          `${frontendUrl()}/verify-pending?email=${encodeURIComponent(req.user.email)}`,
        );
        return;
      }

      res.cookie(
        AUTH_COOKIE_NAME,
        this.authService.signToken(userId),
        getAuthCookieOptions(),
      );
      const user = await this.userService.findByIdWithMemberships(userId);
      res.redirect(
        `${frontendUrl()}${user.hasOnboarded ? '/dashboard' : '/onboarding'}`,
      );
    } catch (error) {
      this.logger.error(
        `Google sign-in failed for ${req.user?.email ?? 'unknown'}`,
        error instanceof Error ? error.stack : undefined,
      );
      res.redirect(
        `${frontendUrl()}/login?error=${encodeURIComponent(extractSafeErrorMessage(error))}`,
      );
    }
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.authService.resendVerification(dto.email);
    return { message: 'Verification email sent.' };
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    try {
      const userId = await this.authService.verifyEmail(token);
      res.cookie(
        AUTH_COOKIE_NAME,
        this.authService.signToken(userId),
        getAuthCookieOptions(),
      );
      const user = await this.userService.findByIdWithMemberships(userId);
      res.redirect(
        `${frontendUrl()}${user.hasOnboarded ? '/dashboard' : '/onboarding'}`,
      );
    } catch (error) {
      this.logger.error(
        'Email verification failed',
        error instanceof Error ? error.stack : undefined,
      );
      res.redirect(
        `${frontendUrl()}/login?error=${encodeURIComponent(extractSafeErrorMessage(error))}`,
      );
    }
  }

  @Public()
  @Get('invite/:token')
  getInvite(@Param('token') token: string) {
    return this.authService.getInviteInfo(token);
  }

  // Never sends a verification email — the invite itself, sent to this
  // exact address, already establishes it's them. Ordinary JSON response
  // (not a redirect like verify-email/google-callback) since the frontend
  // page collects a form first and submits it itself.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.authService.acceptInvite(dto);
    res.cookie(
      AUTH_COOKIE_NAME,
      this.authService.signToken(userId),
      getAuthCookieOptions(),
    );
    return this.userService.findByIdWithMemberships(userId);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, getClearAuthCookieOptions());
    return { message: 'Logged out.' };
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.userService.findByIdWithMemberships(user.id);
  }

  @Patch('onboarding')
  @HttpCode(200)
  async completeOnboarding(@CurrentUser() user: RequestUser) {
    await this.authService.completeOnboarding(user.id);
    return { message: 'Onboarding complete.' };
  }
}
