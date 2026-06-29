import { NextRequest, NextResponse } from 'next/server';

// CSP needs a per-request nonce for script-src, which next.config.js's static
// headers() can't generate — so the whole CSP lives here instead. Next.js
// automatically applies this nonce to its own framework-injected <script>
// tags as long as it's present in the request's CSP header (see
// https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy).
export function middleware(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://*.supabase.co https://finnhub.io https://api.twelvedata.com https://query1.finance.yahoo.com https://open.er-api.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets — they don't need a per-request nonce.
    '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)',
  ],
};
