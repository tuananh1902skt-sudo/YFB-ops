import { describe, expect, it } from 'vitest';
import { parseSeedConfig, SeedConfigError } from '../seed-config';

function baseConfig(): Record<string, unknown> {
  return {
    client: { name: 'Công ty A', code: 'CTY_A' },
    brands: [
      {
        name: 'Brand Một',
        code: 'BRAND_1',
        platformAccounts: [{ accountName: 'Brand Một Official', estimatedRefundRate: 0.05 }],
      },
    ],
    users: [
      { email: 'ops@cty.vn', fullName: 'Nguyễn Vận Hành', roles: [{ role: 'OPERATION', brand: 'BRAND_1' }] },
    ],
  };
}

function problemsOf(raw: unknown): string[] {
  try {
    parseSeedConfig(raw);
  } catch (error) {
    if (error instanceof SeedConfigError) return error.problems;
    throw error;
  }
  throw new Error('Cấu hình lẽ ra phải bị từ chối');
}

describe('cấu hình seed', () => {
  it('nhận cấu hình tối thiểu và chuẩn hoá email về chữ thường', () => {
    const raw = baseConfig();
    (raw.users as Record<string, unknown>[])[0].email = 'OPS@CTY.VN';

    const { config, warnings } = parseSeedConfig(raw);

    expect(config.users[0].email).toBe('ops@cty.vn');
    expect(config.brands[0].platformAccounts[0].platform).toBe('TIKTOK_SHOP');
    expect(warnings).toEqual([]);
  });

  it('chặn vai trò gắn brand mà không khai brand, vì người đó sẽ không thấy gì', () => {
    const raw = baseConfig();
    (raw.users as Record<string, unknown>[])[0].roles = [{ role: 'HOST' }];

    expect(problemsOf(raw).join(' ')).toContain('không thấy dữ liệu nào');
  });

  it('chặn vai trò toàn hệ thống bị gắn vào một brand', () => {
    const raw = baseConfig();
    (raw.users as Record<string, unknown>[])[0].roles = [{ role: 'MANAGEMENT', brand: 'BRAND_1' }];

    expect(problemsOf(raw).join(' ')).toContain('vai trò toàn hệ thống');
  });

  it('chặn vai trò trỏ vào brand chưa khai báo', () => {
    const raw = baseConfig();
    (raw.users as Record<string, unknown>[])[0].roles = [{ role: 'HOST', brand: 'BRAND_KHONG_CO' }];

    expect(problemsOf(raw).join(' ')).toContain('BRAND_KHONG_CO');
  });

  it('chặn mã brand trùng và email trùng', () => {
    const raw = baseConfig();
    const brands = raw.brands as Record<string, unknown>[];
    raw.brands = [brands[0], { ...brands[0], name: 'Brand khác' }];
    const users = raw.users as Record<string, unknown>[];
    raw.users = [users[0], { ...users[0], fullName: 'Người khác' }];

    const problems = problemsOf(raw).join(' ');
    expect(problems).toContain('BRAND_1');
    expect(problems).toContain('ops@cty.vn');
  });

  it('chặn key ngưỡng hệ thống gõ sai thay vì ghi im lặng', () => {
    const raw = baseConfig();
    raw.settings = { room_continuity_max_gap_hour: 8 };

    expect(() => parseSeedConfig(raw)).toThrow(SeedConfigError);
  });

  it('cảnh báo khi một brand không có ai đủ quyền tạo ca', () => {
    const raw = baseConfig();
    (raw.users as Record<string, unknown>[])[0].roles = [{ role: 'HOST', brand: 'BRAND_1' }];

    const { warnings } = parseSeedConfig(raw);

    expect(warnings.join(' ')).toContain('BRAND_1');
    expect(warnings.join(' ')).toContain('OPERATION');
  });

  it('cảnh báo khi chưa khai tỷ lệ hoàn, vì NMV sẽ bằng đúng GMV', () => {
    const raw = baseConfig();
    const brand = (raw.brands as Record<string, unknown>[])[0];
    brand.platformAccounts = [{ accountName: 'Brand Một Official' }];

    const { warnings } = parseSeedConfig(raw);

    expect(warnings.join(' ')).toContain('NMV ước tính sẽ bằng đúng GMV');
  });

  it('cho phép vai trò toàn hệ thống đứng một mình', () => {
    const raw = baseConfig();
    (raw.users as Record<string, unknown>[]).push({
      email: 'ceo@cty.vn',
      fullName: 'Người quản lý',
      roles: [{ role: 'MANAGEMENT' }],
    });

    expect(parseSeedConfig(raw).config.users).toHaveLength(2);
  });
});
