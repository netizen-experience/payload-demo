import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { slugField } from 'payload'
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { revalidatePath } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

const revalidateMenuItem: CollectionAfterChangeHook = ({
  doc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    payload.logger.info(`Revalidating menu item: ${doc.slug}`)
    try {
      revalidatePath(`/en/menu/${doc.slug}`)
      revalidatePath(`/zh/menu/${doc.slug}`)
      revalidatePath('/en/menu')
      revalidatePath('/zh/menu')
    } catch (_err) {
      // revalidatePath only works within Next.js server context
    }
  }
  return doc
}

const revalidateDelete: CollectionAfterDeleteHook = ({ req: { context } }) => {
  if (!context.disableRevalidate) {
    try {
      revalidatePath('/en/menu')
      revalidatePath('/zh/menu')
    } catch (_err) {
      // revalidatePath only works within Next.js server context
    }
  }
}

export const MenuItems: CollectionConfig = {
  slug: 'menu-items',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: {
    title: true,
    slug: true,
    image: true,
    price: true,
    category: true,
    featured: true,
  },
  admin: {
    defaultColumns: ['title', 'category', 'price', 'featured', 'updatedAt'],
    useAsTitle: 'title',
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'menu-items',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'menu-items',
        req,
      }),
    description: 'Individual sushi and food items on the menu',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: 'Item name (localized)',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
      admin: {
        description: 'Short description of the item (localized)',
        rows: 3,
      },
    },
    {
      name: 'price',
      type: 'number',
      required: true,
      min: 0,
      admin: {
        description: 'Price in HKD',
        position: 'sidebar',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Main dish photo',
      },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Show on homepage featured section',
        position: 'sidebar',
      },
    },
    {
      name: 'available',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Currently available to order',
        position: 'sidebar',
      },
    },
    {
      name: 'allergens',
      type: 'select',
      hasMany: true,
      localized: false,
      options: [
        { label: 'Gluten', value: 'gluten' },
        { label: 'Shellfish', value: 'shellfish' },
        { label: 'Fish', value: 'fish' },
        { label: 'Soy', value: 'soy' },
        { label: 'Sesame', value: 'sesame' },
        { label: 'Egg', value: 'egg' },
        { label: 'Dairy', value: 'dairy' },
        { label: 'Nuts', value: 'nuts' },
      ],
      admin: {
        description: 'Allergen information',
        position: 'sidebar',
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({ hasGenerateFn: true }),
            MetaImageField({ relationTo: 'media' }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar' },
    },
    slugField(),
  ],
  hooks: {
    afterChange: [revalidateMenuItem],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      autosave: { interval: 100 },
    },
    maxPerDoc: 50,
  },
}
