import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAMES } from '@/lib/cookie-config';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/api/auth',
  '/api/health',
];

// Routes that should redirect to dashboard if already authenticated
const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

function hasSessionCookie(request: NextRequest): boolean {
  const accessToken = request.cookies.get(COOKIE_NAMES.ACCESS_TOKEN)?.value;
  return !!accessToken;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = hasSessionCookie(request);

  // Redirect authenticated users away from auth pages
  if (isAuthRoute(pathname) && hasSession) {
    const dashboardUrl = new URL('/dashboard', request.url);
    // Preserve return URL if present
    const returnUrl = request.nextUrl.searchParams.get('returnUrl');
    if (returnUrl) {
      dashboardUrl.searchParams.set('returnUrl', returnUrl);
    }
    return NextResponse.redirect(dashboardUrl);
  }

  // Redirect unauthenticated users from protected routes to login
  if (!isPublicRoute(pathname) && !pathname.startsWith('/api/') && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)',
  ],
};
