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

-- `is not null` là bắt buộc: has_brand_access trả true cho vai trò toàn hệ thống
-- với bất kỳ tham số nào, kể cả null, nên một đường dẫn rác sẽ lọt.
create policy imports_read on storage.objects for select to authenticated
  using (
    bucket_id = 'imports'
    and import_object_brand(name) is not null
    and has_brand_access(import_object_brand(name))
  );

create policy imports_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'imports'
    and import_object_brand(name) is not null
    and has_brand_access(import_object_brand(name))
  );

-- Upload cùng một file hai lần ghi đè lên chính nó (tên file là hash của nội dung),
-- nên cần quyền update. Nội dung không đổi được vì tên đã là hash.
create policy imports_update on storage.objects for update to authenticated
  using (
    bucket_id = 'imports'
    and import_object_brand(name) is not null
    and has_brand_access(import_object_brand(name))
  )
  with check (
    bucket_id = 'imports'
    and import_object_brand(name) is not null
    and has_brand_access(import_object_brand(name))
  );

-- Cố ý không có policy delete: report đã upload là bằng chứng, xoá đi thì lịch sử
-- tách ca mất chỗ dựa (CLAUDE.md §2).
