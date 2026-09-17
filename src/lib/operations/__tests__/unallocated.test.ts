import { describe, expect, it } from 'vitest';
import { sumUnallocated } from '../unallocated';

describe('tổng GMV chưa quy kết', () => {
  it('một đoạn chung của hai ca chỉ tính một lần', async () => {
    const total = sumUnallocated([
      { sourceSnapshotId: 's2', prevSnapshotId: null, sourceGmv: '77025508.90', prevGmv: null },
      { sourceSnapshotId: 's2', prevSnapshotId: null, sourceGmv: '77025508.90', prevGmv: null },
    ]);

    expect(total.count).toBe(1);
    expect(total.amount.toString()).toBe('77025508.9');
  });

  it('đoạn có snapshot trước thì lấy phần chênh lệch', async () => {
    const total = sumUnallocated([
      { sourceSnapshotId: 's3', prevSnapshotId: 's1', sourceGmv: '77025508.90', prevGmv: '30000000' },
    ]);

    expect(total.amount.toString()).toBe('47025508.9');
  });

  it('nhiều đoạn khác nhau thì cộng lại', async () => {
    const total = sumUnallocated([
      { sourceSnapshotId: 'a', prevSnapshotId: null, sourceGmv: '1000000', prevGmv: null },
      { sourceSnapshotId: 'b', prevSnapshotId: 'a', sourceGmv: '3000000', prevGmv: '1000000' },
    ]);

    expect(total.count).toBe(2);
    expect(total.amount.toString()).toBe('3000000');
  });

  it('đoạn chưa có số thì không tính bừa thành 0', async () => {
    const total = sumUnallocated([
      { sourceSnapshotId: 'a', prevSnapshotId: null, sourceGmv: null, prevGmv: null },
    ]);

    expect(total.count).toBe(0);
    expect(total.amount.toString()).toBe('0');
  });
});
