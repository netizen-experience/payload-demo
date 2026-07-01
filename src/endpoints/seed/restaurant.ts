import type { Payload, PayloadRequest } from 'payload'

// Inline SVG placeholder image as Buffer
function createSvgPlaceholder(text: string, bgColor = '#F5F5F5', textColor = '#999'): Buffer {
  const svg = `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="600" fill="${bgColor}"/>
    <text x="400" y="280" font-family="Arial, sans-serif" font-size="48" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">🍣</text>
    <text x="400" y="340" font-family="Arial, sans-serif" font-size="18" fill="${textColor}" text-anchor="middle">${text}</text>
  </svg>`
  return Buffer.from(svg)
}

export const seedRestaurant = async ({
  payload,
  req,
}: {
  payload: Payload
  req: PayloadRequest
}): Promise<void> => {
  payload.logger.info('Seeding Matsu-Sushi restaurant data...')

  // Clear existing data (docs + versions for versioned collections)
  const collections = ['menu-items', 'categories', 'pages', 'media'] as const
  for (const col of collections) {
    await payload.db.deleteMany({ collection: col, req, where: {} })
  }
  // Delete versions separately — deleteMany only clears the main table
  const versionedCollections = ['menu-items', 'pages'] as const
  for (const col of versionedCollections) {
    await payload.db.deleteVersions({ collection: col, req, where: {} })
  }

  await payload.updateGlobal({
    slug: 'header',
    data: { navItems: [] },
    context: { disableRevalidate: true },
  })
  await payload.updateGlobal({
    slug: 'footer',
    data: {},
    context: { disableRevalidate: true },
  })

  payload.logger.info('— Seeding media placeholders...')

  const heroBuffer = {
    name: 'hero-sushi.svg',
    data: createSvgPlaceholder('Matsu-Sushi', '#1A1A1A', '#C41E3A'),
    mimetype: 'image/svg+xml',
    size: 500,
  }
  const nigiriBuffer = { name: 'nigiri.svg', data: createSvgPlaceholder('Nigiri'), mimetype: 'image/svg+xml', size: 300 }
  const makiBuffer = { name: 'maki.svg', data: createSvgPlaceholder('Maki Roll'), mimetype: 'image/svg+xml', size: 300 }
  const sashimiBuffer = { name: 'sashimi.svg', data: createSvgPlaceholder('Sashimi'), mimetype: 'image/svg+xml', size: 300 }
  const tempuraBuffer = { name: 'tempura.svg', data: createSvgPlaceholder('Tempura'), mimetype: 'image/svg+xml', size: 300 }
  const edamameBuffer = { name: 'edamame.svg', data: createSvgPlaceholder('Edamame'), mimetype: 'image/svg+xml', size: 300 }
  const drinkBuffer = { name: 'drink.svg', data: createSvgPlaceholder('Drinks'), mimetype: 'image/svg+xml', size: 300 }
  const heroImgBuffer = { name: 'hero-restaurant.svg', data: createSvgPlaceholder('松壽司 Restaurant', '#2d0a15', '#C9A84C'), mimetype: 'image/svg+xml', size: 400 }

  const [
    _heroMedia, nigiriMedia, makiMedia, sashimiMedia, _tempuraMedia, edamameMedia, drinkMedia, heroImgMedia
  ] = await Promise.all([
    payload.create({ collection: 'media', data: { alt: 'Matsu-Sushi hero' }, file: heroBuffer }),
    payload.create({ collection: 'media', data: { alt: 'Nigiri sushi' }, file: nigiriBuffer }),
    payload.create({ collection: 'media', data: { alt: 'Maki roll' }, file: makiBuffer }),
    payload.create({ collection: 'media', data: { alt: 'Sashimi' }, file: sashimiBuffer }),
    payload.create({ collection: 'media', data: { alt: 'Tempura' }, file: tempuraBuffer }),
    payload.create({ collection: 'media', data: { alt: 'Edamame' }, file: edamameBuffer }),
    payload.create({ collection: 'media', data: { alt: 'Drinks' }, file: drinkBuffer }),
    payload.create({ collection: 'media', data: { alt: 'Restaurant interior' }, file: heroImgBuffer }),
  ])

  payload.logger.info('— Seeding categories...')

  const [nigiriCat, makiCat, sashimiCat, appetizersCat, drinksCat] = await Promise.all([
    payload.create({
      collection: 'categories',
      data: {
        title: 'Nigiri',
        description: 'Hand-pressed sushi with premium fish',
        slug: 'nigiri',
        displayOrder: 1,
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'categories',
      data: { title: 'Maki Rolls', description: 'Handcrafted sushi rolls', slug: 'maki-rolls', displayOrder: 2 },
      locale: 'en',
    }),
    payload.create({
      collection: 'categories',
      data: { title: 'Sashimi', description: 'Premium sliced fresh fish', slug: 'sashimi', displayOrder: 3 },
      locale: 'en',
    }),
    payload.create({
      collection: 'categories',
      data: { title: 'Appetizers', description: 'Starters and small plates', slug: 'appetizers', displayOrder: 4 },
      locale: 'en',
    }),
    payload.create({
      collection: 'categories',
      data: { title: 'Drinks', description: 'Sake, beer, and soft drinks', slug: 'drinks', displayOrder: 5 },
      locale: 'en',
    }),
  ])

  // Update categories with Chinese translations
  await Promise.all([
    payload.update({ collection: 'categories', id: nigiriCat.id, data: { title: '握壽司', description: '精選魚鮮，手握壽司' }, locale: 'zh' }),
    payload.update({ collection: 'categories', id: makiCat.id, data: { title: '壽司卷', description: '精心製作壽司卷' }, locale: 'zh' }),
    payload.update({ collection: 'categories', id: sashimiCat.id, data: { title: '刺身', description: '精選新鮮刺身' }, locale: 'zh' }),
    payload.update({ collection: 'categories', id: appetizersCat.id, data: { title: '前菜', description: '開胃小食' }, locale: 'zh' }),
    payload.update({ collection: 'categories', id: drinksCat.id, data: { title: '飲品', description: '清酒、啤酒及軟飲料' }, locale: 'zh' }),
  ])

  payload.logger.info('— Seeding menu items...')

  // Nigiri items
  const [salmonNigiri, tunaHigiri, yellowtailNigiri, scallopsNigiri] = await Promise.all([
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Salmon Nigiri',
        description: 'Premium Atlantic salmon on hand-pressed vinegared rice, served as 2 pieces',
        price: 68,
        image: nigiriMedia.id,
        category: nigiriCat.id,
        featured: true,
        available: true,
        allergens: ['fish'],
        slug: 'salmon-nigiri',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Bluefin Tuna Nigiri',
        description: 'Wild-caught bluefin tuna (otoro) on seasoned rice, 2 pieces',
        price: 128,
        image: nigiriMedia.id,
        category: nigiriCat.id,
        featured: true,
        available: true,
        allergens: ['fish'],
        slug: 'bluefin-tuna-nigiri',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Yellowtail Nigiri',
        description: 'Silky Japanese yellowtail (hamachi) on pressed sushi rice, 2 pieces',
        price: 88,
        image: nigiriMedia.id,
        category: nigiriCat.id,
        featured: false,
        available: true,
        allergens: ['fish'],
        slug: 'yellowtail-nigiri',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Hokkaido Scallop Nigiri',
        description: 'Sweet Hokkaido scallop, lightly seared with yuzu salt, 2 pieces',
        price: 98,
        image: nigiriMedia.id,
        category: nigiriCat.id,
        featured: true,
        available: true,
        allergens: ['shellfish'],
        slug: 'hokkaido-scallop-nigiri',
        _status: 'published',
      },
      locale: 'en',
    }),
  ])

  // Maki items
  const [spicyTunaRoll, dragonRoll, vegetarianRoll] = await Promise.all([
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Spicy Tuna Roll',
        description: 'Fresh tuna, spicy mayo, cucumber and avocado, 8 pieces',
        price: 98,
        image: makiMedia.id,
        category: makiCat.id,
        featured: true,
        available: true,
        allergens: ['fish', 'soy', 'sesame'],
        slug: 'spicy-tuna-roll',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Dragon Roll',
        description: 'Prawn tempura inside, topped with avocado, tobiko and eel sauce, 8 pieces',
        price: 138,
        image: makiMedia.id,
        category: makiCat.id,
        featured: true,
        available: true,
        allergens: ['shellfish', 'gluten', 'fish', 'sesame'],
        slug: 'dragon-roll',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Vegetarian Roll',
        description: 'Avocado, cucumber, pickled daikon and sesame, 8 pieces',
        price: 78,
        image: makiMedia.id,
        category: makiCat.id,
        featured: false,
        available: true,
        allergens: ['sesame', 'soy'],
        slug: 'vegetarian-roll',
        _status: 'published',
      },
      locale: 'en',
    }),
  ])

  // Sashimi items
  const [salmonSashimi, tunaSashimi, sashimiPlatter] = await Promise.all([
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Salmon Sashimi',
        description: 'Five slices of premium Norwegian salmon, served with wasabi and pickled ginger',
        price: 88,
        image: sashimiMedia.id,
        category: sashimiCat.id,
        featured: false,
        available: true,
        allergens: ['fish'],
        slug: 'salmon-sashimi',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Tuna Sashimi',
        description: 'Five slices of lean bluefin tuna (akami), served with wasabi',
        price: 108,
        image: sashimiMedia.id,
        category: sashimiCat.id,
        featured: false,
        available: true,
        allergens: ['fish'],
        slug: 'tuna-sashimi',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: "Chef's Sashimi Platter",
        description: "Chef's selection of 12 seasonal sashimi pieces — the best of today's catch",
        price: 298,
        image: sashimiMedia.id,
        category: sashimiCat.id,
        featured: true,
        available: true,
        allergens: ['fish', 'shellfish'],
        slug: 'chefs-sashimi-platter',
        _status: 'published',
      },
      locale: 'en',
    }),
  ])

  // Appetizers
  const [edamame, miso, gyoza] = await Promise.all([
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Edamame',
        description: 'Steamed salted young soybeans',
        price: 38,
        image: edamameMedia.id,
        category: appetizersCat.id,
        featured: false,
        available: true,
        allergens: ['soy'],
        slug: 'edamame',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Miso Soup',
        description: 'Traditional white miso with tofu, wakame seaweed and spring onion',
        price: 28,
        image: edamameMedia.id,
        category: appetizersCat.id,
        featured: false,
        available: true,
        allergens: ['soy'],
        slug: 'miso-soup',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Pan-Fried Gyoza',
        description: 'Crispy pork and vegetable dumplings with ponzu dipping sauce, 6 pieces',
        price: 68,
        image: edamameMedia.id,
        category: appetizersCat.id,
        featured: false,
        available: true,
        allergens: ['gluten', 'soy'],
        slug: 'pan-fried-gyoza',
        _status: 'published',
      },
      locale: 'en',
    }),
  ])

  // Drinks
  const [sake, greenTea, japaneseBeer] = await Promise.all([
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Premium Sake (Junmai)',
        description: 'Pure rice sake, served warm or chilled — smooth and subtly sweet',
        price: 88,
        image: drinkMedia.id,
        category: drinksCat.id,
        featured: false,
        available: true,
        allergens: ['gluten'],
        slug: 'premium-sake',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Japanese Green Tea',
        description: 'Hot or iced ceremonial-grade matcha or sencha',
        price: 32,
        image: drinkMedia.id,
        category: drinksCat.id,
        featured: false,
        available: true,
        allergens: [],
        slug: 'japanese-green-tea',
        _status: 'published',
      },
      locale: 'en',
    }),
    payload.create({
      collection: 'menu-items',
      data: {
        title: 'Sapporo Beer',
        description: 'Classic Japanese lager, 330ml bottle',
        price: 58,
        image: drinkMedia.id,
        category: drinksCat.id,
        featured: false,
        available: true,
        allergens: ['gluten'],
        slug: 'sapporo-beer',
        _status: 'published',
      },
      locale: 'en',
    }),
  ])

  // Add Chinese translations for menu items
  await Promise.all([
    // Nigiri
    payload.update({ collection: 'menu-items', id: salmonNigiri.id, locale: 'zh', data: { title: '三文魚握壽司', description: '精選大西洋三文魚，手握醋飯，每份2件' } }),
    payload.update({ collection: 'menu-items', id: tunaHigiri.id, locale: 'zh', data: { title: '藍鰭吞拿魚握壽司', description: '野生藍鰭吞拿魚腩（大肥），搭配調味壽司飯，每份2件' } }),
    payload.update({ collection: 'menu-items', id: yellowtailNigiri.id, locale: 'zh', data: { title: '油甘魚握壽司', description: '日本絲滑油甘魚（青魽），手握壽司飯，每份2件' } }),
    payload.update({ collection: 'menu-items', id: scallopsNigiri.id, locale: 'zh', data: { title: '北海道帆立貝握壽司', description: '北海道甜帶子，輕燒配柚子鹽，每份2件' } }),
    // Maki
    payload.update({ collection: 'menu-items', id: spicyTunaRoll.id, locale: 'zh', data: { title: '辣吞拿魚卷', description: '新鮮吞拿魚、辣汁、青瓜及牛油果，每份8件' } }),
    payload.update({ collection: 'menu-items', id: dragonRoll.id, locale: 'zh', data: { title: '龍卷', description: '天婦羅蝦，外層牛油果、飛魚子及鰻魚汁，每份8件' } }),
    payload.update({ collection: 'menu-items', id: vegetarianRoll.id, locale: 'zh', data: { title: '素食卷', description: '牛油果、青瓜、醃蘿蔔及芝麻，每份8件' } }),
    // Sashimi
    payload.update({ collection: 'menu-items', id: salmonSashimi.id, locale: 'zh', data: { title: '三文魚刺身', description: '五片精選挪威三文魚，配芥末及醃薑' } }),
    payload.update({ collection: 'menu-items', id: tunaSashimi.id, locale: 'zh', data: { title: '吞拿魚刺身', description: '五片藍鰭吞拿魚（赤身），配芥末' } }),
    payload.update({ collection: 'menu-items', id: sashimiPlatter.id, locale: 'zh', data: { title: '主廚刺身拼盤', description: '主廚精選12件時令刺身，今日最佳漁獲' } }),
    // Appetizers
    payload.update({ collection: 'menu-items', id: edamame.id, locale: 'zh', data: { title: '毛豆', description: '蒸煮加鹽毛豆' } }),
    payload.update({ collection: 'menu-items', id: miso.id, locale: 'zh', data: { title: '味噌湯', description: '傳統白味噌湯，配豆腐、裙帶菜及蔥' } }),
    payload.update({ collection: 'menu-items', id: gyoza.id, locale: 'zh', data: { title: '煎餃子', description: '香脆豬肉蔬菜餃，配柚子醬油，每份6件' } }),
    // Drinks
    payload.update({ collection: 'menu-items', id: sake.id, locale: 'zh', data: { title: '純米清酒', description: '純米清酒，可熱飲或冰飲，口感順滑甘甜' } }),
    payload.update({ collection: 'menu-items', id: greenTea.id, locale: 'zh', data: { title: '日本綠茶', description: '熱或冰的儀式級抹茶或煎茶' } }),
    payload.update({ collection: 'menu-items', id: japaneseBeer.id, locale: 'zh', data: { title: '札幌啤酒', description: '經典日本啤酒，330毫升玻璃瓶' } }),
  ])

  payload.logger.info('— Seeding pages...')

  // Create home page
  const homePage = await payload.create({
    collection: 'pages',
    data: {
      title: 'Matsu-Sushi — Authentic Japanese Sushi in Hong Kong',
      slug: 'home',
      _status: 'published',
      hero: {
        type: 'highImpact',
        richText: {
          root: {
            type: 'root',
            children: [
              {
                type: 'heading',
                tag: 'h1',
                children: [{ type: 'text', text: 'Crafted with Intention.' }],
                version: 1,
              },
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'Authentic Japanese sushi in the heart of Hong Kong.' }],
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        },
        links: [
          { link: { type: 'custom', label: 'View Menu', url: '/en/menu', appearance: 'default' } },
        ],
        media: heroImgMedia.id,
      },
      layout: [
        {
          blockType: 'featuredDishes',
          heading: 'Featured Dishes',
          subheading: 'Crafted with the finest seasonal ingredients',
          showAll: true,
          viewAllLink: '/en/menu',
        },
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                root: {
                  type: 'root',
                  children: [
                    {
                      type: 'heading',
                      tag: 'h2',
                      children: [{ type: 'text', text: 'Our Philosophy' }],
                      version: 1,
                    },
                    {
                      type: 'paragraph',
                      children: [
                        {
                          type: 'text',
                          text: 'At Matsu-Sushi, we believe great sushi is an act of respect — for the fish, the rice, and the guest. Our chefs source only the finest seasonal fish, working directly with trusted suppliers in Japan and Hong Kong to ensure the highest quality reaches your plate.',
                        },
                      ],
                      version: 1,
                    },
                    {
                      type: 'paragraph',
                      children: [
                        {
                          type: 'text',
                          text: '在松壽司，我們相信優質壽司是對魚、米飯和賓客的尊重。我們的廚師只選用最優質的時令魚鮮，與日本和香港的可信供應商合作，確保最高品質送達您的餐碟。',
                        },
                      ],
                      version: 1,
                    },
                  ],
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  version: 1,
                },
              },
            },
          ],
        },
      ],
    },
    locale: 'en',
    context: { disableRevalidate: true },
  })

  // Chinese home page title
  await payload.update({
    collection: 'pages',
    id: homePage.id,
    locale: 'zh',
    data: {
      title: '松壽司 — 香港正宗日本壽司',
      hero: {
        type: 'highImpact',
        richText: {
          root: {
            type: 'root',
            children: [
              { type: 'heading', tag: 'h1', children: [{ type: 'text', text: '精心製作，用心呈獻。' }], version: 1 },
              { type: 'paragraph', children: [{ type: 'text', text: '正宗日本壽司，香港市中心。' }], version: 1 },
            ],
            direction: 'ltr', format: '', indent: 0, version: 1,
          },
        },
        links: [{ link: { type: 'custom', label: '查看菜單', url: '/zh/menu', appearance: 'default' } }],
        media: heroImgMedia.id,
      },
    },
    context: { disableRevalidate: true },
  })

  payload.logger.info('— Seeding globals...')

  await Promise.all([
    payload.updateGlobal({
      slug: 'header',
      data: {
        navItems: [
          { link: { type: 'custom', label: 'Menu', url: '/en/menu' } },
          { link: { type: 'custom', label: 'About', url: '/en/about' } },
          { link: { type: 'custom', label: 'Reservations', url: '/en/contact' } },
        ],
      },
    }),
    payload.updateGlobal({
      slug: 'footer',
      data: {
        address: 'G/F, 88 Stanley Street, Central, Hong Kong',
        phone: '+852 2345 6789',
        email: 'info@matsu-sushi.hk',
        hours: 'Mon–Sun: 12:00 – 22:30',
        navItems: [
          { link: { type: 'custom', label: 'Menu', url: '/en/menu' } },
          { link: { type: 'custom', label: 'About', url: '/en/about' } },
          { link: { type: 'custom', label: 'Reservations', url: '/en/contact' } },
          { link: { type: 'custom', label: 'Admin', url: '/admin' } },
        ],
      },
    }),
  ])

  payload.logger.info('Matsu-Sushi database seeded successfully!')
}
