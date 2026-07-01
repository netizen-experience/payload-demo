'use client'
import { useHeaderTheme } from '@/providers/HeaderTheme'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import type { Header } from '@/payload-types'

import { Logo } from '@/components/Logo/Logo'
import { HeaderNav } from './Nav'

interface HeaderClientProps {
  data: Header
}

export const HeaderClient: React.FC<HeaderClientProps> = ({ data }) => {
  const [theme, setTheme] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const { headerTheme, setHeaderTheme } = useHeaderTheme()
  const [prevHeaderTheme, setPrevHeaderTheme] = useState(headerTheme)
  const pathname = usePathname()

  // Detect current locale from pathname
  const currentLocale = pathname.startsWith('/zh') ? 'zh' : 'en'
  const otherLocale = currentLocale === 'en' ? 'zh' : 'en'
  const otherLocaleLabel = currentLocale === 'en' ? '中文' : 'EN'

  // Build the alternate locale URL
  const getAlternateLocaleUrl = () => {
    if (currentLocale === 'en') {
      // Switch to /zh/...
      if (pathname === '/en' || pathname === '/') return '/zh'
      return pathname.replace(/^\/en/, '/zh')
    } else {
      // Switch to /en/...
      if (pathname === '/zh') return '/en'
      return pathname.replace(/^\/zh/, '/en')
    }
  }

  useEffect(() => {
    setHeaderTheme(null)
  }, [pathname])

  if (headerTheme !== prevHeaderTheme) {
    setPrevHeaderTheme(headerTheme)
    if (headerTheme) setTheme(headerTheme)
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-shadow duration-300 ${
        scrolled ? 'shadow-md' : ''
      }`}
      style={{ backgroundColor: 'white', borderBottom: '1px solid var(--brand-red, #C41E3A)' }}
      {...(theme ? { 'data-theme': theme } : {})}
    >
      {/* Top bar */}
      <div
        className="hidden md:block text-xs py-1.5"
        style={{ backgroundColor: 'var(--brand-red, #C41E3A)', color: 'white' }}
      >
        <div className="container flex justify-end items-center gap-6">
          <span>📍 G/F, 88 Stanley Street, Central, Hong Kong</span>
          <span>📞 +852 2345 6789</span>
          <Link
            href={getAlternateLocaleUrl()}
            className="font-medium border-l border-white/30 pl-6 hover:opacity-80 transition-opacity"
          >
            {otherLocaleLabel}
          </Link>
        </div>
      </div>

      {/* Main header */}
      <div className="container py-4 flex items-center justify-between">
        <Link href={`/${currentLocale}`}>
          <Logo />
        </Link>
        <HeaderNav data={data} locale={currentLocale} />
      </div>
    </header>
  )
}
