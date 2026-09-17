-- Checks that the schema enforces the rules the business depends on, rather
-- than trusting application code to remember them.
-- Run through scripts/verify-migrations.sh.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'operation@yfb.test');
insert into users (id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'operation@yfb.test', 'Operation');

insert into clients (id, name, code) values
  ('22222222-2222-2222-2222-222222222222', 'Franklin', 'FRANKLIN');
insert into brands (id, client_id, name, code) values
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Franklin', 'FRANKLIN');
insert into platform_accounts (id, brand_id, account_name) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Franklin TikTok Shop');

-- A handed-over room: one platform room, two agency shifts.
insert into live_sessions (id, brand_id, platform_account_id, session_date, planned_start_at, planned_end_at, status)
values
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444444', date '2026-09-09',
   timestamptz '2026-09-09 10:00:00+07', timestamptz '2026-09-09 13:00:00+07', 'DATA_COMPLETE'),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444444', date '2026-09-09',
   timestamptz '2026-09-09 13:00:00+07', timestamptz '2026-09-09 16:00:00+07', 'DATA_COMPLETE');

insert into platform_rooms (id, platform_account_id, platform_room_id, room_start_at, room_title)
values ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444',
        '7683365340126808852', timestamptz '2026-09-09 10:01:57+07', 'FRANKLIN IS BACK! SPECIAL LIVE');

insert into raw_imports (id, import_type, platform_account_id, file_name, file_hash, storage_path, uploaded_by)
values ('88888888-8888-8888-8888-888888888888', 'LIVE_PERFORMANCE', '44444444-4444-4444-4444-444444444444',
        'Creator-Live-Performance_20260909130000.xlsx', 'hash-1', 'imports/hash-1.xlsx',
        '11111111-1111-1111-1111-111111111111');
insert into raw_import_rows (id, import_id, row_index, raw_values) values
  (1, '88888888-8888-8888-8888-888888888888', 4, '{"Attributed GMV": "30,000,000.00₫"}'),
  (2, '88888888-8888-8888-8888-888888888888', 5, '{"Attributed GMV": "77,025,508.90₫"}');

insert into room_snapshots (id, room_id, raw_import_row_id, snapshot_end_at, gmv, orders) values
  ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', 1,
   timestamptz '2026-09-09 13:00:00+07', 30000000.00, 30),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777', 2,
   timestamptz '2026-09-09 16:02:48+07', 77025508.90, 82);

insert into session_attributions
  (session_id, room_id, method, source_snapshot_id, prev_snapshot_id,
   segment_start_at, segment_end_at, duration_minutes, gmv, orders, confidence)
values
  ('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777777', 'FULL_SNAPSHOT',
   '99999999-9999-9999-9999-999999999999', null,
   timestamptz '2026-09-09 10:01:57+07', timestamptz '2026-09-09 13:00:00+07', 178.05, 30000000.00, 30, 'HIGH'),
  ('66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777', 'SNAPSHOT_DELTA',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999',
   timestamptz '2026-09-09 13:00:00+07', timestamptz '2026-09-09 16:02:48+07', 182.80, 47025508.90, 52, 'HIGH');

do $$
declare
  morning numeric;
  afternoon numeric;
  afternoon_minutes numeric;
begin
  select gmv into morning from session_results where session_id = '55555555-5555-5555-5555-555555555555';
  select gmv, live_minutes into afternoon, afternoon_minutes
    from session_results where session_id = '66666666-6666-6666-6666-666666666666';

  if morning + afternoon <> 77025508.90 then
    raise exception 'Tổng hai ca (%) không khớp số cộng dồn cuối cùng 77025508.90', morning + afternoon;
  end if;
  if afternoon_minutes <> 182.80 then
    raise exception 'Giờ live ca chiều (%) phải là 182.80 phút, không phải thời lượng cả room', afternoon_minutes;
  end if;
  raise notice 'OK: ca nối cộng lại đúng số cộng dồn, giờ live tính theo ca';
end $$;

-- Cumulative totals cannot shrink, so a negative figure must never be stored.
do $$
begin
  begin
    insert into session_attributions (session_id, room_id, method, confidence, gmv)
    values ('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777777',
            'SNAPSHOT_DELTA', 'NEEDS_REVIEW', -1000);
    raise exception 'THIẾU RÀNG BUỘC: GMV âm vẫn ghi được';
  exception when check_violation then
    raise notice 'OK: GMV âm bị chặn ở tầng database';
  end;
end $$;

-- Figures spanning several shifts stay unsplit.
do $$
begin
  begin
    insert into session_attributions (session_id, room_id, method, confidence, gmv)
    values ('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777777',
            'SHARED_UNALLOCATED', 'LOW', 38512754.45);
    raise exception 'THIẾU RÀNG BUỘC: chia đôi GMV chưa quy kết vẫn ghi được';
  exception when check_violation then
    raise notice 'OK: không ghi được số cho đoạn chưa quy kết';
  end;
end $$;

do $$
begin
  begin
    insert into session_events (session_id, event_type, occurred_at, created_by)
    values ('55555555-5555-5555-5555-555555555555', 'ENDED_EARLY', now(),
            '11111111-1111-1111-1111-111111111111');
    raise exception 'THIẾU RÀNG BUỘC: off sớm không cần lý do';
  exception when check_violation then
    raise notice 'OK: off sớm bắt buộc có lý do';
  end;
end $$;

do $$
begin
  begin
    insert into platform_rooms (platform_account_id, platform_room_id, room_start_at)
    values ('44444444-4444-4444-4444-444444444444', '7.6834e+18', now());
    raise exception 'THIẾU RÀNG BUỘC: Room ID sai định dạng vẫn ghi được';
  exception when check_violation then
    raise notice 'OK: Room ID phải là chuỗi chữ số (chặn trường hợp bị parse thành number)';
  end;
end $$;

do $$
begin
  begin
    insert into room_snapshots (room_id, raw_import_row_id, snapshot_end_at, gmv)
    values ('77777777-7777-7777-7777-777777777777', 2, timestamptz '2026-09-09 16:02:48+07', 77025508.90);
    raise exception 'THIẾU RÀNG BUỘC: snapshot trùng thời điểm vẫn ghi được';
  exception when unique_violation then
    raise notice 'OK: snapshot trùng (room, thời điểm) bị chặn';
  end;
end $$;

-- The weakest stretch decides the shift's confidence.
do $$
declare
  result data_confidence;
begin
  update session_attributions set confidence = 'MEDIUM'
   where session_id = '66666666-6666-6666-6666-666666666666';
  insert into session_attributions (session_id, room_id, method, confidence, is_current)
  values ('66666666-6666-6666-6666-666666666666',
          (select id from platform_rooms limit 1), 'ROOM_SUM', 'NEEDS_REVIEW', false);

  select confidence into result from session_results
   where session_id = '66666666-6666-6666-6666-666666666666';
  if result <> 'MEDIUM' then
    raise exception 'Độ tin cậy tổng hợp sai: % (bản ghi cũ không được tính vào)', result;
  end if;
  raise notice 'OK: chỉ tính bản ghi hiện hành, lấy mức tin cậy thấp nhất';
end $$;

rollback;
