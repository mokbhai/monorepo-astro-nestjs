import {
  Global,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PrismaClient } from '@workspace-starter/db' with {
  'resolution-mode': 'import',
};

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client!: PrismaClient;

  get db(): PrismaClient {
    return this.client;
  }

  async onModuleInit() {
    const { prisma } = await import('@workspace-starter/db');
    this.client = prisma;
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
