import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: ['log', 'error', 'warn', 'debug'],
  });
  const config = app.get(ConfigService);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.enableCors({
    origin: [
      'http://localhost:3001',
      'https://your-vercel-app.vercel.app',
      config.get<string>('FRONTEND_URL', ''),
    ].filter(Boolean),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Server running on port ${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
