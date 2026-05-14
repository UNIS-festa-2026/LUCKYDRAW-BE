# Backend Implementation Decisions

## 백엔드 스택

- Framework: NestJS
- Database: Supabase PostgreSQL
- Storage: Supabase Storage
- Google Sheets sync: NestJS 백엔드에서 직접 구현

## 당첨 정책

MVP에서는 KST 기준 매일 선착순 100명을 100% 당첨 처리하고, 이후 응모자는 랜덤 당첨으로 처리한다. 당첨된 응모 안에서 상품은 가중치 기반으로 랜덤 배정한다.

```text
1. 당일 WIN 응모 수 확인
2. 당일 WIN 응모 수가 100명 미만이면 WIN 확정
3. 당일 WIN 응모 수가 100명 이상이면 RANDOM_WIN_RATE 기준으로 WIN/LOSE 결정
4. WIN이면 상품 선택: prizes.probability_weight 기준
5. 선택 가능한 상품이 없으면 선착순 구간은 PRIZE_SOLD_OUT, 랜덤 구간은 LOSE
6. 당첨 확정 시 prizes.remaining_quantity 1 차감
```

기본값:

| 항목 | 값 |
| --- | --- |
| 일일 100% 당첨 인원 | `100명` |
| 선착순 이후 랜덤 당첨 확률 | `20%` |
| 상품 선택 방식 | `remaining_quantity > 0`, `is_active = true` 상품 중 weighted random |
| 재고 없음 | `PRIZE_SOLD_OUT` |
| 일일 선착순 인원 조정 위치 | `LUCKY_DRAW_DAILY_WINNER_LIMIT` 환경변수 |
| 선착순 이후 랜덤 확률 조정 위치 | `LUCKY_DRAW_RANDOM_WIN_RATE_AFTER_LIMIT` 환경변수 |

선착순 잔여 인원은 `lucky_draw_entries.result = WIN`인 당일 응모 수를 기준으로 계산한다. 선착순 100명 이후에도 응모는 가능하며, 랜덤 당첨에 실패한 응모는 `LOSE`로 저장한다.

이 방식은 홈 화면에서 "100% 당첨 N명 남음" 문구를 실시간으로 표시하기 쉽고, 상품별 노출 비율은 `probability_weight`로 조정할 수 있다.

예시:

```text
DAILY_WINNER_LIMIT = 100
RANDOM_WIN_RATE_AFTER_LIMIT = 0.2

상품 A probability_weight = 5
상품 B probability_weight = 3
상품 C probability_weight = 2

당일 WIN 응모 수가 100명 미만이면 WIN으로 확정한다.
당일 WIN 응모 수가 100명 이상이면 20% 확률로 WIN/LOSE를 결정한다.
상품은 A:B:C = 5:3:2 비율로 선택한다.
```

## 중복 응모 기준

중복 응모 방지는 프론트엔드와 백엔드가 모두 처리해야 한다.

프론트엔드는 버튼 중복 클릭을 막아 사용자 경험을 정리하고, 백엔드는 실제 데이터 중복 생성을 막는 최종 방어선 역할을 한다.

MVP 추천 정책:

- 프론트엔드: 송금 완료 버튼 클릭 직후 버튼 비활성화
- 백엔드: `session_id` 기준 최근 5초 이내 생성 요청이 있으면 `DUPLICATE_ENTRY` 반환
- 하루 응모 제한은 두지 않음

더 엄격한 구현이 필요하면 `Idempotency-Key` 헤더를 추가할 수 있다. MVP에서는 프론트 중복 클릭 방지와 서버의 짧은 시간 중복 차단으로 충분하다.

## Google Sheets 연동 위치

Google Sheets 연동은 n8n을 사용하지 않고 NestJS 백엔드에서 직접 Google Sheets API를 호출해 구현한다.

다만 사용자 응답을 막지 않도록 Supabase 저장 성공 후 비동기 작업으로 처리하는 것을 권장한다.

추천 구조:

```text
API 요청
-> Supabase DB transaction 성공
-> 사용자에게 성공 응답
-> NestJS background job 또는 queue에서 Google Sheets sync 실행
-> 실패 시 로그 저장 및 재시도
```

NestJS 직접 연동 시 Google API 인증, 재시도, quota 처리를 백엔드 코드에서 관리해야 한다. 단, Google Sheets 동기화 실패는 API 실패로 처리하지 않는다.

## 부스 쿠폰 row 배정 방식

`BOOTH_COUPON` 상품은 쿠폰 row를 미리 만들어두고, 당첨 시 사용 가능한 쿠폰 하나를 배정하는 방식을 사용한다.

여기서 "미리 만들어둔 row"는 `coupons` 테이블에 실제 쿠폰 데이터를 사전에 저장해둔다는 뜻이다.

예시:

| coupon_id | token | prize_id | title | status |
| --- | --- | --- | --- | --- |
| coupon-1 | random-token-1 | booth-prize-1 | 1000원 할인권 | `AVAILABLE` |
| coupon-2 | random-token-2 | booth-prize-1 | 1000원 할인권 | `AVAILABLE` |
| coupon-3 | random-token-3 | booth-prize-1 | 1000원 할인권 | `AVAILABLE` |

동작 흐름:

```text
BOOTH_COUPON 상품 당첨
-> 해당 prize_id에 연결된 AVAILABLE 쿠폰 1개 선택
-> 쿠폰을 당첨 응모에 연결하거나 배정 상태로 변경
-> 사용자에게 coupon token 또는 coupon URL 제공
-> 실제 사용 시 POST /api/coupons/{couponId}/redeem
-> coupons.status = USED 처리
```

이 방식은 쿠폰 수량, URL token, 사용 가능 부스/메뉴를 운영 전에 검수할 수 있고, 당첨 시 새 쿠폰을 생성하는 것보다 운영자가 Sheets에서 확인하기 쉽다.

배정된 쿠폰을 다시 다른 당첨자에게 주지 않도록 `coupons.status`에 `ASSIGNED`를 추가하고, `assigned_entry_id`, `assigned_at`을 저장한다.

## 서명 이미지 정책

운영자가 Google Sheets에서 서명 이미지를 볼 필요가 없다면 `signature_image_url`을 Sheets에 표시하지 않아도 된다.

추천:

- Storage bucket은 public이 아니어도 된다.
- DB에는 `signature_image_url` 또는 storage object path를 저장한다.
- 쿠폰 재진입 시 백엔드가 필요한 경우 signed URL을 발급해서 응답한다.
- Sheets에는 쿠폰 사용 여부와 사용 시각만 표시한다.

MVP에서 구현을 단순화하려면 public URL 저장도 가능하지만, Sheets 확인 요구가 없다면 비공개 bucket + signed URL이 더 적절하다.

## 확정된 추가 정책

1. 서명 이미지 bucket은 private으로 두고 signed URL을 발급한다.
2. 쿠폰 배정 상태 관리를 위해 `coupons.status = ASSIGNED`를 사용한다.
3. 배정 추적을 위해 `coupons.assigned_entry_id`, `coupons.assigned_at`을 사용한다.
