import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OidcController } from './oidc.controller';
import { OidcService } from './oidc.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ExtensionAuthGuard } from './extension-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController, OidcController],
  providers: [AuthService, OidcService, JwtAuthGuard, ExtensionAuthGuard],
  exports: [AuthService, OidcService, JwtAuthGuard, ExtensionAuthGuard, JwtModule],
})
export class AuthModule {}
