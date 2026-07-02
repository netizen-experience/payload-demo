import type { Metadata } from 'next'
import configPromise from '@payload-config'
import { getPayload, type TypedLocale } from 'payload'
import { notFound } from 'next/navigation'
import React, { cache } from 'react'
import Link from 'next/link'
import { Media } from '@/components/Media'
import { ArrowLeftIcon } from 'lucide-react'
import type { Category, Media as MediaType } from '@/payload-types'

const allergenLabels: Record<string, { en: string; zh: string }> = {
  gluten: { en: 'Gluten', zh: '麩質' },
  shellfish: { en: 'Shellfish', zh: '甲殼類' },
  fish: { en: 'Fish', zh: '魚' },
  soy: { en: 'Soy', zh: '大豆' },
  sesame: { en: 'Sesame', zh: '芝麻' },
  egg: { en: 'Egg', zh: '蛋' },
  dairy: { en: 'Dairy', zh: '乳製品' },
  nuts: { en: 'Nuts', zh: '堅果' },
}

// Dynamic, not static: this page fetches from Postgres at render time. Static generation
// would require DB access during `next build`, which fails when the DB is VPC-private
// (as on Aurora/Lambda) and unreachable from the machine running the build.
export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{ locale: string; slug: string }>
}

export default async function MenuItemPage({ params: paramsPromise }: Args) {
  const { locale, slug } = await paramsPromise
  const item = await queryMenuItemBySlug({ slug, locale })

  if (!item) {
    notFound()
  }

  const category =
    typeof item.category === 'object' && item.category !== null
      ? (item.category as Category)
      : null

  const allergens = (item.allergens || []) as string[]

  return (
    <div className="min-h-screen bg-white">
      <div className="container py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link href={`/${locale}`} className="hover:text-foreground transition-colors">
            {locale === 'zh' ? '首頁' : 'Home'}
          </Link>
          <span>/</span>
          <Link href={`/${locale}/menu`} className="hover:text-foreground transition-colors">
            {locale === 'zh' ? '菜單' : 'Menu'}
          </Link>
          <span>/</span>
          <span className="text-foreground">{item.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Image */}
          <div className="relative aspect-square rounded overflow-hidden bg-gray-100">
            {item.image && typeof item.image === 'object' ? (
              <Media fill imgClassName="object-cover" resource={item.image as MediaType} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                <span className="text-8xl opacity-20">🍣</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="py-4">
            {category && (
              <Link
                href={`/${locale}/menu${category?.slug ? `#${category.slug}` : ''}`}
                className="inline-flex items-center gap-1 text-xs tracking-widest uppercase font-medium mb-3 hover:opacity-80 transition-opacity"
                style={{ color: 'var(--brand-gold, #C9A84C)' }}
              >
                <ArrowLeftIcon className="w-3 h-3" />
                {category.title}
              </Link>
            )}

            <h1 className="text-3xl md:text-4xl font-light tracking-wide mb-2">{item.title}</h1>

            <div className="flex items-center gap-4 mb-6">
              <p
                className="text-2xl font-semibold"
                style={{ color: 'var(--brand-red, #C41E3A)' }}
              >
                HK${item.price}
              </p>
              {item.featured && (
                <span
                  className="text-xs px-3 py-1 rounded font-medium"
                  style={{ backgroundColor: '#FFF8E7', color: 'var(--brand-gold, #C9A84C)' }}
                >
                  {locale === 'zh' ? '主廚推薦' : "Chef's Pick"}
                </span>
              )}
              {!item.available && (
                <span className="text-xs px-3 py-1 rounded bg-gray-100 text-muted-foreground">
                  {locale === 'zh' ? '暫時缺貨' : 'Unavailable'}
                </span>
              )}
            </div>

            <div className="w-12 h-0.5 mb-6" style={{ backgroundColor: 'var(--brand-red, #C41E3A)' }} />

            {item.description && (
              <p className="text-base text-muted-foreground leading-relaxed mb-8">
                {item.description}
              </p>
            )}

            {/* Allergens */}
            {allergens.length > 0 && (
              <div className="mt-6 p-4 bg-gray-50 rounded">
                <h3 className="text-xs font-semibold tracking-widest uppercase mb-3 text-muted-foreground">
                  {locale === 'zh' ? '過敏原' : 'Allergens'}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {allergens.map((allergen) => (
                    <span
                      key={allergen}
                      className="text-xs px-2 py-1 bg-white border border-border rounded"
                    >
                      {allergenLabels[allergen]?.[locale as 'en' | 'zh'] || allergen}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8">
              <Link
                href={`/${locale}/menu`}
                className="inline-flex items-center gap-2 text-sm font-medium tracking-wide hover:opacity-80 transition-opacity"
                style={{ color: 'var(--brand-red, #C41E3A)' }}
              >
                <ArrowLeftIcon className="w-4 h-4" />
                {locale === 'zh' ? '返回菜單' : 'Back to Menu'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { locale, slug } = await paramsPromise
  const item = await queryMenuItemBySlug({ slug, locale })

  if (!item) return {}

  return {
    title: `${item.title} | Matsu-Sushi 松壽司`,
    description: item.description || '',
  }
}

const queryMenuItemBySlug = cache(async ({ slug, locale }: { slug: string; locale: string }) => {
  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'menu-items',
    locale: locale as TypedLocale,
    limit: 1,
    pagination: false,
    overrideAccess: false,
    draft: false,
    depth: 2,
    where: {
      slug: { equals: slug },
    },
  })

  return result.docs?.[0] || null
})
