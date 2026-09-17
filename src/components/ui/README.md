# Component cơ bản

`docs/06` chọn shadcn/ui (Radix). Môi trường build hiện tại **không ra được
`ui.shadcn.com`** nên không chạy được `npx shadcn init` — xem lại khi network
policy cho phép, lúc đó thay các file trong thư mục này bằng bản shadcn chuẩn.

Các component ở đây cố ý giữ đúng API của shadcn (`variant`, `size`,
`className`) để việc thay thế sau này không phải sửa nơi gọi.

Cần hành vi phức tạp (dialog, popover, select) thì cài thẳng primitive Radix từ
npm — npm registry vẫn truy cập được — chứ không tự viết.
