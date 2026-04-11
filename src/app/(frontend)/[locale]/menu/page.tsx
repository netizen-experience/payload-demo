import type { Metadata } from 'next'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'
import Link from 'next/link'
import { Media } from '@/components/Media'

const translations = {
  en: {
    title: 'Our Menu',
    subtitle: 'Fresh. Seasonal. Authentic.',
    viewItem: 'View Item',
    allItems: 'All Items',
    available: 'Available',
    notAvailable: 'Currently Unavailable',
  },
  zh: {
    title: '菜單',
    subtitle: '新鮮。當造。正宗。',
    viewItem: '查看詳情',
    allItems: '所有項目',
    available: '供應中',
    notAvailable: '暫時缺貨',
  },
}

type Args = {
  params: Promise<{ locale: string }>
}

export default async function MenuPage({ params: paramsPromise }: Args) {
  const { locale } = await paramsPromise
  const t = translations[locale as keyof typeof translations] || translations.en

  const payload = await getPayload({ config: configPromise })

  // Fetch all categories
  const categoriesResult = await payload.find({
    collection: 'categories',
    locale: locale as any,
    limit: 100,
    sort: 'displayOrder',
    overrideAccess: false,
  })

  // Fetch all available menu items
  const menuItemsResult = await payload.find({
    collection: 'menu-items',
    locale: locale as any,
    where: { available: { equals: true } },
    limit: 200,
    draft: false,
    overrideAccess: false,
    depth: 2,
  })

  const categories = categoriesResult.docs
  const allItems = menuItemsResult.docs

  // Group items by category
  const itemsByCategory: Record<string, typeof allItems> = {}
  for (const item of allItems) {
    const catId =
      typeof item.category === 'object' && item.category !== null
        ? (item.category as any).id
        : item.category
    if (!itemsByCategory[catId]) {
      itemsByCategory[catId] = []
    }
    itemsByCategory[catId].push(item)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Page header */}
      <div
        className="py-16 text-center text-white"
        style={{
          background: `linear-gradient(135deg, var(--brand-dark, #1A1A1A) 0%, #2d1a1a 100%)`,
        }}
      >
        <p
          className="text-xs tracking-[0.4em] uppercase mb-3 font-medium"
          style={{ color: 'var(--brand-gold, #C9A84C)' }}
        >
          {t.subtitle}
        </p>
        <h1 className="text-4xl md:text-5xl font-light tracking-wide">{t.title}</h1>
        <div
          className="mt-5 mx-auto w-16 h-0.5"
          style={{ backgroundColor: 'var(--brand-red, #C41E3A)' }}
        />
      </div>

      <div className="container py-12">
        {/* Category sections */}
        {categories.map((category: any) => {
          const items = itemsByCategory[category.id] || []
          if (!items.length) return null

          return (
            <section
              key={category.id}
              id={category.slug}
              className="mb-16 scroll-mt-20 md:scroll-mt-28"
            >
              <div className="flex items-center gap-4 mb-8">
                <div
                  className="w-1 h-8 rounded"
                  style={{ backgroundColor: 'var(--brand-red, #C41E3A)' }}
                />
                <h2 className="text-2xl font-light tracking-wide">{category.title}</h2>
                {category.description && (
                  <p className="text-sm text-muted-foreground hidden md:block">
                    {category.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {items.map((item: any) => (
                  <Link
                    key={item.id}
                    href={`/${locale}/menu/${item.slug}`}
                    className="group block bg-white border border-border rounded overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
                  >
                    <div className="relative aspect-4/3 bg-gray-100 overflow-hidden">
                      {item.image && typeof item.image === 'object' ? (
                        <Media
                          fill
                          imgClassName="object-cover group-hover:scale-105 transition-transform duration-500"
                          resource={item.image}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: '#F5F5F5' }}
                        >
                          <span className="text-5xl opacity-30">🍣</span>
                        </div>
                      )}
                      {item.featured && (
                        <div
                          className="absolute top-2 right-2 text-white text-xs px-2 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--brand-gold, #C9A84C)' }}
                        >
                          {locale === 'zh' ? '推薦' : "Chef's Pick"}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {item.description}
                        </p>
                      )}
                      <p
                        className="text-sm font-semibold"
                        style={{ color: 'var(--brand-red, #C41E3A)' }}
                      >
                        HK${item.price}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}

        {categories.length === 0 && (
          <div className="text-center py-24 text-muted-foreground">
            <p className="text-lg">{locale === 'zh' ? '菜單即將推出' : 'Menu coming soon'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { locale } = await paramsPromise
  return {
    title: locale === 'zh' ? '菜單 | 松壽司 Matsu-Sushi' : 'Menu | Matsu-Sushi 松壽司',
    description:
      locale === 'zh'
        ? '瀏覽松壽司的完整菜單，包括刺身、壽司卷、握壽司及更多選擇。'
        : 'Browse the full Matsu-Sushi menu featuring sashimi, maki rolls, nigiri and more.',
  }
}
