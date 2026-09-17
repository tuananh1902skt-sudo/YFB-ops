'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClientSideClient } from '@/lib/supabase/browser';

/**
 * Đăng nhập bằng email + mật khẩu. Tài khoản do Operation tạo qua script seed,
 * không có đăng ký tự do: ai được vào hệ thống là một quyết định vận hành.
 */
/**
 * Sai mật khẩu và không gọi được máy chủ là hai chuyện khác nhau. Gộp làm một sẽ
 * khiến người dùng đi tìm mật khẩu trong khi lỗi nằm ở kết nối.
 */
function messageFor(error: { status?: number; code?: string }): string {
  if (error.code === 'invalid_credentials' || error.status === 400) {
    // Không nói rõ email có tồn tại hay không — đó là thông tin không nên rò rỉ.
    return 'Email hoặc mật khẩu không đúng.';
  }
  if (error.code === 'email_not_confirmed') {
    return 'Tài khoản chưa xác nhận email. Nhờ Operation kích hoạt lại.';
  }
  if (!error.status) {
    return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  }
  return 'Không đăng nhập được. Báo Operation kèm thời điểm bạn thử.';
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClientSideClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(messageFor(signInError));
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không đăng nhập được.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 h-12 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-live"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Mật khẩu
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 h-12 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-live"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-blocking/30 bg-blocking-surface px-3 py-2 text-sm text-blocking">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </Button>
    </form>
  );
}
