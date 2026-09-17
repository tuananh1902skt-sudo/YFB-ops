# YFB Live Agency OS — Project Rules

Đọc `docs/00_INDEX.md` trước khi làm bất cứ việc gì trên repo này.

Tech stack: Next.js (TypeScript) + Supabase (PostgreSQL, Auth, Storage).

---

## Quy tắc không được vi phạm

### Dữ liệu

1. **Không bao giờ giả định 1 Room ID = 1 ca live**, và ngược lại. Quan hệ là nhiều-nhiều.
2. **Không sửa dữ liệu raw đã import** (`raw_import_rows`, `room_snapshots`). Sửa sai đi
   qua import mới + event `UPLOAD_CORRECTED`.
3. **`Room ID` luôn là string**, không parse thành number — 19 chữ số vượt giới hạn số
   nguyên an toàn của JavaScript, parse sẽ sai âm thầm.
4. **Không chia đều GMV** giữa các ca khi thiếu snapshot. Dùng `SHARED_UNALLOCATED`.
5. **Không quy `null` về 0**. Mẫu số bằng 0 → trả `N/A`, không trả 0.

### Tính toán

6. **Mọi KPI tính ở KPI service duy nhất.** Không tính trong component UI, không tính
   trong câu query của riêng từng màn hình.
7. **Chỉ trừ snapshot với trường cộng dồn.** Chỉ số dẫn xuất (AOV, CTR, CVR, GMV/giờ…)
   phải tính lại từ số đã tách. Danh sách trường nào thuộc loại nào:
   `docs/03_TIKTOK_DATA_MAPPING.md` mục A.4.
8. **Không lấy trung bình của trung bình.** Gộp cấp cao hơn = cộng tử số và mẫu số gốc
   rồi chia lại.
9. **KPI agency chỉ tính trên ca `ownership = 'AGENCY'`.** Loại `BRAND_INHOUSE` và
   `UNKNOWN` khỏi cả tử số lẫn mẫu số.
10. **Không hiển thị bất kỳ chỉ số ads nào ở cấp ca/host/campaign.** Ads chỉ có dữ liệu
    cấp ngày và phạm vi toàn shop.

### Vận hành

11. **Mọi override thủ công phải có lý do và ghi audit log.**
12. **Không hard-code**: tên brand, tên campaign, khung giờ ca, công thức KPI, tỷ lệ hoàn,
    ngưỡng thời gian. Tất cả là cấu hình hoặc dữ liệu.
13. **Không im lặng nuốt lỗi import.** Dòng lỗi phải hiện trong báo cáo import kèm lý do
    và hành động đề xuất.
14. Parse file **ở server**, không parse trong trình duyệt.

### Tài liệu

15. Thêm trường DB mới → cập nhật `docs/02_DATA_DICTIONARY.md` trước.
16. Thêm KPI mới → cập nhật `docs/05_KPI_DICTIONARY.md` trước, kèm khai báo cấp được
    phép tính.
17. Đổi rule nghiệp vụ → cập nhật `docs/01_BUSINESS_RULES.md`, không chỉ sửa code.

---

## Thứ tự ưu tiên khi có mâu thuẫn

```
Kiến trúc dữ liệu đúng
  > Logic nghiệp vụ đúng
  > Quy trình chạy được
  > Phân tích/dashboard
  > UI đẹp
  > AI
```

Không build dashboard trước khi import engine và attribution engine chạy đúng với dữ
liệu thật.

## Ngôn ngữ

- Tài liệu và giao tiếp: tiếng Việt.
- Code, tên bảng, tên trường, commit message: tiếng Anh.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
