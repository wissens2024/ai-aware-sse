import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DetectorModule } from '../detector/detector.module';
import { PolicyModule } from '../policy/policy.module';
import { ExtensionController } from './extension.controller';
import { ExtensionService } from './extension.service';

@Module({
  imports: [AuthModule, PolicyModule, DetectorModule],
  controllers: [ExtensionController],
  providers: [ExtensionService],
})
export class ExtensionModule {}
