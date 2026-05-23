import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = ['/', '/login', '/forgot-password', '/unauthorized'];

const roleRoutes: Record<string, string[]> = {
  '/admin': ['super_admin', 'admin'],
  '/employee': ['super_admin', 'admin', 'employee'],
  '/db-admin': ['super_admin', 'db_admin'],
};

function getAuth(request: NextRequest) {
  const raw = request.cookies.get('crm-auth')?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      state?: { user?: { roles?: string[]; panel?: string }; isAuthenticated?: boolean };
    };
  } catch {
    return null;
  }
}

function dashboardForPanel(panel?: string): string {
  switch (panel) {
    case 'db_admin':
      return '/db-admin/dashboard';
    case 'employee':
      return '/employee/dashboard';
    default:
      return '/admin';
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const auth = getAuth(request);
  const isLoggedIn = auth?.state?.isAuthenticated === true;
  const user = auth?.state?.user;

  if (publicRoutes.includes(pathname) || pathname === '/') {
    if (isLoggedIn && (pathname === '/' || pathname === '/login')) {
      const panel = user?.panel as string | undefined;
      const roles = user?.roles ?? [];
      let dest = dashboardForPanel(panel);
      if (!panel) {
        if (roles.includes('db_admin')) dest = '/db-admin/dashboard';
        else if (roles.includes('employee') && !roles.includes('admin')) dest = '/employee/dashboard';
      }
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  for (const [prefix, roles] of Object.entries(roleRoutes)) {
    if (pathname.startsWith(prefix)) {
      const userRoles = user?.roles ?? [];
      const hasAccess = roles.some((r) => userRoles.includes(r));
      if (!hasAccess) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
