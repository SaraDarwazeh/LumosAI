import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global() makes PrismaService available across all modules
 * without needing to import DatabaseModule in each one.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
