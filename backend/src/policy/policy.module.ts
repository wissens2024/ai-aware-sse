import { Module } from '@nestjs/common';
import { PolicyCacheService } from './policy-cache.service';
import { PolicyEngineService } from './policy-engine.service';

@Module({
  providers: [PolicyEngineService, PolicyCacheService],
  exports: [PolicyEngineService, PolicyCacheService],
})
export class PolicyModule {}
