import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Làm mới phiên đăng nhập trên mỗi request, và chặn người chưa đăng nhập ngay ở
 * cửa thay vì để từng trang tự kiểm tra rồi hiện màn hình trống.
 *
 * Đây không phải chốt bảo mật — RLS mới là chốt. Đây chỉ là để người dùng không
 * gặp một trang rỗng không biết làm gì.
 */
const PUBLIC_PREFIXES = ['/login', '/demo', '/_next', '/favicon.ico'];

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Chưa cấu hình Supabase thì để trang tự hiện thông báo, không đá vào /login
  // (trang đăng nhập cũng sẽ không hoạt động).
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  if (!data.user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    // Đăng nhập xong quay lại đúng trang đang muốn vào.
    login.searchParams.set('next', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
