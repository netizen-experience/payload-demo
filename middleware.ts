import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const locales = ['en', 'zh']
const defaultLocale = 'en'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Skip Payload admin, API, static files
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next()
  }

  // Check if path already has a locale
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  )

  if (pathnameHasLocale) return NextResponse.next()

  // Get locale from cookie, else default
  const localeCookie = request.cookies.get('payload-locale')?.value
  const locale = locales.includes(localeCookie || '') ? localeCookie! : defaultLocale

  const newUrl = new URL(`/${locale}${pathname === '/' ? '' : pathname}`, request.url)
  const response = NextResponse.redirect(newUrl)

  // Set locale cookie
  response.cookies.set('payload-locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })

  return response
}

export const config = {
  matcher: ['/((?!_next|api|admin|favicon|assets).*)'],
}
