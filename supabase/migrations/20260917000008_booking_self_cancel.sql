-- Người đăng ký rút tên khi chưa được duyệt.
--
-- Trước đây chỉ Operation mới update được shift_bookings, nghĩa là host/trợ live
-- đăng ký nhầm ca phải nhờ người khác gỡ. Policy này cho họ tự huỷ, nhưng chỉ
-- khi đăng ký còn ở trạng thái chờ và chỉ được chuyển sang CANCELLED — sau khi
-- đã duyệt thì ca đã xếp người quanh họ, đổi người là việc của Operation.
create policy shift_bookings_cancel_own on shift_bookings for update to authenticated
  using (user_id = auth.uid() and status in ('REGISTERED', 'PENDING_APPROVAL'))
  with check (user_id = auth.uid() and status = 'CANCELLED');
