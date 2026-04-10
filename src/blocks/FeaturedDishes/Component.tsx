import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { Media } from '@/components/Media'
import type { FeaturedDishesBlock as FeaturedDishesBlockProps } from '@/payload-types'

type Props = FeaturedDishesBlockProps & {
  locale?: string
}

export const FeaturedDishesBlock: React.FC<Props> = async ({
  heading,
  subheading,
  items,
  showAll,
  viewAllLink,
  locale = 'en',
}) => {
  let dishes: any[] = []

  if (showAll) {
    const payload = await getPayload({ config: configPromise })
    const result = await payload.find({
      collection: 'menu-items',
      locale: locale as any,
      where: { featured: { equals: true }, available: { equals: true } },
      limit: 6,
      draft: false,
    })
    dishes = result.docs
  } else if (items && Array.isArray(items)) {
    dishes = items.filter((item) => typeof item === 'object' && item !== null)
  }

  if (!dishes.length) return null

  return (
    <section className="py-16 bg-white">
      <div className="container">
        <div className="text-center mb-10">
          {heading && (
            <h2 className="text-3xl font-light tracking-wide mb-2" style={{ color: 'var(--brand-dark, #1A1A1A)' }}>
              {heading}
            </h2>
          )}
          {subheading && (
            <p className="text-sm tracking-widest uppercase" style={{ color: 'var(--brand-gold, #C9A84C)' }}>
              {subheading}
            </p>
          )}
          <div className="mt-4 mx-auto w-12 h-0.5" style={{ backgroundColor: 'var(--brand-red, #C41E3A)' }} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {dishes.map((item: any) => (
            <Link
              key={item.id || item}
              href={`/${locale}/menu/${item.slug || ''}`}
              className="group block bg-white border border-border rounded overflow-hidden hover:shadow-lg transition-shadow duration-300"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                {item.image && typeof item.image === 'object' ? (
                  <Media
                    fill
                    imgClassName="object-cover group-hover:scale-105 transition-transform duration-500"
                    resource={item.image}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                    <span className="text-4xl">🍣</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-medium text-base mb-1 group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{item.description}</p>
                )}
                <p className="text-sm font-semibold" style={{ color: 'var(--brand-red, #C41E3A)' }}>
                  HK${item.price}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {viewAllLink && (
          <div className="text-center mt-10">
            <Link
              href={viewAllLink}
              className="inline-flex items-center gap-2 px-8 py-3 border text-sm font-medium tracking-widest uppercase hover:bg-primary hover:text-white hover:border-primary transition-all duration-200"
              style={{ borderColor: 'var(--brand-red, #C41E3A)', color: 'var(--brand-red, #C41E3A)' }}
            >
              {locale === 'zh' ? '查看全部菜單' : 'View Full Menu'}
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
