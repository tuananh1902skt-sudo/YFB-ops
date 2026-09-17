'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Client chạy trong trình duyệt, chỉ dùng cho đăng nhập/đăng xuất. Mọi thao tác
 * đọc ghi dữ liệu vẫn ở phía server, nơi RLS là chốt chặn thật.
 *
 * Đọc từng biến một chứ không parse cả `process.env`: Next chỉ thay thế được
 * `process.env.NEXT_PUBLIC_X` khi nó xuất hiện nguyên vẹn trong mã nguồn.
 */
export function createClientSideClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Hệ thống chưa được cấu hình kết nối Supabase.');
  return createBrowserClient(url, anonKey);
}
