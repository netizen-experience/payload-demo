import { getCachedGlobal } from '@/utilities/getGlobals'
import Link from 'next/link'
import React from 'react'

import { CMSLink } from '@/components/Link'
import { Logo } from '@/components/Logo/Logo'

export async function Footer() {
  const footerData = await getCachedGlobal('footer', 1)()

  const navItems = footerData?.navItems || []

  return (
    <footer className="mt-auto text-white" style={{ backgroundColor: 'var(--brand-dark, #1A1A1A)' }}>
      {/* Main footer */}
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="md:col-span-2">
            <div className="mb-4">
              <div className="flex flex-col leading-none">
                <span
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: 'var(--brand-red, #C41E3A)' }}
                >
                  松壽司
                </span>
                <span className="text-xs tracking-[0.2em] uppercase font-medium text-white/80">
                  Matsu-Sushi
                </span>
              </div>
            </div>
            <p className="text-sm text-white/60 max-w-xs leading-relaxed">
              Authentic Japanese sushi crafted with the finest seasonal ingredients, served in the heart of Hong Kong.
            </p>
            <p className="text-sm text-white/60 max-w-xs leading-relaxed mt-1">
              精選時令食材，正宗日本壽司料理，坐落香港市中心。
            </p>
          </div>

          {/* Contact info */}
          <div>
            <h4
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: 'var(--brand-gold, #C9A84C)' }}
            >
              Contact
            </h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>📍 {(footerData as any)?.address || 'G/F, 88 Stanley Street, Central'}</li>
              <li>📞 {(footerData as any)?.phone || '+852 2345 6789'}</li>
              <li>✉️ {(footerData as any)?.email || 'info@matsu-sushi.hk'}</li>
            </ul>
          </div>

          {/* Hours + Links */}
          <div>
            <h4
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: 'var(--brand-gold, #C9A84C)' }}
            >
              Hours
            </h4>
            <p className="text-sm text-white/70 mb-6">
              {(footerData as any)?.hours || 'Mon–Sun: 12:00 – 22:30'}
            </p>

            <h4
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: 'var(--brand-gold, #C9A84C)' }}
            >
              Links
            </h4>
            <nav className="flex flex-col gap-2">
              {navItems.map(({ link }, i) => {
                return (
                  <CMSLink
                    className="text-sm text-white/70 hover:text-white transition-colors"
                    key={i}
                    {...link}
                  />
                )
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="container py-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} 松壽司 Matsu-Sushi. All rights reserved.
          </p>
          <p className="text-xs text-white/30">
            Powered by <span className="text-white/50">Payload CMS</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
