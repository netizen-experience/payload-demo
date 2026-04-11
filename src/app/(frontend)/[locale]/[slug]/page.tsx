import type { Metadata } from 'next'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import React, { cache } from 'react'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { RenderHero } from '@/heros/RenderHero'
import { generateMeta } from '@/utilities/generateMeta'
import { LivePreviewListener } from '@/components/LivePreviewListener'

export async function generateStaticParams() {
  try {
    const payload = await getPayload({ config: configPromise })
    const pages = await payload.find({
      collection: 'pages',
      draft: false,
      limit: 1000,
      overrideAccess: false,
      pagination: false,
      select: { slug: true },
    })

    const locales = ['en', 'zh']
    const params: { locale: string; slug: string }[] = []

    for (const locale of locales) {
      for (const doc of pages.docs) {
        if (doc.slug && doc.slug !== 'home') {
          params.push({ locale, slug: doc.slug })
        }
      }
    }

    return params
  } catch {
    return []
  }
}

type Args = {
  params: Promise<{ locale: string; slug: string }>
}

export default async function LocaleSlugPage({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { locale, slug } = await paramsPromise
  const decodedSlug = decodeURIComponent(slug)
  const url = `/${locale}/${decodedSlug}`

  const page = await queryPageBySlug({ slug: decodedSlug, locale })

  if (!page) {
    return <PayloadRedirects url={url} />
  }

  const { hero, layout } = page as any

  return (
    <article className="pt-16 pb-24">
      <PayloadRedirects disableNotFound url={url} />
      {draft && <LivePreviewListener />}
      <RenderHero {...hero} />
      <RenderBlocks blocks={layout} locale={locale} />
    </article>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { locale, slug } = await paramsPromise
  const page = await queryPageBySlug({ slug: decodeURIComponent(slug), locale })
  return generateMeta({ doc: page })
}

const queryPageBySlug = cache(async ({ slug, locale }: { slug: string; locale: string }) => {
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'pages',
    draft,
    locale: locale as any,
    limit: 1,
    pagination: false,
    overrideAccess: draft,
    where: {
      slug: { equals: slug },
    },
  })

  return result.docs?.[0] || null
})
