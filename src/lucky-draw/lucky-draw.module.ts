import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SheetsModule } from '../sheets/sheets.module';
import { LuckyDrawController } from './lucky-draw.controller';
import { LuckyDrawHomeController } from './lucky-draw-home.controller';
import { LuckyDrawService } from './lucky-draw.service';

@Module({
  imports: [DatabaseModule, SheetsModule],
  controllers: [LuckyDrawController, LuckyDrawHomeController],
  providers: [LuckyDrawService],
})
export class LuckyDrawModule {}
