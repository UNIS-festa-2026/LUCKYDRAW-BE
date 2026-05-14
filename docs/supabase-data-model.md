# Supabase Data Model

## 전체 테이블

| 테이블명 | 역할 |
| --- | --- |
| `lucky_draw_entries` | 럭키드로우 응모 기록 및 당첨/꽝 결과 저장 |
| `prizes` | 럭키드로우 상품 정보 및 재고 관리 |
| `winner_infos` | 당첨자 이름, 전화번호, 후기 저장 |
| `coupons` | 부스 쿠폰 정보 및 사용 상태 관리 |
| `coupon_redemptions` | 쿠폰 사용 이력 및 운영자 서명 기록 |

## `lucky_draw_entries`

사용자가 `송금 완료` 버튼을 누르면 생성되는 응모 기록이다. 응모 생성 시점에 서버에서 당첨/꽝 결과를 확정하고 저장한다.

| column | type | nullable | default | 설명 |
| --- | --- | --- | --- | --- |
| `id` | uuid | N | `gen_random_uuid()` | 응모 ID |
| `session_id` | text | Y |  | 비로그인 사용자 식별용 세션 ID |
| `payment_method` | text | N | `'BANK_TRANSFER'` | 결제 방식 |
| `amount` | int | N | `990` | 응모 금액 |
| `depositor_name` | text | Y |  | 입금자명 |
| `result` | text | N |  | `WIN` / `LOSE` |
| `prize_id` | uuid | Y |  | 당첨 상품 ID. 꽝이면 null |
| `status` | text | N | `'RESULT_CONFIRMED'` | 응모 상태 |
| `payment_verified` | boolean | N | `false` | 운영자 입금 확인 여부 |
| `created_at` | timestamptz | N | `now()` | 응모 생성 시각 |

제약 및 정책:

- `result`는 `WIN`, `LOSE` 중 하나여야 한다.
- `result = WIN`이면 `prize_id`가 있어야 한다.
- `result = LOSE`이면 `prize_id`는 null이어야 한다.
- 결과는 응모 생성 시점에 확정하고 이후 변경하지 않는 것을 원칙으로 한다.
- 자동 송금 검증이 없으므로 `payment_verified`는 운영자 확인용으로 사용한다.
- 하루 응모 제한은 두지 않는다.

## `prizes`

럭키드로우 상품 정보와 재고를 관리한다. 응모 생성 시 당첨으로 확정되면 상품을 선택하고 `remaining_quantity`를 차감한다.

| column | type | nullable | default | 설명 |
| --- | --- | --- | --- | --- |
| `id` | uuid | N | `gen_random_uuid()` | 상품 ID |
| `name` | text | N |  | 상품명 |
| `type` | text | N |  | 상품 유형 |
| `image_url` | text | Y |  | 상품 이미지 URL |
| `total_quantity` | int | N | `0` | 전체 상품 수량 |
| `remaining_quantity` | int | N | `0` | 남은 상품 수량 |
| `probability_weight` | int | N | `1` | 당첨 가중치 |
| `is_active` | boolean | N | `true` | 상품 활성화 여부 |
| `created_at` | timestamptz | N | `now()` | 생성 시각 |

상품 유형:

| 값 | 설명 |
| --- | --- |
| `DIGITAL_COUPON` | 스타벅스, 기프티콘 등 디지털 쿠폰 |
| `BOOTH_COUPON` | 대동제 부스에서 사용하는 현장 쿠폰 |
| `ETC` | 기타 상품 |

제약 및 정책:

- 당첨 확정 시 `remaining_quantity`를 1 차감한다.
- `remaining_quantity <= 0`인 상품은 당첨 후보에서 제외한다.
- `is_active = false`인 상품은 당첨 후보에서 제외한다.
- `probability_weight`가 높을수록 당첨 후보에서 선택될 확률이 높아진다.
- `remaining_quantity`는 `total_quantity`보다 클 수 없다.
- `remaining_quantity`는 0 미만이 될 수 없다.
- 재고 차감은 동시성 문제가 생기지 않도록 서버 로직에서 안전하게 처리한다.

## `winner_infos`

당첨자의 상품 전달 정보를 저장한다. 당첨자가 이름, 전화번호, 한 줄 후기를 입력하면 생성된다.

| column | type | nullable | default | 설명 |
| --- | --- | --- | --- | --- |
| `id` | uuid | N | `gen_random_uuid()` | 당첨자 정보 ID |
| `entry_id` | uuid | N |  | 연결된 응모 ID |
| `name` | text | N |  | 당첨자 이름 |
| `phone` | text | N |  | 상품 전달용 전화번호 |
| `review` | text | N |  | 한 줄 후기 |
| `delivery_status` | text | N | `'PENDING'` | 상품 발송 상태 |
| `created_at` | timestamptz | N | `now()` | 입력 시각 |

상품 발송 상태:

| 값 | 설명 |
| --- | --- |
| `PENDING` | 상품 발송 대기 |
| `SENT` | 상품 발송 완료 |

제약 및 정책:

- `entry_id`는 `lucky_draw_entries.id`를 참조한다.
- `result = WIN`인 응모에 대해서만 등록할 수 있다.
- 하나의 `entry_id`에는 하나의 `winner_infos`만 생성할 수 있다.
- 중복 제출 방지를 위해 `winner_infos.entry_id`는 unique 제약을 둔다.
- 전화번호 형식은 프론트엔드와 백엔드에서 검증하고, 백엔드 저장 시 숫자만 남긴 `01012345678` 형태로 normalize한다.
- `name`은 trim 후 1자 이상 20자 이하로 검증한다.
- `review`는 trim 후 1자 이상 100자 이하로 검증한다.
- 이름과 전화번호는 상품 전달 및 송금 확인 목적으로만 사용한다.
- 후기 노출이 필요하면 별도 동의를 받는다.

개인정보 안내 문구:

```text
입력하신 이름과 전화번호는 상품 전달 및 송금 확인 목적으로만 사용되며, 행사 종료 후 삭제됩니다.
```

후기 노출 안내 문구:

```text
한 줄 후기는 익명 처리 후 서비스 화면에 노출될 수 있습니다.
```

## `coupons`

부스 쿠폰 정보를 저장하고 쿠폰의 현재 사용 상태를 관리한다. 쿠폰은 URL token으로 접근하는 구조를 권장한다.

| column | type | nullable | default | 설명 |
| --- | --- | --- | --- | --- |
| `id` | uuid | N | `gen_random_uuid()` | 내부 쿠폰 ID |
| `token` | text | N |  | URL 접근용 랜덤 토큰 |
| `prize_id` | uuid | Y |  | 연결된 상품 ID |
| `title` | text | N |  | 쿠폰명 |
| `coupon_image_url` | text | Y |  | 쿠폰 이미지 URL |
| `status` | text | N | `'AVAILABLE'` | 쿠폰 상태 |
| `event_name` | text | Y |  | 이벤트명 |
| `booth_name` | text | Y |  | 사용 가능 부스 |
| `menu_name` | text | Y |  | 사용 가능 메뉴 |
| `valid_from` | date | Y |  | 사용 시작일 |
| `valid_until` | date | Y |  | 사용 종료일 |
| `contact_phone` | text | Y |  | 문의 전화번호 |
| `used_at` | timestamptz | Y |  | 사용 완료 시각 |
| `signature_image_url` | text | Y |  | 운영자 서명 이미지 URL |
| `created_at` | timestamptz | N | `now()` | 생성 시각 |

쿠폰 상태:

| 값 | 설명 |
| --- | --- |
| `AVAILABLE` | 사용 가능 |
| `ASSIGNED` | 당첨자에게 배정됨. 아직 현장에서 사용 완료되지는 않음 |
| `USED` | 사용 완료 |
| `EXPIRED` | 만료됨 |

제약 및 정책:

- 쿠폰 URL은 `id`보다 예측 불가능한 `token` 기반 접근을 권장한다.
- 쿠폰 화면 진입 시 `coupon_image_url`을 기준으로 쿠폰 이미지를 표시한다.
- `status = USED`인 쿠폰은 다시 사용할 수 없다.
- `BOOTH_COUPON` 당첨 시 `AVAILABLE` 쿠폰 row 하나를 사전 발급분에서 배정하고 `ASSIGNED`로 변경하는 것을 권장한다.
- `valid_until`이 지난 경우 `EXPIRED`로 처리한다.
- 사용 완료 시 `status = USED`, `used_at`, `signature_image_url`을 저장한다.
- 운영자 서명 이미지는 Supabase Storage에 저장하고 URL만 저장한다.
- 재진입 시 `status = USED`와 `signature_image_url`을 기준으로 사용 완료 화면을 보여준다.
- 쿠폰 화면 진입 시마다 최신 상태를 조회한다.

## `coupon_redemptions`

쿠폰 사용 이력을 저장하는 로그 테이블이다. 쿠폰이 사용 완료될 때마다 사용 기록과 운영자 서명 이미지 URL을 저장한다.

| column | type | nullable | default | 설명 |
| --- | --- | --- | --- | --- |
| `id` | uuid | N | `gen_random_uuid()` | 쿠폰 사용 기록 ID |
| `coupon_id` | uuid | N |  | 사용된 쿠폰 ID |
| `signature_image_url` | text | N |  | 저장된 운영자 서명 이미지 URL |
| `redeemed_at` | timestamptz | N | `now()` | 사용 완료 시각 |

제약 및 정책:

- `coupon_id`는 `coupons.id`를 참조한다.
- 쿠폰 사용 완료 시 반드시 row를 생성한다.
- `signature_image_url`은 Supabase Storage에 저장된 이미지 URL이다.
- 하나의 쿠폰은 원칙적으로 한 번만 사용 가능하다.
- 현재 상태는 `coupons.status`, 이력은 `coupon_redemptions`에서 관리한다.

## 관계

| 관계 | 설명 |
| --- | --- |
| `lucky_draw_entries.prize_id` -> `prizes.id` | 당첨된 응모가 어떤 상품을 받았는지 연결 |
| `winner_infos.entry_id` -> `lucky_draw_entries.id` | 당첨자 정보가 어떤 응모에 대한 것인지 연결 |
| `coupons.prize_id` -> `prizes.id` | 부스 쿠폰이 어떤 상품에서 발급된 것인지 연결 |
| `coupon_redemptions.coupon_id` -> `coupons.id` | 쿠폰 사용 이력이 어떤 쿠폰에 대한 것인지 연결 |

## 구현 메모

- 결과 조회 API는 저장된 `lucky_draw_entries.result`를 반환해야 하며 랜덤 결과를 새로 만들면 안 된다.
- `prizes.type = BOOTH_COUPON`인 상품이 당첨된 경우, 연결된 쿠폰 URL 또는 token을 사용자에게 제공할 수 있다.
- 최종 정책상 별도의 운영자 PIN 또는 `booth_code`는 사용하지 않는다.
