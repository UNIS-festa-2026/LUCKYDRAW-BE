import { Module } from '@nestjs/common';
import { SignatureStorageService } from './signature-storage.service';

@Module({
  providers: [SignatureStorageService],
  exports: [SignatureStorageService],
})
export class SignatureStorageModule {}
