import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SignatureStorageModule } from '../storage/signature-storage.module';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [DatabaseModule, SignatureStorageModule],
  controllers: [CouponsController],
  providers: [CouponsService],
})
export class CouponsModule {}
