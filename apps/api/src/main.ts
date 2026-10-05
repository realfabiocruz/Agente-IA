import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Lê apps/api/.env quando existir (Node 22+), sem dependência extra.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
    allowedHeaders: ['content-type', 'x-user-id'],
  });
  app.enableShutdownHooks();
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`API do entrevistador em http://localhost:${port}`);
}
bootstrap();
