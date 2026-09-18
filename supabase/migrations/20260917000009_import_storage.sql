-- Kho file report đã upload, và quyền truy cập nó.
--
-- Đường dẫn file là `<platform_account_id>/<sha256>.xlsx` (xem `storagePathFor`),
-- nên brand của một file suy ra được từ thư mục đầu tiên. Không có bảng nào khác
-- tham gia: quyền đọc file phải tự đứng vững kể cả khi bản ghi import chưa kịp tạo.

insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

/**
 * Brand sở hữu một file trong bucket `imports`, hoặc null nếu đường dẫn không
 * theo quy ước. Trả null thay vì báo lỗi: một object đặt sai tên không được phép
 * làm hỏng câu query liệt kê của người khác.
 */
create or replace function import_object_brand(object_name text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  account uuid;
begin
  begin
    account := split_part(object_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return account_brand(account);
end;
$$;

/*
 * Policy trên `storage.objects` — bảng này do Supabase sở hữu, không phải schema
 * của repo. Tạo qua EXECUTE để chặn được hai tình huống thật:
 *
 *   - chạy lại migration: policy đã có thì bỏ qua, không làm đổ cả lần push;
 *   - role chạy migration không đủ quyền trên bảng của Supabase: báo bằng câu
 *     người đọc hiểu được, kèm cách xử lý, thay vì một lỗi Postgres trần.
 *
 * `is not null` là bắt buộc chứ không phải phòng xa: has_brand_access trả true
 * cho vai trò toàn hệ thống với mọi tham số, kể cả null, nên một đường dẫn rác
 * sẽ lọt. scripts/verify-rls.sql có assertion chứng minh đúng điều đó.
 *
 * Cố ý không có policy delete: report đã nộp là bằng chứng (CLAUDE.md §2).
 */
do $$
declare
  owns_check text := '(
    bucket_id = ''imports''
    and import_object_brand(name) is not null
    and has_brand_access(import_object_brand(name))
  )';
  statements text[] := array[
    format('create policy imports_read on storage.objects for select to authenticated using %s', owns_check),
    format('create policy imports_insert on storage.objects for insert to authenticated with check %s', owns_check),
    -- Upload cùng một file hai lần ghi đè lên chính nó (tên file là hash của nội
    -- dung), nên cần quyền update.
    format('create policy imports_update on storage.objects for update to authenticated using %s with check %s', owns_check, owns_check)
  ];
  statement text;
begin
  foreach statement in array statements loop
    begin
      execute statement;
    exception
      when duplicate_object then
        null;
      when insufficient_privilege then
        raise exception
          'Không tạo được policy cho bucket imports: role đang chạy migration không sở hữu storage.objects. '
          'Chạy lại bằng connection string của role postgres trong project, hoặc dán nội dung migration này '
          'vào SQL Editor trên dashboard Supabase. Không bỏ qua bước này — thiếu policy thì trợ live nộp file sẽ lỗi.';
    end;
  end loop;
end $$;
