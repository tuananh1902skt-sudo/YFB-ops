# Khai báo tổ chức ban đầu

`organisation.example.json` là mẫu. Copy sang `organisation.json`, sửa theo tổ chức
thật rồi chạy:

```
npm run seed -- seed/organisation.json --dry-run   # xem trước
npm run seed -- seed/organisation.json             # ghi thật
```

`organisation.json` không nằm trong git (`.gitignore`) vì chứa email nhân sự thật.

## Vài điểm dễ sai

**Mã brand (`code`)** là khoá tra cứu khi chạy lại seed. Đổi mã sau này sẽ tạo brand
mới chứ không đổi tên brand cũ — đổi tên thì sửa `name`, giữ nguyên `code`.

**Vai trò toàn hệ thống** (`SUPER_ADMIN`, `MANAGEMENT`, `DATA_ANALYST`, `FINANCE`)
không gắn brand, và thấy mọi brand. **Vai trò còn lại** (`ACCOUNT`, `OPERATION`,
`HOST`, `ASSISTANT`) bắt buộc gắn brand: để trống thì người đó đăng nhập được nhưng
không thấy dữ liệu nào, seed sẽ chặn trước.

**`estimatedRefundRate`** là tỷ lệ hoàn ước tính, dạng thập phân (`0.05` = 5%). Bỏ
trống thì NMV ước tính sẽ bằng đúng GMV — seed cảnh báo chứ không tự đặt một con số.

**Chạy lại bao nhiêu lần cũng được.** Seed so khớp với dữ liệu đang có rồi chỉ ghi
phần khác, và không xoá gì. Thứ có trong database mà không có trong file được liệt kê
ra để bạn tự quyết.
