import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Workspace scripts run with `apps/api` as cwd, where NestJS's default
    // `.env` lookup (`resolve(process.cwd(), '.env')`) never finds the root
    // `.env` a monorepo-wide `cp .env.example .env` produces. `../../.env`
    // resolves that same file relative to `apps/api`. In the container image
    // cwd is `/app`, so `.env` (first entry) is the one that would apply and
    // the second entry is harmlessly absent. List both so the same command
    // works in every context this app actually runs in.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
  ],
})
export class AppModule {}
