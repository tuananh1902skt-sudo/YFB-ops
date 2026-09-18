-- Ngưỡng của Target Engine (docs/05 §7b).
--
-- Nằm ở đây thay vì trong code vì mỗi brand có lượng lịch sử khác nhau, và mức
-- "đủ dữ liệu để dám đề xuất" là quyết định kinh doanh chứ không phải hằng số
-- kỹ thuật (CLAUDE.md §12).

insert into system_settings (key, value, description) values
  ('target_min_samples', '6',
   'Số ca đã quy kết tối thiểu để hệ thống dám đề xuất target'),
  ('target_confidence_high_samples', '20',
   'Từ số ca này trở lên thì độ tin cậy của đề xuất là HIGH'),
  ('target_confidence_medium_samples', '10',
   'Từ số ca này trở lên thì độ tin cậy của đề xuất là MEDIUM'),
  ('target_recent_window_days', '30',
   'Cửa sổ "gần đây" dùng để đo hệ số xu hướng'),
  ('target_history_window_days', '90',
   'Toàn bộ lịch sử được xét khi dựng baseline'),
  ('target_min_factor_samples', '3',
   'Mẫu tối thiểu để một hệ số (campaign, host) được áp dụng thay vì bỏ qua')
on conflict (key) do nothing;
