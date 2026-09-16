# 03 — TikTok Data Mapping

Status: DRAFT — v0.1

Ánh xạ **từng cột thật** của các file export TikTok mà YFB Agency đang dùng sang trường
chuẩn của hệ thống. Tất cả nội dung dưới đây lấy từ file thật đã kiểm tra, không đoán.

Nguồn đã phân tích:
1. `Creator-Live-Performance_20260916172642.xlsx` — hiệu suất live theo Room
2. `Campaign_overview_data_20260901_-_20260917.xlsx` — chi phí ads theo ngày

---

## PHẦN A — File hiệu suất live (`Creator-Live-Performance_*.xlsx`)

### A.1. Cấu trúc file

| Thuộc tính | Giá trị thật |
|---|---|
| Số sheet | 1 — tên `performance_detail` |
| Dòng 1 | Khoảng thời gian export, ví dụ `2026-07-01 ~ 2026-09-17` → lưu vào `raw_import.data_period` |
| Dòng 2 | Trống |
| Dòng 3 | Header (35 cột) |
| Dòng 4 → hết | Dữ liệu, mỗi dòng = 1 Room |
| Dòng tổng cuối file | **Không có** (khác file ads) |
| Kiểu dữ liệu ô | **Toàn bộ là string**, kể cả số và ngày giờ |

### A.2. Hai cảnh báo kỹ thuật bắt buộc

**1. `Room ID` phải giữ nguyên kiểu string trong toàn hệ thống.** Giá trị thật có 19 chữ
số (`7658657266417994504`). JavaScript/TypeScript `number` chỉ an toàn tới 2^53
(~9,007,199,254,740,992 — 16 chữ số) → parse thành number sẽ **sai số âm thầm**. Lưu
`text` trong Postgres, `string` trong TS, không dùng `bigint` của JS ở tầng API/JSON.

**2. Tỷ lệ phần trăm có thể vượt 100%.** Ví dụ thật: `Like rate = 1293.103448%` (vì mẫu
số là người xem chứ không phải lượt hiển thị). Không được validate `<= 100%`, không được
coi là lỗi dữ liệu.

### A.3. Quy tắc parse theo kiểu dữ liệu

| Kiểu | Ví dụ thật | Quy tắc |
|---|---|---|
| Tiền | `"6,830,000.01₫"` | Bỏ `₫` và dấu `,`, parse `numeric(18,2)`. Đơn vị VND |
| Phần trăm | `"4.38247%"` | Bỏ `%`, parse `numeric`. **Lưu dạng phần trăm** (4.38247), không chia 100 — thống nhất toàn hệ thống |
| Số nguyên | `"55"` | Parse integer |
| Số thực | `"3911.69"` | Parse numeric |
| Thời lượng | `"0h19m"` | Regex `^(\d+)h(\d+)m$` → tổng số phút. Lưu ý chỉ có giờ+phút, **không có giây** → dùng `Start/End Time` để tính chính xác hơn khi cần |
| Thời gian | `"2026-07-04 20:01:54"` | Parse timestamp. `[TBD]` xác nhận múi giờ export là GMT+7 |
| Ô rỗng | `""` | → `NULL`, **tuyệt đối không quy về 0**. Ô rỗng xuất hiện khi mẫu số = 0 (ví dụ `LIVE CTR` rỗng khi không có lượt xem) |

### A.4. Bảng ánh xạ 35 cột

Cột `Tính chất` quyết định cách attribution engine xử lý (mục 6 của `01_BUSINESS_RULES.md`):
- **CUM** = cộng dồn → được phép trừ snapshot để tách ca
- **CUM~** = cộng dồn nhưng **không chính xác tuyệt đối** khi trừ (xem ghi chú)
- **DERIVED** = chỉ số tính ra → **cấm trừ**, phải tính lại từ các trường CUM đã tách
- **ID/META** = định danh, metadata

| # | Cột gốc TikTok | Trường chuẩn | Kiểu | Tính chất |
|---|---|---|---|---|
| 1 | Room ID | `platform_room_id` | text | ID |
| 2 | Room Title | `room_title` | text | META — **không dùng làm khoá nghiệp vụ** (xem A.5) |
| 3 | Start Time | `room_start_at` | timestamptz | ID (khoá phụ để nhận diện Room) |
| 4 | End Time | `snapshot_end_at` | timestamptz | ID — **thời điểm chốt số của snapshot này**, là mốc để sắp thứ tự snapshot |
| 5 | Duration | `duration_minutes` | int | DERIVED |
| 6 | Attributed GMV | `gmv` | numeric(18,2) | **CUM** |
| 7 | Attributed items sold | `items_sold` | int | **CUM** |
| 8 | Attributed orders | `orders` | int | **CUM** |
| 9 | Attributed SKU orders | `sku_orders` | int | **CUM** |
| 10 | Customers | `customers` | int | **CUM~** — là số khách *duy nhất*; nếu 1 khách mua ở cả ca A và ca B thì hiệu số sẽ hụt. Dùng được nhưng gắn nhãn xấp xỉ |
| 11 | AOV | `aov` | numeric(18,2) | DERIVED = `gmv / orders` |
| 12 | Views | `views` | int | **CUM** |
| 13 | Impressions | `impressions` | int | **CUM** |
| 14 | Impressions Per Hour | `impressions_per_hour` | numeric | DERIVED |
| 15 | GMV per hour | `gmv_per_hour` | numeric(18,2) | DERIVED |
| 16 | Show GPM | `show_gpm` | numeric(18,2) | DERIVED — GMV trên 1000 lượt hiển thị |
| 17 | Watch GPM | `watch_gpm` | numeric(18,2) | DERIVED — GMV trên 1000 lượt xem |
| 18 | Avg. viewing duration per view | `avg_view_duration_per_view` | numeric | DERIVED — đơn vị giây |
| 19 | Avg. viewing duration | `avg_view_duration` | numeric | DERIVED — đơn vị giây |
| 20 | Tap through rate | `tap_through_rate` | numeric | DERIVED (%) |
| 21 | LIVE CTR | `live_ctr` | numeric | DERIVED (%) |
| 22 | Product Impressions | `product_impressions` | int | **CUM** |
| 23 | Product clicks | `product_clicks` | int | **CUM** |
| 24 | CTR | `ctr` | numeric | DERIVED (%) |
| 25 | CTOR | `ctor` | numeric | DERIVED (%) |
| 26 | CTOR (SKU orders) | `ctor_sku_orders` | numeric | DERIVED (%) |
| 27 | SKU order rate | `sku_order_rate` | numeric | DERIVED (%) |
| 28 | New followers | `new_followers` | int | **CUM** |
| 29 | Follow rate | `follow_rate` | numeric | DERIVED (%) |
| 30 | Comments | `comments` | int | **CUM** |
| 31 | Comment rate | `comment_rate` | numeric | DERIVED (%) |
| 32 | Shares | `shares` | int | **CUM** |
| 33 | Share rate | `share_rate` | numeric | DERIVED (%) |
| 34 | Likes | `likes` | int | **CUM** |
| 35 | Like rate | `like_rate` | numeric | DERIVED (%) |

Tóm tắt: **11 trường CUM** (được phép trừ để tách ca) + 1 trường CUM~ + 19 trường
DERIVED + 4 trường ID/META.

### A.5. Vì sao `Room Title` không đáng tin

Bằng chứng từ file thật: cùng một title `FRANKLIN IS BACK! SPECIAL LIVE🎉` được giữ
nguyên từ 06/08 đến 13/09 (~59 Room liên tiếp). Title do team tự đặt trên TikTok rồi để
nguyên nhiều tuần, không phản ánh campaign thực tế từng ngày.

→ Lưu lại làm metadata tham khảo. **Campaign phải lấy từ Planning module của agency**,
không parse từ title.

### A.6. Nhận diện file khi upload

- Tên file: `Creator-Live-Performance_<YYYYMMDDHHMMSS>.xlsx`
- Dấu hiệu chắc chắn hơn tên file: **sheet tên `performance_detail`** + header dòng 3
  khớp chữ ký 35 cột ở trên.
- Nếu header không khớp 100% (TikTok đổi tên cột): **không được tự đoán**, chuyển sang
  màn hình mapping thủ công, lưu lại phiên bản mapping mới để lần sau tự nhận diện.

---

## PHẦN B — File chi phí ads (`Campaign_overview_data_*.xlsx`)

### B.1. Cấu trúc file

| Thuộc tính | Giá trị thật |
|---|---|
| Số sheet | 1 — tên `Sheet1` |
| Dòng 1 | Header (7 cột) |
| Dòng 2 → N-1 | Dữ liệu, mỗi dòng = 1 ngày |
| Dòng N (cuối) | **Dòng TỔNG**, cột đầu = `-` → **bắt buộc loại bỏ khi import** |
| Kiểu dữ liệu ô | Hỗn hợp: có ô là `int` thật, có ô là `string` |
| Ngôn ngữ header | **Tiếng Việt** — phụ thuộc ngôn ngữ giao diện TikTok Ads lúc export |

### B.2. Bảng ánh xạ 7 cột

| # | Cột gốc | Trường chuẩn | Kiểu ô thật | Ghi chú |
|---|---|---|---|---|
| 1 | Theo ngày | `stat_date` | string `"2026-09-01 00:00:00"` | Parse lấy phần ngày. Giá trị `-` = dòng tổng → bỏ |
| 2 | Chi phí | `ads_spend` | int | VND |
| 3 | Số lượng đơn hàng SKU (Cửa hàng hiện tại) | `ads_sku_orders` | int | Đơn hàng SKU do ads mang lại, **toàn shop** |
| 4 | Chi phí mỗi đơn hàng (Cửa hàng hiện tại) | `ads_cost_per_order` | string | DERIVED = `ads_spend / ads_sku_orders` — nên **tính lại**, không tin số gốc khi mẫu số = 0 |
| 5 | Doanh thu gộp (Cửa hàng hiện tại) | `ads_gross_revenue` | int | **Doanh thu toàn shop do ads quy kết — KHÔNG phải GMV live** |
| 6 | ROI (Cửa hàng hiện tại) | `ads_roi` | string | DERIVED = `ads_gross_revenue / ads_spend` |
| 7 | Tiền tệ | `currency` | string | `VND` |

### B.3. Ràng buộc nghiệp vụ (nhắc lại từ `01_BUSINESS_RULES.md` mục 10)

File này **chỉ có độ mịn theo ngày**, trong khi 1 ngày có nhiều ca live. Bằng chứng thật:

- 09/09: ads revenue 132,952,442đ > tổng GMV live cùng ngày 107,355,468đ
- 16/09 và 17/09: có chi phí ads nhưng **không có ca live nào**

→ Ads spend/ROAS ở cấp ca chỉ được phép là **ước lượng có nhãn**, không bao giờ là số
thật. Chi tiết rule ở `01_BUSINESS_RULES.md` mục 10.

### B.4. Nhận diện file & chọn brand

File **không có cột nào phân biệt brand/shop**. Vì vậy khi upload, người dùng **bắt buộc
phải chọn `platform_account`** thủ công, và hệ thống cảnh báo nếu khoảng ngày trong file
trùng lặp với dữ liệu ads đã import trước đó cho cùng account.

---

## PHẦN C — Nguyên tắc chung cho Import Engine

1. **Raw bất biến**: lưu nguyên văn giá trị string gốc của mọi ô song song với giá trị
   đã parse. Mọi sửa chữa đi qua bảng correction, không ghi đè raw.
2. **Mapping có phiên bản**: chữ ký header (danh sách tên cột) được hash và lưu. Header
   lạ → bắt buộc người dùng mapping thủ công, lưu thành phiên bản mới, không tự đoán.
3. **Chống trùng**:
   - File live: khoá `(platform_room_id, snapshot_end_at)`
   - File ads: khoá `(platform_account_id, stat_date)` — import lại cùng ngày thì
     **ghi đè có lưu vết**, vì số ads có thể được TikTok cập nhật lại sau
4. **Không im lặng nuốt lỗi**: mọi dòng không parse được phải xuất hiện trong báo cáo
   import với lý do cụ thể và hành động đề xuất.
5. **Parse ở server**, không parse file lớn trong trình duyệt.

---

## PHẦN D — Các điểm đã xác nhận

1. **Múi giờ: GMT+7 (`Asia/Ho_Chi_Minh`)** cho toàn bộ `Start Time` / `End Time`.
2. **`End Time` = thời điểm tải report** khi Room còn đang live (đã xác nhận với người
   vận hành). Đây là điều kiện tiên quyết để cơ chế delta ở `01_BUSINESS_RULES.md` mục 6
   hoạt động: mỗi lần trợ live tải report tạo ra một mốc cắt chính xác tại ranh giới ca.
   Hệ quả: `snapshot_end_at` là khoá sắp xếp thứ tự snapshot trong cùng Room, và
   `Duration` của snapshot giữa chừng là thời lượng **từ đầu Room tới lúc tải**, không
   phải thời lượng ca.
3. **Ads không export được nhỏ hơn cấp ngày.** Phần ads tạm gác lại, chỉ lưu số liệu
   ngày, không phân bổ xuống ca (xem `01_BUSINESS_RULES.md` mục 10).

Còn mở: `[TBD]` nguồn dữ liệu voucher spend.
