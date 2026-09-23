import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SesService } from '../email/ses.service';
import { renderVerifyEmail } from '../email/templates/verify-email.template';
import {
  VERIFICATION_RESEND_COOLDOWN_MS,
  VERIFICATION_TOKEN_TTL_MS,
} from './auth.constants';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';
import type { AcceptInviteDto } from './dto/accept-invite.dto';
import type { GoogleProfile } from './strategies/google.strategy';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly ses: SesService,
  ) {}

  signToken(userId: number): string {
    return this.jwtService.sign({ sub: userId });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  // A Gmail-domain account never needs a password of its own here — the
  // first time they use "Continue with Google" with this exact email,
  // findOrCreateFromGoogle()'s byEmail-linking branch attaches their
  // googleId to this same passwordless row automatically.
  private isGmailAddress(email: string): boolean {
    return email.toLowerCase().endsWith('@gmail.com');
  }

  private backendUrl(): string {
    return (
      process.env.BACKEND_URL || `http://localhost:${process.env.PORT ?? 3001}`
    );
  }

  // Sent *before* the user row is created — same "don't persist what
  // wasn't actually communicated" rule member.service.ts uses for invites.
  private async sendVerificationEmail(
    email: string,
    firstName: string,
    token: string,
  ) {
    const verifyUrl = `${this.backendUrl()}/auth/verify-email?token=${token}`;
    const { subject, html, text } = renderVerifyEmail({ firstName, verifyUrl });

    try {
      await this.ses.send({ to: email, subject, html, text });
      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to send verification email to ${email}: ${detail}`,
        error instanceof Error ? error.stack : undefined,
      );
      // The real cause (SES sandbox restrictions, etc.) is logged above —
      // never surface it to the client, same rule AllExceptionsFilter
      // applies to every other unexpected 500.
      throw new InternalServerErrorException(
        'Failed to send verification email, try again later.',
      );
    }
  }

  async signup(dto: SignupDto): Promise<void> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }

    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        isDeleted: false,
      },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const verificationToken = randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(
      Date.now() + VERIFICATION_TOKEN_TTL_MS,
    );

    await this.sendVerificationEmail(
      email,
      dto.firstName.trim(),
      verificationToken,
    );

    await this.prisma.user.create({
      data: {
        email,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        passwordHash,
        isVerified: false,
        hasOnboarded: false,
        verificationToken,
        verificationTokenExpiry,
        lastVerificationSentAt: new Date(),
      },
    });
  }

  /** Throws ForbiddenException({ code: 'UNVERIFIED' }) if the password is
   * correct but the account hasn't been verified yet — the controller
   * translates that into the frontend's "check your email" state instead
   * of a generic login failure. */
  async login(dto: LoginDto): Promise<number> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        isDeleted: false,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    if (!user.isVerified) {
      throw new ForbiddenException({
        code: 'UNVERIFIED',
        message: 'Please verify your email before logging in.',
      });
    }

    return user.id;
  }

  /** A pending MEMBERSHIP invite for this email, if any — checked before
   * treating a brand-new Google sign-in as a fresh owner-track signup. An
   * invited person accepting via Google skips both email verification
   * (the invite itself, sent to this exact address, already establishes
   * that it's them) and onboarding (they're joining a specific,
   * already-existing org — there's no personal-vs-organization choice to
   * make), landing straight in the dashboard as a MEMBER. */
  private async findPendingMembershipInvite(email: string) {
    return this.prisma.memberInvite.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        type: 'MEMBERSHIP',
        status: 'PENDING',
        isDeleted: false,
        OR: [{ expiry: null }, { expiry: { gt: new Date() } }],
      },
    });
  }

  /** Turns a pending invite into a real Member row for a just-created
   * user, and marks the invite consumed. */
  private async acceptInviteForNewUser(
    invite: { id: number; orgId: number; roleId: number },
    user: { id: number; firstName: string; lastName: string; email: string },
  ) {
    await this.prisma.$transaction([
      this.prisma.member.create({
        data: {
          orgId: invite.orgId,
          userId: user.id,
          roleId: invite.roleId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        },
      }),
      this.prisma.memberInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' },
      }),
    ]);
  }

  /** Looks up a pending, unexpired MEMBERSHIP invite by its token — shared
   * by the accept-invite lookup page and the actual accept action. */
  private async findValidInviteByToken(token: string) {
    const invite = await this.prisma.memberInvite.findFirst({
      where: { token, type: 'MEMBERSHIP', isDeleted: false },
      include: { organization: true, role: true },
    });
    if (!invite) {
      throw new BadRequestException('Invalid or already-used invite link.');
    }
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('This invite is no longer pending.');
    }
    if (invite.expiry && invite.expiry < new Date()) {
      throw new BadRequestException('This invite has expired.');
    }
    return invite;
  }

  /** What the accept-invite page needs to render itself. `requiresPassword`
   * is false whenever the invitee has some other way to log in later
   * without one — an existing account (any auth method), or a Gmail
   * address that will self-link the first time they use Google sign-in —
   * so the page can skip straight to "Accept" instead of showing a form. */
  async getInviteInfo(token: string) {
    const invite = await this.findValidInviteByToken(token);
    const email = this.normalizeEmail(invite.email);
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        isDeleted: false,
      },
    });

    return {
      email: invite.email,
      organizationName: invite.organization.organizationName,
      roleName: invite.role.roleName,
      requiresPassword: !existingUser && !this.isGmailAddress(email),
    };
  }

  /** Accepting an invite never sends (or needs) a separate verification
   * email — the invite itself, sent to this exact address, already
   * establishes it's them. Returns the accepted user's id for the
   * controller to issue a session with. */
  async acceptInvite(dto: AcceptInviteDto): Promise<number> {
    const invite = await this.findValidInviteByToken(dto.token);
    const email = this.normalizeEmail(invite.email);

    let user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        isDeleted: false,
      },
    });

    if (!user) {
      const isGmail = this.isGmailAddress(email);
      if (!isGmail && (!dto.firstName || !dto.lastName || !dto.password)) {
        throw new BadRequestException(
          'firstName, lastName, and password are required to accept this invite.',
        );
      }

      const passwordHash = dto.password
        ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
        : null;

      user = await this.prisma.user.create({
        data: {
          email,
          firstName: dto.firstName?.trim() || this.emailLocalPart(email),
          lastName: dto.lastName?.trim() || '',
          passwordHash,
          isVerified: true,
          hasOnboarded: true,
        },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    const alreadyMember = await this.prisma.member.findFirst({
      where: { orgId: invite.orgId, userId: user.id, isDeleted: false },
    });

    if (!alreadyMember) {
      await this.acceptInviteForNewUser(invite, user);
    } else {
      // Already a member somehow (e.g. the invite link was opened twice)
      // — just close out the invite without a duplicate Member row.
      await this.prisma.memberInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' },
      });
    }

    return user.id;
  }

  /** Fallback display name for a Gmail-linked account accepted without
   * ever entering one — "jane.doe" from jane.doe@gmail.com. Editable
   * afterward from their profile. */
  private emailLocalPart(email: string): string {
    const [localPart] = email.split('@');
    return localPart || 'Member';
  }

  /** Finds an existing Google-linked user, links Google onto an existing
   * password account with the same email, or creates a brand-new one.
   * `needsVerification` mirrors login()'s UNVERIFIED case — a new (or
   * previously-unverified) account still needs the verification email
   * clicked before a session is issued. */
  async findOrCreateFromGoogle(
    profile: GoogleProfile,
  ): Promise<{ userId: number; needsVerification: boolean }> {
    const email = this.normalizeEmail(profile.email);

    let user = await this.prisma.user.findFirst({
      where: { googleId: profile.googleId, isDeleted: false },
    });

    if (!user) {
      const byEmail = await this.prisma.user.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          isDeleted: false,
        },
      });

      if (byEmail) {
        // Same email, first time using Google to sign in to it — link the
        // accounts. Doesn't auto-verify: if they never finished verifying
        // the password-based signup, Google linking isn't a substitute.
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.googleId,
            avatar: byEmail.avatar ?? profile.avatar,
          },
        });
      }
    }

    if (!user) {
      const invite = await this.findPendingMembershipInvite(email);

      if (invite) {
        user = await this.prisma.user.create({
          data: {
            email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            avatar: profile.avatar,
            googleId: profile.googleId,
            isVerified: true,
            hasOnboarded: true,
          },
        });
        await this.acceptInviteForNewUser(invite, user);
      } else {
        const verificationToken = randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(
          Date.now() + VERIFICATION_TOKEN_TTL_MS,
        );

        await this.sendVerificationEmail(
          email,
          profile.firstName,
          verificationToken,
        );

        user = await this.prisma.user.create({
          data: {
            email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            avatar: profile.avatar,
            googleId: profile.googleId,
            isVerified: false,
            hasOnboarded: false,
            verificationToken,
            verificationTokenExpiry,
            lastVerificationSentAt: new Date(),
          },
        });
      }
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    return { userId: user.id, needsVerification: !user.isVerified };
  }

  async resendVerification(email: string): Promise<void> {
    const normalized = this.normalizeEmail(email);
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
        isDeleted: false,
      },
    });
    if (!user)
      throw new BadRequestException('No account found for this email.');
    if (user.isVerified) {
      throw new BadRequestException('This account is already verified.');
    }

    if (user.lastVerificationSentAt) {
      const elapsed = Date.now() - user.lastVerificationSentAt.getTime();
      if (elapsed < VERIFICATION_RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil(
          (VERIFICATION_RESEND_COOLDOWN_MS - elapsed) / 1000,
        );
        throw new BadRequestException(
          `Please wait ${waitSeconds}s before resending.`,
        );
      }
    }

    const verificationToken = randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(
      Date.now() + VERIFICATION_TOKEN_TTL_MS,
    );

    // Send first — if it fails, the token/cooldown stay untouched, same
    // rule as member.service.ts's resend().
    await this.sendVerificationEmail(
      user.email,
      user.firstName,
      verificationToken,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        verificationTokenExpiry,
        lastVerificationSentAt: new Date(),
      },
    });
  }

  /** Returns the verified user's id, or throws if the token is invalid/
   * expired — the controller redirects the browser either way. */
  async verifyEmail(token: string): Promise<number> {
    const user = await this.prisma.user.findFirst({
      where: { verificationToken: token, isDeleted: false },
    });
    if (!user) {
      throw new BadRequestException(
        'Invalid or already-used verification link.',
      );
    }
    if (
      user.verificationTokenExpiry &&
      user.verificationTokenExpiry < new Date()
    ) {
      throw new BadRequestException('This verification link has expired.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    return user.id;
  }

  async completeOnboarding(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hasOnboarded: true },
    });
  }
}
