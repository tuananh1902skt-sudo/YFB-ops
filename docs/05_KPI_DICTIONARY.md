# 05 — KPI Dictionary

Status: DRAFT — v0.1

Công thức chính xác của mọi chỉ số trong hệ thống. Đây là **nguồn sự thật duy nhất** cho
việc tính toán.

**Quy tắc bắt buộc:**
1. Mọi KPI được tính ở **KPI service** duy nhất. Component UI, báo cáo, export — không
   được tự tính lại.
2. Chỉ số mới muốn xuất hiện trên dashboard → phải định nghĩa ở file này trước.
3. Mỗi chỉ số phải khai báo rõ: **được phép tính ở cấp nào** (ca / ngày / brand / kỳ /
   host). Tính ở cấp không được phép = bug.

---

## 1. Quy ước tính toán

### 1.1. Mẫu số bằng 0 → `N/A`, không phải 0

```
if (denominator is null or denominator = 0) return N/A
```

Hiển thị `N/A` (hoặc `—`) trên UI. **Tuyệt đối không trả về 0**, vì 0 mang nghĩa "có đo
và bằng không", còn `N/A` mang nghĩa "không tính được". Nhầm hai thứ này sẽ kéo tụt mọi
số trung bình.

Ví dụ thật từ file: nhiều Room có `Views = 0` → `LIVE CTR` để **rỗng**, không phải 0.

### 1.2. Đơn vị & lưu trữ

| Loại | Quy ước |
|---|---|
| Tiền | VND, `numeric(18,2)` |
| Phần trăm | Lưu **dạng phần trăm**: `12.5` = 12.5%. Không lưu 0.125 |
| Thời lượng | Lưu bằng **giờ** (`numeric`), hiển thị `Xh Ym` |
| Làm tròn | Chỉ làm tròn **ở tầng hiển thị**. Tính toán và lưu trữ giữ nguyên độ chính xác |

### 1.3. Không bao giờ "trung bình của trung bình"

Khi gộp nhiều ca lại (theo ngày/brand/host/kỳ), luôn **cộng tử số và mẫu số gốc rồi chia
lại**:

```
ĐÚNG : AOV(brand) = Σ GMV / Σ Orders
SAI  : AOV(brand) = trung bình các AOV của từng ca
```

Áp dụng cho mọi chỉ số dẫn xuất, không có ngoại lệ.

### 1.4. Chỉ số dẫn xuất không được trừ snapshot

Khi tách ca bằng cơ chế delta (`01_BUSINESS_RULES.md` mục 6): chỉ trừ các trường **cộng
dồn**, rồi **tính lại** chỉ số dẫn xuất từ kết quả đã trừ.

```
ĐÚNG : AOV(ca B) = GMV(ca B) / Orders(ca B)          -- từ số đã tách
SAI  : AOV(ca B) = AOV(snapshot 2) − AOV(snapshot 1)
```

Các giá trị dẫn xuất TikTok báo sẵn (cột 11, 14–21, 24–27, 29, 31, 33, 35) chỉ lưu trong
`room_snapshots.reported_derived` để **đối chiếu ở cấp Room**, không dùng ở cấp ca.

### 1.5. Chỉ tính trên phần `AGENCY`

Mọi KPI hiệu suất, target achievement, doanh thu agency chỉ tính trên ca có
`ownership = 'AGENCY'`. Ca `BRAND_INHOUSE` và `UNKNOWN` bị loại khỏi tử số **và** mẫu số.

Ngoại lệ duy nhất: các chỉ số "toàn shop" được đặt tên rõ ràng (mục 6).

---

## 2. Trường gốc (không phải KPI)

Các trường cộng dồn lấy trực tiếp từ attribution, dùng làm nguyên liệu cho mọi công thức:

`gmv`, `orders`, `sku_orders`, `items_sold`, `customers`, `views`, `impressions`,
`product_impressions`, `product_clicks`, `new_followers`, `comments`, `shares`, `likes`

### 2.1. `live_hours` — định nghĩa chính xác

Thời lượng live của một ca **không** lấy từ cột `Duration` của file (đó là thời lượng
cộng dồn của cả Room), và cũng **không** lấy từ giờ kế hoạch.

```
live_hours(ca) = Σ (thời lượng từng đoạn Room thuộc ca đó)

trong đó, mỗi đoạn:
  - Ca đầu tiên của Room : snapshot_end_at − room_start_at
  - Ca nối               : snapshot_end_at(hiện tại) − snapshot_end_at(ca trước)
```

Lý do dùng mốc snapshot thay vì `actual_start_at/actual_end_at` từ event log: mốc
snapshot là thời điểm TikTok chốt số, nên thời lượng và doanh thu luôn khớp cùng một
khoảng. Event log dùng để đối chiếu và giải thích, không dùng làm mẫu số.

Trường hợp `SHARED_UNALLOCATED` (thiếu snapshot): `live_hours` = `N/A` cho từng ca, chỉ
có tổng chung của cụm ca.

---

## 3. KPI hiệu suất bán hàng

| KPI | Công thức | Cấp được phép | Ghi chú |
|---|---|---|---|
| **GMV** | `Σ gmv` | Ca, ngày, brand, kỳ, host, campaign | Doanh thu gộp, chưa trừ hoàn |
| **NMV (ước tính)** | `GMV × (1 − estimated_refund_rate)` | Ngày, brand, kỳ | **Luôn gắn nhãn ƯỚC TÍNH**. Không dùng cho báo cáo chốt tiền |
| **Orders** | `Σ orders` | Mọi cấp | |
| **Items Sold** | `Σ items_sold` | Mọi cấp | |
| **AOV** | `GMV / Orders` | Mọi cấp | `N/A` khi `Orders = 0` |
| **GMV / hour** | `GMV / live_hours` | Mọi cấp | Chỉ số quan trọng nhất để so sánh giữa các ca có độ dài khác nhau |
| **Orders / hour** | `Orders / live_hours` | Mọi cấp | |
| **Items / order** | `Items Sold / Orders` | Mọi cấp | |

---

## 4. KPI traffic & tương tác

| KPI | Công thức | Cấp được phép | Ghi chú |
|---|---|---|---|
| **Views** | `Σ views` | Mọi cấp | |
| **Impressions** | `Σ impressions` | Mọi cấp | |
| **Product Clicks** | `Σ product_clicks` | Mọi cấp | |
| **CTR (sản phẩm)** | `product_clicks / product_impressions × 100` | Mọi cấp | |
| **GMV / view** | `GMV / views` | Mọi cấp | |
| **Follow rate** | `new_followers / views × 100` | Mọi cấp | Có thể vượt 100%, không coi là lỗi |
| **Comment / Share / Like rate** | `(comments\|shares\|likes) / views × 100` | Mọi cấp | Như trên |
| **Customers** | `Σ customers` | Ngày, brand, kỳ | **Cấp ca: gắn nhãn xấp xỉ** — khách mua ở cả 2 ca nối sẽ bị đếm hụt khi trừ delta |

---

## 5. KPI chuyển đổi

| KPI | Công thức | Cấp được phép | Ghi chú |
|---|---|---|---|
| **CVR (trên click)** | `orders / product_clicks × 100` | Mọi cấp | Định nghĩa chuẩn của hệ thống |
| **SKU order rate** | `sku_orders / product_clicks × 100` | Mọi cấp | |
| **CVR (trên view)** | `orders / views × 100` | Mọi cấp | Phải ghi rõ mẫu số trên UI để không nhầm với CVR trên click |

> Trên UI, mọi chỉ số tên "CVR" phải chú thích mẫu số. Hai chỉ số khác mẫu số mà cùng tên
> là nguồn tranh cãi số liệu phổ biến nhất giữa agency và brand.

---

## 6. Chỉ số liên quan ads — GIỚI HẠN NGHIÊM NGẶT

Nguồn ads chỉ có độ mịn **theo ngày** và phạm vi **toàn shop** (`01_BUSINESS_RULES.md`
mục 10).

| KPI | Công thức | Cấp được phép | Ghi chú |
|---|---|---|---|
| **Ads Spend (toàn shop)** | `Σ ads_spend` | **Ngày, kỳ** | |
| **ROAS toàn shop** | `ads_gross_revenue / ads_spend` | **Ngày, kỳ** | Tên hiển thị bắt buộc có chữ "toàn shop" |
| **Cost per order (ads)** | `ads_spend / ads_sku_orders` | **Ngày, kỳ** | Tính lại, không lấy số gốc |

**CẤM tuyệt đối** (sẽ tạo ra số sai):
- ROAS / ads spend ở **cấp ca**, cấp host, cấp campaign.
- Gọi `ads_gross_revenue` là "GMV live do ads mang lại".
- Chia tỷ lệ ads spend theo GMV hay theo giờ live rồi hiển thị như số thật.

---

## 7. KPI target

| KPI | Công thức | Cấp được phép | Ghi chú |
|---|---|---|---|
| **Target GMV** | Từ `targets` / `target_allocations` | Ca, kỳ | |
| **Achievement** | `GMV thực tế / Target GMV × 100` | Ca, ngày, brand, kỳ | `N/A` khi chưa set target — **không hiển thị 0%** |
| **Target Gap** | `GMV − Target GMV` | Ca, kỳ | Âm = thiếu |
| **Run-rate (trong kỳ)** | `GMV lũy kế / (số ngày đã qua / tổng số ngày trong kỳ)` | Kỳ | Chỉ để cảnh báo sớm, không phải dự báo |
| **Required GMV/hour còn lại** | `(Target − GMV lũy kế) / số giờ live còn lại theo kế hoạch` | Kỳ | `N/A` nếu chưa có kế hoạch giờ còn lại |

Khi ca có `ENDED_EARLY` hoặc `OVERTIME_EXTENDED`: Achievement vẫn so với target đã đặt,
nhưng UI phải hiển thị cờ cho biết thời lượng thực tế lệch kế hoạch — nếu không, ca off
sớm sẽ luôn bị đánh giá là kém.

---

## 8. KPI nhân sự

### 8.1. Host — hiệu suất bán hàng

| KPI | Công thức | Ghi chú |
|---|---|---|
| **GMV** | `Σ gmv` các ca host đó phụ trách | Chỉ ca `AGENCY` |
| **GMV / hour** | `Σ gmv / Σ live_hours` | **Chỉ số so sánh chính**, công bằng giữa ca dài và ca ngắn |
| **AOV / CVR / CTR** | Như mục 3–5, cộng dồn rồi chia lại | |
| **Achievement trung bình** | `Σ GMV / Σ Target` các ca của host | Không lấy trung bình các % |

**Bắt buộc khi so sánh host**: luôn kèm chiều bối cảnh (brand / campaign type / khung
giờ). Một host live brand khó, khung giờ xấu sẽ luôn thua nếu chỉ xếp hạng bằng GMV
tuyệt đối. Bảng xếp hạng chỉ bằng một chỉ số đơn lẻ = bug thiết kế.

**Khi có `HOST_CHANGED` giữa ca**: GMV của ca không tự chia cho 2 host. Nếu không có
snapshot tại thời điểm đổi người thì phần đó là `SHARED_UNALLOCATED` — ghi nhận cả hai
host cùng tham gia ca, không quy kết GMV riêng cho ai.

### 8.2. Trợ live — hiệu suất vận hành

Không đánh giá trợ live bằng GMV (họ không quyết định doanh thu). Các chỉ số vận hành:

| KPI | Công thức | Nguồn |
|---|---|---|
| **Tỷ lệ có mặt** | `số ca đã nhận / số ca được phân công × 100` | booking + session |
| **Tỷ lệ đúng giờ** | `số ca có SESSION_STARTED ≤ giờ kế hoạch / tổng số ca × 100` | event log |
| **Tỷ lệ nộp dữ liệu đúng hạn** | `số ca có snapshot trong vòng X phút sau khi ca kết thúc / tổng số ca × 100` | import + session |
| **Tỷ lệ dữ liệu cần sửa** | `số ca bị UPLOAD_CORRECTED / tổng số ca × 100` | event log |
| **Độ đầy đủ event log** | `số ca có đủ SESSION_STARTED và SESSION_ENDED / tổng số ca × 100` | event log |

**Đã chốt**: ngưỡng "nộp dữ liệu đúng hạn" = **30 phút** kể từ khi ca kết thúc. Để ở dạng
cấu hình hệ thống, không hard-code.

---

## 9. KPI chất lượng dữ liệu (cho Operation & Data Analyst)

| KPI | Công thức | Mục đích |
|---|---|---|
| **Tỷ lệ ca có confidence HIGH** | `số ca HIGH / tổng số ca × 100` | Sức khoẻ dữ liệu toàn hệ thống |
| **Số ca chờ dữ liệu** | Đếm ca `DATA_PENDING` | Việc cần làm hôm nay |
| **Số đoạn chưa xác định ownership** | Đếm ca/đoạn `UNKNOWN` | Operation phải xử lý |
| **Số event chờ hậu kiểm** | Đếm event `LOGGED` | Hàng đợi của Operation |
| **GMV đang ở trạng thái SHARED_UNALLOCATED** | `Σ gmv` các dòng `SHARED_UNALLOCATED` | Phần doanh thu chưa quy kết được cho ca nào — càng nhỏ càng tốt |

Chỉ số cuối cùng là thước đo quan trọng nhất cho chất lượng quy trình: nó cho biết bao
nhiêu tiền đang "không biết của ai" vì trợ live quên tải report đúng thời điểm.

---

## 10. Quy tắc gộp theo cấp

| Từ cấp | Lên cấp | Cách gộp |
|---|---|---|
| Ca | Ngày / Brand / Kỳ / Host / Campaign | Cộng các trường gốc → tính lại chỉ số dẫn xuất |
| Ca `SHARED_UNALLOCATED` | Bất kỳ cấp nào | Tiền có thật nên **luôn phải hiện**, nhưng hiện **cạnh** tổng chứ không **trong** tổng — xem 10.1 |
| Ca `BRAND_INHOUSE` | — | Loại khỏi mọi KPI agency; chỉ hiện ở báo cáo "toàn shop" có ghi chú |
| Ca `UNKNOWN` | — | Loại khỏi mọi KPI cho tới khi Operation xác nhận |

### 10.1. Ca chưa quy kết được: hiện cạnh tổng, không cộng vào tổng

Khi thiếu snapshot ở ranh giới bàn giao, engine không tạo ra được con số GMV cho từng ca
— nó chỉ biết cả đoạn chung kiếm được bao nhiêu. Vì vậy có **hai** con số phải cùng xuất
hiện, không bao giờ được gộp:

| Con số | Ý nghĩa | Dùng để |
|---|---|---|
| **GMV đã quy kết** | Tổng của các ca engine tách được | So sánh, tính KPI dẫn xuất, đánh giá target |
| **GMV chưa quy kết** | Tiền của các đoạn chung, không biết thuộc ca nào | Đo chất lượng dữ liệu; cộng với trên ra GMV toàn shop |

Ba quy tắc bắt buộc:

1. **Không cộng ca chưa quy kết vào tổng dưới dạng 0.** Nó sẽ kéo GMV/giờ và AOV xuống
   một cách sai sự thật.
2. **Không vì một ca chưa quy kết mà trả `N/A` cho cả kỳ.** Một ngày không tách được
   không làm cả tháng thành không biết được.
3. **Luôn nói rõ đã loại bao nhiêu ca** ngay cạnh con số lớn. Một tổng lặng lẽ bỏ sót ca
   là một kiểu nói dối khác.

Hệ quả cho mẫu số: tỷ lệ đạt target so GMV đã quy kết với target của **đúng những ca đã
quy kết**, không phải target của toàn kỳ — nếu không tỷ lệ sẽ thấp một cách vô lý.

Hệ quả khi so sánh nhiều brand: brand có nhiều tiền chưa quy kết sẽ bị **báo thiếu** nếu
chỉ nhìn GMV đã quy kết. Mọi bảng so sánh giữa các brand phải hiện phần chưa quy kết của
từng brand ngay trong bảng, không giấu xuống phần chú thích.

---

## 11. Chỉ số cố tình CHƯA làm

Ghi lại để không ai vô tình build sai:

| Chỉ số | Lý do chưa làm |
|---|---|
| ROAS / ads ở cấp ca | Nguồn ads chỉ có cấp ngày, toàn shop (mục 6) |
| NMV thật, tỷ lệ hoàn thật | Cần ~15 ngày mới chốt; hiện chỉ có ước tính |
| KPI theo SKU / sản phẩm | File export hiện tại **không có dữ liệu SKU** — cần nguồn khác trước |
| Peak CCU, watch time chi tiết | Không có trong file export hiện tại |
| Forecast, benchmark P25/P50/P75 | Cần tích luỹ đủ dữ liệu sạch qua hệ thống mới, không lấy từ Google Sheet cũ |
