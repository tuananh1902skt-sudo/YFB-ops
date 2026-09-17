/**
 * Khởi tạo tổ chức trên một project Supabase trống:
 *
 *   npx tsx scripts/seed.ts seed/organisation.json --dry-run   # xem trước, không ghi gì
 *   npx tsx scripts/seed.ts seed/organisation.json             # ghi thật
 *   npx tsx scripts/seed.ts seed/organisation.json --invite     # gửi email mời thay vì đặt mật khẩu
 *
 * Chạy lại nhiều lần được: seed so khớp với dữ liệu đang có rồi chỉ ghi phần khác,
 * và không xoá bất cứ thứ gì. Chạy lần hai trên cùng file cấu hình phải ra "không có
 * gì để đổi".
 *
 * Cần SUPABASE_SERVICE_ROLE_KEY vì phải tạo tài khoản đăng nhập. Key này bỏ qua toàn
 * bộ RLS nên chỉ đọc từ file môi trường trên máy, không bao giờ in ra.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseSeedConfig, SeedConfigError, type SeedConfig } from '../src/lib/setup/seed-config';
import {
  planSeed,
  type ExistingOrganisation,
  type SeedPlan,
} from '../src/lib/setup/seed-plan';
import { countChanges, describePlan } from '../src/lib/setup/seed-report';

interface Options {
  configPath: string;
  envPath: string;
  dryRun: boolean;
  invite: boolean;
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = [];
  let envPath = '.env.local';
  let dryRun = false;
  let invite = false;

  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--invite') invite = true;
    else if (arg.startsWith('--env-file=')) envPath = arg.slice('--env-file='.length);
    else if (arg.startsWith('--')) throw new Error(`Không hiểu tham số: ${arg}`);
    else positional.push(arg);
  }

  if (positional.length !== 1) {
    throw new Error('Cách dùng: npx tsx scripts/seed.ts <file-cấu-hình.json> [--dry-run] [--invite]');
  }
  return { configPath: positional[0], envPath, dryRun, invite };
}

function loadEnv(envPath: string): void {
  const full = resolve(envPath);
  if (!existsSync(full)) return;
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('Cần Node 20.12 trở lên để đọc file môi trường.');
  }
  process.loadEnvFile(full);
}

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function readConfig(path: string): SeedConfig & { warnings: string[] } {
  const raw = readFileSync(resolve(path), 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`File cấu hình không phải JSON hợp lệ: ${(error as Error).message}`);
  }
  const { config, warnings } = parseSeedConfig(parsed);
  return { ...config, warnings };
}

async function loadExisting(db: SupabaseClient, clientCode: string): Promise<ExistingOrganisation> {
  const clients = await db.from('clients').select('id,code,name').eq('code', clientCode);
  fail('đọc clients', clients.error);

  const brands = await db.from('brands').select('id,client_id,code,name');
  fail('đọc brands', brands.error);

  const accounts = await db
    .from('platform_accounts')
    .select('id,brand_id,account_name,platform,external_shop_id,estimated_refund_rate::text');
  fail('đọc platform_accounts', accounts.error);

  const users = await db.from('users').select('id,email,full_name,phone,is_active');
  fail('đọc users', users.error);

  const roles = await db.from('user_roles').select('user_id,role,brand_id');
  fail('đọc user_roles', roles.error);

  const settings = await db.from('system_settings').select('key,value');
  fail('đọc system_settings', settings.error);

  return {
    clients: (clients.data ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name })),
    brands: (brands.data ?? []).map((row) => ({
      id: row.id,
      clientId: row.client_id,
      code: row.code,
      name: row.name,
    })),
    accounts: (accounts.data ?? []).map((row) => ({
      id: row.id,
      brandId: row.brand_id,
      accountName: row.account_name,
      platform: row.platform,
      externalShopId: row.external_shop_id,
      estimatedRefundRate: Number(row.estimated_refund_rate ?? 0),
    })),
    users: (users.data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      isActive: row.is_active,
    })),
    roles: (roles.data ?? []).map((row) => ({
      userId: row.user_id,
      role: row.role,
      brandId: row.brand_id,
    })),
    settings: (settings.data ?? []).map((row) => ({ key: row.key, value: row.value })),
  };
}

/** Bảng `users` tham chiếu `auth.users`, nên tài khoản đăng nhập phải có trước. */
async function loadAuthIds(db: SupabaseClient): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    fail('đọc danh sách tài khoản đăng nhập', error);
    const batch = data?.users ?? [];
    for (const user of batch) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
    }
    if (batch.length < perPage) return byEmail;
  }
}

function temporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

/**
 * Supabase trả về lỗi rỗng kèm user rỗng trong vài trường hợp biên. Dừng ở đây còn
 * hơn ghi một hồ sơ trỏ vào tài khoản đăng nhập không tồn tại.
 */
function requireAuthId(email: string, user: { id: string } | null | undefined): string {
  if (!user?.id) throw new Error(`Không nhận được tài khoản đăng nhập cho ${email}`);
  return user.id;
}

interface NewLogin {
  email: string;
  password: string | null;
  invited: boolean;
}

async function apply(db: SupabaseClient, plan: SeedPlan, options: Options): Promise<NewLogin[]> {
  const clientId = await upsertClient(db, plan);
  const brandIdByCode = await upsertBrands(db, plan, clientId);
  await upsertAccounts(db, plan, brandIdByCode);
  const { userIdByEmail, newLogins } = await upsertUsers(db, plan, options);
  await upsertRoles(db, plan, brandIdByCode, userIdByEmail);
  await upsertSettings(db, plan);
  return newLogins;
}

async function upsertClient(db: SupabaseClient, plan: SeedPlan): Promise<string> {
  if (plan.client.change === 'CREATE') {
    const { data, error } = await db
      .from('clients')
      .insert({ code: plan.client.code, name: plan.client.name })
      .select('id')
      .single();
    fail('tạo client', error);
    return data!.id;
  }
  if (plan.client.change === 'UPDATE') {
    const { error } = await db
      .from('clients')
      .update({ name: plan.client.name, updated_at: new Date().toISOString() })
      .eq('id', plan.client.id!);
    fail('cập nhật client', error);
  }
  return plan.client.id!;
}

async function upsertBrands(
  db: SupabaseClient,
  plan: SeedPlan,
  clientId: string,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const brand of plan.brands) {
    if (brand.change === 'CREATE') {
      const { data, error } = await db
        .from('brands')
        .insert({ client_id: clientId, code: brand.code, name: brand.name })
        .select('id')
        .single();
      fail(`tạo brand ${brand.code}`, error);
      ids.set(brand.code, data!.id);
      continue;
    }
    if (brand.change === 'UPDATE') {
      const { error } = await db
        .from('brands')
        .update({ name: brand.name, updated_at: new Date().toISOString() })
        .eq('id', brand.id!);
      fail(`cập nhật brand ${brand.code}`, error);
    }
    ids.set(brand.code, brand.id!);
  }
  return ids;
}

async function upsertAccounts(
  db: SupabaseClient,
  plan: SeedPlan,
  brandIdByCode: Map<string, string>,
): Promise<void> {
  for (const account of plan.accounts) {
    if (account.change === 'UNCHANGED') continue;

    const payload: Record<string, unknown> = {
      brand_id: brandIdByCode.get(account.brandCode),
      account_name: account.accountName,
      platform: account.platform,
      external_shop_id: account.externalShopId,
    };
    // Không khai tỷ lệ hoàn thì để nguyên giá trị đang có thay vì ghi đè bằng 0.
    if (account.estimatedRefundRate !== null) {
      payload.estimated_refund_rate = account.estimatedRefundRate;
    }

    if (account.change === 'CREATE') {
      const { error } = await db.from('platform_accounts').insert(payload);
      fail(`tạo tài khoản ${account.accountName}`, error);
      continue;
    }
    const { error } = await db
      .from('platform_accounts')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', account.id!);
    fail(`cập nhật tài khoản ${account.accountName}`, error);
  }
}

async function upsertUsers(
  db: SupabaseClient,
  plan: SeedPlan,
  options: Options,
): Promise<{ userIdByEmail: Map<string, string>; newLogins: NewLogin[] }> {
  const authIds = await loadAuthIds(db);
  const userIdByEmail = new Map<string, string>();
  const newLogins: NewLogin[] = [];

  for (const user of plan.users) {
    let authId = authIds.get(user.email) ?? null;

    if (!authId) {
      if (options.invite) {
        const { data, error } = await db.auth.admin.inviteUserByEmail(user.email);
        fail(`gửi lời mời cho ${user.email}`, error);
        authId = requireAuthId(user.email, data?.user);
        newLogins.push({ email: user.email, password: null, invited: true });
      } else {
        const password = temporaryPassword();
        const { data, error } = await db.auth.admin.createUser({
          email: user.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: user.fullName },
        });
        fail(`tạo tài khoản đăng nhập cho ${user.email}`, error);
        authId = requireAuthId(user.email, data?.user);
        newLogins.push({ email: user.email, password, invited: false });
      }
    }

    const payload = {
      id: authId,
      email: user.email,
      full_name: user.fullName,
      phone: user.phone,
      updated_at: new Date().toISOString(),
      ...(user.change === 'REACTIVATE' ? { is_active: true } : {}),
    };
    const { error } = await db.from('users').upsert(payload, { onConflict: 'id' });
    fail(`ghi hồ sơ ${user.email}`, error);
    userIdByEmail.set(user.email, authId);
  }

  return { userIdByEmail, newLogins };
}

async function upsertRoles(
  db: SupabaseClient,
  plan: SeedPlan,
  brandIdByCode: Map<string, string>,
  userIdByEmail: Map<string, string>,
): Promise<void> {
  const rows = plan.roles
    .filter((role) => role.change === 'CREATE')
    .map((role) => ({
      user_id: userIdByEmail.get(role.email)!,
      role: role.role,
      brand_id: role.brandCode ? brandIdByCode.get(role.brandCode)! : null,
    }));
  if (rows.length === 0) return;

  // `unique nulls not distinct (user_id, role, brand_id)` nên chạy lại không nhân bản.
  const { error } = await db
    .from('user_roles')
    .upsert(rows, { onConflict: 'user_id,role,brand_id', ignoreDuplicates: true });
  fail('cấp vai trò', error);
}

async function upsertSettings(db: SupabaseClient, plan: SeedPlan): Promise<void> {
  const rows = plan.settings
    .filter((setting) => setting.change !== 'UNCHANGED')
    .map((setting) => ({
      key: setting.key,
      value: setting.value,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;

  const { error } = await db.from('system_settings').upsert(rows, { onConflict: 'key' });
  fail('ghi ngưỡng hệ thống', error);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  loadEnv(options.envPath);

  // Kiểm tra file cấu hình trước khi cần đến kết nối: viết xong cấu hình là soát được
  // ngay, chưa cần có project Supabase.
  const config = readConfig(options.configPath);
  if (config.warnings.length > 0) {
    console.log('Lưu ý về cấu hình:');
    for (const warning of config.warnings) console.log(`  ! ${warning}`);
    console.log('');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    if (options.dryRun) {
      console.log('Cấu hình hợp lệ.');
      console.log(
        `Chưa có NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong ${options.envPath} ` +
          'nên chưa so khớp được với database.',
      );
      return;
    }
    throw new Error(
      `Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY (đã tìm trong ${options.envPath}).`,
    );
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Project: ${url}`);
  const existing = await loadExisting(db, config.client.code);
  const plan = planSeed(config, existing);

  console.log('');
  for (const line of describePlan(plan)) console.log(line);

  const changes = countChanges(plan);
  console.log('');
  if (changes === 0) {
    console.log('Không có gì để đổi — database đã khớp với file cấu hình.');
    return;
  }

  if (options.dryRun) {
    console.log(`${changes} thay đổi sẽ được ghi. Bỏ --dry-run để chạy thật.`);
    return;
  }

  const newLogins = await apply(db, plan, options);
  console.log(`Đã ghi ${changes} thay đổi.`);

  if (newLogins.length > 0) {
    console.log('');
    console.log('Tài khoản đăng nhập mới tạo:');
    for (const login of newLogins) {
      console.log(
        login.invited
          ? `  ${login.email} — đã gửi email mời`
          : `  ${login.email} — mật khẩu tạm: ${login.password}`,
      );
    }
    if (newLogins.some((login) => !login.invited)) {
      console.log('');
      console.log('Mật khẩu tạm chỉ hiện đúng một lần ở đây. Gửi riêng cho từng người và');
      console.log('yêu cầu đổi ngay khi đăng nhập lần đầu.');
    }
  }
}

main().catch((error: unknown) => {
  if (error instanceof SeedConfigError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
});
