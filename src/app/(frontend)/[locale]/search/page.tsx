import type { Metadata } from 'next/types'
import configPromise from '@payload-config'
import { getPayload, type TypedLocale } from 'payload'
import React from 'react'
import Link from 'next/link'
import { Search } from '@/search/Component'
import { Media } from '@/components/Media'

const t = {
  en: {
    title: 'Search',
    noResults: 'No results found.',
    menuItem: "Menu Item",
    post: 'Article',
    searchMeta: 'Search | Matsu-Sushi 松壽司',
    placeholder: 'Search dishes, rolls, sashimi…',
  },
  zh: {
    title: '搜尋',
    noResults: '找不到結果。',
    menuItem: '菜單項目',
    post: '文章',
    searchMeta: '搜尋 | 松壽司 Matsu-Sushi',
    placeholder: '搜尋菜式、壽司卷、刺身…',
  },
}

type Args = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ params: paramsPromise, searchParams: searchParamsPromise }: Args) {
  const { locale } = await paramsPromise
  const { q: query } = await searchParamsPromise
  const labels = t[locale as keyof typeof t] || t.en

  const payload = await getPayload({ config: configPromise })

  const results = await payload.find({
    collection: 'search',
    depth: 1,
    locale: locale as TypedLocale,
    limit: 24,
    pagination: false,
    select: {
      title: true,
      slug: true,
      categories: true,
      meta: true,
      doc: true,
    },
    ...(query
      ? {
          where: {
            or: [
              { title: { like: query } },
              { 'meta.description': { like: query } },
              { 'meta.title': { like: query } },
              { slug: { like: query } },
            ],
          },
        }
      : {}),
  })

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div
        className="py-16 text-center text-white"
        style={{ background: 'linear-gradient(135deg, var(--brand-dark, #1A1A1A) 0%, #2d1a1a 100%)' }}
      >
        <h1 className="text-4xl font-light tracking-wide mb-8">{labels.title}</h1>
        <div className="max-w-xl mx-auto px-4">
          <Search basePath={`/${locale}/search`} placeholder={labels.placeholder} />
        </div>
      </div>

      <div className="container py-12">
        {results.docs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {results.docs.map((result) => {
              const isMenuItem = result.doc?.relationTo === 'menu-items'
              const href = isMenuItem
                ? `/${locale}/menu/${result.slug}`
                : `/posts/${result.slug}`
              const category = result.categories?.[0]?.title
              const price = isMenuItem && result.meta?.description?.startsWith('HK$')
                ? result.meta.description
                : null

              return (
                <Link
                  key={result.id}
                  href={href}
                  className="group block bg-white border border-border rounded overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
                >
                  <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
                    {result.meta?.image && typeof result.meta.image === 'object' ? (
                      <Media
                        fill
                        imgClassName="object-cover group-hover:scale-105 transition-transform duration-500"
                        resource={result.meta.image}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                        <span className="text-4xl opacity-20">{isMenuItem ? '🍣' : '📄'}</span>
                      </div>
                    )}
                    <div
                      className="absolute top-2 left-2 text-white text-xs px-2 py-0.5 rounded"
                      style={{ backgroundColor: isMenuItem ? 'var(--brand-red, #C41E3A)' : 'var(--brand-dark, #1A1A1A)' }}
                    >
                      {isMenuItem ? labels.menuItem : labels.post}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
                      {result.title}
                    </h3>
                    {category && (
                      <p className="text-xs text-muted-foreground mb-1">{category}</p>
                    )}
                    {price && (
                      <p className="text-sm font-semibold" style={{ color: 'var(--brand-red, #C41E3A)' }}>
                        {price}
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-24 text-muted-foreground">
            <p className="text-5xl mb-4 opacity-20">🔍</p>
            <p className="text-lg">{query ? labels.noResults : ''}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await paramsPromise
  const labels = t[locale as keyof typeof t] || t.en
  return { title: labels.searchMeta }
}
