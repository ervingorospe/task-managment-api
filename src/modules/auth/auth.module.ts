import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { EmailModule } from '../email/email.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    PassportModule,
    // registerAsync + useFactory defers reading JWT_SECRET until Nest
    // actually instantiates this module at bootstrap — register() reads
    // it immediately when this file's @Module() decorator is evaluated,
    // which happens while app.module.ts is still resolving its own
    // imports, before ConfigModule.forRoot() (further down that same
    // imports array) has loaded .env. That earlier ordering left
    // JWT_SECRET undefined here even though it's set correctly in .env —
    // JwtService only failed once something actually called .sign().
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '7d' },
      }),
    }),
    EmailModule,
    UserModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
})
export class AuthModule {}
