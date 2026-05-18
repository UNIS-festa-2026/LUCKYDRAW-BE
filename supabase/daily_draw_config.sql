-- 날짜별 당첨 설정
-- Supabase SQL Editor 또는 psql에서 실행

insert into daily_draw_config (date, booth_quota, unis_quota, random_win_rate) values
  ('2026-05-20', 135, 15, 0.2),
  ('2026-05-21', 135, 15, 0.2),
  -- 22일: BOOTH 없음, UNIS 잔여 전량 소진 목적
  -- unis_quota는 UNIS 총량(36) 기준 최대치로 설정
  -- 행사 전날 실제 남은 수량 확인 후 조정 권장
  ('2026-05-22', 0, 36, 0.0)
on conflict (date) do update set
  booth_quota    = excluded.booth_quota,
  unis_quota     = excluded.unis_quota,
  random_win_rate = excluded.random_win_rate;
