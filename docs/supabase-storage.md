# Supabase Storage Design

## `coupon-signatures` bucket

`coupon-signatures` bucket은 부스 운영자 서명 이미지를 저장한다.

쿠폰 사용 완료 시 프론트엔드에서 전달한 Canvas 서명 이미지를 백엔드가 Supabase Storage에 업로드하고, 업로드된 이미지 URL을 `coupons.signature_image_url`과 `coupon_redemptions.signature_image_url`에 저장한다.

| 항목 | 내용 |
| --- | --- |
| bucket name | `coupon-signatures` |
| 저장 대상 | 부스 운영자 서명 이미지 |
| 파일 형식 | PNG |
| 파일 경로 | `coupons/{couponId}/{timestamp}.png` |
| DB 저장 위치 | `coupons.signature_image_url`, `coupon_redemptions.signature_image_url` |
| Google Sheets 표시 위치 | 표시하지 않음 |

## 저장 흐름

```text
Canvas 서명 base64
-> Backend API
-> Supabase Storage 업로드
-> storage object path 또는 signed URL 생성
-> coupons.signature_image_url 저장
-> coupon_redemptions.signature_image_url 저장
-> 쿠폰 재조회 시 필요하면 signed URL 발급
```

## URL 정책

운영자가 Google Sheets에서 서명 이미지를 볼 필요가 없으므로 private bucket과 signed URL 방식을 우선 고려한다.

DB에는 storage object path를 저장한다. 사용 완료된 쿠폰 재진입 시 백엔드가 signed URL을 발급해 `signature_image_url`로 응답한다.

MVP 구현 단순화가 더 중요하면 public URL 방식도 가능하지만, 현재 요구사항에서는 Sheets 표시가 필요 없으므로 public bucket이 필수는 아니다.

## 주의사항

- 서명 이미지는 쿠폰 사용 증빙 성격이 있으므로 접근 범위를 정해야 한다.
- 쿠폰 사용 완료 후 재진입 시 `coupons.signature_image_url`을 기준으로 저장된 서명 상태를 다시 표시한다.
- Storage에는 이미지 파일만 저장한다.
- 쿠폰 사용 상태의 기준은 반드시 `coupons.status`로 판단한다.
- Google Sheets에는 서명 이미지 URL을 표시하지 않는다.
