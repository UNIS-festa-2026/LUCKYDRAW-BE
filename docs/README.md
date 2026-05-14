# UNIS Festival Docs

## 설계 문서

| 문서 | 내용 |
| --- | --- |
| [Architecture](./architecture.md) | 전체 시스템 구성, 구성 요소 역할, 핵심 설계 원칙 |
| [Supabase Data Model](./supabase-data-model.md) | PostgreSQL 테이블, 컬럼, 제약 조건, 관계 |
| [Supabase Storage](./supabase-storage.md) | `coupon-signatures` bucket, 서명 이미지 저장 흐름, URL 정책 |
| [Google Sheets Sync](./google-sheets-sync.md) | Sheets 탭 매핑, 컬럼, 동기화 정책 |
| [API Spec](./api-spec.md) | 럭키드로우, 쿠폰 조회, 쿠폰 사용 완료 API 상세 명세 |
| [Backend Decisions](./backend-decisions.md) | NestJS 구현 기준, 선착순 당첨 정책, 중복 응모, Sheets 연동 결정사항 |
| [Backend Implementation](./backend-implementation.md) | 구현된 백엔드 범위, 실행 전 연결값, 검증 방법 |
