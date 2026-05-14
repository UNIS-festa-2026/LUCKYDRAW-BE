-- prizes.type을 BOOTH | UNIS 두 가지로 단순화
-- BOOTH: 부스 쿠폰 (각 동아리/학생회)
-- UNIS: 자체 쿠폰 (UNIS 직접 제공)

alter table prizes drop constraint prizes_type_check;
update prizes set type = 'BOOTH' where type = 'BOOTH_COUPON';
update prizes set type = 'UNIS' where type in ('DIGITAL_COUPON', 'ETC');
alter table prizes add constraint prizes_type_check check (type in ('BOOTH', 'UNIS'));
