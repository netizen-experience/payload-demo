import { BeforeSync, DocToSync } from '@payloadcms/plugin-search/types'

export const beforeSyncWithSearch: BeforeSync = async ({ req, originalDoc, searchDoc }) => {
  const {
    doc: { relationTo: collection },
  } = searchDoc

  const { slug, id, title, meta } = originalDoc

  const modifiedDoc: DocToSync = {
    ...searchDoc,
    slug,
    meta: {
      ...meta,
      title: meta?.title || title,
      image: meta?.image?.id || meta?.image,
      description: meta?.description,
    },
    categories: [],
  }

  // Posts: populate array of categories
  if (collection === 'posts') {
    const { categories } = originalDoc
    if (categories && Array.isArray(categories) && categories.length > 0) {
      const populated: { id: string | number; title: string }[] = []
      for (const category of categories) {
        if (!category) continue
        if (typeof category === 'object') {
          populated.push(category)
          continue
        }
        const doc = await req.payload.findByID({
          collection: 'categories',
          id: category,
          disableErrors: true,
          depth: 0,
          select: { title: true },
          req,
        })
        if (doc !== null) {
          populated.push(doc)
        } else {
          console.error(
            `Failed. Category not found when syncing collection '${collection}' with id: '${id}' to search.`,
          )
        }
      }
      modifiedDoc.categories = populated.map((each) => ({
        relationTo: 'categories',
        categoryID: String(each.id),
        title: each.title,
      }))
    }
  }

  // Menu items: populate single category relationship
  if (collection === 'menu-items') {
    const { category, price } = originalDoc
    if (category) {
      const catDoc =
        typeof category === 'object'
          ? category
          : await req.payload.findByID({
              collection: 'categories',
              id: category,
              disableErrors: true,
              depth: 0,
              select: { title: true },
              req,
            })
      if (catDoc) {
        modifiedDoc.categories = [
          {
            relationTo: 'categories',
            categoryID: String(catDoc.id),
            title: catDoc.title,
          },
        ]
      }
    }
    // Store price in meta.description if no SEO description set
    if (!modifiedDoc.meta?.description && price != null) {
      modifiedDoc.meta = { ...modifiedDoc.meta, description: `HK$${price}` }
    }
  }

  return modifiedDoc
}
