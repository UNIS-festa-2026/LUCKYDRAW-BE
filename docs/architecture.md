# UNIS Festival Architecture

## 개요

UNIS Festival 서비스는 럭키드로우 응모, 당첨 결과 확정, 당첨자 정보 수집, 부스 쿠폰 사용 처리를 제공한다. 백엔드는 NestJS로 구현한다.

Supabase PostgreSQL을 원본 데이터 저장소로 사용하고, Supabase Storage는 운영자 서명 이미지 저장소로 사용한다. Google Sheets는 운영자가 상태를 확인하기 위한 관리용 시트이며, 실제 서비스 상태 판단은 항상 Supabase DB를 기준으로 한다.

```text
Frontend
-> Backend API
-> Supabase PostgreSQL
-> Supabase Storage

Backend API
-> NestJS Sync Logic
-> Google Sheets
```

## 구성 요소

| 구성 | 역할 |
| --- | --- |
| Frontend | 화면 표시, 송금 완료 요청, 결과 조회, 당첨자 정보 입력, 쿠폰 서명 전송 |
| Backend API | 응모 생성, 결과 확정, 재고 차감, 당첨자 정보 저장, 쿠폰 사용 처리 |
| Supabase PostgreSQL | 실제 데이터 저장소 |
| Supabase Storage | 부스 운영자 서명 이미지 저장 |
| Google Sheets | 운영자가 응모, 당첨자, 쿠폰 상태를 확인하는 관리용 시트 |
| NestJS Sync Logic | Supabase 데이터를 Google Sheets로 동기화 |

## 핵심 원칙

1. 결과는 `lucky_draw_entries`에 고정 저장한다.
2. 결과 조회 시 새로 랜덤을 실행하지 않는다.
3. 상품 재고는 `prizes.remaining_quantity`로 관리한다.
4. 쿠폰 현재 상태는 `coupons.status`로 관리한다.
5. 쿠폰 사용 이력은 `coupon_redemptions`에 별도로 남긴다.
6. 운영자 서명 이미지는 Supabase Storage에 저장하고 DB에는 URL만 저장한다.
7. Google Sheets는 운영자 확인용이며 원본 데이터가 아니다.
8. Google Sheets 동기화 실패는 사용자 플로우를 막지 않는다.

## 관련 문서

- [Supabase 데이터 모델](./supabase-data-model.md)
- [Supabase Storage 설계](./supabase-storage.md)
- [Google Sheets 동기화 설계](./google-sheets-sync.md)
- [API 상세 명세](./api-spec.md)
- [백엔드 구현 결정사항](./backend-decisions.md)
