// Must stay the first import in this file: it populates `process.env` from
// `.env` synchronously, before `./app.module`'s require chain reaches
// `./prisma/client` and reads `DATABASE_URL` at module-evaluation time.
// `ConfigModule.forRoot()` (in `app.module.ts`) does the same `.env` load,
// but only runs once `AppModule` is instantiated — long after that first
// read already happened. See `load-env.ts` for the full explanation.
import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import type { FastifyInstance } from 'fastify';
import { AppModule } from './app.module';
import { createContext } from './trpc/context';
import { appRouter } from './trpc/router';

export interface CreateApiOptions {
  fastify?: FastifyInstance;
  cors?: boolean;
  initialize?: boolean;
}

export async function createApi(
  options: CreateApiOptions = {},
): Promise<NestFastifyApplication> {
  const allowedOrigins = (
    process.env.CORS_ORIGIN ??
    'http://localhost:3000,http://localhost:4321,http://127.0.0.1:4321'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const adapter = options.fastify
    ? new FastifyAdapter(options.fastify)
    : new FastifyAdapter({
        logger: process.env.NODE_ENV !== 'test',
        trustProxy: true,
      });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  if (options.cors !== false) {
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
      },
      credentials: true,
    });
  }

  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      onError: ({ error }: { error: { code: string } }) => {
        if (error.code === 'INTERNAL_SERVER_ERROR') {
          console.error('tRPC internal error:', error);
        }
      },
    },
  });

  if (options.initialize !== false) {
    await app.init();
    app.enableShutdownHooks();
  }
  return app;
}
