import { Module } from '@nestjs/common';
import { ExtensionAuthGuard } from './extension-auth.guard';

@Module({
  providers: [ExtensionAuthGuard],
  exports: [ExtensionAuthGuard],
})
export class AuthModule {}
