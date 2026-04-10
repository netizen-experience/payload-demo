'use client'

import React from 'react'

import type { Header as HeaderType } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import Link from 'next/link'
import { SearchIcon, MenuIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

export const HeaderNav: React.FC<{ data: HeaderType; locale?: string }> = ({
  data,
  locale = 'en',
}) => {
  const navItems = data?.navItems || []
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex gap-8 items-center">
        {navItems.map(({ link }, i) => {
          return (
            <CMSLink
              key={i}
              {...link}
              appearance="link"
              className="text-sm font-medium tracking-wide hover:text-primary transition-colors relative group"
            />
          )
        })}
        <Link
          href={`/${locale}/search`}
          className="ml-2"
          aria-label="Search"
        >
          <SearchIcon
            className="w-4 h-4 hover:text-primary transition-colors"
            style={{ color: 'var(--brand-dark, #1A1A1A)' }}
          />
        </Link>
      </nav>

      {/* Mobile hamburger */}
      <button
        className="md:hidden p-2"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? (
          <XIcon className="w-5 h-5" />
        ) : (
          <MenuIcon className="w-5 h-5" />
        )}
      </button>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="md:hidden absolute top-full left-0 right-0 bg-white border-t shadow-lg z-50"
          style={{ borderTopColor: 'var(--brand-red, #C41E3A)' }}
        >
          <div className="container py-4 flex flex-col gap-4">
            {navItems.map(({ link }, i) => {
              return (
                <div key={i} onClick={() => setMobileOpen(false)}>
                  <CMSLink
                    {...link}
                    appearance="link"
                    className="text-base font-medium py-2 border-b border-border"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
