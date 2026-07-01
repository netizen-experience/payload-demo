'use client'
import { useHeaderTheme } from '@/providers/HeaderTheme'
import React, { useEffect } from 'react'

import type { Page } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Media } from '@/components/Media'
import RichText from '@/components/RichText'

export const HighImpactHero: React.FC<Page['hero']> = ({ links, media, richText }) => {
  const { setHeaderTheme } = useHeaderTheme()

  useEffect(() => {
    setHeaderTheme('dark')
  })

  return (
    <div
      className="relative flex items-center justify-center text-white overflow-hidden"
      style={{ minHeight: '70vh' }}
      data-theme="dark"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
        }}
      />

      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        {media && typeof media === 'object' && (
          <Media fill imgClassName="object-cover" priority resource={media} />
        )}
      </div>

      {/* Content */}
      <div className="container relative z-20 py-24">
        <div className="max-w-xl">
          {/* Decorative line */}
          <div
            className="w-12 h-0.5 mb-6"
            style={{ backgroundColor: 'var(--brand-gold, #C9A84C)' }}
          />

          {richText && (
            <RichText
              className="mb-8 [&_h1]:text-4xl [&_h1]:md:text-5xl [&_h1]:lg:text-6xl [&_h1]:font-light [&_h1]:tracking-wide [&_h1]:mb-3 [&_p]:text-white/70 [&_p]:text-lg"
              data={richText}
              enableGutter={false}
            />
          )}

          {Array.isArray(links) && links.length > 0 && (
            <div className="flex flex-wrap gap-4">
              {links.map(({ link }, i) => {
                return (
                  <CMSLink
                    key={i}
                    {...link}
                    className={
                      i === 0
                        ? 'inline-flex items-center px-8 py-3 text-sm font-medium tracking-widest uppercase transition-all duration-200 bg-[#C41E3A] text-white border border-transparent hover:bg-[#a01830]'
                        : 'inline-flex items-center px-8 py-3 text-sm font-medium tracking-widest uppercase transition-all duration-200 bg-transparent text-white border border-white/50 hover:bg-white/10'
                    }
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
