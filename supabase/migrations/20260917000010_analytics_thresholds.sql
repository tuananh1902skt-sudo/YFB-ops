-- Ngưỡng dùng cho dashboard: mức nào thì một brand bị nêu là cần xem.
--
-- Nằm ở đây thay vì trong code vì đây là quyết định kinh doanh, không phải hằng
-- số kỹ thuật (CLAUDE.md §12). Code có giá trị dự phòng trùng với các giá trị
-- dưới đây, dùng khi thiếu key chứ không phải nguồn sự thật thứ hai.

insert into system_settings (key, value, description) values
  ('target_warning_percent', '90',
   'Đạt target dưới mức này (%) thì brand được nêu lên danh sách cần xem'),
  ('data_confidence_good_percent', '80',
   'Tỷ lệ ca có dữ liệu tin cậy từ mức này (%) trở lên thì coi là ổn'),
  ('data_confidence_warning_percent', '50',
   'Tỷ lệ ca có dữ liệu tin cậy dưới mức này (%) thì coi là nghiêm trọng')
on conflict (key) do nothing;
