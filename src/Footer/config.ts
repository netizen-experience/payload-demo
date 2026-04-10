import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { revalidateFooter } from './hooks/revalidateFooter'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'address',
      type: 'text',
      localized: true,
      defaultValue: 'G/F, 88 Stanley Street, Central, Hong Kong',
    },
    {
      name: 'phone',
      type: 'text',
      defaultValue: '+852 2345 6789',
    },
    {
      name: 'email',
      type: 'email',
      defaultValue: 'info@matsu-sushi.hk',
    },
    {
      name: 'hours',
      type: 'text',
      localized: true,
      defaultValue: 'Mon–Sun: 12:00 – 22:30',
    },
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 8,
      admin: {
        initCollapsed: true,
        components: {
          RowLabel: '@/Footer/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateFooter],
  },
}
