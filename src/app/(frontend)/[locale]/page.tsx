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

type Args = {
  params: Promise<{ locale: string }>
}

export default async function LocalePage({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { locale } = await paramsPromise

  const page = await queryPageBySlug({ slug: 'home', locale })

  if (!page) {
    return <PayloadRedirects url="/" />
  }

  const { hero, layout } = page as any

  return (
    <article>
      {draft && <LivePreviewListener />}
      <PayloadRedirects disableNotFound url="/" />
      <RenderHero {...hero} />
      <RenderBlocks blocks={layout} locale={locale} />
    </article>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { locale } = await paramsPromise
  const page = await queryPageBySlug({ slug: 'home', locale })
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
