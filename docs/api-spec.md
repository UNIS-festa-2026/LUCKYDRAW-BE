# API 상세 명세

## 공통 원칙

- 실제 서비스 상태 판단은 Supabase DB 기준으로 처리한다.
- Google Sheets 동기화 실패가 사용자 플로우를 막으면 안 된다.
- Google Sheets 동기화는 NestJS에서 직접 구현하며, API 응답 이후 비동기로 처리한다.
- 응모 결과 조회 API는 랜덤 결과를 새로 생성하지 않는다.
- 쿠폰 화면은 프론트 상태만 믿지 않고 진입 시마다 서버 상태를 조회한다.
- API 문서상 `{couponId}`라고 표현하더라도 실제 구현에서는 예측 불가능한 `token` 사용을 권장한다.
- 프론트엔드가 중복 클릭을 막더라도, 백엔드가 최종적으로 중복 요청을 방어한다.

## API 목록

| 기능 | Method | Path |
| --- | --- | --- |
| 홈 상태 조회 | `GET` | `/api/lucky-draw/home-status` |
| 럭키드로우 응모 생성 | `POST` | `/api/lucky-draw/entries` |
| 럭키드로우 결과 조회 | `GET` | `/api/lucky-draw/entries/{entryId}/result` |
| 당첨자 정보 등록 | `POST` | `/api/lucky-draw/entries/{entryId}/winner-info` |
| 당첨자 정보 조회 | `GET` | `/api/lucky-draw/entries/{entryId}/winner-info` |
| 부스 쿠폰 조회 | `GET` | `/api/coupons/{couponId}` |
| 쿠폰 사용 완료 | `POST` | `/api/coupons/{couponId}/redeem` |

## 홈 상태 조회

- 홈 화면에서 실시간 선착순 당첨 잔여 인원과 문구를 조회한다.
- 매일 선착순 100명은 100% 당첨이며, 이후 응모자는 랜덤 당첨으로 처리된다.
- 당첨된 응모 안에서 상품은 랜덤으로 배정된다.

### Request

```json
{
  "method": "GET",
  "url": "/api/lucky-draw/home-status"
}
```

### Response(success)

```json
// HTTP 200 OK
{
  "daily_winner_limit": 100,
  "used_winner_slots": 10,
  "remaining_winner_slots": 90,
  "guaranteed_win_available": true,
  "random_available": false,
  "random_win_rate_after_limit": 0.2,
  "is_open": true,
  "popup_text": "100% 당첨 90명 남음!",
  "hero_title": "단돈 990원으로 상품타자!",
  "hero_subtitle": "400개 이상의 상품이 준비되어 있다고..?",
  "speech_bubble_text": "욜영, 치킨, 베라, 떡볶이, 커피.. 대동제 부스 쿠폰까지 준다구?!",
  "cta_text": "응모하기",
  "server_time": "2026-05-04T20:30:00+09:00"
}
```

### Response(success) - 선착순 100명 소진 후 랜덤 당첨 구간

```json
// HTTP 200 OK
{
  "daily_winner_limit": 100,
  "used_winner_slots": 100,
  "remaining_winner_slots": 0,
  "guaranteed_win_available": false,
  "random_available": true,
  "random_win_rate_after_limit": 0.2,
  "is_open": true,
  "popup_text": "선착순 100% 당첨 마감! 지금부터 랜덤 당첨",
  "hero_title": "단돈 990원으로 상품타자!",
  "hero_subtitle": "400개 이상의 상품이 준비되어 있다고..?",
  "speech_bubble_text": "욜영, 치킨, 베라, 떡볶이, 커피.. 대동제 부스 쿠폰까지 준다구?!",
  "cta_text": "응모하기",
  "server_time": "2026-05-04T20:30:00+09:00"
}
```

### 기타 설명

- 홈 화면 진입 시 이 API를 호출해 선착순 잔여 인원을 표시한다.
- `remaining_winner_slots`는 KST 기준 당일 `WIN` 처리된 응모 수를 기준으로 계산한다.
- `guaranteed_win_available = true`이면 선착순 100% 당첨 가능 상태이다.
- `guaranteed_win_available = false`이고 `random_available = true`이면 선착순 100% 당첨은 마감됐지만 랜덤 당첨 응모는 가능한 상태이다.
- `random_win_rate_after_limit`는 선착순 100명 이후 적용되는 랜덤 당첨 확률이다.
- 프론트는 `popup_text`를 실시간 인원수 팝업 알림에 사용한다.
- 프론트는 `hero_title`, `hero_subtitle`, `speech_bubble_text`를 홈 화면 문구에 사용한다.
- 최종 응모 가능 여부는 `POST /api/lucky-draw/entries`에서 다시 검증한다.

## 럭키드로우 응모 생성

- 송금 완료 버튼 클릭 시 응모를 생성한다.
- KST 기준 매일 선착순 100명은 100% 당첨이다.
- 선착순 100명 이후 응모자는 랜덤 당첨으로 처리된다.
- 당첨된 응모 안에서 상품만 랜덤으로 배정한다.

### Request

```json
{
  "method": "POST",
  "url": "/api/lucky-draw/entries",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "payment_method": "BANK_TRANSFER",
    "amount": 990,
    "depositor_name": "홍휘민",
    "session_id": "session-uuid-1"
  }
}
```

### Response(success)

```json
{
  "entry_id": "entry-uuid-1",
  "status": "RESULT_CONFIRMED",
  "amount": 990,
  "result": "WIN",
  "created_at": "2026-05-04T20:30:00+09:00",
  "next_action": "SHOW_RESULT_LOADING"
}
```

HTTP status: `201 Created`

### Response(error)

```json
{
  "error": "INVALID_AMOUNT",
  "message": "응모 금액이 올바르지 않습니다."
}
```

HTTP status: `400 Bad Request`

```json
{
  "error": "LUCKY_DRAW_CLOSED",
  "message": "현재 응모 가능 시간이 아닙니다."
}
```

HTTP status: `403 Forbidden`

```json
{
  "error": "DUPLICATE_ENTRY",
  "message": "이미 처리 중인 응모가 있습니다."
}
```

HTTP status: `409 Conflict`

```json
{
  "error": "PRIZE_SOLD_OUT",
  "message": "남은 상품이 없습니다."
}
```

HTTP status: `409 Conflict`

### 정책

- 운영 시간은 `09:00~20:00`이다.
- 프론트 접근 제한과 별개로 서버에서도 운영 시간을 검증한다.
- 하루 응모 횟수 제한은 따로 두지 않는다.
- 중복 응모 방지는 프론트엔드 버튼 비활성화와 별개로 백엔드에서 최종 처리한다.
- MVP에서는 `session_id` 기준 최근 5초 이내 응모 생성 요청이 있으면 `DUPLICATE_ENTRY`를 반환한다.
- `송금 완료` 버튼 클릭 시 결과를 즉시 확정한다.
- 결과는 `lucky_draw_entries`에 저장되며, 이후 재조회 시 동일한 결과를 반환해야 한다.
- 송금 자동 검증은 하지 않는다.
- 당첨 상품 발송 전 운영자가 Supabase 또는 Google Sheets에서 입금 내역을 수동 확인한다.
- `payment_verified` 기본값은 `false`로 저장한다.
- 당첨 결과 확정 시 `prizes.remaining_quantity`를 1 차감한다.
- KST 기준 매일 선착순 100명은 100% 당첨이다.
- 선착순 잔여 인원은 `lucky_draw_entries.result = WIN`인 당일 응모 수를 기준으로 계산한다.
- 선착순 100명 이후 응모자는 `LUCKY_DRAW_RANDOM_WIN_RATE_AFTER_LIMIT` 기준으로 랜덤 당첨 처리한다.
- 랜덤 당첨에 실패하면 `result = LOSE`로 응모를 저장한다.
- 당첨된 응모 안에서 상품은 `remaining_quantity > 0`, `is_active = true` 상품 중 `probability_weight` 기반으로 랜덤 선택한다.
- 선택 가능한 상품이 없으면 `PRIZE_SOLD_OUT`을 반환한다.
- 성공 시 프론트는 결과 로딩 화면으로 이동한 뒤 `GET /api/lucky-draw/entries/{entryId}/result`를 호출한다.

## 럭키드로우 결과 조회

응모 ID 기준으로 확정된 당첨/꽝 결과를 조회한다.

### Request

```json
{
  "method": "GET",
  "url": "/api/lucky-draw/entries/{entryId}/result",
  "path_parameters": {
    "entryId": "entry-uuid-1"
  }
}
```

### Response(success) - 꽝

```json
{
  "entry_id": "entry-uuid-1",
  "result": "LOSE",
  "title": "아쉽지만 다음 기회에..",
  "message": "매일 9시~20시 동안 도전할 수 있어요!",
  "retry_available": true,
  "share_url": "https://example.com/lucky-draw"
}
```

HTTP status: `200 OK`

### Response(success) - 당첨

```json
{
  "entry_id": "entry-uuid-1",
  "result": "WIN",
  "title": "당첨!!",
  "prize": {
    "prize_id": "prize-001",
    "type": "DIGITAL_COUPON",
    "name": "스타벅스 5000원 쿠폰",
    "image_url": "https://example.com/images/starbucks-coupon.png",
    "delivery_type": "MANUAL_SEND"
  },
  "winner_info_required": true,
  "next_action": "INPUT_WINNER_INFO"
}
```

HTTP status: `200 OK`

### Response(error)

```json
{
  "error": "ENTRY_NOT_FOUND",
  "message": "응모 내역을 찾을 수 없습니다."
}
```

HTTP status: `404 Not Found`

```json
{
  "error": "RESULT_NOT_CONFIRMED",
  "message": "아직 결과가 확정되지 않았습니다."
}
```

HTTP status: `409 Conflict`

### 정책

- 결과 조회 API에서는 새로 랜덤 결과를 생성하지 않는다.
- `lucky_draw_entries.result`에 저장된 값을 그대로 반환한다.
- `result = LOSE`이면 꽝 화면을 표시한다.
- `result = WIN`이면 당첨 화면을 표시한다.
- 당첨인 경우 `prize` 객체를 포함한다.
- 프론트는 `prize.image_url`, `prize.name`을 당첨 화면에 표시한다.
- 당첨 화면에서 입력 완료 클릭 시 `POST /api/lucky-draw/entries/{entryId}/winner-info`를 호출한다.
- 새로고침 또는 재접근 시에도 동일한 결과를 보여줘야 한다.

## 당첨자 정보 등록

당첨자가 상품 전달을 위한 이름, 전화번호, 한 줄 후기를 입력한다.

### Request

```json
{
  "method": "POST",
  "url": "/api/lucky-draw/entries/{entryId}/winner-info",
  "headers": {
    "Content-Type": "application/json"
  },
  "path_parameters": {
    "entryId": "entry-uuid-1"
  },
  "body": {
    "name": "이화벗",
    "phone": "010-1234-5678",
    "review": "한 줄 후기"
  }
}
```

### Request body

| field | type | required | 설명 |
| --- | --- | --- | --- |
| `name` | string | Y | 당첨자 이름 |
| `phone` | string | Y | 상품 전달용 전화번호 |
| `review` | string | Y | 한 줄 후기 |

### Validation

| field | 규칙 | 실패 error |
| --- | --- | --- |
| `name` | trim 후 1자 이상, 20자 이하 | `INVALID_NAME` |
| `phone` | 숫자만 추출해 normalize 후 `010`으로 시작하는 11자리 | `INVALID_PHONE` |
| `review` | trim 후 1자 이상, 100자 이하 | `INVALID_REVIEW` |

전화번호는 저장 전에 숫자만 남긴다.

```text
010-1234-5678 -> 01012345678
010 1234 5678 -> 01012345678
```

### Response(success)

```json
{
  "entry_id": "entry-uuid-1",
  "winner_info_id": "winner-info-uuid-1",
  "name": "이화벗",
  "phone": "01012345678",
  "review": "한 줄 후기",
  "delivery_status": "PENDING",
  "created_at": "2026-05-04T20:45:00+09:00",
  "next_action": "SHOW_DELIVERY_GUIDE"
}
```

HTTP status: `201 Created`

### Response(error)

```json
{
  "error": "INVALID_NAME",
  "message": "이름을 올바르게 입력해주세요."
}
```

HTTP status: `400 Bad Request`

```json
{
  "error": "INVALID_PHONE",
  "message": "전화번호 형식이 올바르지 않습니다."
}
```

HTTP status: `400 Bad Request`

```json
{
  "error": "INVALID_REVIEW",
  "message": "한 줄 후기를 올바르게 입력해주세요."
}
```

HTTP status: `400 Bad Request`

```json
{
  "error": "NOT_WINNER",
  "message": "당첨된 응모가 아닙니다."
}
```

HTTP status: `403 Forbidden`

```json
{
  "error": "ENTRY_NOT_FOUND",
  "message": "응모 내역을 찾을 수 없습니다."
}
```

HTTP status: `404 Not Found`

```json
{
  "error": "WINNER_INFO_ALREADY_SUBMITTED",
  "message": "이미 당첨자 정보가 입력되었습니다."
}
```

HTTP status: `409 Conflict`

### 정책

- `entryId`에 해당하는 응모가 존재해야 한다.
- `lucky_draw_entries.result = WIN`인 응모에 대해서만 등록할 수 있다.
- `result = LOSE`인 응모는 `NOT_WINNER`를 반환한다.
- 하나의 `entry_id`에는 하나의 `winner_infos`만 생성할 수 있다.
- 중복 제출 방지를 위해 `winner_infos.entry_id` unique 제약을 둔다.
- 중복 제출이 발생하면 `WINNER_INFO_ALREADY_SUBMITTED`를 반환한다.
- 저장 시 `delivery_status`는 `PENDING`으로 생성한다.
- 전화번호는 normalize된 `01012345678` 형태로 저장하고 응답한다.
- 성공 후 NestJS sync logic이 Google Sheets `winner_infos` 탭에 append한다.
- Google Sheets 동기화 실패는 등록 API 실패로 처리하지 않는다.
- `WINNER_INFO_ALREADY_SUBMITTED`가 발생하면 프론트는 `GET /api/lucky-draw/entries/{entryId}/winner-info`를 호출해 기존 입력 정보를 조회할 수 있다.
- 개인정보 안내 문구는 프론트에서 함께 노출한다.

## 당첨자 정보 조회

상품 전송 안내 페이지 재진입 시 기존 당첨자 정보 입력 여부를 조회한다. 운영자 전체 조회는 Google Sheets를 기준으로 처리하고, 이 API는 개별 사용자 플로우 복구용으로 사용한다.

### Request

```json
{
  "method": "GET",
  "url": "/api/lucky-draw/entries/{entryId}/winner-info",
  "path_parameters": {
    "entryId": "entry-uuid-1"
  }
}
```

### Response(success) - 입력 완료

```json
{
  "entry_id": "entry-uuid-1",
  "winner_info_id": "winner-info-uuid-1",
  "name": "이화벗",
  "phone": "01012345678",
  "review": "한 줄 후기",
  "delivery_status": "PENDING",
  "created_at": "2026-05-04T20:45:00+09:00"
}
```

HTTP status: `200 OK`

### Response(success) - 미입력

```json
{
  "entry_id": "entry-uuid-1",
  "is_submitted": false,
  "message": "아직 당첨자 정보가 입력되지 않았습니다."
}
```

HTTP status: `200 OK`

### Response(error)

```json
{
  "error": "NOT_WINNER",
  "message": "당첨된 응모가 아닙니다."
}
```

HTTP status: `403 Forbidden`

```json
{
  "error": "ENTRY_NOT_FOUND",
  "message": "응모 내역을 찾을 수 없습니다."
}
```

HTTP status: `404 Not Found`

### 정책

- `entryId`에 해당하는 응모가 존재해야 한다.
- `lucky_draw_entries.result = WIN`인 경우에만 조회 가능하다.
- `winner_infos`에 해당 `entryId`의 데이터가 있으면 입력 완료 상태를 반환한다.
- 아직 입력하지 않은 경우 `is_submitted: false`를 반환한다.
- 전화번호는 저장 시 normalize된 `01012345678` 형태로 반환하는 것을 권장한다.
- `POST /winner-info`에서 `WINNER_INFO_ALREADY_SUBMITTED`가 발생한 경우, 프론트는 이 API를 호출해 이미 입력된 정보를 확인하고 상품 전송 안내 화면으로 이동할 수 있다.

## 부스 쿠폰 조회

쿠폰 링크 진입 시 쿠폰 정보와 현재 상태를 조회한다.

### Request

```json
{
  "method": "GET",
  "url": "/api/coupons/{couponId}",
  "path_parameters": {
    "couponId": "coupon-token-or-uuid"
  }
}
```

### Response(success) - 사용 가능

```json
{
  "coupon_id": "coupon-uuid-1",
  "status": "AVAILABLE",
  "title": "1000원 할인권",
  "coupon_image_url": "https://example.com/coupons/coupon-001.png",
  "event_name": "UNIS IT 창업학회",
  "valid_from": "2026-05-01",
  "valid_until": "2026-05-31",
  "booth_name": "포스고관 옆",
  "menu_name": "김치말이국수",
  "operator_signature_required": true,
  "contact_phone": "010-4550-8535"
}
```

HTTP status: `200 OK`

### Response(success) - 사용 완료

```json
{
  "coupon_id": "coupon-uuid-1",
  "status": "USED",
  "title": "1000원 할인권",
  "coupon_image_url": "https://example.com/coupons/coupon-001.png",
  "used_at": "2026-05-04T20:40:00+09:00",
  "signature_image_url": "https://example.supabase.co/storage/v1/object/public/coupon-signatures/coupons/coupon-uuid-1/20260504.png",
  "message": "이미 사용 완료된 쿠폰입니다.",
  "contact_phone": "010-4550-8535"
}
```

HTTP status: `200 OK`

### Response(success) - 만료

```json
{
  "coupon_id": "coupon-uuid-1",
  "status": "EXPIRED",
  "title": "1000원 할인권",
  "coupon_image_url": "https://example.com/coupons/coupon-001.png",
  "message": "만료된 쿠폰입니다.",
  "contact_phone": "010-4550-8535"
}
```

HTTP status: `200 OK`

### Response(error)

```json
{
  "error": "COUPON_NOT_FOUND",
  "message": "쿠폰을 찾을 수 없습니다."
}
```

HTTP status: `404 Not Found`

### 정책

- `couponId`는 실제 구현 시 UUID보다 예측 불가능한 `token` 사용을 권장한다.
- 쿠폰 URL을 아는 사람이 접근 가능한 구조이므로 `token`은 랜덤 문자열이어야 한다.
- 쿠폰 화면 진입 시마다 이 API를 호출해 최신 상태를 확인한다.
- `status = AVAILABLE`이면 쿠폰 사용 화면을 표시한다.
- `status = AVAILABLE`일 때 프론트는 `coupon_image_url`을 기준으로 쿠폰 이미지를 표시한다.
- `status = USED`이면 쿠폰 사용 완료 화면을 표시한다.
- `status = USED`일 때 `signature_image_url`을 기준으로 저장된 사인 상태를 재표시한다.
- `status = EXPIRED`이면 만료 안내 화면을 표시한다.
- 별도 `redeem-result` API 없이 이 API의 `status`로 화면을 분기한다.
- 캡처본 재사용을 막기 위해 프론트 상태만 믿으면 안 된다.
- `coupon_image_url`은 부스 쿠폰 사용 사이트의 쿠폰 이미지 노출 기능에 필요하다.
- `signature_image_url`은 페이지 새로고침 또는 재진입 시 사인 상태 유지에 필요하다.

## 쿠폰 사용 완료

부스 운영자가 사인 영역에 직접 서명한 뒤 쿠폰을 사용 완료 처리한다.

### Request

```json
{
  "method": "POST",
  "url": "/api/coupons/{couponId}/redeem",
  "headers": {
    "Content-Type": "application/json"
  },
  "path_parameters": {
    "couponId": "coupon-token-or-uuid"
  },
  "body": {
    "signature_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
  }
}
```

### Response(success)

```json
{
  "coupon_id": "coupon-uuid-1",
  "status": "USED",
  "used_at": "2026-05-04T20:40:00+09:00",
  "signature_image_url": "https://example.supabase.co/storage/v1/object/public/coupon-signatures/coupons/coupon-uuid-1/20260504.png",
  "message": "쿠폰 사용이 완료되었습니다."
}
```

HTTP status: `200 OK`

### Response(error)

```json
{
  "error": "SIGNATURE_REQUIRED",
  "message": "운영자 서명이 필요합니다."
}
```

HTTP status: `400 Bad Request`

```json
{
  "error": "INVALID_SIGNATURE_IMAGE",
  "message": "서명 이미지 형식이 올바르지 않습니다."
}
```

HTTP status: `400 Bad Request`

```json
{
  "error": "COUPON_NOT_FOUND",
  "message": "쿠폰을 찾을 수 없습니다."
}
```

HTTP status: `404 Not Found`

```json
{
  "error": "COUPON_ALREADY_USED",
  "message": "이미 사용된 쿠폰입니다."
}
```

HTTP status: `409 Conflict`

```json
{
  "error": "COUPON_EXPIRED",
  "message": "만료된 쿠폰입니다."
}
```

HTTP status: `410 Gone`

```json
{
  "error": "SIGNATURE_UPLOAD_FAILED",
  "message": "서명 이미지 저장에 실패했습니다."
}
```

HTTP status: `502 Bad Gateway`

### 정책

- 별도의 운영자 PIN 또는 `booth_code`는 MVP 범위에서는 사용하지 않는다.
- 사용자가 임의로 서명할 수는 있지만, 실제 혜택 수령은 부스 운영자 앞에서만 가능하므로 현장 확인으로 대응한다.
- 쿠폰 사용 화면 진입 시 먼저 `GET /api/coupons/{couponId}`로 상태를 조회한다.
- `status = AVAILABLE`일 때만 서명 영역과 쿠폰 사용 완료 버튼을 활성화한다.
- 서명이 비어 있으면 쿠폰 사용 완료 버튼을 비활성화한다.
- 쿠폰 사용 완료 버튼 클릭 후 프론트는 즉시 버튼을 비활성화한다.
- API 요청 중 중복 클릭을 막는다.
- 쿠폰 사용 완료 클릭 시 Canvas 서명을 PNG base64로 변환한다.
- 변환된 `signature_image`를 이 API에 전달한다.
- 서버는 서명 이미지를 Supabase Storage에 저장하고, DB에는 `signature_image_url`만 저장한다.
- 서버는 `coupons.status`를 `USED`로 변경한다.
- 서버는 `coupons.used_at`, `coupons.signature_image_url`을 업데이트한다.
- 서버는 `coupon_redemptions`에 사용 이력을 저장한다.
- NestJS sync logic을 통해 Google Sheets `coupons`, `coupon_redemptions` 탭에 동기화한다.
- 이미 사용된 쿠폰에 대해 재요청하면 서버는 `COUPON_ALREADY_USED`를 반환한다.
- 사용 완료된 쿠폰은 재접근 시 `GET /api/coupons/{couponId}`의 `USED` 상태와 `signature_image_url`을 기준으로 사용 완료 화면과 저장된 서명을 보여준다.
- 중복 사용 방지의 핵심은 PIN이 아니라 서버에서 `USED` 상태를 확실히 저장하는 것이다.
