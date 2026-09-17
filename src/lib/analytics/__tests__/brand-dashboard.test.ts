import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { buildBrandDashboard, type DashboardSessionRow } from '../brand-dashboard';

function row(overrides: Partial<DashboardSessionRow> = {}): DashboardSessionRow {
  return {
    sessionId: 's1',
    sessionDate: '2026-09-09',
    ownership: 'AGENCY',
    confidence: 'HIGH',
    status: 'DATA_COMPLETE',
    gmv: '30000000',
    orders: 30,
    itemsSold: 30,
    customers: 28,
    views: 10000,
    productImpressions: 9000,
    productClicks: 1200,
    liveMinutes: 180,
    targetGmv: '25000000',
    hasUnallocated: false,
    hostNames: ['Khói'],
    ...overrides,
  };
}

function tile(dashboard: ReturnType<typeof buildBrandDashboard>, label: string) {
  return dashboard.tiles.find((item) => item.label === label)!;
}

describe('dashboard brand', () => {
  it('E4: ca brand tự live không vào KPI agency, nhưng vẫn hiện riêng', async () => {
    const dashboard = buildBrandDashboard(
      [
        row(),
        row({ sessionId: 's2', ownership: 'BRAND_INHOUSE', gmv: '10000000', hostNames: [] }),
      ],
      'Tháng 9',
    );

    expect(dashboard.gmvDisplay).toBe('30.000.000 ₫');
    expect(tile(dashboard, 'Số ca').value).toBe('1');
    expect(dashboard.inhouseGmvDisplay).toBe('10.000.000 ₫');
    expect(dashboard.inhouseShareLabel).toBe('25% GMV toàn shop kỳ này');
  });

  it('ca chưa rõ ownership bị loại khỏi cả tử số lẫn mẫu số', async () => {
    const dashboard = buildBrandDashboard(
      [row(), row({ sessionId: 's2', ownership: 'UNKNOWN', gmv: '99000000', hostNames: [] })],
      'Tháng 9',
    );

    expect(dashboard.gmvDisplay).toBe('30.000.000 ₫');
    expect(tile(dashboard, 'Số ca').value).toBe('1');
  });

  it('E3: gộp bằng cách cộng tử số và mẫu số, không lấy trung bình các tỷ lệ', async () => {
    const dashboard = buildBrandDashboard(
      [
        row({ gmv: '30000000', orders: 30, liveMinutes: 180 }),
        row({ sessionId: 's2', gmv: '10000000', orders: 5, liveMinutes: 60 }),
      ],
      'Tháng 9',
    );

    // 40.000.000 / 35 = 1.142.857, không phải trung bình của 1.000.000 và 2.000.000
    expect(tile(dashboard, 'AOV').value).toBe('1.142.857 ₫');
    // 40.000.000 / 4 giờ = 10.000.000
    expect(tile(dashboard, 'GMV / giờ').value).toBe('10.000.000 ₫');
  });

  it('E5: chưa ca nào đặt target thì không quy ra 0%', async () => {
    const dashboard = buildBrandDashboard([row({ targetGmv: null })], 'Tháng 9');

    expect(tile(dashboard, 'Đạt target').value).toBe('—');
    expect(tile(dashboard, 'Đạt target').caveat).toContain('Chưa ca nào đặt target');
  });

  it('biểu đồ ngày tách riêng phần agency và phần brand tự live', async () => {
    const dashboard = buildBrandDashboard(
      [
        row({ sessionDate: '2026-09-09' }),
        row({
          sessionId: 's2',
          sessionDate: '2026-09-09',
          ownership: 'BRAND_INHOUSE',
          gmv: '5000000',
          hostNames: [],
        }),
        row({ sessionId: 's3', sessionDate: '2026-09-10', gmv: '20000000' }),
      ],
      'Tháng 9',
    );

    expect(dashboard.daily).toHaveLength(2);
    expect(dashboard.daily[0]).toMatchObject({
      label: '09/09',
      agencyGmv: 30000000,
      inhouseGmv: 5000000,
      targetGmv: 25000000,
    });
    expect(dashboard.daily[1].inhouseGmv).toBe(0);
  });

  it('ca chưa quy kết được không làm cả kỳ mất số, chỉ bị loại và nêu rõ', async () => {
    const dashboard = buildBrandDashboard(
      [
        row({ gmv: '30000000' }),
        row({ sessionId: 's2', gmv: null, hasUnallocated: true, orders: null, liveMinutes: null }),
      ],
      'Tháng 9',
    );

    // One unsplittable shift must not blank out the whole period.
    expect(dashboard.gmvDisplay).toBe('30.000.000 ₫');
    expect(dashboard.excludedSessions).toBe(1);
    // It still counts as a shift that happened.
    expect(tile(dashboard, 'Số ca').value).toBe('2');
    // Achievement compares like with like: only the shifts in the numerator.
    expect(tile(dashboard, 'Đạt target').value).toBe('120,0%');

    const host = dashboard.hosts[0];
    expect(host.sessions).toBe(2);
    expect(host.unallocatedSessions).toBe(1);
    expect(host.gmvDisplay).toBe('30.000.000 ₫');
  });

  it('không xếp hạng host bằng một con số duy nhất', async () => {
    const dashboard = buildBrandDashboard(
      [
        row({ hostNames: ['Khói'] }),
        row({ sessionId: 's2', gmv: '50000000', liveMinutes: 480, hostNames: ['Linh Ân'] }),
      ],
      'Tháng 9',
    );

    // Every host row carries the context needed to read its numbers fairly.
    for (const host of dashboard.hosts) {
      expect(host.gmvPerHourDisplay).not.toBe('');
      expect(host.liveHoursDisplay).not.toBe('');
      expect(host.aovDisplay).not.toBe('');
      expect(host.sessions).toBeGreaterThan(0);
    }
  });

  it('GMV chưa quy kết là chỉ số chất lượng, càng lớn càng nghiêm trọng', async () => {
    const clean = buildBrandDashboard([row()], 'Tháng 9', new Decimal(0));
    const dirty = buildBrandDashboard([row()], 'Tháng 9', new Decimal('77025508.90'));

    const find = (dashboard: ReturnType<typeof buildBrandDashboard>) =>
      dashboard.quality.find((item) => item.label === 'GMV chưa quy kết được')!;

    expect(find(clean).status).toBe('good');
    expect(find(dirty).status).toBe('critical');
    expect(find(dirty).value).toBe('77.025.509 ₫');
  });

  it('F2: dashboard không có bất kỳ chỉ số ads nào', async () => {
    const dashboard = buildBrandDashboard([row()], 'Tháng 9');
    const labels = [...dashboard.tiles, ...dashboard.quality]
      .map((item) => item.label.toLowerCase())
      .join(' ');

    for (const forbidden of ['ads', 'roas', 'chi phí', 'spend']) {
      expect(labels).not.toContain(forbidden);
    }
  });
});
