# 08 — Dựng hệ thống từ số không

Tài liệu này đi từ "chưa có gì" đến "trợ live nộp được file thật và Operation thấy số".
Làm đúng thứ tự — mỗi bước đều kiểm chứng được trước khi sang bước sau.

Thời gian ước tính: 30–45 phút, phần lớn là chờ Supabase khởi tạo.

---

## Trước khi bắt đầu

Cần có:

- Tài khoản Supabase (bản miễn phí là đủ cho giai đoạn pilot)
- Node 20.12 trở lên (`node -v`)
- Supabase CLI. **Không cài bằng `npm i -g supabase`** — gói npm này cố tình chặn cài
  toàn cục và sẽ báo lỗi. Dùng một trong hai:
  - macOS/Linux có Homebrew: `brew install supabase/tap/supabase`
  - không có Homebrew: bỏ qua bước cài, thay mọi lệnh `supabase ...` dưới đây bằng
    `npx supabase@latest ...`
- Danh sách nhân sự: email, họ tên, vai trò, brand phụ trách

Chưa cần: tên miền, hosting. Chạy trên máy trước, deploy sau.

---

## Bước 1 — Tạo project Supabase

Vào https://supabase.com/dashboard → **New project**.

- **Region**: Singapore (`ap-southeast-1`) — gần Việt Nam nhất, giảm độ trễ mỗi lần
  trợ live nộp file.
- **Database password**: lưu vào trình quản lý mật khẩu ngay. Supabase không cho xem lại.

Chờ khoảng 2 phút cho project khởi tạo xong.

## Bước 2 — Lấy khoá và điền vào `.env.local`

Project Settings → **API**. Copy ba giá trị:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...            # mục "anon public"
SUPABASE_SERVICE_ROLE_KEY=eyJ...                # mục "service_role" — bí mật
```

> **`SUPABASE_SERVICE_ROLE_KEY` bỏ qua toàn bộ phân quyền.** Ai cầm key này đọc và sửa
> được dữ liệu của mọi brand. Nó chỉ được nằm ở hai chỗ: file `.env.local` trên máy, và
> biến môi trường của môi trường deploy. Không đưa vào chat, không commit, không gửi
> qua tin nhắn. `.env*` đã nằm trong `.gitignore`.

## Bước 3 — Áp dụng schema

```bash
supabase link --project-ref <project-ref>   # project-ref nằm trong URL của dashboard
supabase db push
```

(Chưa cài CLI thì dùng `npx supabase@latest link --project-ref <ref>` và
`npx supabase@latest db push`.)

Repo đã có sẵn `supabase/config.toml` nên không cần chạy `supabase init`.

`db push` chạy toàn bộ migration trong `supabase/migrations/`, gồm cả bucket `imports`
và policy của nó. **Không tạo bucket bằng tay trên giao diện** — bucket tạo tay sẽ
không có policy, và lỗi đó chỉ lộ ra khi trợ live bấm nộp file.

Chạy lại `db push` nhiều lần không sao: các migration đều viết để áp lại được.

Nếu push dừng ở thông báo *"role đang chạy migration không sở hữu storage.objects"*: đó
là bảng của Supabase chứ không phải của repo, và một số project không cho role mặc định
tạo policy trên đó. Cách xử lý: mở SQL Editor trên dashboard, dán nguyên nội dung
`supabase/migrations/20260917000009_import_storage.sql` rồi chạy. **Đừng bỏ qua bước
này** — thiếu policy thì màn hình nộp file sẽ lỗi, và tệ hơn là file của brand này có
thể lọt sang brand khác.

Kiểm chứng: Table Editor phải thấy `live_sessions`, `room_snapshots`,
`session_attributions`; Storage phải thấy bucket `imports` ở trạng thái private.

## Bước 4 — Khai báo tổ chức

```bash
cp seed/organisation.example.json seed/organisation.json
```

Sửa file theo tổ chức thật: client, brand, tài khoản TikTok Shop, nhân sự và vai trò.
Hướng dẫn từng trường ở `seed/README.md`.

Soát trước khi ghi:

```bash
npm run seed -- seed/organisation.json --dry-run
```

Lệnh này in ra đúng những gì sẽ thay đổi và không ghi gì cả. Đọc kỹ phần cảnh báo — ví
dụ một brand chưa có ai vai trò OPERATION nghĩa là sẽ không ai tạo được ca cho brand đó.

Ghi thật:

```bash
npm run seed -- seed/organisation.json
```

Cuối lệnh sẽ in **mật khẩu tạm của từng tài khoản mới**, mỗi mật khẩu chỉ hiện đúng một
lần. Gửi riêng cho từng người và yêu cầu đổi khi đăng nhập lần đầu. Nếu project Supabase
đã cấu hình SMTP thì dùng `--invite` để gửi email mời thay vì đặt mật khẩu.

Chạy lại lệnh này bao nhiêu lần cũng được: seed so khớp với dữ liệu đang có rồi chỉ ghi
phần khác, và không xoá bất cứ thứ gì.

## Bước 5 — Chạy thử

```bash
npm install
npm run dev
```

Mở http://localhost:3000 → chuyển sang `/login` → đăng nhập bằng một tài khoản vừa tạo.
Trang chủ hiện đúng những màn hình vai trò đó dùng được.

## Bước 6 — Đi hết một vòng bằng dữ liệu thật

Đây là bước quan trọng nhất. Từ đầu tới giờ mới chỉ chứng minh hệ thống *chạy*, chưa
chứng minh nó *đúng*.

1. **Tạo một ca** ở `/schedule`, đặt khung giờ trùng với một ca live đã diễn ra thật.

   Brand đã live một thời gian rồi thì dựng lại khung ca từ chính file report nhanh hơn
   gõ tay:

   ```bash
   npm run shifts-from-report -- <report.xlsx> --date 2026-09-13
   npm run shifts-from-report -- <report.xlsx> --date 2026-09-13 --commit
   ```

   Lệnh đầu chỉ in ra, không ghi gì. Nó ghép các room liền nhau thành một ca, nên ca bị
   mất sóng rồi bật lại vẫn ra một ca chứ không thành hai.

   **Đối chiếu khung giờ nó đề xuất với lịch thật của bạn trước khi `--commit`.** Dựng
   ngược ca từ report chỉ đúng cho lần nạp dữ liệu quá khứ đầu tiên — bình thường ca
   phải được lên kế hoạch trước, rồi report mới khớp vào.
2. **Phân người** vào ca đó.
3. **Nộp file report thật** ở `/upload` — đúng file trợ live tải về lúc kết thúc ca.
4. **Đọc màn hình đối soát**: nó phải nói rõ phép trừ nào đang được thực hiện
   ("lấy số cộng dồn lúc X trừ số cộng dồn lúc Y"), trước khi bạn bấm lưu.
5. **Mở chi tiết ca** ở `/sessions/<id>` và truy ngược con số về file gốc.
6. **Xem `/operations`**: mọi đoạn live không khớp ca nào phải nằm ở hàng đợi chờ xác
   nhận `ownership`, không được tự động tính vào KPI agency.

Nếu con số ở bước 4 không khớp với con số bạn tự tính tay từ file, **dừng lại và báo**.
Đó là lỗi nghiệp vụ, không phải lỗi hiển thị.

---

## Kiểm chứng không cần Supabase

Ba lệnh dưới đây chạy được ngay cả khi chưa có project, dùng để soát trước mỗi lần đổi
code:

```bash
npx tsx scripts/dry-run-import.ts <file.xlsx>   # cả pipeline import trên file thật
./scripts/verify-migrations.sh                  # ràng buộc nghiệp vụ ở tầng DB
./scripts/verify-rls.sh                         # phân quyền theo từng vai trò
npm test                                        # toàn bộ quy tắc nghiệp vụ
```

Hai script `verify-*` cần một PostgreSQL 15+ chạy trên máy. Chúng dựng database tạm, áp
migration thật, chạy assertion rồi xoá đi — không đụng tới database nào khác.

---

## Deploy

Biến môi trường ở môi trường deploy giống hệt `.env.local`. Riêng
`SUPABASE_SERVICE_ROLE_KEY` phải đặt ở mục biến bí mật của nền tảng hosting, không bao
giờ ở dạng `NEXT_PUBLIC_`.

Sau khi deploy, thêm URL thật vào Supabase → Authentication → URL Configuration →
**Redirect URLs**, nếu không thì luồng đăng nhập sẽ quay về `localhost`.

---

## Gặp lỗi

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| "Hệ thống chưa được cấu hình" ở mọi trang | Thiếu biến môi trường, hoặc chưa khởi động lại `npm run dev` sau khi sửa `.env.local` |
| Đăng nhập báo "Không kết nối được máy chủ" | `NEXT_PUBLIC_SUPABASE_URL` sai, hoặc project Supabase đang tạm dừng |
| Đăng nhập được nhưng trang chủ trống | Tài khoản chưa được gán vai trò — chạy lại seed hoặc kiểm tra `user_roles` |
| Nộp file báo "Không lưu được file lên kho" | Bucket `imports` chưa có, hoặc tạo bằng tay nên thiếu policy — chạy lại `supabase db push`, xem thêm bước 3 |
| `supabase link` báo "failed to load config" | Đang đứng sai thư mục — chạy ở gốc repo, nơi có `supabase/config.toml` |
| Nộp file xong không thấy ca nào khớp | Khung giờ ca lệch với thời gian live thật; xem `/operations` để xác nhận ownership |
