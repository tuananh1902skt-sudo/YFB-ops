-- Runs the row level security policies as real users.
--
-- The constraint checks in verify-migrations.sql prove the schema refuses bad
-- data. This proves the schema refuses the wrong *people* — which is where a
-- mistake is invisible until one brand sees another brand's revenue.
--
-- Scope: the policies themselves. Supabase's own auth.uid() is stubbed by
-- scripts/local-supabase-shim.sql, so this does not test Supabase's JWT layer.

\set ON_ERROR_STOP on

create or replace function expect(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice 'OK: %', description;
  else
    raise exception 'SAI: %', description;
  end if;
end $$;

-- ---------------------------------------------------------------- seed data

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@yfb.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'ops.franklin@yfb.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'assistant.franklin@yfb.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'host.freelance@yfb.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'finance@yfb.test'),
  ('00000000-0000-0000-0000-0000000000a6', 'analyst@yfb.test'),
  ('00000000-0000-0000-0000-0000000000a7', 'ops.other@yfb.test');

insert into users (id, email, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@yfb.test', 'Admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'ops.franklin@yfb.test', 'Operation Franklin'),
  ('00000000-0000-0000-0000-0000000000a3', 'assistant.franklin@yfb.test', 'Trợ live Franklin'),
  ('00000000-0000-0000-0000-0000000000a4', 'host.freelance@yfb.test', 'Host tự do'),
  ('00000000-0000-0000-0000-0000000000a5', 'finance@yfb.test', 'Kế toán'),
  ('00000000-0000-0000-0000-0000000000a6', 'analyst@yfb.test', 'Data Analyst'),
  ('00000000-0000-0000-0000-0000000000a7', 'ops.other@yfb.test', 'Operation brand khác');

insert into clients (id, name, code) values
  ('00000000-0000-0000-0000-0000000000c1', 'YFB Clients', 'YFB');
insert into brands (id, client_id, name, code) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'Franklin', 'FRANKLIN'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 'Brand khác', 'OTHER');

insert into user_roles (user_id, role, brand_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'SUPER_ADMIN', null),
  ('00000000-0000-0000-0000-0000000000a2', 'OPERATION', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000a3', 'ASSISTANT', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000a5', 'FINANCE', null),
  ('00000000-0000-0000-0000-0000000000a6', 'DATA_ANALYST', null),
  ('00000000-0000-0000-0000-0000000000a7', 'OPERATION', '00000000-0000-0000-0000-0000000000b2');
-- a4 deliberately has no role at all: he is only assigned to one shift.

insert into platform_accounts (id, brand_id, account_name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'Franklin TikTok Shop'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', 'Brand khác TikTok Shop');

insert into live_sessions (id, brand_id, platform_account_id, session_date, planned_start_at, planned_end_at, ownership, status)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000d1', date '2026-09-09',
   timestamptz '2026-09-09 10:00+07', timestamptz '2026-09-09 13:00+07', 'UNKNOWN', 'DATA_PARTIAL'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000d2', date '2026-09-09',
   timestamptz '2026-09-09 14:00+07', timestamptz '2026-09-09 17:00+07', 'AGENCY', 'DATA_COMPLETE');

insert into live_session_staff (session_id, user_id, role_in_session) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a4', 'HOST');

insert into platform_rooms (id, platform_account_id, platform_room_id, room_start_at)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1',
        '7683365340126808852', timestamptz '2026-09-09 10:01:57+07');

insert into raw_imports (id, import_type, platform_account_id, file_name, file_hash, storage_path, uploaded_by)
values ('00000000-0000-0000-0000-000000000091', 'LIVE_PERFORMANCE', '00000000-0000-0000-0000-0000000000d1',
        'seed.xlsx', 'seed-hash', 'imports/seed.xlsx', '00000000-0000-0000-0000-0000000000a3');
insert into raw_import_rows (id, import_id, row_index, raw_values) values
  (1, '00000000-0000-0000-0000-000000000091', 4, '{"Attributed GMV": "30,000,000.00₫"}');

insert into room_snapshots (id, room_id, raw_import_row_id, snapshot_end_at, gmv, orders)
values ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-0000000000f1', 1,
        timestamptz '2026-09-09 13:00+07', 30000000.00, 30);

insert into session_attributions (session_id, room_id, method, source_snapshot_id, gmv, orders, confidence)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 'FULL_SNAPSHOT',
        '00000000-0000-0000-0000-000000000081', 30000000.00, 30, 'HIGH');

insert into ads_daily (platform_account_id, stat_date, ads_spend)
values ('00000000-0000-0000-0000-0000000000d1', date '2026-09-09', 2652354);

insert into contracts (id, brand_id, start_date) values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-0000000000b1', date '2026-01-01');

insert into audit_logs (entity_type, entity_id, action) values ('live_sessions', 'seed', 'SEEDED');

insert into shift_slots (id, session_id, brand_id, role_needed, start_at, end_at)
values
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000b1', 'ASSISTANT',
   timestamptz '2026-09-09 10:00+07', timestamptz '2026-09-09 13:00+07'),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000b1', 'HOST',
   timestamptz '2026-09-09 10:00+07', timestamptz '2026-09-09 13:00+07');

insert into shift_bookings (slot_id, user_id, status) values
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-0000000000a3', 'REGISTERED'),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-0000000000a3', 'REGISTERED'),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-0000000000a4', 'REGISTERED');

-- ------------------------------------------------- trợ live của brand Franklin

set role authenticated;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a3';

do $$
declare
  affected integer;
begin
  -- D3: whose revenue a stretch counts as is not the assistant's to decide.
  begin
    update live_sessions set ownership = 'AGENCY'
     where id = '00000000-0000-0000-0000-0000000000e1';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then
    affected := 0;
  end;
  perform expect(affected = 0, 'trợ live không đổi được ownership (chặn ở tầng DB, không chỉ ở UI)');
  perform expect(
    (select ownership from live_sessions where id = '00000000-0000-0000-0000-0000000000e1') is not distinct from 'UNKNOWN',
    'ownership giữ nguyên sau khi trợ live thử đổi');
end $$;

do $$
begin
  perform expect(
    (select count(*) from live_sessions where brand_id = '00000000-0000-0000-0000-0000000000b2') = 0,
    'trợ live brand Franklin không đọc được ca của brand khác');
  perform expect(
    (select count(*) from live_sessions where brand_id = '00000000-0000-0000-0000-0000000000b1') = 1,
    'trợ live đọc được ca của brand mình');
  perform expect(
    (select count(*) from session_attributions) = 1,
    'trợ live chỉ thấy kết quả ca thuộc brand mình');
end $$;

do $$
declare
  affected integer;
  gmv_now numeric;
begin
  -- Raw platform data has insert and select policies only: there is no way to
  -- edit what the platform reported, from any account (CLAUDE.md §2).
  begin
    update room_snapshots set gmv = 999 where id = '00000000-0000-0000-0000-000000000081';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then
    affected := 0;
  end;
  select gmv into gmv_now from room_snapshots where id = '00000000-0000-0000-0000-000000000081';
  perform expect(affected = 0 and gmv_now = 30000000.00, 'không ai sửa được snapshot đã import');

  begin
    delete from room_snapshots where id = '00000000-0000-0000-0000-000000000081';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then
    affected := 0;
  end;
  perform expect(
    affected = 0 and exists (select 1 from room_snapshots where id = '00000000-0000-0000-0000-000000000081'),
    'không ai xoá được snapshot đã import');
end $$;

do $$
declare
  ok boolean := true;
begin
  begin
    insert into raw_imports (import_type, platform_account_id, file_name, file_hash, storage_path, uploaded_by)
    values ('LIVE_PERFORMANCE', '00000000-0000-0000-0000-0000000000d1', 'ca-toi.xlsx', 'hash-2',
            'imports/hash-2.xlsx', '00000000-0000-0000-0000-0000000000a3');
  exception when others then
    ok := false;
  end;
  perform expect(ok, 'trợ live nộp được file cho tài khoản của brand mình');
end $$;

do $$
declare
  blocked boolean := false;
begin
  begin
    insert into ads_daily (platform_account_id, stat_date, ads_spend)
    values ('00000000-0000-0000-0000-0000000000d1', date '2026-09-10', 100000);
  exception when insufficient_privilege then
    blocked := true;
  end;
  perform expect(blocked, 'trợ live không ghi được số liệu ads');

  blocked := false;
  begin
    update system_settings set value = '5' where key = 'data_submission_grace_minutes';
    if not found then blocked := true; end if;
  exception when insufficient_privilege then
    blocked := true;
  end;
  perform expect(blocked, 'trợ live không đổi được ngưỡng cấu hình hệ thống');

  perform expect((select count(*) from audit_logs) = 0, 'trợ live không đọc được audit log');
  perform expect((select count(*) from contracts) = 0, 'trợ live không đọc được hợp đồng');
end $$;

do $$
declare
  affected integer;
begin
  -- Rút tên khỏi ca mình đăng ký: được, khi chưa duyệt.
  update shift_bookings set status = 'CANCELLED'
   where slot_id = '00000000-0000-0000-0000-000000000061'
     and user_id = '00000000-0000-0000-0000-0000000000a3';
  get diagnostics affected = row_count;
  perform expect(affected = 1, 'người đăng ký tự huỷ được khi chưa duyệt');

  -- Nhưng không tự duyệt cho mình.
  begin
    update shift_bookings set status = 'APPROVED'
     where slot_id = '00000000-0000-0000-0000-000000000062'
       and user_id = '00000000-0000-0000-0000-0000000000a3';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then
    affected := 0;
  end;
  perform expect(affected = 0, 'người đăng ký không tự duyệt cho mình được');

  -- Và không đụng vào đăng ký của người khác.
  begin
    update shift_bookings set status = 'CANCELLED'
     where slot_id = '00000000-0000-0000-0000-000000000062'
       and user_id = '00000000-0000-0000-0000-0000000000a4';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then
    affected := 0;
  end;
  perform expect(affected = 0, 'không huỷ được đăng ký của người khác');
end $$;

-- ------------------------------- host tự do: không có role, chỉ được phân ca

reset role;
set role authenticated;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a4';

do $$
begin
  perform expect(
    (select count(*) from live_sessions where id = '00000000-0000-0000-0000-0000000000e1') = 1,
    'người được phân ca đọc được đúng ca của mình dù không có quyền theo brand');
  perform expect(
    (select count(*) from live_sessions where id = '00000000-0000-0000-0000-0000000000e2') = 0,
    'người được phân ca không đọc được ca mình không tham gia');
end $$;

-- ------------------------------------------------ Operation của brand Franklin

reset role;
set role authenticated;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a2';

do $$
declare
  affected integer;
begin
  update live_sessions set ownership = 'BRAND_INHOUSE'
   where id = '00000000-0000-0000-0000-0000000000e1';
  get diagnostics affected = row_count;
  perform expect(affected = 1, 'Operation đổi được ownership ca của brand mình');

  begin
    update live_sessions set ownership = 'BRAND_INHOUSE'
     where id = '00000000-0000-0000-0000-0000000000e2';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then
    affected := 0;
  end;
  perform expect(affected = 0, 'Operation brand Franklin không đụng được ca của brand khác');

  perform expect((select count(*) from contracts) = 0, 'Operation không đọc được hợp đồng (chỉ Finance/Management)');
end $$;

-- ---------------------------------------------------------- Finance & Analyst

reset role;
set role authenticated;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a5';
do $$
begin
  perform expect((select count(*) from contracts) = 1, 'Finance đọc được hợp đồng');
end $$;

reset role;
set role authenticated;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a6';
do $$
begin
  perform expect((select count(*) from audit_logs) >= 1, 'Data Analyst đọc được audit log');
  perform expect(
    (select count(*) from live_sessions) = 2,
    'Data Analyst toàn cục đọc được ca của mọi brand');
end $$;

-- --------------------------------------------- kho file report (bucket imports)

reset role;
-- Hai file có sẵn, mỗi brand một file. Đường dẫn theo đúng quy ước của
-- `storagePathFor`: <platform_account_id>/<sha256>.xlsx
insert into storage.objects (bucket_id, name) values
  ('imports', '00000000-0000-0000-0000-0000000000d1/aaaa.xlsx'),
  ('imports', '00000000-0000-0000-0000-0000000000d2/bbbb.xlsx'),
  ('imports', 'khong-phai-uuid/cccc.xlsx');

set role authenticated;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a3';
do $$
declare
  affected integer;
begin
  perform expect(
    (select count(*) from storage.objects where bucket_id = 'imports') = 1,
    'Trợ live chỉ thấy file report của brand mình');

  begin
    insert into storage.objects (bucket_id, name)
    values ('imports', '00000000-0000-0000-0000-0000000000d1/dddd.xlsx');
    affected := 1;
  exception when insufficient_privilege then
    affected := 0;
  end;
  perform expect(affected = 1, 'Trợ live upload được file cho brand mình');

  begin
    insert into storage.objects (bucket_id, name)
    values ('imports', '00000000-0000-0000-0000-0000000000d2/eeee.xlsx');
    affected := 1;
  exception when insufficient_privilege then
    affected := 0;
  end;
  perform expect(affected = 0, 'Trợ live không upload được file sang brand khác');

  -- Cùng một file upload lại phải ghi đè được, vì tên file là hash của nội dung.
  update storage.objects set owner = null
    where name = '00000000-0000-0000-0000-0000000000d1/aaaa.xlsx';
  get diagnostics affected = row_count;
  perform expect(affected = 1, 'Trợ live upload đè được đúng file của brand mình');

  delete from storage.objects where bucket_id = 'imports';
  get diagnostics affected = row_count;
  perform expect(affected = 0, 'Không ai xoá được file report đã upload');
end $$;

reset role;
set role authenticated;
set "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
do $$
begin
  -- Vai trò toàn hệ thống thấy mọi brand, nhưng một đường dẫn không suy ra được
  -- brand thì không thuộc về ai, kể cả SUPER_ADMIN.
  perform expect(
    (select count(*) from storage.objects where name like 'khong-phai-uuid/%') = 0,
    'File đặt sai đường dẫn không lọt qua vai trò toàn hệ thống');
  perform expect(
    (select count(*) from storage.objects where bucket_id = 'imports') = 3,
    'SUPER_ADMIN thấy file report của mọi brand');
end $$;

reset role;
