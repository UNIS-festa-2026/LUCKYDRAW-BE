export interface AppConfig {
  port: number;
  databaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  signatureBucket: string;
  luckyDraw: {
    dailyWinnerLimit: number;
    randomWinRateAfterLimit: number;
    amount: number;
    timezone: string;
    openTime: string;
    closeTime: string;
  };
  publicCouponBaseUrl: string;
  googleSheets: {
    spreadsheetId: string;
    serviceAccountEmail: string;
    privateKey: string;
  };
}

export function loadAppConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    databaseUrl: required('DATABASE_URL'),
    supabaseUrl: required('SUPABASE_URL'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    signatureBucket: process.env.SUPABASE_SIGNATURE_BUCKET ?? 'coupon-signatures',
    luckyDraw: {
      dailyWinnerLimit: parseInt(process.env.LUCKY_DRAW_DAILY_WINNER_LIMIT ?? '100', 10),
      randomWinRateAfterLimit: parseFloat(process.env.LUCKY_DRAW_RANDOM_WIN_RATE_AFTER_LIMIT ?? '0.2'),
      amount: parseInt(process.env.LUCKY_DRAW_AMOUNT ?? '990', 10),
      timezone: process.env.LUCKY_DRAW_TIMEZONE ?? 'Asia/Seoul',
      openTime: process.env.LUCKY_DRAW_OPEN_TIME ?? '09:00',
      closeTime: process.env.LUCKY_DRAW_CLOSE_TIME ?? '20:00',
    },
    publicCouponBaseUrl: process.env.PUBLIC_COUPON_BASE_URL ?? '',
    googleSheets: {
      spreadsheetId: required('GOOGLE_SHEETS_SPREADSHEET_ID'),
      serviceAccountEmail: required('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      privateKey: required('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    },
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
