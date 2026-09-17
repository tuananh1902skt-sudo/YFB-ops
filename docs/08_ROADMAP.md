# 08 — Roadmap & Timeline

Kế hoạch từ 18/09/2026 đến go-live 24/10/2026.

**Giả định:** 4 giờ/ngày, 6 ngày/tuần (Chủ nhật nghỉ, dùng làm buổi bù). Mỗi buổi làm
trọn một hạng mục dọc và kết thúc bằng một commit chạy được — không để việc dở qua ngày.
Dữ liệu nền (brand, host, trợ live, lịch ca tháng 9, file export thật của ít nhất 1
brand) phải sẵn sàng trước 19/09.

---

## Mốc bàn giao

| Mốc | Ngày | Tiêu chí nghiệm thu |
|---|---|---|
| M1 | 23/09 | Import file thật không lỗi; chạy lại lần hai số không đổi; GMV từng ca khớp bảng Excel hiện tại, chênh lệch giải thích được |
| M2 | 26/09 | Bản draft dashboard brand: đọc được GMV, % hoàn thành target, GMV/giờ, top host mà không cần ai giải thích |
| M3 | 30/09 | Xem được toàn agency và so sánh host có kèm bối cảnh |
| M4 | 07/10 | Không còn việc phải sửa trực tiếp trong database; mọi thao tác vận hành làm được trên giao diện |
| M5 | 14/10 | Trợ live tự hoàn thành một ca đầu–cuối mà không cần hỏi |
| M6 | 24/10 | 7 ngày pilot liên tục không sai lệch số; bảng Excel cũ ngừng dùng |

---

## Sprint 1 — Đưa dữ liệu thật lên hạ tầng thật (18/09 – 23/09)

| Ngày | Việc | Xong thì có gì |
|---|---|---|
| T6 18/09 | Dựng Supabase staging, chạy 8 migration, bật đăng nhập thật | Đăng nhập được bằng tài khoản thật, mỗi vai trò thấy đúng phần của mình |
| T7 19/09 | Nạp dữ liệu nền: brand, host, trợ live, lịch ca tháng 9 | Lịch live tháng 9 hiển thị trên hệ thống |
| T2 21/09 | Import file export thật qua giao diện, chạy attribution trên dữ liệu thật | Mỗi ca có GMV riêng, truy ngược được về dòng raw |
| T3 22/09 | KPI service trên dữ liệu thật: gộp theo ngày, brand, campaign, host | Số KPI đọc được qua API, đúng quy tắc gộp |
| T4 23/09 | Đối soát số với bảng Excel đang dùng, sửa lệch | **M1** |

## Sprint 2 — Dashboard (24/09 – 30/09)

| Ngày | Việc | Xong thì có gì |
|---|---|---|
| T5 24/09 | Dashboard brand: khung màn hình + số tổng (GMV, target, achievement, số ca, giờ live) | Nhìn thấy hình hài dashboard với số thật |
| T6 25/09 | Biểu đồ GMV theo ngày, tách rõ phần agency và phần brand tự live | Thấy được xu hướng và phần nào là công agency |
| T7 26/09 | Bảng theo campaign và theo host | **M2 — bản draft dashboard brand** |
| T2 28/09 | Sửa theo góp ý vòng 1 | Dashboard đúng thứ cần nhìn |
| T3 29/09 | Dashboard tổng — gộp nhiều brand cho Management | Một màn hình nhìn toàn agency |
| T4 30/09 | Hiệu suất host / trợ live, kèm bối cảnh brand – campaign – khung giờ | **M3** |

## Sprint 3 — Quản trị và chất lượng dữ liệu (01/10 – 07/10)

| Ngày | Việc | Xong thì có gì |
|---|---|---|
| T5 01/10 | Màn hình chất lượng dữ liệu: tỷ lệ ca confidence HIGH, GMV chưa quy kết, tỷ lệ nộp đúng hạn | Biết ngay ai nộp thiếu, số nào chưa chắc |
| T6 02/10 | Màn hình cấu hình: ngưỡng 30 phút, ngưỡng 8 tiếng, tỷ lệ hoàn, loại campaign | Đổi quy tắc không cần sửa code |
| T7 03/10 | Quản trị brand và nhân sự | Tự thêm brand, thêm host mới |
| T2 05/10 | Mapping cột file import | TikTok đổi tên cột thì tự sửa được trong 5 phút |
| T3 06/10 | Xuất báo cáo brand ra Excel/PDF | Gửi báo cáo cho khách được ngay từ hệ thống |
| T4 07/10 | Trạng thái rỗng / lỗi / chờ, màn hình audit log | **M4** |

## Sprint 4 — Kiểm thử và đào tạo (08/10 – 14/10)

| Ngày | Việc | Xong thì có gì |
|---|---|---|
| T5 08/10 | Chạy toàn bộ bộ test A–G và checklist Definition of Done | Danh sách lỗi cần sửa |
| T6 09/10 | Sửa lỗi từ buổi test | Toàn bộ test pass |
| T7 10/10 | Deploy production, backup, cảnh báo lỗi | Hệ thống chạy trên môi trường thật |
| T2 12/10 | Hướng dẫn 2 trang cho trợ live + buổi đào tạo 1 tiếng | Trợ live biết tự upload và đối soát |
| T3 13/10 | Chạy thử có người kèm: 1 brand, các ca trong ngày | Phát hiện vướng mắc thực tế |
| T4 14/10 | Sửa vướng mắc từ buổi chạy thử | **M5** |

## Sprint 5 — Pilot song song và go-live (15/10 – 24/10)

| Ngày | Việc | Xong thì có gì |
|---|---|---|
| 15/10 – 20/10 | Chạy song song với cách cũ trên 1 brand, mỗi buổi 4h đối soát và sửa lỗi phát sinh | Sai lệch giảm dần về 0 |
| T4 21/10 | Nghiệm thu số liệu pilot, chốt dừng bảng Excel cũ | Biên bản đối soát |
| T5 22/10 – T6 23/10 | Mở rộng cho các brand còn lại | Toàn bộ brand đã lên hệ thống |
| T7 24/10 | Chốt vận hành chính thức | **M6 — Go-live** |

---

## Rủi ro

| Rủi ro | Ảnh hưởng | Phương án |
|---|---|---|
| Trợ live không tải report đúng lúc giao ca | Thiếu snapshot → GMV không tách được cho từng ca | Đánh dấu `SHARED_UNALLOCATED` thay vì chia đều; đưa vào đào tạo 12/10 như việc bắt buộc |
| TikTok đổi tên cột file export | Import gãy giữa chừng | Màn hình mapping cột làm 05/10; trước đó sửa cấu hình mất ~1 giờ |
| Dữ liệu nền không kịp ngày 19/09 | Trượt toàn bộ Sprint 1 và cả M2 | Chốt người cung cấp danh sách trước 18/09 |
| Góp ý sau khi xem draft đổi nhiều về cách nhìn số | Thêm 2–3 buổi | Đã chừa sẵn buổi 28/09; thêm nữa thì lấy các ngày Chủ nhật |
| Giới hạn token trong ngày | Một buổi không đi hết hạng mục | Mỗi hạng mục chia nhỏ để vừa một buổi; phần thừa đẩy sang buổi bù Chủ nhật |

Phạm vi cố tình chưa làm trong đợt này: ads cấp ca, refund thật, KPI theo SKU,
forecast/benchmark, client portal, module tài chính — lý do từng mục ở
`05_KPI_DICTIONARY.md` mục 11.
