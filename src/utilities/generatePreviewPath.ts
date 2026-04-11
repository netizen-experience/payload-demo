import { PayloadRequest, CollectionSlug } from 'payload'

type Props = {
  collection: CollectionSlug
  slug: string
  req: PayloadRequest
}

export const generatePreviewPath = ({ collection, slug, req }: Props) => {
  // Allow empty strings, e.g. for the homepage
  if (slug === undefined || slug === null) {
    return null
  }

  const locale = (req.locale as string) || 'en'

  const collectionPrefixMap: Partial<Record<CollectionSlug, string>> = {
    posts: '/posts',
    pages: `/${locale}`,
    'menu-items': `/${locale}/menu`,
  }

  const prefix = collectionPrefixMap[collection] ?? `/${locale}`

  // Encode to support slugs with special characters
  const encodedSlug = encodeURIComponent(slug)

  const encodedParams = new URLSearchParams({
    slug: encodedSlug,
    collection,
    path: `${prefix}/${encodedSlug}`,
    previewSecret: process.env.PREVIEW_SECRET || '',
  })

  const url = `/next/preview?${encodedParams.toString()}`

  return url
}
