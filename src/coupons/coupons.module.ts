import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SheetsModule } from '../sheets/sheets.module';
import { SignatureStorageModule } from '../storage/signature-storage.module';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [DatabaseModule, SheetsModule, SignatureStorageModule],
  controllers: [CouponsController],
  providers: [CouponsService],
})
export class CouponsModule {}
