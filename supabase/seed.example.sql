-- Replace sample values before running in production.

insert into prizes (
  id,
  name,
  type,
  image_url,
  total_quantity,
  remaining_quantity,
  probability_weight,
  is_active
) values
  (
    '00000000-0000-0000-0000-000000000101',
    '스타벅스 5000원 쿠폰',
    'DIGITAL_COUPON',
    'https://example.com/images/starbucks-coupon.png',
    10,
    10,
    5,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000201',
    '1000원 할인권',
    'BOOTH_COUPON',
    'https://example.com/images/booth-coupon.png',
    100,
    100,
    10,
    true
  )
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  image_url = excluded.image_url,
  total_quantity = excluded.total_quantity,
  remaining_quantity = excluded.remaining_quantity,
  probability_weight = excluded.probability_weight,
  is_active = excluded.is_active;

-- Generate BOOTH_COUPON coupon rows.
-- Increase generate_series upper bound to the actual coupon count.
insert into coupons (
  token,
  prize_id,
  title,
  coupon_image_url,
  status,
  event_name,
  booth_name,
  menu_name,
  valid_from,
  valid_until,
  contact_phone
)
select
  encode(gen_random_bytes(24), 'hex') as token,
  '00000000-0000-0000-0000-000000000201'::uuid as prize_id,
  '1000원 할인권' as title,
  'https://example.com/coupons/coupon-001.png' as coupon_image_url,
  'AVAILABLE' as status,
  'UNIS IT 창업학회' as event_name,
  '포스고관 옆' as booth_name,
  '김치말이국수' as menu_name,
  '2026-05-01'::date as valid_from,
  '2026-05-31'::date as valid_until,
  '010-4550-8535' as contact_phone
from generate_series(1, 100);
