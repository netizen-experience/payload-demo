import type { Block } from 'payload'

export const FeaturedDishes: Block = {
  slug: 'featuredDishes',
  interfaceName: 'FeaturedDishesBlock',
  labels: {
    singular: 'Featured Dishes',
    plural: 'Featured Dishes Sections',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      localized: true,
      defaultValue: 'Featured Dishes',
      admin: {
        description: 'Section heading (localized)',
      },
    },
    {
      name: 'subheading',
      type: 'text',
      localized: true,
      defaultValue: 'Crafted with the finest ingredients',
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: 'menu-items',
      hasMany: true,
      maxRows: 6,
      admin: {
        description: 'Select up to 6 featured menu items to display',
      },
    },
    {
      name: 'showAll',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'If checked, automatically shows all featured items instead of manual selection',
      },
    },
    {
      name: 'viewAllLink',
      type: 'text',
      defaultValue: '/menu',
      admin: {
        description: 'Link for "View All" button',
      },
    },
  ],
}
