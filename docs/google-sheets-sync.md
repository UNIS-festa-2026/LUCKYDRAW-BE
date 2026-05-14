# Google Sheets Sync Design

## 역할

Google Sheets는 실제 DB가 아니라 운영자 확인용 관리 시트다.

응모 결과 확정, 상품 재고 차감, 쿠폰 사용 상태 변경, 서명 저장 여부 판단은 모두 Supabase DB 기준으로 처리한다.

## 탭 매핑

| Supabase 테이블 | Google Sheet 탭 | 동기화 방식 | 용도 |
| --- | --- | --- | --- |
| `lucky_draw_entries` | `entries` | insert 시 row append | 응모 내역, 당첨/꽝 결과, 입금 확인 여부 확인 |
| `winner_infos` | `winner_infos` | insert 시 row append | 당첨자 이름, 전화번호, 한 줄 후기, 상품 발송 상태 확인 |
| `prizes` | `prizes` | insert/update 시 row upsert 또는 update | 상품 목록, 총 수량, 남은 수량, 활성화 여부 확인 |
| `coupons` | `coupons` | insert/update 시 row upsert 또는 update | 쿠폰 이미지, 쿠폰 상태, 사용 완료 시각 확인 |
| `coupon_redemptions` | `coupon_redemptions` | insert 시 row append | 쿠폰 사용 이력, 사용 완료 시각 확인 |

## `entries` 탭

| column | 설명 |
| --- | --- |
| `entry_id` | 응모 ID |
| `session_id` | 비로그인 사용자 식별용 세션 ID |
| `amount` | 응모 금액 |
| `depositor_name` | 입금자명 |
| `result` | `WIN` / `LOSE` |
| `prize_id` | 당첨 상품 ID |
| `payment_verified` | 운영자 입금 확인 여부 |
| `created_at` | 응모 생성 시각 |

## `winner_infos` 탭

| column | 설명 |
| --- | --- |
| `winner_info_id` | 당첨자 정보 ID |
| `entry_id` | 연결된 응모 ID |
| `name` | 당첨자 이름 |
| `phone` | 전화번호 |
| `review` | 한 줄 후기 |
| `delivery_status` | `PENDING` / `SENT` |
| `created_at` | 입력 시각 |

## `prizes` 탭

| column | 설명 |
| --- | --- |
| `prize_id` | 상품 ID |
| `name` | 상품명 |
| `type` | `DIGITAL_COUPON` / `BOOTH_COUPON` / `ETC` |
| `image_url` | 상품 이미지 URL |
| `total_quantity` | 전체 상품 수량 |
| `remaining_quantity` | 남은 상품 수량 |
| `probability_weight` | 당첨 가중치 |
| `is_active` | 활성화 여부 |
| `created_at` | 생성 시각 |

## `coupons` 탭

| column | 설명 |
| --- | --- |
| `coupon_id` | 쿠폰 ID |
| `token` | URL 접근용 랜덤 토큰 |
| `prize_id` | 연결된 상품 ID |
| `title` | 쿠폰명 |
| `coupon_image_url` | 쿠폰 이미지 URL |
| `status` | `AVAILABLE` / `USED` / `EXPIRED` |
| `booth_name` | 사용 가능 부스 |
| `menu_name` | 사용 가능 메뉴 |
| `valid_until` | 사용 종료일 |
| `used_at` | 사용 완료 시각 |

## `coupon_redemptions` 탭

| column | 설명 |
| --- | --- |
| `redemption_id` | 쿠폰 사용 기록 ID |
| `coupon_id` | 사용된 쿠폰 ID |
| `redeemed_at` | 사용 완료 시각 |

## 동기화 정책

1. Supabase를 원본 데이터로 사용한다.
2. `POST /api/lucky-draw/entries` 성공 후 `entries` 탭에 append한다.
3. `POST /api/lucky-draw/entries/{entryId}/winner-info` 성공 후 `winner_infos` 탭에 append한다.
4. 당첨 확정으로 `remaining_quantity`가 차감되면 `prizes` 탭의 해당 row를 업데이트한다.
5. 쿠폰 사용 완료로 `status = USED`, `used_at`이 저장되면 `coupons` 탭의 해당 row를 업데이트한다.
6. `POST /api/coupons/{couponId}/redeem` 성공 후 `coupon_redemptions` 탭에 append한다.
7. Google Sheets 동기화 실패가 사용자 플로우를 막으면 안 된다.
8. Supabase 저장이 성공했다면 사용자에게는 성공 응답을 반환하고, Sheets 동기화 실패는 재시도 또는 운영 로그로 관리한다.
9. n8n 없이 NestJS에서 Google Sheets API를 직접 호출해 동기화한다.
10. NestJS 직접 연동 시 API 응답 이후 background job 또는 queue에서 비동기로 처리한다.

## 운영 기준

- 운영자가 Google Sheets에서 값을 확인할 수는 있지만, 서비스 상태 변경은 Supabase DB에서만 처리한다.
- Sheets 컬럼은 DB 컬럼 변경과 함께 관리한다.
- `coupons` 탭에는 `coupon_image_url`을 포함한다.
- 운영자가 Sheets에서 서명 이미지를 확인하지 않는 정책이면 `signature_image_url`은 Sheets에 포함하지 않는다.
- `coupon_redemptions` 탭에는 `booth_code`를 포함하지 않는다.
