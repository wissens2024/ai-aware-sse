import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExtensionAuthGuard } from '../auth/extension-auth.guard';
import { DecisionRequestDto } from './dto/decision-request.dto';
import { ExtensionService } from './extension.service';

@ApiTags('Extension')
@ApiBearerAuth('extBearerAuth')
@Controller('extension')
@UseGuards(ExtensionAuthGuard)
export class ExtensionController {
  constructor(private readonly extensionService: ExtensionService) {}

  @Post('decision-requests')
  @ApiOperation({ summary: 'Evaluate a decision for an extension event' })
  async createDecisionRequest(@Body() dto: DecisionRequestDto) {
    try {
      return await this.extensionService.evaluateDecision(dto);
    } catch (err) {
      // 500 원인 확인: 서버 터미널에 실제 예외 출력 (HttpException은 그대로 전파)
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(
        '[ExtensionController] decision-requests error:',
        msg,
        stack ?? '',
      );
      throw err;
    }
  }

  @Post('user-actions')
  @ApiOperation({ summary: 'Record user follow-up actions' })
  createUserAction(@Body() body: object) {
    return this.extensionService.recordUserAction(body);
  }

  @Post('approval-cases')
  @ApiOperation({ summary: 'Create an approval case' })
  async createApprovalCase(
    @Body()
    body: {
      event_id: string;
      decision_id: string;
      request_reason?: string;
      requested_at: string;
    },
  ) {
    return this.extensionService.createApprovalCase(body);
  }

  @Get('approval-cases/:case_id')
  @ApiOperation({ summary: 'Get approval case status' })
  async getApprovalCase(@Param('case_id') caseId: string) {
    return this.extensionService.getApprovalCaseStatus(caseId);
  }

  @Get('ping')
  @ApiOperation({ summary: 'Extension health ping' })
  ping() {
    return this.extensionService.ping();
  }
}
