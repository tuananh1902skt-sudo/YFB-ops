/**
 * Dựng ca trong hệ thống từ các Room đã phát sóng thật trong file report:
 *
 *   npx tsx scripts/shifts-from-report.ts <report.xlsx> --date 2026-09-13
 *   npx tsx scripts/shifts-from-report.ts <report.xlsx> --date 2026-09-13 --commit
 *
 * Mặc định chỉ in ra, không ghi gì. Thêm `--commit` mới ghi thật.
 *
 * **Đây không phải cách làm việc bình thường.** Ca phải được lên kế hoạch trước,
 * rồi report mới khớp vào. Script này chỉ dùng cho lần nạp dữ liệu quá khứ đầu
 * tiên của một brand, và bạn phải đối chiếu khung giờ nó đề xuất với lịch thật
 * của mình trước khi `--commit`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseLivePerformanceWorkbook } from '../src/lib/parsing/live-performance';
import { toPlatformDateString } from '../src/lib/parsing/primitives';
import { prepareSession } from '../src/lib/planning/session-form';
import {
  DEFAULT_GROUP_OPTIONS,
  groupRoomsIntoShifts,
  type RoomWindow,
} from '../src/lib/planning/shifts-from-rooms';

interface Options {
  reportPath: string;
  date: string | null;
  brandCode: string | null;
  assignEmail: string | null;
  commit: boolean;
  envPath: string;
  gapMinutes: number;
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = [];
  const options: Options = {
    reportPath: '',
    date: null,
    brandCode: null,
    assignEmail: null,
    commit: false,
    envPath: '.env.local',
    gapMinutes: DEFAULT_GROUP_OPTIONS.maxGapMinutes,
  };

  // Nhận cả `--date=2026-09-13` lẫn `--date 2026-09-13`: gõ nhầm kiểu nào cũng
  // chạy, thay vì bắt người dùng nhớ đúng một cú pháp.
  const valueOf = (arg: string, index: number, name: string): string | null => {
    if (arg === `--${name}`) return argv[index + 1] ?? null;
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
    return null;
  };

  const consumed = new Set<number>();
  for (const [index, arg] of argv.entries()) {
    if (consumed.has(index)) continue;

    if (arg === '--commit') {
      options.commit = true;
      continue;
    }

    let matched = false;
    for (const [name, assign] of [
      ['date', (value: string) => (options.date = value)],
      ['brand', (value: string) => (options.brandCode = value)],
      ['assign', (value: string) => (options.assignEmail = value)],
      ['env-file', (value: string) => (options.envPath = value)],
      ['gap', (value: string) => (options.gapMinutes = Number(value))],
    ] as const) {
      const value = valueOf(arg, index, name);
      if (value === null) continue;
      if (arg === `--${name}`) consumed.add(index + 1);
      assign(value);
      matched = true;
      break;
    }
    if (matched) continue;

    if (arg.startsWith('--')) throw new Error(`Không hiểu tham số: ${arg}`);
    positional.push(arg);
  }

  if (positional.length !== 1) {
    throw new Error(
      'Cách dùng: npx tsx scripts/shifts-from-report.ts <report.xlsx> --date YYYY-MM-DD [--commit]',
    );
  }
  if (options.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error(`Ngày phải dạng YYYY-MM-DD, nhận được: ${options.date}`);
  }
  options.reportPath = positional[0];
  return options;
}

function loadEnv(envPath: string): void {
  const full = resolve(envPath);
  if (existsSync(full) && typeof process.loadEnvFile === 'function') process.loadEnvFile(full);
}

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

const time = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'short',
});

async function resolveBrand(db: SupabaseClient, code: string | null) {
  const query = db.from('brands').select('id,name,code').eq('is_active', true).order('name');
  const { data, error } = code ? await query.eq('code', code) : await query;
  fail('đọc brand', error);

  const brands = data ?? [];
  if (brands.length === 0) throw new Error('Chưa có brand nào. Chạy `npm run seed` trước.');
  if (brands.length > 1 && !code) {
    throw new Error(
      `Có ${brands.length} brand, chọn một bằng --brand=<MÃ>: ${brands.map((b) => b.code).join(', ')}`,
    );
  }

  const brand = brands[0];
  const accounts = await db
    .from('platform_accounts')
    .select('id,account_name')
    .eq('brand_id', brand.id)
    .eq('is_active', true)
    .order('account_name');
  fail('đọc tài khoản nền tảng', accounts.error);
  const account = accounts.data?.[0];
  if (!account) throw new Error(`Brand ${brand.code} chưa có tài khoản nền tảng nào.`);

  return { brand, account };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const buffer = readFileSync(resolve(options.reportPath));
  const parsed = await parseLivePerformanceWorkbook(buffer);
  if (parsed.status !== 'PARSED') {
    throw new Error(`Không đọc được file report (trạng thái ${parsed.status}).`);
  }

  const rooms = new Map<string, RoomWindow>();
  for (const row of parsed.rows) {
    // Mỗi room lấy khung rộng nhất trong file, phòng khi có nhiều snapshot.
    const existing = rooms.get(row.platformRoomId);
    rooms.set(row.platformRoomId, {
      platformRoomId: row.platformRoomId,
      startAt:
        existing && existing.startAt < row.roomStartAt ? existing.startAt : row.roomStartAt,
      endAt: existing && existing.endAt > row.snapshotEndAt ? existing.endAt : row.snapshotEndAt,
    });
  }

  const onDate = [...rooms.values()].filter(
    (room) => !options.date || toPlatformDateString(room.startAt) === options.date,
  );

  if (onDate.length === 0) {
    const days = [...new Set([...rooms.values()].map((r) => toPlatformDateString(r.startAt)))].sort();
    console.log(`Không có room nào ngày ${options.date}.`);
    console.log(`Ngày có dữ liệu: ${days.slice(-10).join(', ')}`);
    return;
  }

  const shifts = groupRoomsIntoShifts(onDate, {
    ...DEFAULT_GROUP_OPTIONS,
    maxGapMinutes: options.gapMinutes,
  });

  console.log(`File: ${options.reportPath}`);
  console.log(`Room trong ngày ${options.date ?? '(tất cả)'}: ${onDate.length}`);
  console.log('');
  for (const [index, shift] of shifts.entries()) {
    console.log(`Ca ${index + 1}: ${time.format(shift.plannedStartAt)} → ${time.format(shift.plannedEndAt)}`);
    console.log(`  ngày của ca: ${shift.sessionDate}${shift.crossesMidnight ? ' (vắt qua nửa đêm)' : ''}`);
    console.log(`  room: ${shift.roomIds.join(', ')}${shift.roomIds.length > 1 ? '  ← restart giữa ca' : ''}`);
  }
  console.log('');

  if (!options.commit) {
    console.log(`${shifts.length} ca sẽ được tạo. Đối chiếu với lịch thật của bạn rồi thêm --commit.`);
    return;
  }

  loadEnv(options.envPath);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(`Thiếu cấu hình Supabase (đã tìm trong ${options.envPath}).`);
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { brand, account } = await resolveBrand(db, options.brandCode);
  console.log(`Brand: ${brand.name} (${brand.code}) · tài khoản ${account.account_name}`);

  let assignee: { id: string; full_name: string } | null = null;
  if (options.assignEmail) {
    const { data, error } = await db
      .from('users')
      .select('id,full_name')
      .eq('email', options.assignEmail.toLowerCase())
      .maybeSingle();
    fail('đọc nhân sự', error);
    if (!data) throw new Error(`Không tìm thấy nhân sự ${options.assignEmail}.`);
    assignee = data;
  }

  for (const shift of shifts) {
    // Đi qua đúng `prepareSession` mà giao diện dùng, nên mọi ràng buộc nghiệp vụ
    // vẫn áp — script không được có đường tắt riêng.
    const prepared = prepareSession({
      brandId: brand.id,
      platformAccountId: account.id,
      plannedStartAt: shift.plannedStartAt,
      plannedEndAt: shift.plannedEndAt,
      note: `Dựng lại từ report: room ${shift.roomIds.join(', ')}`,
    });

    const { data, error } = await db
      .from('live_sessions')
      .insert({
        brand_id: prepared.brandId,
        platform_account_id: prepared.platformAccountId,
        session_date: prepared.sessionDate,
        planned_start_at: prepared.plannedStartAt.toISOString(),
        planned_end_at: prepared.plannedEndAt.toISOString(),
        ownership: 'AGENCY',
        status: 'DATA_PENDING',
        note: prepared.note,
      })
      .select('id')
      .single();
    fail('tạo ca', error);

    if (assignee) {
      const { error: staffError } = await db.from('live_session_staff').insert({
        session_id: data!.id,
        user_id: assignee.id,
        role_in_session: 'HOST',
      });
      fail('phân người vào ca', staffError);
    }

    console.log(`  ✓ đã tạo ca ${time.format(shift.plannedStartAt)} (${data!.id})`);
  }

  console.log('');
  console.log(`Đã tạo ${shifts.length} ca. Giờ vào /upload nộp đúng file report này.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
