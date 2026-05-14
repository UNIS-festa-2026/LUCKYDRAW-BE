import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
import { PoolClient } from 'pg';
import { AppConfig } from '../config/app.config';
import { DatabaseService } from '../database/database.service';

type SheetOperation = 'APPEND' | 'UPSERT' | 'UPDATE';

interface EnqueueJobInput {
  targetTab: string;
  operation: SheetOperation;
  dedupeKey?: string;
  payload: Record<string, unknown>;
}

interface SheetSyncJobRow {
  id: string;
  target_tab: string;
  operation: SheetOperation;
  payload: Record<string, unknown>;
  attempts: number;
}

@Injectable()
export class SheetsService {
  private readonly logger = new Logger(SheetsService.name);
  private readonly spreadsheetId: string;
  private readonly authClient: JWT;

  constructor(
    private readonly database: DatabaseService,
    configService: ConfigService<AppConfig, true>,
  ) {
    const config = configService.get('googleSheets', { infer: true });
    this.spreadsheetId = config.spreadsheetId;
    this.authClient = new JWT({
      email: config.serviceAccountEmail,
      key: config.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  async enqueueJob(client: PoolClient, input: EnqueueJobInput) {
    await client.query(
      `
        insert into sheet_sync_jobs (target_tab, operation, dedupe_key, payload)
        values ($1, $2, $3, $4::jsonb)
        on conflict (dedupe_key) where dedupe_key is not null do nothing
      `,
      [
        input.targetTab,
        input.operation,
        input.dedupeKey ?? null,
        JSON.stringify(input.payload),
      ],
    );
  }

  async processPendingJobs(limit = 20) {
    const jobs = await this.database.transaction(async (client) => {
      const result = await client.query<SheetSyncJobRow>(
        `
          select id, target_tab, operation, payload, attempts
          from sheet_sync_jobs
          where status in ('PENDING', 'FAILED') and attempts < 5
          order by created_at
          for update skip locked
          limit $1
        `,
        [limit],
      );

      if (result.rows.length) {
        await client.query(
          `
            update sheet_sync_jobs
            set status = 'PROCESSING', updated_at = now()
            where id = any($1::uuid[])
          `,
          [result.rows.map((job) => job.id)],
        );
      }

      return result.rows;
    });

    for (const job of jobs) {
      await this.processJob(job);
    }
  }

  private async processJob(job: SheetSyncJobRow) {
    try {
      await this.writeJobToSheet(job);
      await this.database.query(
        `
          update sheet_sync_jobs
          set status = 'SUCCEEDED', attempts = attempts + 1, last_error = null, updated_at = now()
          where id = $1
        `,
        [job.id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Google Sheets sync failed for job ${job.id}: ${message}`);
      await this.database.query(
        `
          update sheet_sync_jobs
          set status = 'FAILED', attempts = attempts + 1, last_error = $2, updated_at = now()
          where id = $1
        `,
        [job.id, message],
      );
    }
  }

  private async writeJobToSheet(job: SheetSyncJobRow) {
    const sheets = google.sheets({ version: 'v4', auth: this.authClient });
    const values = [this.payloadToRow(job.payload)];

    // MVP sync writes rows in append-only form. UPDATE/UPSERT jobs include latest IDs
    // in the row so operators can filter the most recent record if needed.
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${job.target_tab}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
  }

  private payloadToRow(payload: Record<string, unknown>): string[] {
    return Object.values(payload).map((value) => {
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
  }
}
