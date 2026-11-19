import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './presentation/http/filters/api-error.filter';
import { EncryptedConnectionRepository } from './infrastructure/database/repositories/encrypted-connection.repository';
import type { DatabaseGateway } from './domain/repositories/database.gateway';
export type BootstrapOptions = {
  token: string;
  vaultKey: Buffer;
  dataDir: string;
  staticDir: string;
  port: number;
  host: string;
  persistent?: boolean;
  mode?: 'web' | 'desktop';
  gateway?: DatabaseGateway;
  origins?: string[];
};
export async function bootstrap(options: BootstrapOptions) {
  if (options.token.length < 32 || options.vaultKey.length !== 32)
    throw new Error(
      'A 32-character access token and a 32-byte vault key are required. Run npm run setup first.',
    );
  const repo = new EncryptedConnectionRepository(
    options.dataDir,
    options.vaultKey,
    options.persistent !== false,
  );
  await repo.initialize();
  const app = await NestFactory.create(AppModule.register(repo, options.token, options.gateway), {
    logger: ['error', 'warn'],
    bodyParser: false,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiErrorFilter());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      strictTransportSecurity: false,
    }),
  );
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.disable('x-powered-by');
  if (options.origins?.length)
    app.enableCors({
      origin: options.origins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    });
  server.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  server.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { message: 'Too many requests. Wait a minute and try again.' } },
    }),
  );
  server.use(express.json({ limit: '256kb' }));
  server.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  server.get('/api/config', (_req, res) =>
    res.json({
      mode: options.mode ?? 'web',
      persistent: options.persistent !== false,
      readOnly: true,
      version: '0.2.1',
    }),
  );
  server.post(
    '/api/session',
    rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }),
    (req, res) => {
      const value = Buffer.from(
        typeof req.body?.token === 'string' ? req.body.token.slice(0, 512) : '',
      );
      const expected = Buffer.from(options.token);
      if (value.length !== expected.length || !timingSafeEqual(value, expected)) {
        res.status(401).json({ error: { message: 'That access token is not correct.' } });
        return;
      }
      res.json({ ok: true });
    },
  );
  // Mount the SPA only for non-API paths; API mistakes must stay JSON 404s.
  if (existsSync(options.staticDir)) {
    server.use(
      express.static(options.staticDir, {
        index: false,
        setHeaders: (res, path) => {
          if (path.endsWith('sw.js') || path.endsWith('index.html'))
            res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    server.get('/{*path}', (req, res, next) =>
      req.path.startsWith('/api/')
        ? next()
        : res.sendFile(resolve(options.staticDir, 'index.html')),
    );
  }
  await app.listen(options.port, options.host);
  return app;
}
export function environmentOptions(): BootstrapOptions {
  return {
    token: process.env.DB_EXPLORER_TOKEN ?? '',
    vaultKey: Buffer.from(process.env.DB_EXPLORER_MASTER_KEY ?? '', 'base64'),
    dataDir: resolve(process.env.DB_EXPLORER_DATA_DIR ?? 'data'),
    staticDir: resolve(process.env.DB_EXPLORER_STATIC_DIR ?? 'frontend/dist'),
    port: Number(process.env.PORT ?? 4317),
    host: process.env.HOST ?? '127.0.0.1',
    mode: 'web',
    origins: process.env.DB_EXPLORER_ORIGINS?.split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  };
}
if (require.main === module)
  bootstrap(environmentOptions())
    .then((app) => {
      console.log(
        'DB Explorer is ready on ' +
          (process.env.HOST ?? '127.0.0.1') +
          ':' +
          (process.env.PORT ?? 4317),
      );
      for (const signal of ['SIGINT', 'SIGTERM'] as const)
        process.once(signal, () => {
          void app.close().then(() => process.exit(0));
        });
    })
    .catch(() => {
      console.error(
        'DB Explorer could not start. Check your configuration and vault key. Run npm run setup for a new installation.',
      );
      process.exitCode = 1;
    });
