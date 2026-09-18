import { z } from 'zod';

/**
 * Khai báo tổ chức ban đầu: client, brand, tài khoản nền tảng, nhân sự và vai trò.
 *
 * File cấu hình tồn tại vì CLAUDE.md §12 cấm hard-code tên brand, tên tài khoản
 * hay ngưỡng thời gian. Seed script chỉ đọc file này, không tự nghĩ ra dữ liệu.
 */

/** Vai trò toàn hệ thống: thấy được mọi brand, nên không gắn brand cụ thể. */
export const GLOBAL_ROLES = ['SUPER_ADMIN', 'MANAGEMENT', 'DATA_ANALYST', 'FINANCE'] as const;

/** Vai trò bắt buộc gắn brand: không gắn thì `has_brand_access` trả false, người đó không thấy gì. */
export const BRAND_SCOPED_ROLES = ['ACCOUNT', 'OPERATION', 'HOST', 'ASSISTANT'] as const;

export const USER_ROLES = [...GLOBAL_ROLES, ...BRAND_SCOPED_ROLES] as const;

export const PLATFORM_CODES = ['TIKTOK_SHOP', 'SHOPEE'] as const;

/**
 * Ngưỡng hệ thống được phép đặt ở seed. Danh sách đóng để một key gõ sai không
 * bị ghi vào database rồi nằm im không ai đọc — đúng kiểu sai âm thầm mà hệ
 * thống này tồn tại để chặn.
 */
export const SETTING_KEYS = [
  'data_submission_grace_minutes',
  'room_continuity_max_gap_hours',
  'segment_match_min_overlap_minutes',
  'segment_match_min_overlap_ratio',
  'target_warning_percent',
  'data_confidence_good_percent',
  'data_confidence_warning_percent',
  'target_min_samples',
  'target_confidence_high_samples',
  'target_confidence_medium_samples',
  'target_recent_window_days',
  'target_history_window_days',
  'target_min_factor_samples',
] as const;

export type UserRoleCode = (typeof USER_ROLES)[number];
export type PlatformCode = (typeof PLATFORM_CODES)[number];
export type SettingKey = (typeof SETTING_KEYS)[number];

const codeSchema = z
  .string({ error: 'thiếu mã' })
  .trim()
  .min(1, 'thiếu mã')
  .max(32, 'mã dài quá 32 ký tự')
  .regex(/^[A-Z0-9_]+$/, 'chỉ gồm chữ in hoa không dấu, số và dấu gạch dưới');

const platformAccountSchema = z.object({
  accountName: z.string({ error: 'thiếu tên tài khoản' }).trim().min(1, 'thiếu tên tài khoản'),
  platform: z.enum(PLATFORM_CODES, { error: `chỉ nhận ${PLATFORM_CODES.join(' hoặc ')}` }).default('TIKTOK_SHOP'),
  externalShopId: z.string().trim().min(1, 'để null nếu chưa có, không để chuỗi rỗng').nullish(),
  /** Tỷ lệ hoàn ước tính (0–1). Bỏ trống → NMV bằng GMV, seed sẽ cảnh báo. */
  estimatedRefundRate: z
    .number({ error: 'tỷ lệ hoàn phải là số thập phân, ví dụ 0.05 cho 5%' })
    .min(0, 'tỷ lệ hoàn không âm')
    .lt(1, 'tỷ lệ hoàn là phần thập phân (0,05 = 5%), không phải phần trăm')
    .nullish(),
});

const brandSchema = z.object({
  name: z.string({ error: 'thiếu tên brand' }).trim().min(1, 'thiếu tên brand'),
  code: codeSchema,
  platformAccounts: z.array(platformAccountSchema).min(1, 'brand cần ít nhất một tài khoản nền tảng'),
});

const roleSchema = z.object({
  role: z.enum(USER_ROLES, { error: `vai trò phải là một trong: ${USER_ROLES.join(', ')}` }),
  /** Mã brand trong chính file này. Bỏ trống nghĩa là vai trò toàn hệ thống. */
  brand: codeSchema.nullish(),
});

const userSchema = z.object({
  email: z.string({ error: 'thiếu email' }).trim().toLowerCase().email('không phải địa chỉ email'),
  fullName: z.string({ error: 'thiếu họ tên' }).trim().min(1, 'thiếu họ tên'),
  phone: z.string().trim().min(1, 'để null nếu chưa có, không để chuỗi rỗng').nullish(),
  roles: z.array(roleSchema).min(1, 'mỗi người cần ít nhất một vai trò'),
});

// partialRecord chứ không phải record: record với khoá enum bắt buộc khai đủ mọi khoá,
// mà seed chỉ cần đặt những ngưỡng muốn khác mặc định.
const settingsSchema = z.partialRecord(
  z.enum(SETTING_KEYS, { error: `chỉ nhận các khoá: ${SETTING_KEYS.join(', ')}` }),
  z.union([z.number(), z.string(), z.boolean()]),
);

export const seedConfigSchema = z.object({
  client: z.object({
    name: z.string({ error: 'thiếu tên client' }).trim().min(1, 'thiếu tên client'),
    code: codeSchema,
  }),
  brands: z.array(brandSchema).min(1, 'cần ít nhất một brand'),
  users: z.array(userSchema).min(1, 'cần ít nhất một người'),
  settings: settingsSchema.optional(),
});

export type SeedConfig = z.infer<typeof seedConfigSchema>;
export type SeedBrand = z.infer<typeof brandSchema>;
export type SeedUser = z.infer<typeof userSchema>;
export type SeedPlatformAccount = z.infer<typeof platformAccountSchema>;

export class SeedConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Cấu hình seed không hợp lệ:\n${problems.map((p) => `  • ${p}`).join('\n')}`);
    this.name = 'SeedConfigError';
  }
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

/**
 * Những ràng buộc zod không diễn đạt được: trùng mã, vai trò trỏ vào brand
 * không tồn tại, và vai trò gắn brand sai cách.
 */
function crossChecks(config: SeedConfig): string[] {
  const problems: string[] = [];

  for (const code of duplicates(config.brands.map((b) => b.code))) {
    problems.push(`brand có mã trùng nhau: ${code}`);
  }
  for (const brand of config.brands) {
    for (const name of duplicates(brand.platformAccounts.map((a) => a.accountName))) {
      problems.push(`brand ${brand.code} có hai tài khoản trùng tên: ${name}`);
    }
  }
  for (const email of duplicates(config.users.map((u) => u.email))) {
    problems.push(`email xuất hiện nhiều lần: ${email}`);
  }

  const brandCodes = new Set(config.brands.map((b) => b.code));
  for (const user of config.users) {
    const signatures = user.roles.map((r) => `${r.role}@${r.brand ?? '*'}`);
    for (const signature of duplicates(signatures)) {
      problems.push(`${user.email} khai vai trò trùng: ${signature}`);
    }

    for (const { role, brand } of user.roles) {
      const isGlobalRole = (GLOBAL_ROLES as readonly string[]).includes(role);
      if (brand && !brandCodes.has(brand)) {
        problems.push(`${user.email} có vai trò ${role} trỏ vào brand không khai báo: ${brand}`);
      }
      if (!brand && !isGlobalRole) {
        problems.push(
          `${user.email} có vai trò ${role} không gắn brand — vai trò này bắt buộc gắn brand, ` +
            'để trống thì người đó đăng nhập được nhưng không thấy dữ liệu nào',
        );
      }
      if (brand && isGlobalRole) {
        problems.push(
          `${user.email} có vai trò ${role} gắn brand ${brand} — đây là vai trò toàn hệ thống, ` +
            'gắn brand sẽ thu hẹp quyền một cách khó đoán',
        );
      }
    }
  }

  return problems;
}

/** Mỗi brand cần ít nhất một người đủ quyền vận hành, nếu không không ai tạo được ca. */
function coverageWarnings(config: SeedConfig): string[] {
  const warnings: string[] = [];
  const managers = new Set<string>();
  let hasGlobalManager = false;

  for (const user of config.users) {
    for (const { role, brand } of user.roles) {
      if (role !== 'OPERATION' && role !== 'ACCOUNT' && role !== 'SUPER_ADMIN' && role !== 'MANAGEMENT') {
        continue;
      }
      if (brand) managers.add(brand);
      else hasGlobalManager = true;
    }
  }

  if (!hasGlobalManager) {
    for (const brand of config.brands) {
      if (!managers.has(brand.code)) {
        warnings.push(
          `brand ${brand.code} chưa có ai vai trò OPERATION hoặc ACCOUNT — sẽ không ai tạo được ca cho brand này`,
        );
      }
    }
  }

  for (const brand of config.brands) {
    for (const account of brand.platformAccounts) {
      if (account.estimatedRefundRate === null || account.estimatedRefundRate === undefined) {
        warnings.push(
          `tài khoản "${account.accountName}" chưa khai estimatedRefundRate — NMV ước tính sẽ bằng đúng GMV`,
        );
      }
    }
  }

  return warnings;
}

/** Vài mã lỗi của zod không đi qua thông điệp tự đặt được, nên dịch tại đây. */
function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.join('.');
  const message =
    issue.code === 'unrecognized_keys'
      ? `không nhận khoá: ${issue.keys.join(', ')}`
      : issue.code === 'invalid_type'
        ? `sai kiểu dữ liệu, cần ${issue.expected}`
        : issue.message;
  return path ? `${path}: ${message}` : message;
}

export interface ParsedSeedConfig {
  config: SeedConfig;
  warnings: string[];
}

export function parseSeedConfig(raw: unknown): ParsedSeedConfig {
  const parsed = seedConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SeedConfigError(parsed.error.issues.map(describeIssue));
  }

  const problems = crossChecks(parsed.data);
  if (problems.length > 0) throw new SeedConfigError(problems);

  return { config: parsed.data, warnings: coverageWarnings(parsed.data) };
}
