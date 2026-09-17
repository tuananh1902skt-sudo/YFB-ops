# 01 — Business Rules: Live Session, Attribution & Event Model

Status: DRAFT — v0.1 — chờ chủ agency (Tuấn Anh) duyệt trước khi các tài liệu sau (Data
Dictionary, Schema, KPI Dictionary) được viết dựa trên đây.

Mọi rule trong file này được rút ra trực tiếp từ mô tả vận hành thực tế của YFB Agency
(không suy diễn từ mẫu agency "chuẩn" nào khác) và từ việc phân tích file export thật
`Creator-Live-Performance_20260916172642.xlsx` (sheet `performance_detail`, TikTok Shop).
Chỗ nào chưa có thông tin xác nhận, được đánh dấu `[TBD]` — hệ thống phải build đủ linh
hoạt để không cứng hoá giả định sai ở đó.

---

## 1. Vì sao tài liệu này tồn tại

Bài toán khó nhất của hệ thống không phải là "vẽ lịch" hay "hiển thị dashboard" — mà là:

> Từ một chuỗi report TikTok Shop (mỗi report là số liệu **cộng dồn** của một "Room"
> tính từ lúc mở phòng), suy ra được **chính xác** từng ca live nội bộ (ai làm, khi nào,
> kết quả bao nhiêu) — kể cả khi ranh giới ca không trùng với ranh giới Room, kể cả khi
> có ca không phải của agency xen vào.

Nếu phần này sai, mọi thứ phía trên (KPI, benchmark, target, lương, báo cáo client,
doanh thu agency) đều sai theo. Vì vậy tài liệu này được viết và duyệt **trước tiên**.

---

## 2. Các thực thể cốt lõi

```
Brand
  └── Platform Account (1 brand = đúng 1 tài khoản TikTok Shop — đã xác nhận, không có
       multi-account)
        └── Platform Room  (1 "phiên phát sóng liên tục" theo TikTok, định danh = Room ID)
              └── Room Snapshot  (1 lần trợ live tải report cho Room đó, tại 1 thời điểm)

Live Session ("ca")  — đơn vị vận hành của AGENCY, độc lập với Room
  ├── gắn với 1 hoặc nhiều Platform Room (do restart)
  ├── gắn với 1 hoặc nhiều Room Snapshot (do ca nối / cộng dồn)
  ├── có Session Event Log (chuỗi sự kiện xảy ra trong ca)
  └── có Session Attribution (kết quả GMV/orders/... đã được tách ra cho riêng ca này)
```

Nguyên tắc nền tảng: **Live Session (ca) và Platform Room là hai khái niệm độc lập,
quan hệ nhiều-nhiều.** Không được giả định 1-1 ở bất kỳ đâu trong hệ thống.

---

## 3. Phân loại "ai vận hành ca" (Ownership)

Đã xác nhận: có brand tự live in-house khi agency đã off ca. Vì cùng 1 tài khoản
TikTok, report tải về có thể chứa cả ca của agency lẫn ca in-house của brand.

Mọi Live Session và mọi Room Snapshot phải có trường phân loại:

| Giá trị | Ý nghĩa |
|---|---|
| `AGENCY` | Ca do agency vận hành (có host/trợ live của agency được assign) |
| `BRAND_INHOUSE` | Ca do brand tự live, không phải người của agency |
| `UNKNOWN` | Chưa xác định — mặc định khi phát hiện 1 khoảng Room không khớp với bất kỳ Live Session (agency) nào đã book |

**Đã chốt — ai xác nhận**: khi hệ thống phát hiện đoạn `UNKNOWN`, **Operation** là người
xác nhận đó là `BRAND_INHOUSE` hay là ca agency bị thiếu dữ liệu booking. Không tự động
gán sau X giờ, không để trợ live tự quyết — vì phân loại này ảnh hưởng trực tiếp tới
doanh thu agency (mục 9). Đoạn chưa xác nhận giữ nguyên `UNKNOWN` và **không** được tính
vào bất kỳ KPI/doanh thu nào, đồng thời xuất hiện trong danh sách chờ xử lý của
Operation.

**Hệ quả bắt buộc:**
- KPI/target achievement/host performance/doanh thu agency **chỉ tính trên các đoạn
  `AGENCY`**.
- Đoạn `BRAND_INHOUSE` vẫn được lưu lại (không bỏ) vì hữu ích cho báo cáo tổng quan
  brand (agency đóng góp bao nhiêu % GMV cả ngày so với brand tự live) — nhưng phải
  tách bạch rõ ràng trong mọi dashboard, không gộp chung.
- Ranh giới chuyển giao AGENCY ↔ BRAND_INHOUSE là một loại sự kiện trong Session Event
  Log (mục 5).

---

## 4. Live Session (ca) — vòng đời trạng thái

```
Draft → Planning → Open for Booking → Pending Approval → Confirmed → Ready
   → Live → Data Pending → Data Partial → Data Complete → Analyzed → Completed
   (Cancelled có thể xảy ra từ bất kỳ trạng thái nào trước Live)
```

Điểm khác so với mô hình "chuẩn" thường thấy: giữa `Live` và `Completed` cần 2 trạng
thái trung gian vì dữ liệu về theo từng lần upload, không về 1 lần:

- **Data Pending**: ca đã kết thúc theo lịch nhưng chưa có upload nào.
- **Data Partial**: đã có ít nhất 1 snapshot nhưng attribution engine chưa xác nhận đủ
  điều kiện tính KPI cuối (ví dụ: ca nối chưa có đủ snapshot của cả 2 đầu).
- **Data Complete**: đủ dữ liệu để tính KPI chính thức cho ca.

`planned_start` / `planned_end` (từ Planning) và `actual_start` / `actual_end` (suy ra
từ Room + Event Log) là hai cặp field **tách biệt** — không ghi đè lên nhau. Achievement
phải so target với thời lượng/kết quả **thực tế**, đúng như bạn nêu ở case "off sớm".

---

## 5. Session Event Log

Bắt buộc: trợ live/Operation phải log sự kiện **ngay khi nó xảy ra**, không phải suy
luận hồi tố. Đây là input, không phải output, của attribution engine.

| Event type | Ai log | Field bắt buộc | Ảnh hưởng |
|---|---|---|---|
| `SESSION_STARTED` | Trợ live | session_id, actual_start, room_id | Mốc bắt đầu thực tế |
| `HANDOVER_AGENCY_TEAM` (ca nối giữa 2 team agency) | Trợ live ca sắp xuống | session_id cũ, session_id mới, room_id, thời điểm | Kích hoạt cơ chế delta snapshot (mục 6) |
| `HANDOVER_TO_INHOUSE` | Trợ live (hoặc hệ thống tự phát hiện + Operation xác nhận) | room_id, thời điểm | Đoạn sau thuộc `BRAND_INHOUSE` |
| `HANDOVER_FROM_INHOUSE` | Trợ live/Operation | room_id, thời điểm | Đoạn sau quay lại `AGENCY`, có thể là ca mới |
| `HOST_CHANGED` / `ASSISTANT_CHANGED` (đổi người, vẫn cùng 1 ca) | Trợ live | session_id, người cũ, người mới, thời điểm | Không tách ca mới, nhưng chia nhỏ để tính performance cá nhân đúng theo khung giờ mỗi người đảm nhiệm |
| `OVERTIME_EXTENDED` | Trợ live/Operation | session_id, thời gian OT dự kiến, lý do | actual_end kéo dài hơn planned_end; dùng cho tính công/lương và không tính "trễ kế hoạch" là lỗi |
| `ENDED_EARLY` | Trợ live/Operation | session_id, lý do (bắt buộc nhập, ví dụ: hiệu suất thấp) | actual_end sớm hơn planned_end; target achievement so theo actual, lý do dùng cho phân tích sau |
| `RESTART_TECHNICAL` | Trợ live | room_id cũ, room_id mới, lý do (mất điện/mất mạng/lỗi nền tảng) | Vẫn là 1 Live Session, nhưng phải **cộng** kết quả nhiều Room lại (không phải trừ snapshot — xem mục 6.3) |
| `RESTART_STRATEGIC` | Operation | room_id cũ, room_id mới, lý do (làm mới traffic) | Giống RESTART_TECHNICAL về xử lý dữ liệu, khác ở lý do — dùng để phân tích hiệu quả của quyết định restart sau này |
| `UPLOAD_CORRECTED` | Operation | import_id cũ, lý do | Dùng khi 1 file bị gắn nhầm ca — audit log bắt buộc |
| `SESSION_ENDED` | Trợ live | session_id, actual_end | Mốc kết thúc thực tế |

**Đã chốt — quy trình duyệt**: trợ live **tự log** tất cả event ở trên ngay tại thời
điểm xảy ra, không cần chờ duyệt (không chặn vận hành). Operation **hậu kiểm** sau:
event ở trạng thái `logged` → Operation review → `verified` hoặc `corrected` (kèm lý do,
ghi audit log). KPI được tính ngay từ event `logged`, nếu sau đó Operation sửa thì hệ
thống tính lại và lưu vết cả hai phiên bản.

Mọi event đều có `created_by`, `created_at`, và với các event có "lý do" thì lý do là
bắt buộc nhập (không cho để trống) — đây chính là dữ liệu Operation/Data Analyst cần để
phân tích nguyên nhân sau này (mục 39/AI Analyst trong bản brief gốc chỉ có ý nghĩa nếu
lớp dữ liệu này đầy đủ).

---

## 6. Cơ chế Attribution — "Cumulative Snapshot + Delta"

### 6.1. Nguyên tắc

Mỗi report TikTok Shop (1 dòng trong file `performance_detail`, khoá bởi `Room ID`) là
số liệu **cộng dồn từ lúc mở Room đến thời điểm export**, không phải số liệu riêng của
một ca. Quy trình vận hành thực tế (đã xác nhận): trợ live tải report ngay khi ca của
mình vừa xong → đây chính là 1 "snapshot" tại đúng ranh giới ca.

### 6.2. Trường hợp ca nối trong cùng 1 Room (không restart)

```
Room mở lúc 10:00
  Ca A (10:00–12:00): trợ live A tải report lúc 12:00 → Snapshot #1
                        GMV cộng dồn = 20,000,000đ  (= GMV thật của ca A, vì là snapshot đầu tiên của room)
  Ca B (12:00–15:00): trợ live B tải report lúc 15:00 → Snapshot #2
                        GMV cộng dồn = 55,000,000đ
                        → GMV thật của ca B = Snapshot#2 − Snapshot#1 = 35,000,000đ
```

Công thức tổng quát cho Room có N snapshot theo thứ tự thời gian:

```
GMV(ca thứ k) = GMV(Snapshot k) − GMV(Snapshot k-1)      với k > 1
GMV(ca thứ 1) = GMV(Snapshot 1)
```

Áp dụng tương tự cho mọi field cộng dồn: orders, items sold, views, product clicks,
comments, likes, shares, new followers... Các field **không** cộng dồn (AOV, CTR, CVR,
GMV per hour...) **không được trừ trực tiếp** — phải tính lại từ các field đã trừ
(AOV_ca_B = GMV_ca_B / Orders_ca_B), không lấy hiệu số 2 AOV.

### 6.3. Trường hợp restart (nhiều Room ID nhưng là 1 ca)

Khi có `RESTART_TECHNICAL` hoặc `RESTART_STRATEGIC`, Room mới không kế thừa số cộng
dồn của Room cũ (TikTok tính lại từ 0). Vậy kết quả thật của ca = **cộng** kết quả các
đoạn Room lại, mỗi đoạn Room tự áp dụng lại cơ chế delta ở 6.2 nếu bản thân nó cũng bị
ca nối:

```
GMV(ca có restart) = Σ GMV(mỗi đoạn Room thuộc ca đó, sau khi đã tự trừ snapshot nếu cần)
```

### 6.4. Trường hợp không có sự kiện nào (ca đơn giản, 1 room = 1 ca)

Snapshot cuối cùng (hoặc duy nhất) của Room chính là kết quả ca — không cần trừ gì
(giống hệt các dòng trong file mẫu, vì file mẫu là export **sau khi đã kết thúc hẳn**
Room, không phải snapshot giữa chừng).

### 6.5. Độ tin cậy dữ liệu (Data Confidence)

Vì cơ chế delta phụ thuộc vào việc trợ live tải đúng thời điểm, hệ thống phải gắn nhãn
độ tin cậy cho từng kết quả ca:

| Confidence | Điều kiện |
|---|---|
| `HIGH` | Ca đơn giản (1 room, không sự kiện), hoặc ca nối có đủ cả snapshot đầu và cuối, khớp đúng thứ tự thời gian |
| `MEDIUM` | Có restart nhưng đủ dữ liệu từng đoạn |
| `LOW` | Thiếu 1 snapshot (ví dụ trợ live ca A quên tải, chỉ có snapshot ca B) → hệ thống chỉ biết **tổng cộng dồn 2 ca**, không tách được — phải hiển thị "Shared/Unallocated" giữa 2 ca đó, KHÔNG tự chia đều, đúng nguyên tắc "không bịa độ chính xác" |
| `NEEDS_REVIEW` | Số liệu âm sau khi trừ (dấu hiệu snapshot bị lấy sai thứ tự hoặc nhầm ca), hoặc chênh lệch bất thường so với benchmark |

### 6.6. Validate khi nhận snapshot mới

Khi 1 snapshot mới được upload cho 1 Room đã có snapshot trước:
- Mọi field cộng dồn ở snapshot mới phải `>=` snapshot trước (GMV không thể giảm theo
  thời gian trong cùng 1 room). Nếu nhỏ hơn → `NEEDS_REVIEW`, chặn tự động tính, báo
  Operation.
- Thời điểm upload/`End Time` của snapshot mới phải sau snapshot trước — nếu trùng
  hoặc ngược, nghi vấn trùng file → chạy duplicate detection theo `Room ID` +
  `End Time`.
- Room ID tái sử dụng sau khoảng trống dài bất thường không được coi là tiếp nối. **Đã
  chốt**: ngưỡng mặc định **8 tiếng** — nếu khoảng trống giữa 2 lần thấy cùng Room ID
  vượt 8 tiếng, hệ thống không tự động nối mà đưa vào `NEEDS_REVIEW` để Operation quyết
  định. Ngưỡng này để ở dạng cấu hình (system setting), không hard-code.

### 6.7. Đoạn live không khớp ca nào đã book

Khi engine tách ra một đoạn Room mà không ca nào đã book phủ được, hệ thống **tạo một ca
mới với `ownership = UNKNOWN`**, mốc thời gian lấy đúng bằng đoạn đó, và đưa vào hàng đợi
Operation. Lý do làm vậy thay vì để đoạn đó trôi nổi:

- Doanh thu trong đoạn đó **có thật** và phải nằm ở đâu đó để đối chiếu với báo cáo toàn
  shop; bỏ qua là tự làm lệch số.
- Gắn vào một ca agency gần đó là **đoán** — đúng thứ mục 3 cấm.
- Khi Operation xác nhận `BRAND_INHOUSE` hoặc bổ sung booking còn thiếu, ca đó trở thành
  ca bình thường; lần import sau khớp thẳng vào nó, **không** tạo thêm ca UNKNOWN mới.

Chừng nào còn `UNKNOWN`, đoạn đó **không vào bất kỳ KPI nào của agency** (mục 3).

### 6.8. Tính lại, không cộng dồn

Kết quả ca luôn được **tính lại từ toàn bộ snapshot đang có**, không phải cộng thêm vào
số cũ. Hệ quả:

- Import một file bulk muộn, Operation sửa gắn nhãn, hay trợ live bổ sung snapshot còn
  thiếu — cả ba đều ra cùng một kết quả cuối, không phụ thuộc thứ tự upload.
- Dòng attribution cũ chuyển `is_current = false` chứ không bị xoá.
- Upload trùng (cùng Room + cùng `End Time`) bị bỏ qua ở tầng ghi snapshot, nên không có
  đường nào để một lần upload lại làm số bị nhân đôi.

---

## 7. Vai trò & con người (Roles)

- Một người có thể vừa là Host vừa là Trợ live, tuỳ theo ca (role gắn theo **assignment
  của từng ca**, không gắn cố định theo người dùng).
- Một người có thể làm cho nhiều brand khác nhau. Không có ràng buộc "1 nhân sự = 1
  brand".
- → Bảng phân quyền và bảng performance phải tính theo **(người, ca, role trong ca đó)**,
  không phải theo (người, brand) cố định.

---

## 8. Target Model (linh hoạt theo brand)

Không có công thức target chung. Mỗi brand có `target_rule` riêng, tối thiểu hỗ trợ các
kiểu sau (danh sách mở, cho phép thêm):

- **Fixed KPI do brand đưa xuống** theo kỳ (ngày/tuần/tháng/campaign) — agency chỉ phân
  bổ xuống từng ca.
- **GMV/giờ live** làm chỉ số gốc — tổng target = GMV/giờ mục tiêu × tổng giờ live kế
  hoạch.
- Kết hợp cả hai, hoặc **agency tự đề xuất** target dựa trên baseline lịch sử (benchmark
  engine, xây ở phase sau).

**Target Allocation Engine** (phase sau, nhưng phải thiết kế chỗ trong schema từ đầu):
nhận 1 target ở cấp kỳ (tháng/tuần/campaign), phân bổ xuống từng ca dựa trên trọng số:
hiệu suất lịch sử theo khung giờ, loại ngày (thường/campaign/payday), và điều chỉnh thủ
công của Operation. Không tự động khoá — luôn cho override, có audit log.

---

## 9. Contract / Fee Model (linh hoạt theo brand)

Mỗi brand/hợp đồng có thể có **nhiều fee component** cộng lại, không phải 2 cột cứng:

| Loại component | Ví dụ |
|---|---|
| Fixed fee theo giờ live | X đồng/giờ |
| Fixed fee theo kỳ | X đồng/tháng |
| % hoa hồng theo GMV | X% GMV |
| % hoa hồng theo NMV | X% NMV (GMV trừ hoàn/huỷ) |
| Kết hợp | bất kỳ tổ hợp nào ở trên |

Doanh thu agency cho 1 kỳ = tổng các fee component áp dụng, tính **chỉ trên phần
`AGENCY`** (không tính GMV của `BRAND_INHOUSE`). Đây là lý do mục 3 (Ownership) bắt buộc
phải tách bạch — nó ảnh hưởng trực tiếp tới doanh thu tính đúng/sai.

---

## 10. Ads data — CẢNH BÁO LỆCH ĐỘ MỊN (granularity mismatch)

Nguồn: file export `Campaign_overview_data_YYYYMMDD_-_YYYYMMDD.xlsx` (TikTok Ads, giao
diện tiếng Việt), 7 cột: `Theo ngày`, `Chi phí`, `Số lượng đơn hàng SKU (Cửa hàng hiện
tại)`, `Chi phí mỗi đơn hàng (Cửa hàng hiện tại)`, `Doanh thu gộp (Cửa hàng hiện tại)`,
`ROI (Cửa hàng hiện tại)`, `Tiền tệ`. Dòng cuối là dòng TỔNG (`Theo ngày` = `-`) — phải
loại bỏ khi import.

**Vấn đề cốt lõi: file ads chỉ có độ mịn THEO NGÀY, trong khi 1 ngày có nhiều ca live.**
Không thể suy ra chính xác ads spend của từng ca từ nguồn này.

Bằng chứng từ chính dữ liệu thật (đối chiếu 2 file):

| Ngày | Ads spend | Ads "Doanh thu gộp" | Tổng GMV live cùng ngày |
|---|---|---|---|
| 2026-09-09 | 2,652,354đ | 132,952,442đ | 107,355,468đ (2 ca) |
| 2026-09-16 | 100,225đ | 4,100,000đ | **không có ca live nào** |
| 2026-09-17 | 2,819đ | 0đ | **không có ca live nào** |

Hai kết luận bắt buộc phải tôn trọng trong toàn hệ thống:

1. **Doanh thu ads ≠ doanh thu live.** Ngày 09/09 doanh thu ads (133M) **lớn hơn** tổng
   GMV live cả ngày (107M) → ads chạy cho cả video, product card, shop, không riêng
   live. Không được lấy `Doanh thu gộp` của ads làm "GMV live do ads mang lại".
2. **Ads spend không chỉ thuộc về ca agency.** Ngày 16-17/09 có chi phí ads nhưng không
   có ca live nào → ads chạy cả ngoài giờ live, và (theo mục 3) có thể phục vụ cả ca
   in-house của brand.

**Đã chốt — ads NẰM NGOÀI SCOPE hiện tại.** TikTok không export được ads ở độ mịn nhỏ
hơn ngày, nên không có phương án tính đúng ads ở cấp ca. Quyết định: **tạm gác phần ads,
tìm phương án sau.**

Trong scope này:

- `ads_daily` vẫn được lưu ở độ mịn **(platform_account, ngày)** — đây là số thật,
  confidence `HIGH`. Chỉ lưu và hiển thị, không suy diễn thêm.
- ROAS/ROI chỉ hiển thị ở cấp **ngày hoặc kỳ**, và phải đặt tên đúng là **"ROAS toàn
  shop"** — tuyệt đối không gọi là "ROAS của ca live" hay "ROAS của host".
- **Không build** tính năng phân bổ ads spend xuống từng ca ở giai đoạn này. Không hiển
  thị bất kỳ con số ads nào ở cấp ca, kể cả dạng ước lượng — tránh tạo thói quen tin vào
  số sai.
- Schema phải chừa sẵn chỗ (`ads_daily` tách bảng riêng, không nhét vào bảng ca) để sau
  này có nguồn dữ liệu tốt hơn thì gắn vào mà không phải migrate lớn.
- `[TBD]` Voucher spend: chưa có nguồn dữ liệu, cùng nhóm hoãn với ads.

---

## 11. Refund / hoàn hàng

**Đã chốt**: refund chỉ xác định được chính xác sau ~15 ngày, nằm **ngoài scope hiện
tại**. Trong scope này:

- GMV từ TikTok được coi là **GMV gộp** (chưa trừ hoàn).
- Hệ thống lưu một **tỷ lệ hoàn ước tính** (`estimated_refund_rate`) cấu hình được theo
  từng `platform_account` (mỗi account một tỷ lệ riêng).
- NMV ước tính = `GMV × (1 − estimated_refund_rate)`, luôn gắn nhãn `ESTIMATED`.
- Với brand tính phí theo %NMV (mục 9), doanh thu agency hiển thị là **ước tính**, và
  thiết kế phải chừa sẵn chỗ để sau này đối soát lại bằng số refund thật khi có (không
  build ở MVP, nhưng schema không được cản đường).

---

## 12. Các quy ước đã chốt khác

- **Múi giờ**: toàn bộ thời gian trong file export TikTok là **GMT+7
  (`Asia/Ho_Chi_Minh`)**. Lưu `timestamptz` trong DB, hiển thị theo GMT+7. Ngày vận hành
  (`session_date`) của ca kết thúc sau nửa đêm vẫn tính theo **ngày bắt đầu ca**, không
  tách đôi.
- **Ý nghĩa cột `End Time`**: đã xác nhận — khi tải report giữa lúc Room còn đang live,
  `End Time` = **đúng thời điểm tải report**. Đây chính là mốc chốt số của snapshot, xác
  nhận cơ chế delta ở mục 6 chạy đúng: mỗi lần trợ live tải report là một mốc cắt chính
  xác tại ranh giới ca.
- **File ads không có cột phân biệt brand** → khi import, người dùng **bắt buộc chọn
  `platform_account`** thủ công.

Câu hỏi còn mở: `[TBD]` nguồn dữ liệu voucher spend (cùng nhóm hoãn với ads).

---

## 13. Điều KHÔNG được làm (non-negotiable)

- Không bao giờ tự động chia đều GMV giữa 2 ca khi thiếu snapshot — phải hiển thị
  `Shared/Unallocated` và chờ xác nhận thủ công.
- Không sửa raw snapshot đã lưu — mọi điều chỉnh đi qua `UPLOAD_CORRECTED` event, giữ
  bản gốc.
- Không tính KPI/doanh thu agency trên phần `BRAND_INHOUSE`.
- Không giả định 1 Room ID = 1 ca, và không giả định 1 ca = 1 Room ID, ở bất kỳ đâu
  trong code.
- Không để trống lý do khi log `ENDED_EARLY`, `RESTART_TECHNICAL`, `RESTART_STRATEGIC`.
- Không gọi ROAS/doanh thu ads là chỉ số của ca live hay của host — ads là số liệu cấp
  ngày, cấp shop (mục 10).
- Không dùng ads spend ước lượng ở cấp ca, hay NMV ước lượng từ tỷ lệ hoàn, để tính tiền
  thật (hợp đồng, lương, thưởng) nếu chưa có phê duyệt và audit log.
