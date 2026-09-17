import { describe, expect, it } from 'vitest';
import { buildSessionDetailView } from '../detail-view';
import type { DetailAttribution, SessionDetail } from '../detail-types';

function attribution(overrides: Partial<DetailAttribution> = {}): DetailAttribution {
  return {
    id: 'attr-1',
    method: 'SNAPSHOT_DELTA',
    confidence: 'HIGH',
    platformRoomId: '7683365340126808852',
    segmentStartAt: '2026-09-09T13:00:00+07:00',
    segmentEndAt: '2026-09-09T16:02:48+07:00',
    durationMinutes: 182.8,
    gmv: '47025508.90',
    orders: 52,
    itemsSold: 60,
    customers: 48,
    views: 12000,
    productImpressions: 9000,
    productClicks: 1200,
    newFollowers: 130,
    sourceSnapshot: {
      snapshotId: 's2',
      endAt: '2026-09-09T16:02:48+07:00',
      gmv: '77025508.90',
      orders: 82,
      importId: 'import-2',
      fileName: 'Creator-Live-Performance_20260909160312.xlsx',
    },
    previousSnapshot: {
      snapshotId: 's1',
      endAt: '2026-09-09T13:00:00+07:00',
      gmv: '30000000.00',
      orders: 30,
      importId: 'import-1',
      fileName: 'Creator-Live-Performance_20260909130000.xlsx',
    },
    computedReason: null,
    overrideReason: null,
    computedAt: '2026-09-09T16:05:00+07:00',
    isCurrent: true,
    ...overrides,
  };
}

function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    sessionId: 'session-1',
    brandName: 'Franklin',
    sessionDate: '09/09/2026',
    status: 'DATA_COMPLETE',
    ownership: 'AGENCY',
    confidence: 'HIGH',
    plannedStartAt: '2026-09-09T13:00:00+07:00',
    plannedEndAt: '2026-09-09T16:00:00+07:00',
    actualStartAt: '2026-09-09T13:00:00+07:00',
    actualEndAt: '2026-09-09T16:02:48+07:00',
    targetGmv: '30000000',
    staff: [{ name: 'Khói', role: 'HOST', startedAt: null, endedAt: null }],
    events: [],
    attributions: [attribution()],
    auditLogs: [],
    ...overrides,
  };
}

describe('màn chi tiết ca — truy vết con số', () => {
  it('hiện đủ chuỗi snapshot → phép trừ → kết quả, kèm file gốc của từng số', async () => {
    const view = buildSessionDetailView(detail());
    const block = view.lineage[0];

    expect(block.steps.map((step) => [step.operation, step.label, step.amount])).toEqual([
      ['BASE', 'Số cộng dồn lúc 16:02', '77.025.509 ₫'],
      ['SUBTRACT', 'Trừ số cộng dồn lúc 13:00', '30.000.000 ₫'],
      ['RESULT', 'Kết quả đoạn này', '47.025.509 ₫'],
    ]);
    // Each figure is traceable back to the upload it arrived in.
    expect(block.steps[0].fileName).toContain('20260909160312');
    expect(block.steps[1].importId).toBe('import-1');
  });

  it('E1: chỉ số dẫn xuất tính lại từ số đã tách, không lấy từ file', async () => {
    const view = buildSessionDetailView(detail());
    const byLabel = new Map(view.kpis.map((kpi) => [kpi.label, kpi.value]));

    // 47.025.508,90 / 52 = 904.336,71 — not the AOV the export reported for the
    // whole room.
    expect(byLabel.get('AOV')).toBe('904.337 ₫');
    // 1200 / 9000 = 13,3%
    expect(byLabel.get('CTR sản phẩm')).toBe('13.3%');
  });

  it('E6: thời lượng lấy từ mốc snapshot, không lấy cột Duration của file', async () => {
    const view = buildSessionDetailView(detail());
    const duration = view.planActual.find((row) => row.label === 'Thời lượng live')!;

    expect(duration.actual).toBe('3h 03m');
    expect(duration.note).toContain('không lấy cột Duration');
  });

  it('E2: mẫu số 0 thì trả N/A, không trả 0', async () => {
    const view = buildSessionDetailView(
      detail({ attributions: [attribution({ orders: 0, productClicks: 0 })] }),
    );
    const byLabel = new Map(view.kpis.map((kpi) => [kpi.label, kpi.value]));

    expect(byLabel.get('AOV')).toBe('—');
    expect(byLabel.get('CVR (trên click)')).toBe('—');
  });

  it('E5: chưa đặt target thì không quy ra 0%', async () => {
    const view = buildSessionDetailView(detail({ targetGmv: null }));
    const achievement = view.kpis.find((kpi) => kpi.label === 'Đạt target')!;

    expect(achievement.value).toBe('—');
    expect(achievement.caveat).toContain('không quy ra 0%');
  });

  it('khách mua ở cấp ca luôn kèm cảnh báo đếm hụt', async () => {
    const view = buildSessionDetailView(detail());
    const customers = view.kpis.find((kpi) => kpi.label === 'Khách mua')!;

    expect(customers.caveat).toContain('đếm hụt');
  });

  it('ca không thuộc agency bị đánh dấu là không tính vào KPI agency', async () => {
    const view = buildSessionDetailView(detail({ ownership: 'BRAND_INHOUSE' }));

    expect(view.countsTowardAgency).toBe(false);
    expect(view.ownershipLabel).toBe('Brand tự live');
  });

  it('off sớm được nêu rõ cạnh mốc kết thúc', async () => {
    const view = buildSessionDetailView(
      detail({ actualEndAt: '2026-09-09T15:00:00+07:00' }),
    );

    expect(view.planActual.find((row) => row.label === 'Kết thúc')!.note).toBe('Off sớm 1h 00m');
  });

  it('đoạn chưa quy kết hiện "Gộp chung", không hiện số chia đôi', async () => {
    const view = buildSessionDetailView(
      detail({
        attributions: [
          attribution({ method: 'SHARED_UNALLOCATED', gmv: null, orders: null, confidence: 'LOW' }),
        ],
      }),
    );

    expect(view.gmvDisplay).toBe('Gộp chung');
    expect(view.lineage[0].steps.at(-1)!.amount).toBe('Gộp chung');
  });

  it('kết quả cũ vẫn xem được trong lịch sử sau khi tính lại', async () => {
    const view = buildSessionDetailView(
      detail({
        attributions: [
          attribution({ id: 'old', isCurrent: false, gmv: '38512754.45', computedAt: '2026-09-09T16:03:00+07:00' }),
          attribution(),
        ],
        auditLogs: [
          {
            id: 'audit-1',
            action: 'OWNERSHIP_CONFIRMED',
            reason: 'Brand xác nhận agency vận hành',
            actorName: 'Operation',
            createdAt: '2026-09-09T17:00:00+07:00',
          },
        ],
      }),
    );

    // Audit actions are stored as codes but never shown as codes.
    expect(view.history.map((entry) => entry.title)).toEqual([
      'Kết quả cũ, đã được tính lại',
      'Operation xác nhận ai vận hành ca',
    ]);
    expect(view.history[0].detail).toContain('38.512.754 ₫');
    // The superseded row is history only; it never enters the current total.
    expect(view.gmvDisplay).toBe('47.025.509 ₫');
  });

  it('F2: không có bất kỳ chỉ số ads nào ở cấp ca', async () => {
    const view = buildSessionDetailView(detail());
    const labels = view.kpis.map((kpi) => kpi.label.toLowerCase()).join(' ');

    for (const forbidden of ['ads', 'roas', 'chi phí', 'spend']) {
      expect(labels).not.toContain(forbidden);
    }
  });
});
