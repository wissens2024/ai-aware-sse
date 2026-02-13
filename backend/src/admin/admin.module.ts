import { Module } from '@nestjs/common';
import { PolicyModule } from '../policy/policy.module';
import { ApprovalsController } from './approvals/approvals.controller';
import { ApprovalsService } from './approvals/approvals.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AppsController } from './apps/apps.controller';
import { AppsService } from './apps/apps.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { DetectorsController } from './detectors/detectors.controller';
import { DetectorsService } from './detectors/detectors.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { ExceptionsController } from './exceptions/exceptions.controller';
import { ExceptionsService } from './exceptions/exceptions.service';
import { GroupsController } from './groups/groups.controller';
import { GroupsService } from './groups/groups.service';
import { PoliciesController } from './policies/policies.controller';
import { PoliciesService } from './policies/policies.service';
import { TenantsController } from './tenants/tenants.controller';
import { TenantsService } from './tenants/tenants.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({
  imports: [PolicyModule],
  controllers: [
    DashboardController,
    EventsController,
    ApprovalsController,
    PoliciesController,
    DetectorsController,
    AppsController,
    UsersController,
    TenantsController,
    GroupsController,
    ExceptionsController,
    AuditController,
  ],
  providers: [
    DashboardService,
    EventsService,
    ApprovalsService,
    PoliciesService,
    DetectorsService,
    AppsService,
    UsersService,
    TenantsService,
    GroupsService,
    ExceptionsService,
    AuditService,
  ],
})
export class AdminModule {}
