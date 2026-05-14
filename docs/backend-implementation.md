# Backend Implementation Notes

## 구현 상태

NestJS 백엔드 구현이 추가되었다.

구현된 범위:

- 럭키드로우 응모 생성
- 럭키드로우 결과 조회
- 당첨자 정보 등록
- 당첨자 정보 조회
- 부스 쿠폰 조회
- 쿠폰 사용 완료
- Supabase PostgreSQL migration
- Supabase Storage 서명 이미지 업로드 adapter
- Google Sheets 직접 연동용 `sheet_sync_jobs` 기반 sync worker
- 홈 상태 조회 API
- KST 기준 매일 선착순 100명 100% 당첨, 이후 랜덤 당첨 정책
- Swagger UI: `/api-docs`
- 기본 보안 미들웨어: Helmet, request body limit, rate limit

## 실행 전 필요한 연결값

`.env.example`을 기준으로 `.env`를 만든다.

```text
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SIGNATURE_BUCKET=coupon-signatures
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

## Supabase 작업

Project:

```text
name: unis-festa
ref: buxzebgammmyzhqseprp
region: ap-northeast-1
dashboard: https://supabase.com/dashboard/project/buxzebgammmyzhqseprp
```

완료:

1. `migrations/001_initial_schema.sql`을 Supabase PostgreSQL에 적용했다.
2. `coupon-signatures` bucket을 private으로 생성했다.
3. 로컬 프로젝트를 Supabase project에 link했다.
4. public 테이블 RLS를 활성화하고 `anon`, `authenticated` 직접 접근 권한을 제거했다.

남은 작업:

1. `.env` 실제 값을 입력한다.
2. `prizes` 초기 데이터를 넣는다.
3. `BOOTH_COUPON` 상품용 `coupons` row를 사전에 생성한다.
4. Google Sheets service account를 연결한다.
5. 실제 API smoke test를 실행한다.

## Google Sheets 작업

NestJS 백엔드가 Google Sheets API를 직접 호출한다.

필요 작업:

1. Google Sheets API 활성화
2. Service Account 생성
3. Service Account JSON key 발급
4. Google Sheet에 service account email 편집 권한 공유
5. `.env`에 spreadsheet id, service account email, private key 입력

## 검증

```bash
npm install
npm run typecheck
npm run build
```

현재 구현은 `npm run typecheck`와 `npm run build`를 통과한다.

Swagger 확인:

```text
GET /api-docs
```

## 서버 배포 기준

이 백엔드는 일반 NestJS 서버로 배포한다.

권장 배포 환경:

- Render
- Railway
- Fly.io
- Cloud Run

기본 명령:

```text
Build Command: npm ci && npm run build
Start Command: npm run start
```

Vercel serverless 배포는 사용하지 않는다. DB connection pool, transaction, Google Sheets sync job을 사용하는 구조이므로 상시 Node 서버 런타임이 더 적합하다.

## Render 배포

`render.yaml`을 포함한다. Render Dashboard에서 GitHub repo를 연결하고 Blueprint 또는 Web Service로 배포한다.

Free plan으로 시작할 수 있지만, Free web service는 idle 상태에서 sleep될 수 있다.

필수 secret env:

```text
DATABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PUBLIC_COUPON_BASE_URL
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
```

## 주의

- 실제 Supabase, Storage, Google Sheets API 호출은 연결값 설정 후 실행한다.
- Google Sheets sync 실패는 API 실패로 처리하지 않고 `sheet_sync_jobs`에 실패 상태로 남긴다.
- 쿠폰 서명 이미지는 DB에 object path를 저장하고, 조회 응답에서 signed URL 발급을 시도한다.
