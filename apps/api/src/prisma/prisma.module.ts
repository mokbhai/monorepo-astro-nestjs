import {
  Global,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PrismaClient } from './client';
import { prisma } from './client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  get db(): PrismaClient {
    return prisma;
  }

  async onModuleInit() {
    await prisma.$connect();
  }

  async onModuleDestroy() {
    await prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
