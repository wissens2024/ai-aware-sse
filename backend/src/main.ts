import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 8080);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isDev = nodeEnv === 'development';

  app.setGlobalPrefix('api/v1');

  // CORS: Admin Console + Chrome Extension (content script fetch 시 Origin이 페이지 도메인으로 옴)
  const corsExtra = configService.get<string>('CORS_ORIGINS', '');
  const allowed = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    ...(corsExtra
      ? corsExtra
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []),
  ];
  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      const extensionPageOrigins = [
        'https://chatgpt.com',
        'https://www.chatgpt.com',
        'https://copilot.microsoft.com',
        'https://gemini.google.com',
        'https://claude.ai',
        'https://www.anthropic.com',
      ];
      const allowedOrigin =
        !origin ||
        allowed.includes(origin) ||
        /^chrome-extension:\/\//.test(origin) ||
        extensionPageOrigins.includes(origin) ||
        /^https:\/\/([a-z0-9-]+\.)*chatgpt\.com$/.test(origin) ||
        /^https:\/\/([a-z0-9-]+\.)*anthropic\.com$/.test(origin);
      cb(null, allowedOrigin);
    },
    credentials: true,
  });

  // Global validation pipe (제품형: DTO 자동 검증/변환)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // MVP: unknown props strip only
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Security & compression (제품형 기본)

  app.use(helmet(isDev ? { contentSecurityPolicy: false } : undefined));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(compression());

  // Request/response logging
  app.use(
    pinoHttp({
      level: isDev ? 'info' : 'info',
      customLogLevel(_req, res, err) {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // Swagger (OpenAPI)
  const config = new DocumentBuilder()
    .setTitle('SASE Backend API')
    .setDescription('AI-Aware SSE Policy Engine & Admin API')
    .setVersion('0.1.0')
    .addTag('api')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api`);
}

void bootstrap();
