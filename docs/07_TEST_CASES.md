# 07 — Test Cases

Status: DRAFT — v0.1

Bộ kiểm thử cho import engine, attribution engine và KPI engine. Toàn bộ dữ liệu dùng
trong các case dưới đây **lấy từ file export thật** của YFB
(`Creator-Live-Performance_20260916172642.xlsx` và
`Campaign_overview_data_20260901_-_20260917.xlsx`), không phải số bịa.

**Quy tắc**: engine chưa chạy đúng toàn bộ nhóm C (Attribution) thì **không được build
dashboard**. Đây là điều kiện chặn, không phải khuyến nghị.

---

## 1. Fixture từ dữ liệu thật

Các Room dưới đây được trích từ file thật, dùng lại xuyên suốt các case.

| Mã fixture | Room ID | Thời gian | Thời lượng | GMV |
|---|---|---|---|---|
| `R-SIMPLE` | 7683505862182275861 | 09/09 19:07:06 → 22:07:37 | 3h00m | 30.329.959,79 ₫ |
| `R-LONG` | 7683365340126808852 | 09/09 10:01:57 → 16:02:48 | 6h00m | 77.025.508,90 ₫ |
| `R-SPLIT-A` | 7682391002071436053 | 06/09 19:00:52 → 20:10:06 | 1h09m | 6.065.697,98 ₫ |
| `R-SPLIT-B` | 7682409863158401812 | 06/09 20:14:01 → 22:07:29 | 1h53m | 11.155.600,01 ₫ |
| `R-MIDNIGHT` | 7685370600542391060 | 14/09 19:43:15 → 15/09 00:34:43 | 4h51m | 18.132.599,93 ₫ |
| `R-ABORT` | 7677196130832108309 | 23/08 19:02:05 → 19:04:13 | 0h02m | 0 ₫ |
| `R-NOISE` | 7658664691129158420 | 04/07 20:30:37 → 20:30:48 | 0h00m (11 giây) | 0 ₫ |
| `R-ZERO-VIEW` | 7658664691129158420 | như trên | — | `LIVE CTR` = chuỗi rỗng |

---

## 2. Nhóm A — Parser

### A1. Parse tiền tệ
**Cho**: chuỗi `"18,764,427.98₫"`
**Kỳ vọng**: `18764427.98` kiểu numeric.
Biến thể phải pass: `"0.00₫"` → `0`, `"77,025,508.90₫"` → `77025508.90`.

### A2. Parse phần trăm, chấp nhận > 100%
**Cho**: `"1293.103448%"` (giá trị thật của `Like rate` dòng đầu file)
**Kỳ vọng**: `1293.103448`, **không** báo lỗi, **không** kẹp về 100.

### A3. Chuỗi rỗng → NULL
**Cho**: `LIVE CTR` = `""` (fixture `R-ZERO-VIEW`)
**Kỳ vọng**: lưu `NULL`.
**Không được** lưu `0`. Test phải khẳng định `value IS NULL`.

### A4. Parse thời lượng
**Cho**: `"3h55m"` → `235` phút; `"0h00m"` → `0`; `"6h00m"` → `360`.

### A5. Giữ nguyên độ chính xác Room ID
**Cho**: `"7658657266417994504"`
**Kỳ vọng**: lưu và đọc ra **đúng chuỗi đó**.
**Test bắt buộc**: kiểm tra chuỗi trả về từ API bằng phép so sánh string. Nếu ở đâu đó
code parse sang `number`, giá trị sẽ thành `7658657266417994500` — test phải bắt được.

### A6. Bỏ qua dòng tiêu đề và dòng trống của file live
**Cho**: file có dòng 1 = `"2026-07-01 ~ 2026-09-17"`, dòng 2 trống, dòng 3 = header.
**Kỳ vọng**: `data_period` = 01/07–17/09, parse đúng **110 dòng dữ liệu**, không coi
dòng 1 là dữ liệu.

### A7. Loại dòng tổng của file ads
**Cho**: file ads có dòng cuối `Theo ngày = "-"`, `Chi phí = 18394437`.
**Kỳ vọng**: import **17 dòng**, không import dòng tổng.
**Test khẳng định**: `SUM(ads_spend)` trong DB = `18394437` (đúng bằng dòng tổng) — nếu
dòng tổng bị import nhầm, tổng sẽ gấp đôi.

### A8. Header lạ → không tự đoán
**Cho**: file có cột `"Gross Revenue"` thay vì `"Attributed GMV"`.
**Kỳ vọng**: import dừng ở trạng thái chờ mapping thủ công, **không** tự khớp theo phỏng
đoán, không import dòng nào.

---

## 3. Nhóm B — Import & chống trùng

### B1. Upload cùng một file hai lần
**Cho**: upload `R-SIMPLE` lần 1, rồi upload lại đúng file đó.
**Kỳ vọng**: lần 2 bị nhận diện trùng theo `(room_id, snapshot_end_at)`; **không** tạo
snapshot mới; GMV của ca **không đổi**.

### B2. Hai file khác nhau chứa cùng một Room
**Cho**: file per-ca đã tạo snapshot lúc 22:07:37 cho `R-SIMPLE`; sau đó import file
bulk 2,5 tháng cũng chứa Room này với cùng `End Time`.
**Kỳ vọng**: không tạo snapshot trùng, không cộng dồn hai lần.

### B3. File bulk tạo snapshot đuôi hợp lệ
**Cho**: ca đã upload snapshot lúc 12:00; sau đó file bulk chứa cùng Room với
`End Time` = 16:02:48 và số lớn hơn.
**Kỳ vọng**: tạo **snapshot mới** (hợp lệ, không phải trùng). Phần chênh lệch
`16:02 − 12:00` chưa thuộc ca nào → tạo đoạn `UNKNOWN` đưa vào hàng đợi Operation.
**Không** tự gán phần chênh lệch đó cho ca 12:00.

### B4. Import lại ads cùng ngày
**Cho**: `ads_daily` đã có 09/09 = 2.652.354 ₫; import lại file chứa 09/09 với số khác.
**Kỳ vọng**: ghi đè (vì TikTok cập nhật số sau), ghi `audit_logs` với giá trị cũ và mới.
**Không** tạo dòng thứ hai cho cùng ngày.

---

## 4. Nhóm C — Attribution (nhóm quan trọng nhất)

### C1. Ca đơn giản — 1 room = 1 ca
**Cho**: ca 09/09 19:00–22:00 của Franklin; upload 1 snapshot `R-SIMPLE`.
**Kỳ vọng**:
- `method = FULL_SNAPSHOT`
- `gmv = 30.329.959,79`
- `live_hours = 3h00m` (19:07:06 → 22:07:37)
- `confidence = HIGH`

### C2. Ca nối — 1 room, 2 ca
**Cho**: `R-LONG` (10:01:57 → 16:02:48, GMV cuối 77.025.508,90).
Ca sáng kết thúc 13:00, trợ live upload snapshot #1: GMV cộng dồn 30.000.000.
Ca chiều kết thúc 16:02, upload snapshot #2: GMV cộng dồn 77.025.508,90.
**Kỳ vọng**:

| Ca | method | GMV | live_hours |
|---|---|---|---|
| Ca sáng | `FULL_SNAPSHOT` | 30.000.000 | 10:01:57 → 13:00 |
| Ca chiều | `SNAPSHOT_DELTA` | **47.025.508,90** | 13:00 → 16:02:48 |

**Khẳng định bắt buộc**: tổng GMV 2 ca = đúng 77.025.508,90 — không thừa, không thiếu.

### C3. Ca nối 3 ca liên tiếp
Như C2 nhưng 3 snapshot. Kỳ vọng: ca 1 `FULL_SNAPSHOT`, ca 2 và 3 `SNAPSHOT_DELTA`,
tổng 3 ca = snapshot cuối.

### C4. Restart — 2 room, 1 ca
**Cho**: ca tối 06/09 19:00–22:00. Trợ live log `RESTART_TECHNICAL` lúc 20:12 (lý do:
mất mạng). Upload snapshot cho `R-SPLIT-A` và `R-SPLIT-B`.
**Kỳ vọng**:
- Ca có **2 dòng** `session_attributions`, `method = ROOM_SUM`
- Tổng GMV ca = `6.065.697,98 + 11.155.600,01` = **17.221.297,99**
- `live_hours` = 1h09m + 1h53m = **3h02m** (không tính 4 phút gián đoạn)
- `confidence = MEDIUM`

### C5. Restart kết hợp ca nối
**Cho**: ca A và ca B nối nhau, ca B có restart giữa chừng.
**Kỳ vọng**: ca B = (delta trong room 1) + (toàn bộ room 2). Không bỏ sót đoạn nào.

### C6. Thiếu snapshot ở ranh giới bàn giao
**Cho**: `R-LONG`, ca sáng **quên upload**, chỉ có snapshot cuối 16:02 = 77.025.508,90.
**Kỳ vọng**:
- Tạo dòng `SHARED_UNALLOCATED` cho **cụm 2 ca**, GMV của từng ca = `NULL`
- **Không** chia đôi 38,5tr mỗi ca
- **Không** gán toàn bộ 77tr cho ca chiều
- `confidence = LOW`
- Xuất hiện trong hàng đợi Operation với số tiền 77.025.508,90 chưa quy kết
- KPI của host 2 ca này: có ghi nhận tham gia, **không** có GMV cá nhân

### C7. Delta ra số âm
**Cho**: snapshot #2 có GMV **nhỏ hơn** snapshot #1 (dấu hiệu upload sai thứ tự / nhầm ca).
**Kỳ vọng**: **không** ghi dòng attribution; ca chuyển `NEEDS_REVIEW`; hiện lý do cụ thể
cho Operation. Ràng buộc DB `no_negative_gmv` phải chặn ở tầng cuối cùng.

### C8. Room ID quay lại sau hơn 8 tiếng
**Cho**: cùng Room ID xuất hiện lại sau 30 tiếng.
**Kỳ vọng**: **không** tự nối vào ca cũ; đưa vào `NEEDS_REVIEW`.

### C9. Ca qua nửa đêm
**Cho**: `R-MIDNIGHT` (14/09 19:43:15 → 15/09 00:34:43).
**Kỳ vọng**: `session_date = 14/09` (ngày bắt đầu), `live_hours = 4h51m`, **không** tách
thành 2 ca theo ngày lịch.

### C10. Room rác (vài giây, GMV 0)
**Cho**: `R-NOISE` (11 giây, GMV 0) xuất hiện giữa 2 room thật.
**Kỳ vọng**: vẫn lưu raw đầy đủ; **không** làm hỏng việc khớp ca của các room khác;
không tạo ca mới; không làm `live_hours` sai lệch.

### C11. Room có thật nhưng GMV 0
**Cho**: `R-ABORT` (2 phút, GMV 0) — team bật rồi tắt ngay.
**Kỳ vọng**: GMV ca = `0` (**không** phải `NULL`, vì đây là số đo được thật). AOV = `N/A`
vì orders = 0.

### C12. Tính lại sau khi Operation sửa
**Cho**: ca đã tính xong; Operation sửa gắn nhãn snapshot sang ca khác (event
`UPLOAD_CORRECTED`).
**Kỳ vọng**: dòng attribution cũ `is_current = false` (vẫn còn trong DB), dòng mới được
tạo, `audit_logs` ghi trước/sau, dashboard cập nhật theo số mới.

---

## 5. Nhóm D — Ownership

### D1. Đoạn live không khớp ca nào
**Cho**: snapshot của một room chạy 09:00–11:00, không có ca agency nào đã book khung đó.
**Kỳ vọng**: `ownership = UNKNOWN`, vào hàng đợi Operation, **bị loại khỏi mọi KPI** cho
tới khi xác nhận.

### D2. Operation xác nhận brand tự live
**Cho**: D1, Operation chọn `Brand tự live`.
**Kỳ vọng**: `ownership = BRAND_INHOUSE`; GMV **không** vào target achievement của agency,
**không** vào hiệu suất host nào; vẫn hiện ở báo cáo toàn shop có ghi chú; ghi
`ownership_confirmed_by` và `ownership_confirmed_at`.

### D3. Trợ live không được tự đổi ownership
**Cho**: user role `ASSISTANT` gọi API đổi `ownership`.
**Kỳ vọng**: bị từ chối (RLS chặn ở tầng DB, không chỉ ở UI).

---

## 6. Nhóm E — KPI

### E1. Chỉ số dẫn xuất phải tính lại, không trừ
**Cho**: ca nối như C2. Snapshot #1 có AOV = 1.000.000, snapshot #2 có AOV = 900.000.
**Kỳ vọng**: AOV ca chiều = `GMV ca chiều / Orders ca chiều`, **không** phải
`900.000 − 1.000.000 = −100.000`.
Test phải khẳng định AOV ca chiều > 0.

### E2. Mẫu số 0 → N/A
**Cho**: ca có `product_clicks = 0`.
**Kỳ vọng**: CVR trả `null`/`N/A`. **Không** trả `0`. UI hiện `—`.

### E3. Không lấy trung bình của trung bình
**Cho**: ca A (GMV 10tr, 10 orders, AOV 1tr), ca B (GMV 90tr, 30 orders, AOV 3tr).
**Kỳ vọng**: AOV brand = `100tr / 40` = **2,5tr**.
**Sai nếu ra**: `(1tr + 3tr) / 2 = 2tr`.

### E4. Loại ca không thuộc agency khỏi KPI
**Cho**: trong ngày có ca agency (GMV 30tr) và ca brand in-house (GMV 20tr).
**Kỳ vọng**: GMV agency ngày đó = **30tr**; achievement tính trên 30tr; báo cáo toàn shop
hiện 50tr kèm chú thích tách phần.

### E5. Achievement khi chưa set target
**Cho**: ca chưa có target.
**Kỳ vọng**: achievement = `N/A`. **Không** hiện `0%` (sẽ kéo tụt trung bình của brand).

### E6. live_hours không lấy từ cột Duration
**Cho**: ca chiều trong C2. Cột `Duration` của snapshot #2 là `6h00m` (cả room).
**Kỳ vọng**: `live_hours` ca chiều = **3h02m** (13:00 → 16:02:48), không phải 6h00m.
Nếu sai, GMV/giờ sẽ bị chia sai gần một nửa.

### E7. GMV/giờ khi live_hours = 0
**Cho**: `R-NOISE` (11 giây).
**Kỳ vọng**: GMV/giờ = `N/A` hoặc tính trên 0,003 giờ — **không** chia cho 0 gây lỗi.
Quy ước: `live_hours < 1 phút` → `N/A`.

---

## 7. Nhóm F — Ads

### F1. Ngày có ads nhưng không có ca live
**Cho**: 16/09 (ads 100.225 ₫) và 17/09 (ads 2.819 ₫), không có ca live nào.
**Kỳ vọng**: `ads_daily` vẫn lưu; không tạo ca; không gán cho ca nào.

### F2. Không lộ chỉ số ads ở cấp ca
**Cho**: gọi API lấy chi tiết ca.
**Kỳ vọng**: response **không chứa** trường ads spend/ROAS nào.
Đây là test chặn hồi quy cho rule số 10 trong `CLAUDE.md`.

### F3. Không gọi doanh thu ads là GMV live
**Cho**: 09/09 — ads gross revenue 132.952.442, GMV live 107.355.468.
**Kỳ vọng**: hai con số hiển thị ở hai chỗ khác nhau, nhãn khác nhau; không có chỗ nào
trong hệ thống trừ/chia hai số này cho nhau.

---

## 8. Nhóm G — Quy trình & thời hạn

### G1. Ca quá hạn nộp dữ liệu
**Cho**: ca kết thúc 31 phút trước, chưa có snapshot.
**Kỳ vọng**: hiện trong "Cần xử lý" của Operation; tính vào chỉ số nộp đúng hạn của trợ
live (`false`); ca vẫn ở `DATA_PENDING`.

### G2. Event bắt buộc lý do
**Cho**: log `ENDED_EARLY` với `reason` rỗng.
**Kỳ vọng**: bị từ chối ở **tầng DB** (constraint `reason_required`), không chỉ ở form.

### G3. Hậu kiểm không chặn tính KPI
**Cho**: trợ live log `RESTART_TECHNICAL`, Operation chưa duyệt.
**Kỳ vọng**: KPI vẫn tính ngay từ event `LOGGED`; event hiện trong hàng đợi hậu kiểm.

### G4. Xung đột lịch
**Cho**: gán 1 host vào 2 ca có giờ chồng nhau.
**Kỳ vọng**: cảnh báo trước khi lưu, nêu rõ ca nào chồng.

---

## 9. Điều kiện hoàn thành (Definition of Done)

Import + attribution engine được coi là xong khi:

1. Toàn bộ case nhóm A, B, C, D, E, F, G pass tự động.
2. Import được **cả 110 dòng** file live thật và **17 dòng** file ads thật, không lỗi.
3. Chạy lại import lần hai trên cùng dữ liệu: **số liệu không đổi** (idempotent).
4. Với mọi ca có kết quả, truy ngược được tới đúng dòng raw đã sinh ra nó.
5. Không có ca nào mang GMV mà hệ thống không giải thích được bằng phép tính hiển thị
   cho người dùng.
