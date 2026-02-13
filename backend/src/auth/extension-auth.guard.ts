import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ExtensionAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const expected = this.config.get<string>('EXT_DEVICE_TOKEN');

    if (!expected) {
      throw new UnauthorizedException({
        error: {
          code: 'AUTH_INVALID_TOKEN',
          message: 'Extension auth not configured',
          trace_id: (request as Request & { traceId?: string }).traceId,
        },
      });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: {
          code: 'AUTH_INVALID_TOKEN',
          message: 'Missing or invalid Authorization header',
          trace_id: (request as Request & { traceId?: string }).traceId,
        },
      });
    }

    const token = authHeader.slice(7).trim();
    if (token !== expected) {
      throw new UnauthorizedException({
        error: {
          code: 'AUTH_INVALID_TOKEN',
          message: 'Invalid token',
          trace_id: (request as Request & { traceId?: string }).traceId,
        },
      });
    }

    return true;
  }
}
