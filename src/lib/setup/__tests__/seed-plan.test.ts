import { describe, expect, it } from 'vitest';
import { parseSeedConfig, type SeedConfig } from '../seed-config';
import { EMPTY_ORGANISATION, isNoop, planSeed, type ExistingOrganisation } from '../seed-plan';
import { countChanges, describePlan } from '../seed-report';

const CONFIG: SeedConfig = parseSeedConfig({
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
  settings: { room_continuity_max_gap_hours: 8 },
}).config;

/** Trạng thái database sau khi seed đúng một lần với CONFIG. */
function seeded(overrides: Partial<ExistingOrganisation> = {}): ExistingOrganisation {
  return {
    clients: [{ id: 'client-1', code: 'CTY_A', name: 'Công ty A' }],
    brands: [{ id: 'brand-1', clientId: 'client-1', code: 'BRAND_1', name: 'Brand Một' }],
    accounts: [
      {
        id: 'acc-1',
        brandId: 'brand-1',
        accountName: 'Brand Một Official',
        platform: 'TIKTOK_SHOP',
        externalShopId: null,
        estimatedRefundRate: 0.05,
      },
    ],
    users: [
      { id: 'user-1', email: 'ops@cty.vn', fullName: 'Nguyễn Vận Hành', phone: null, isActive: true },
    ],
    roles: [{ userId: 'user-1', role: 'OPERATION', brandId: 'brand-1' }],
    settings: [{ key: 'room_continuity_max_gap_hours', value: 8 }],
    ...overrides,
  };
}

describe('kế hoạch seed', () => {
  it('trên database trống thì tạo mới toàn bộ', () => {
    const plan = planSeed(CONFIG, EMPTY_ORGANISATION);

    expect(plan.client.change).toBe('CREATE');
    expect(plan.brands[0].change).toBe('CREATE');
    expect(plan.accounts[0].change).toBe('CREATE');
    expect(plan.users[0].change).toBe('CREATE');
    expect(plan.roles[0].change).toBe('CREATE');
    expect(plan.settings[0].change).toBe('CREATE');
  });

  it('chạy lần thứ hai không còn gì để đổi', () => {
    const plan = planSeed(CONFIG, seeded());

    expect(isNoop(plan)).toBe(true);
    expect(countChanges(plan)).toBe(0);
  });

  it('đổi tên brand là cập nhật, không phải tạo brand thứ hai', () => {
    const existing = seeded();
    existing.brands[0].name = 'Tên cũ';

    const plan = planSeed(CONFIG, existing);

    expect(plan.brands).toHaveLength(1);
    expect(plan.brands[0].change).toBe('UPDATE');
    expect(plan.brands[0].id).toBe('brand-1');
  });

  it('không nhận nhầm brand cùng mã của client khác', () => {
    const existing = seeded({
      brands: [{ id: 'brand-khac', clientId: 'client-khac', code: 'BRAND_1', name: 'Brand Một' }],
    });

    const plan = planSeed(CONFIG, existing);

    expect(plan.brands[0].change).toBe('CREATE');
  });

  it('bỏ trống tỷ lệ hoàn thì giữ nguyên giá trị đang có, không ghi đè bằng 0', () => {
    const config = parseSeedConfig({
      ...CONFIG,
      brands: [{ ...CONFIG.brands[0], platformAccounts: [{ accountName: 'Brand Một Official' }] }],
    }).config;

    const plan = planSeed(config, seeded());

    expect(plan.accounts[0].change).toBe('UNCHANGED');
  });

  it('tỷ lệ hoàn lệch ở chữ số thứ năm không tạo cập nhật lặp vô hạn', () => {
    const config = parseSeedConfig({
      ...CONFIG,
      brands: [
        {
          ...CONFIG.brands[0],
          platformAccounts: [{ accountName: 'Brand Một Official', estimatedRefundRate: 0.050004 }],
        },
      ],
    }).config;

    expect(planSeed(config, seeded()).accounts[0].change).toBe('UNCHANGED');
  });

  it('nhân sự đang tắt được đánh dấu kích hoạt lại chứ không im lặng bỏ qua', () => {
    const existing = seeded();
    existing.users[0].isActive = false;

    const plan = planSeed(CONFIG, existing);

    expect(plan.users[0].change).toBe('REACTIVATE');
  });

  it('vai trò đã có thì không cấp lại', () => {
    const plan = planSeed(CONFIG, seeded());

    expect(plan.roles[0].change).toBe('UNCHANGED');
  });

  it('cấp thêm vai trò mới mà không đụng vai trò cũ', () => {
    const config = parseSeedConfig({
      ...CONFIG,
      users: [
        {
          email: 'ops@cty.vn',
          fullName: 'Nguyễn Vận Hành',
          roles: [
            { role: 'OPERATION', brand: 'BRAND_1' },
            { role: 'ASSISTANT', brand: 'BRAND_1' },
          ],
        },
      ],
    }).config;

    const plan = planSeed(config, seeded());

    expect(plan.roles.map((role) => role.change)).toEqual(['UNCHANGED', 'CREATE']);
    expect(plan.untracked.roles).toEqual([]);
  });

  it('báo cáo vai trò thừa trong database nhưng không xoá', () => {
    const existing = seeded();
    existing.roles.push({ userId: 'user-1', role: 'FINANCE', brandId: null });

    const plan = planSeed(CONFIG, existing);

    expect(plan.untracked.roles).toEqual([{ email: 'ops@cty.vn', role: 'FINANCE', brandCode: null }]);
    expect(isNoop(plan)).toBe(true);
  });

  it('báo cáo brand và nhân sự có trong database mà không có trong cấu hình', () => {
    const existing = seeded();
    existing.brands.push({ id: 'brand-2', clientId: 'client-1', code: 'BRAND_2', name: 'Brand Hai' });
    existing.users.push({
      id: 'user-2',
      email: 'ai-do@cty.vn',
      fullName: 'Ai Đó',
      phone: null,
      isActive: true,
    });

    const plan = planSeed(CONFIG, existing);

    expect(plan.untracked.brands).toEqual(['BRAND_2']);
    expect(plan.untracked.users).toEqual(['ai-do@cty.vn']);
    expect(isNoop(plan)).toBe(true);
  });

  it('ngưỡng hệ thống đổi giá trị thì cập nhật, giữ nguyên thì thôi', () => {
    const existing = seeded({ settings: [{ key: 'room_continuity_max_gap_hours', value: 6 }] });

    const plan = planSeed(CONFIG, existing);

    expect(plan.settings[0].change).toBe('UPDATE');
    expect(plan.settings[0].before).toBe(6);
  });

  it('bản mô tả nói rõ cái gì đổi thành cái gì', () => {
    const existing = seeded();
    existing.brands[0].name = 'Tên cũ';

    const text = describePlan(planSeed(CONFIG, existing)).join('\n');

    expect(text).toContain('"Tên cũ" → "Brand Một"');
    expect(text).toContain('hoàn ước tính 5,00%');
  });
});
