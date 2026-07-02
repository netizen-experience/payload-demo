import type { Metadata } from 'next'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import configPromise from '@payload-config'
import { getPayload, type TypedLocale } from 'payload'
import { draftMode } from 'next/headers'
import React, { cache } from 'react'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { RenderHero } from '@/heros/RenderHero'
import { generateMeta } from '@/utilities/generateMeta'
import { LivePreviewListener } from '@/components/LivePreviewListener'

// Dynamic, not static: this page fetches from Postgres at render time. Static generation
// would require DB access during `next build`, which fails when the DB is VPC-private
// (as on Aurora/Lambda) and unreachable from the machine running the build.
export const dynamic = 'force-dynamic'

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

  const { hero, layout } = page

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
    locale: locale as TypedLocale,
    limit: 1,
    pagination: false,
    overrideAccess: draft,
    where: {
      slug: { equals: slug },
    },
  })

  return result.docs?.[0] || null
})
