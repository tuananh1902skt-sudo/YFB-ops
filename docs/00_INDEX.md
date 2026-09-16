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
- [ ] Migration & khởi tạo project
- [ ] Import engine
- [ ] Attribution engine
- [ ] Operations UI (planning, calendar, shift, session)
- [ ] Dashboard

## Phạm vi đã thống nhất là CHƯA làm

Ads ở cấp ca, refund thật, KPI theo SKU, forecast/benchmark, client portal, module tài
chính. Lý do từng mục ghi ở `05_KPI_DICTIONARY.md` mục 11.
