# YFB Live Agency Operating System — Bộ tài liệu đặc tả

Hệ thống vận hành cho agency livestream: từ kế hoạch ca live → phân công host/trợ live →
nhập dữ liệu nền tảng → tách kết quả từng ca → KPI → báo cáo.

**Thứ tự đọc bắt buộc** với bất kỳ ai (người hoặc AI) bắt đầu làm việc trên repo này:

| File | Nội dung | Đọc khi |
|---|---|---|
| `01_BUSINESS_RULES.md` | Quy tắc nghiệp vụ: ca vs Room, cơ chế tách ca nối, event log, ownership, target, hợp đồng | **Luôn đọc đầu tiên** |
| `02_DATA_DICTIONARY.md` | Từ điển khái niệm + toàn bộ giá trị enum chuẩn | Trước khi thêm trường/enum mới |
| `03_TIKTOK_DATA_MAPPING.md` | Ánh xạ từng cột của 2 file export TikTok sang trường chuẩn | Khi làm import engine |
| `04_DATABASE_SCHEMA.md` | Schema PostgreSQL đầy đủ + RLS | Khi viết migration |
| `05_KPI_DICTIONARY.md` | Công thức chính xác mọi chỉ số, chỉ số nào cấm tính ở cấp nào | Khi làm dashboard/báo cáo |
| `06_UI_UX_SPEC.md` | Danh sách màn hình, luồng chính, quy ước hiển thị số | Khi làm giao diện |
| `07_TEST_CASES.md` | Bộ kiểm thử dựng từ dữ liệu thật + điều kiện hoàn thành | Khi viết engine và test |
| `08_SETUP.md` | Dựng hệ thống từ số không: Supabase, migration, seed, chạy thử | Khi cài đặt hoặc deploy |

---

## Bài toán cốt lõi của hệ thống

TikTok Shop ghi nhận theo **Room** (phiên phát sóng liên tục). Agency vận hành theo
**Ca** (khoảng thời gian có host/trợ live được phân công). Hai thứ này **không trùng
nhau**:

- **Ca nối**: nhiều ca agency nằm trong cùng 1 Room (bàn giao không tắt sóng)
- **Restart**: 1 ca agency bị cắt thành nhiều Room (mất mạng, hoặc chủ động làm mới traffic)
- **In-house**: brand tự live trên cùng tài khoản khi agency off ca

Cách giải: mỗi lần trợ live tải report tại thời điểm ca kết thúc tạo ra một **snapshot**
(số liệu cộng dồn từ đầu Room). Kết quả riêng của một ca = **hiệu số giữa hai snapshot
liền kề**. Chi tiết ở `01_BUSINESS_RULES.md` mục 6.

---

## Trạng thái hiện tại

- [x] Phân tích file export thật (live performance + ads)
- [x] Quy tắc nghiệp vụ & cơ chế attribution
- [x] Data dictionary & enum chuẩn
- [x] Mapping dữ liệu TikTok
- [x] Database schema
- [x] KPI dictionary
- [x] UI/UX spec
- [x] Test cases từ dữ liệu thật
- [x] Migration & khởi tạo project
- [x] Import engine (parser + chống trùng + lưu trữ)
- [x] Attribution engine (tách ca, đã chạy đúng trên file thật)
- [x] Màn hình upload & đối soát cho trợ live
- [x] Hàng đợi Operation + xác nhận ownership
- [x] Live Console — log sự kiện trong ca (event log là input của attribution)
- [x] Chi tiết ca (truy vết "con số này ở đâu ra")
- [x] Lịch live, tạo ca, phân ca (có cảnh báo trùng giờ)
- [x] Đăng ký ca & duyệt đăng ký (shift_bookings)
- [x] Dashboard brand (GMV/target, tách agency vs in-house, host, chất lượng dữ liệu)
- [x] Đăng nhập, trang chủ theo vai trò, kho file report có phân quyền
- [x] Script khởi tạo tổ chức (`npm run seed`) + hướng dẫn cài đặt
- [x] Dashboard tổng hợp nhiều brand (Management) — so sánh + danh sách việc cần xem

Kiểm chứng nhanh, không đụng database thật:

```
npx tsx scripts/dry-run-import.ts <file.xlsx>   # chạy cả pipeline trên file thật
./scripts/verify-migrations.sh                  # ràng buộc nghiệp vụ ở tầng DB
./scripts/verify-rls.sh                         # phân quyền theo từng vai trò
```

Xem thử giao diện (không cần Supabase): `/demo/upload`, `/demo/operations`,
`/demo/live-console`, `/demo/session-detail`, `/demo/schedule`, `/demo/bookings`,
`/demo/dashboard`, `/demo/portfolio`.

Chạy thật với dữ liệu thật: làm theo `08_SETUP.md`.

## Phạm vi đã thống nhất là CHƯA làm

Ads ở cấp ca, refund thật, KPI theo SKU, forecast/benchmark, client portal, module tài
chính. Lý do từng mục ghi ở `05_KPI_DICTIONARY.md` mục 11.
