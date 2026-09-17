# 06 — UI/UX Specification

Status: DRAFT — v0.1

Kiến trúc thông tin, danh sách màn hình, luồng chính và quy ước hiển thị. Mọi con số trên
UI phải truy được về `05_KPI_DICTIONARY.md`; mọi trạng thái phải khớp enum ở
`02_DATA_DICTIONARY.md`.

---

## 1. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Thiết bị chính của trợ live trong ca | **Laptop đặt sẵn tại studio** → thiết kế desktop-first. Vẫn responsive để xem lịch/hiệu suất trên điện thoại, nhưng luồng trong ca tối ưu cho màn hình rộng |
| Phong cách | **Phân theo vai trò**: màn hình host/trợ live thoáng, chữ to, ít thông tin; màn hình Operation/Management dày dữ liệu. Cùng một design system, khác mật độ |
| Ngôn ngữ | **Tiếng Việt, giữ thuật ngữ ngành**: GMV, AOV, CTR, CVR, ROAS, live, ca, session, campaign giữ nguyên |
| Triển khai | **1 brand pilot trước**. `[TBD]` xác nhận brand nào (dữ liệu mẫu đang là Franklin) |

---

## 2. Nguyên tắc thiết kế

1. **Thao tác trong ca tối đa 2 chạm.** Trợ live đang vừa live vừa thao tác. Mỗi hành
   động (bàn giao, restart, OT, off sớm) = 1 chạm mở, 1 chạm xác nhận. Hệ thống điền sẵn
   tất cả những gì đoán được (ca nào, room nào, giờ nào = bây giờ).
2. **Hiển thị phép tính, không chỉ kết quả.** Team đang quen nhìn số thô trên Google
   Sheet. Nếu hệ thống đưa ra con số khác mà không giải thích, họ sẽ không tin và quay
   lại Sheet. Mọi con số đã qua xử lý (delta, cộng room) phải xem được cách tính.
3. **Số không chắc chắn phải trông khác số chắc chắn.** Ước tính, thiếu dữ liệu, chưa
   quy kết được — mỗi loại có dấu hiệu thị giác riêng, không trộn lẫn với số thật.
4. **Việc cần làm phải tự tìm đến người dùng**, không bắt người dùng đi tìm. Operation mở
   app là thấy ngay hàng đợi phải xử lý.
5. **Không bắt nhập cái hệ thống tính được.** Trợ live không nhập GMV, AOV, CTR — chỉ
   upload file và log sự kiện.

---

## 3. Design system

### 3.1. Nền tảng

- Tailwind CSS + shadcn/ui (Radix). Không tự viết component cơ bản.
- Font: Inter (hỗ trợ tiếng Việt đầy đủ). Số liệu dùng `font-variant-numeric: tabular-nums`
  để các cột số thẳng hàng.
- Mật độ: 2 preset — `comfortable` (host/trợ live: chữ 16px, nút cao 48px) và `compact`
  (Operation/Management: chữ 14px, hàng bảng 36px).

### 3.2. Màu ngữ nghĩa

Màu **chỉ mang ý nghĩa trạng thái**, không dùng để trang trí.

| Ý nghĩa | Dùng cho |
|---|---|
| Trung tính | Trạng thái bình thường, dữ liệu tin cậy (`HIGH`) — **không gắn badge**, tránh nhiễu |
| Xanh dương | Đang diễn ra (ca `LIVE`), thông tin |
| Xanh lá | Hoàn tất, đạt target |
| Vàng/hổ phách | Cần chú ý: `MEDIUM`/`LOW` confidence, ownership `UNKNOWN`, event chờ hậu kiểm |
| Đỏ | Cần xử lý ngay: `NEEDS_REVIEW`, thiếu dữ liệu quá hạn, xung đột lịch |
| Xám nhạt | Không thuộc agency (`BRAND_INHOUSE`), dữ liệu ngoài phạm vi |

Không bao giờ dùng riêng màu để truyền đạt trạng thái — luôn kèm chữ hoặc icon (người
dùng mù màu, và ánh sáng studio có thể làm lệch màu).

### 3.3. Quy ước hiển thị số

| Loại | Quy ước | Ví dụ |
|---|---|---|
| Tiền đầy đủ | `Intl.NumberFormat('vi-VN')` + `₫` | `18.764.428 ₫` |
| Tiền rút gọn (KPI card, biểu đồ) | Triệu = `tr`, tỷ = `tỷ`, 1 chữ số thập phân | `18,8tr` · `4,2 tỷ` |
| Phần trăm | 1 chữ số thập phân | `93,6%` |
| Thời lượng | `Xh Ym` | `3h 55m` |
| Ngày | `dd/MM/yyyy` | `09/09/2026` |
| Giờ | 24h, `HH:mm` | `19:07` |
| Ca qua nửa đêm | Ghi rõ ngày hôm sau | `20:00 → 00:36 (10/09)` |

Toàn bộ thời gian hiển thị theo GMT+7.

### 3.4. Quy ước hiển thị "số không chắc chắn"

Đây là phần quan trọng nhất của design system trong hệ thống này.

| Tình huống | Cách hiển thị |
|---|---|
| Không tính được (mẫu số = 0) | `—` (em dash), tooltip: "Không tính được: chưa có lượt click sản phẩm". **Không hiển thị `0`** |
| Ước tính (NMV, tỷ lệ hoàn) | Tiền tố `~` + gạch chân chấm + tooltip giải thích cách ước tính | 
| Chưa quy kết được (`SHARED_UNALLOCATED`) | Ô số hiển thị `Gộp chung`, kèm link tới cụm ca liên quan. **Không hiển thị số chia đôi** |
| Confidence thấp | Badge nhỏ cạnh số: `Cần rà soát` / `Xấp xỉ` |
| Chưa có dữ liệu | `Chờ dữ liệu` + thời gian đã trôi qua kể từ khi ca kết thúc |

---

## 4. Kiến trúc thông tin

Điều hướng thay đổi theo vai trò — mỗi người chỉ thấy phần của mình.

```
TRỢ LIVE / HOST              OPERATION / ACCOUNT          MANAGEMENT / ANALYST
─────────────────            ────────────────────         ────────────────────
Ca của tôi                   Cần xử lý  ← mặc định        Tổng quan
Ca đang live ← mặc định      Lịch live                    Theo brand
Ca đang mở (đăng ký)         Kế hoạch & target            Theo host
Hiệu suất của tôi            Phân ca & duyệt              Theo campaign
                             Nhập dữ liệu                 Chất lượng dữ liệu
                             Quản lý ca                   Cấu hình
                             Brand & nhân sự
```

### Ma trận vai trò × màn hình

| Màn hình | Host | Trợ live | Operation | Account | Management | Analyst |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Bảng điều khiển ca (Live Console) | xem | **dùng** | xem | – | – | – |
| Ca của tôi / Lịch cá nhân | ✓ | ✓ | ✓ | – | – | – |
| Ca đang mở & đăng ký | ✓ | ✓ | duyệt | – | – | – |
| Hiệu suất cá nhân | ✓ | ✓ | ✓ | – | – | – |
| Cần xử lý (hàng đợi) | – | – | **dùng** | xem | – | ✓ |
| Lịch live (tháng/tuần/ngày) | xem | xem | **dùng** | ✓ | ✓ | ✓ |
| Kế hoạch & target | – | – | ✓ | **dùng** | ✓ | ✓ |
| Nhập dữ liệu (upload) | – | **dùng** | ✓ | – | – | ✓ |
| Chi tiết ca | ✓(ca mình) | ✓(ca mình) | ✓ | ✓ | ✓ | ✓ |
| Dashboard brand | – | – | ✓ | ✓ | ✓ | ✓ |
| Dashboard tổng | – | – | – | – | ✓ | ✓ |
| Hiệu suất host/trợ live | – | – | ✓ | ✓ | ✓ | ✓ |
| Chất lượng dữ liệu | – | – | ✓ | – | ✓ | ✓ |
| Brand & nhân sự, cấu hình | – | – | ✓ | – | ✓ | – |

---

## 5. Danh sách màn hình MVP

### Nhóm A — Trong ca (quan trọng nhất)

**A1. Live Console — bảng điều khiển ca**

Màn hình trợ live mở suốt ca. Một màn hình duy nhất, không menu con.

```
┌──────────────────────────────────────────────────────────────┐
│  FRANKLIN · Ca tối 09/09        ● ĐANG LIVE   2h 14m         │
│  Host: Khói   ·   Trợ live: Minh   ·   Room: ...7893         │
│  Target ca: 30tr                                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   [  KẾT THÚC CA  ]   ← nút chính, to nhất                   │
│                                                              │
│   Bàn giao ca    Restart phòng    Đổi người    OT    Off sớm │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Diễn biến ca                                                │
│  19:07  Bắt đầu ca                                           │
│  20:31  Restart phòng live — mất mạng                        │
│  21:45  Đổi host: Khói → Linh Ân                             │
└──────────────────────────────────────────────────────────────┘
```

Quy tắc:
- Mỗi nút hành động mở một hộp thoại nhỏ đã điền sẵn: thời điểm = bây giờ (sửa được),
  room = room hiện tại, ca = ca hiện tại. Người dùng chỉ cần bấm xác nhận.
- Chỉ bắt nhập lý do ở các sự kiện bắt buộc (`Off sớm`, `Restart`) — ô lý do có sẵn vài
  lựa chọn nhanh (mất mạng / mất điện / lỗi nền tảng / làm mới traffic / hiệu suất thấp)
  kèm ô ghi chú tự do.
- Nút `Kết thúc ca` và `Bàn giao ca` đều dẫn thẳng sang màn hình upload (A2).

**A2. Upload & đối soát dữ liệu**

Mở ngay sau khi kết thúc/bàn giao ca. Đây là thời điểm quyết định chất lượng dữ liệu.

```
┌──────────────────────────────────────────────────────────────┐
│  Nộp dữ liệu — Ca tối 09/09                                  │
│  Còn 24 phút để nộp đúng hạn                    ⏱ 06:12     │
├──────────────────────────────────────────────────────────────┤
│  Bước 1  Tải report từ TikTok Shop   [Xem hướng dẫn]         │
│  Bước 2  Kéo file vào đây hoặc chọn file                     │
├──────────────────────────────────────────────────────────────┤
│  ✓ Đã nhận file · 1 room khớp với ca này                     │
│                                                              │
│  Kết quả ca này: 30.329.960 ₫                                │
│  ├─ Số cộng dồn lúc 22:07   →  107.355.468 ₫                 │
│  └─ Trừ số cộng dồn lúc 16:02 (ca chiều)  →  77.025.508 ₫    │
│                                                              │
│  [ Xác nhận ]     [ Không khớp — báo Operation ]             │
└──────────────────────────────────────────────────────────────┘
```

Quy tắc:
- **Luôn hiện phép trừ**, không chỉ hiện kết quả (nguyên tắc 2.2).
- Nếu hệ thống không chắc ca nào: hiện danh sách ca gần nhất để trợ live chọn, không tự
  gán bừa.
- Nếu phát hiện số âm, file trùng, hoặc room không khớp ca nào: dừng lại, hiện lý do
  bằng tiếng Việt dễ hiểu + nút đẩy sang Operation. **Không tự sửa, không bỏ qua.**
- Đồng hồ đếm ngược 30 phút là để nhắc nhẹ, không phải để phạt — hết giờ vẫn nộp được,
  chỉ ghi nhận vào chỉ số đúng hạn.

**A3. Ca của tôi** — danh sách ca sắp tới / đang chờ nộp dữ liệu / đã xong.

**A4. Ca đang mở & đăng ký** — danh sách ca cần người, nút đăng ký, trạng thái duyệt.

**A5. Hiệu suất của tôi** — host xem GMV/giờ, AOV, CVR theo brand và khung giờ; trợ live
xem các chỉ số vận hành (đúng giờ, nộp dữ liệu đúng hạn...).

### Nhóm B — Operation

**B1. Cần xử lý** (màn hình mặc định của Operation)

Gom toàn bộ việc tồn thành một nơi, sắp theo mức độ khẩn:

```
┌──────────────────────────────────────────────────────────────┐
│  Cần xử lý                                    Hôm nay 16/09  │
├──────────────────────────────────────────────────────────────┤
│  ● 2   Ca chưa nộp dữ liệu quá 30 phút                       │
│  ● 1   Kết quả bất thường cần rà soát (số âm sau khi trừ)    │
│  ● 3   Đoạn live chưa rõ của agency hay brand tự live        │
│  ○ 5   Sự kiện chờ hậu kiểm                                  │
│  ○ 1   GMV chưa quy kết được cho ca nào — 12,4tr             │
│  ○ 2   Ca chưa có người                                      │
└──────────────────────────────────────────────────────────────┘
```

Mỗi dòng bấm vào là vào thẳng danh sách xử lý, xử lý xong tự biến mất.

**B2. Xác nhận ownership** — hiện đoạn live không khớp ca nào đã book, kèm bối cảnh
(giờ, GMV, room) để Operation chọn: `Đây là ca của agency` (gắn vào ca nào) hoặc
`Brand tự live`. Có nút xử lý hàng loạt cho các đoạn giống nhau.

**B3. Lịch live** — tháng/tuần/ngày, kéo thả, hiện trạng thái ca bằng badge, cảnh báo
xung đột người. Vì giờ live linh hoạt (không có ca cố định), khung giờ do người tạo nhập
tự do, không chọn từ danh sách cứng.

**B4. Tạo & sửa ca** — brand, campaign, giờ dự kiến, target, nhu cầu host/trợ live.

**B5. Phân ca & duyệt đăng ký** — duyệt đăng ký, gán người trực tiếp, cảnh báo trùng giờ.

**B6. Chi tiết ca** — nơi truy vết đầy đủ:
kế hoạch vs thực tế · diễn biến ca (event log) · dữ liệu đã nộp · phép tính ra kết quả ·
nút xem file gốc · lịch sử chỉnh sửa. Đây là màn hình trả lời câu hỏi
"con số này ở đâu ra".

### Nhóm C — Phân tích

**C1. Dashboard brand** — GMV, target, achievement, số ca, giờ live, GMV/giờ, AOV, CVR;
tách rõ phần agency và phần brand tự live; biểu đồ theo ngày; bảng theo campaign và theo
host.

**C2. Dashboard tổng** (Management) — tổng hợp nhiều brand.

**C3. Hiệu suất host/trợ live** — bảng so sánh **luôn kèm bối cảnh** (brand, campaign,
khung giờ). Không có bảng xếp hạng chỉ bằng một con số.

**C4. Chất lượng dữ liệu** — tỷ lệ ca confidence HIGH, GMV chưa quy kết, tỷ lệ nộp đúng
hạn theo từng trợ live.

### Nhóm D — Quản trị

**D1. Brand & nhân sự**, **D2. Cấu hình** (ngưỡng 30 phút, ngưỡng 8 tiếng, tỷ lệ hoàn ước
tính, loại campaign), **D3. Mapping cột file import** (khi TikTok đổi tên cột).

Ở MVP, D1 và D2 được khai bằng file cấu hình + `npm run seed` thay vì màn hình quản trị
(`08_SETUP.md`). Lý do: tổ chức chỉ đổi vài lần một năm, còn một màn hình sửa brand và
vai trò lại là màn hình dễ gây hậu quả nhất nếu bấm nhầm.

### Nhóm E — Cửa vào

**E1. Đăng nhập** (`/login`). Email + mật khẩu. Không có đăng ký tự do: ai vào được hệ
thống là một quyết định vận hành, không phải ai biết URL cũng vào được.

Thông báo lỗi tách làm ba loại vì ba loại này dẫn tới ba hành động khác nhau: sai thông
tin đăng nhập (người dùng tự sửa), không kết nối được máy chủ (kiểm tra mạng), lỗi khác
(báo Operation). Gộp chúng làm một sẽ khiến người dùng đi tìm mật khẩu trong khi lỗi nằm
ở chỗ khác. Riêng trường hợp sai thông tin **không** nói rõ email có tồn tại hay không.

**E2. Trang chủ** (`/`). Tên người đăng nhập, vai trò kèm brand, và danh sách màn hình
người đó dùng được — suy từ vai trò, không phải danh sách cố định.

Việc giấu link **không** phải là phân quyền; RLS mới là chốt chặn. Giấu link là để người
dùng không bấm vào một màn hình rồi gặp trang trống và tưởng hệ thống hỏng. Người đã
đăng nhập nhưng chưa được gán vai trò thấy đúng câu đó, kèm việc cần làm tiếp: nhờ
Operation gán vai trò.

---

## 6. Luồng chính

### Luồng 1 — Ca bình thường
```
Trợ live mở Live Console → Bắt đầu ca → (live) → Kết thúc ca
→ Upload report → hệ thống khớp room, tính kết quả → Xác nhận → Xong
```

### Luồng 2 — Ca nối (2 team, 1 room)
```
Team A: Bắt đầu ca → Bàn giao ca → Upload report (snapshot 1)
                                      ↓
Team B: hệ thống tự tạo/kích hoạt ca tiếp theo cùng room
        → (live) → Kết thúc ca → Upload report (snapshot 2)
        → Hiển thị: kết quả ca B = snapshot 2 − snapshot 1
```
Điểm mấu chốt về UX: khi Team A bấm `Bàn giao ca`, hệ thống **nhắc ngay** rằng phải
upload report trước khi rời đi — vì nếu bỏ qua, GMV của cả hai ca sẽ dính vào nhau và
không tách được nữa. Đây là cảnh báo cứng, không phải gợi ý mờ.

### Luồng 3 — Restart giữa ca
```
Trợ live bấm Restart phòng → chọn lý do → (live tiếp trên room mới)
→ Kết thúc ca → Upload report (hệ thống nhận ra có 2 room trong ca)
→ Kết quả ca = cộng 2 đoạn room
```

### Luồng 4 — Brand tự live xen vào
```
Import phát hiện đoạn live không khớp ca nào
→ Đưa vào hàng đợi "Cần xử lý" của Operation
→ Operation xác nhận "Brand tự live"
→ Đoạn đó bị loại khỏi mọi KPI của agency, vẫn hiện ở báo cáo toàn shop
```

---

## 7. Trạng thái rỗng, lỗi, chờ

| Tình huống | Hiển thị |
|---|---|
| Chưa có ca nào | Hướng dẫn tạo ca đầu tiên, không để trang trắng |
| Chưa có dữ liệu ca | `Chờ dữ liệu — ca kết thúc 12 phút trước` + nút nhắc trợ live |
| File sai định dạng | Nói rõ sai gì ("Không tìm thấy sheet `performance_detail`"), gợi ý cách sửa |
| Cột file lạ | Chuyển sang màn hình mapping thủ công, không báo lỗi cụt |
| Không có quyền | Nói rõ cần quyền gì và liên hệ ai |

Không bao giờ hiện lỗi kỹ thuật thô (stack trace, mã lỗi Postgres) cho người dùng cuối.

---

## 8. Những gì KHÔNG làm ở MVP

- App mobile riêng (dùng web responsive).
- Chế độ tối (dark mode).
- Tuỳ biến dashboard theo từng người.
- Thông báo đẩy qua Zalo/Telegram — MVP dùng thông báo trong app + email.
- Bất kỳ chỉ số ads nào ở cấp ca (xem `05_KPI_DICTIONARY.md` mục 6).

---

## 3.5. Màu biểu đồ và giới hạn đã đo

Bảng màu biểu đồ đã chạy qua validator (kiểm lightness, chroma, tách biệt dưới mù màu,
tương phản nền):

| Dùng cho | Màu | Kết quả đo trên nền trắng |
|---|---|---|
| Phần agency vận hành | `#1d4ed8` | Đạt toàn bộ |
| Phần brand tự live | `#94a3b8` | Xám có chủ đích (dạng *emphasis*): agency là chủ thể, in-house là bối cảnh. Tách biệt với màu agency ΔE 28,8 (thường) / 25,1 (mù màu) |

Xám chỉ đạt tương phản 2,56:1 nên **bắt buộc** kèm nhãn trực tiếp và nút "Xem dạng bảng" —
không được để người đọc chỉ dựa vào màu.

**Phát hiện cần ghi lại**: bộ màu trạng thái (`#15803d` / `#b45309` / `#b91c1c`) **không**
tách biệt được bằng màu: vàng và đỏ chỉ cách nhau ΔE 9,1 ở mắt thường và 4,9 dưới mù màu
deuteranopia. Không sửa được bằng cách đổi sắc độ: cả ba phải đủ đậm để đọc như **chữ**
trên nền trắng, mà dải đậm đó ép chúng lại gần nhau.

Kết luận: chữ đi kèm màu trạng thái **không phải để trang trí, nó là kênh truyền đạt
chính**. Mọi badge và mục chất lượng dữ liệu phải có icon + chữ; không bao giờ chỉ có
chấm màu. Đây chính là lý do quy tắc ở mục 3.2 tồn tại — giờ đã có số đo chứng minh.

---

## 8b. Ghi chú khi triển khai

- **Kho file**: upload cần một bucket Supabase Storage tên `imports`. Đường dẫn file do
  server tự sinh theo `{platform_account_id}/{sha256}.xlsx`, trình duyệt không được
  quyết định — nếu không, người dùng có thể trỏ import sang file của brand khác.
- **shadcn/ui**: môi trường build hiện tại chặn `ui.shadcn.com` nên chưa chạy được
  `npx shadcn init`. Component cơ bản đang ở `src/components/ui/`, giữ đúng API của
  shadcn để thay thế sau. Cần hành vi phức tạp (dialog, select) thì cài primitive Radix
  từ npm.
- **Xem thử thiết kế**: `/demo/upload` dựng 4 tình huống thường gặp bằng chính engine
  tách ca, không phải số viết tay — dùng để duyệt giao diện trước khi có dữ liệu thật.

---

## 9. Còn mở

1. `[TBD]` Brand nào chạy pilot.
2. `[TBD]` Có bộ nhận diện thương hiệu YFB (logo, màu chính) cần áp vào không, hay dùng
   bảng màu trung tính mặc định.
