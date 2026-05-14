-- 날짜별 당첨 설정 (booth/unis 쿼터, 랜덤 확률)
create table if not exists daily_draw_config (
  date date primary key,
  booth_quota integer not null default 90 check (booth_quota >= 0),
  unis_quota integer not null default 10 check (unis_quota >= 0),
  random_win_rate numeric(4,3) not null default 0.2 check (random_win_rate between 0 and 1)
);

-- 날짜별 선착순 당첨 카운터 (advisory lock 없이 atomic UPDATE로 관리)
create table if not exists daily_counters (
  date date primary key,
  guaranteed_count integer not null default 0 check (guaranteed_count >= 0)
);
