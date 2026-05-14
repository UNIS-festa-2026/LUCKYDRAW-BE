alter table lucky_draw_entries enable row level security;
alter table prizes enable row level security;
alter table winner_infos enable row level security;
alter table coupons enable row level security;
alter table coupon_redemptions enable row level security;
alter table sheet_sync_jobs enable row level security;

revoke all on table lucky_draw_entries from anon, authenticated;
revoke all on table prizes from anon, authenticated;
revoke all on table winner_infos from anon, authenticated;
revoke all on table coupons from anon, authenticated;
revoke all on table coupon_redemptions from anon, authenticated;
revoke all on table sheet_sync_jobs from anon, authenticated;

alter table lucky_draw_entries
  add constraint lucky_draw_entries_session_id_length
  check (session_id is null or char_length(session_id) <= 100);

alter table lucky_draw_entries
  add constraint lucky_draw_entries_depositor_name_length
  check (depositor_name is null or char_length(btrim(depositor_name)) between 1 and 40);

alter table coupons
  add constraint coupons_token_length
  check (char_length(token) between 24 and 128);

alter table coupons
  add constraint coupons_signature_path_safe
  check (
    signature_image_url is null
    or signature_image_url !~ '^https?://'
  );

alter table coupon_redemptions
  add constraint coupon_redemptions_signature_path_safe
  check (signature_image_url !~ '^https?://');
