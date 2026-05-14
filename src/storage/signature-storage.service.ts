import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../config/app.config';

@Injectable()
export class SignatureStorageService {
  private readonly bucket: string;
  private readonly supabase: SupabaseClient;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.bucket = configService.get('signatureBucket', { infer: true });
    this.supabase = createClient(
      configService.get('supabaseUrl', { infer: true }),
      configService.get('supabaseServiceRoleKey', { infer: true }),
      { auth: { persistSession: false } },
    );
  }

  async uploadSignature(couponId: string, dataUrl: string): Promise<string> {
    const buffer = this.parsePngDataUrl(dataUrl);
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const path = `coupons/${couponId}/${timestamp}.png`;

    const { error } = await this.supabase.storage.from(this.bucket).upload(path, buffer, {
      contentType: 'image/png',
      upsert: false,
    });

    if (error) {
      throw error;
    }

    return path;
  }

  async createSignedUrl(path: string, expiresInSeconds = 5 * 60): Promise<string> {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error) {
      throw error;
    }
    return data.signedUrl;
  }

  parsePngDataUrl(dataUrl: string): Buffer {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      throw new Error('INVALID_SIGNATURE_IMAGE');
    }
    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length === 0 || buffer.length > 1024 * 1024) {
      throw new Error('INVALID_SIGNATURE_IMAGE');
    }
    return buffer;
  }
}
