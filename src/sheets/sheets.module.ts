import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SheetsService } from './sheets.service';

@Module({
  imports: [DatabaseModule],
  providers: [SheetsService],
  exports: [SheetsService],
})
export class SheetsModule {}
