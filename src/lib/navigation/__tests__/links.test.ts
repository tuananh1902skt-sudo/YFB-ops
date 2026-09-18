import { describe, expect, it } from 'vitest';
import { linksFor } from '../links';

describe('link trên trang chủ', () => {
  it('trợ live thấy đường nộp dữ liệu, không thấy hàng đợi Operation', () => {
    const hrefs = linksFor(['ASSISTANT']).map((link) => link.href);

    expect(hrefs).toContain('/upload');
    expect(hrefs).not.toContain('/operations');
    expect(hrefs).not.toContain('/operations/ownership');
  });

  it('Operation thấy cả hàng đợi lẫn xác nhận ownership', () => {
    const hrefs = linksFor(['OPERATION']).map((link) => link.href);

    expect(hrefs).toContain('/operations');
    expect(hrefs).toContain('/operations/ownership');
  });

  it('Finance chỉ thấy phần kết quả, không thấy màn hình vận hành', () => {
    expect(linksFor(['FINANCE']).map((link) => link.href)).toEqual(['/dashboard/all', '/dashboard']);
  });

  it('Operation không thấy dashboard tổng hợp — họ làm việc theo brand', () => {
    expect(linksFor(['OPERATION']).map((link) => link.href)).not.toContain('/dashboard/all');
  });

  it('người chưa có vai trò nào không thấy link nào', () => {
    expect(linksFor([])).toEqual([]);
  });

  it('nhiều vai trò gộp lại, không lặp link', () => {
    const hrefs = linksFor(['ASSISTANT', 'OPERATION']).map((link) => link.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain('/upload');
    expect(hrefs).toContain('/operations');
  });
});
