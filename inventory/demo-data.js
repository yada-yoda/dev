/* ============================================================
   Demo / Preview Data
   ----------------------------------------------------------------
   Realistic sample items used by Demo Mode so first-time visitors
   can see the app populated without signing up. Loaded into memory
   only — never persisted to localStorage or Firestore.

   Mix is deliberate: a couple of rare / high-value Beanies, a
   couple of routine ones, a sold one, a draft, and a non-Beanie
   item — to give a sense of how varied inventory looks.

   Each item carries a single procedurally-generated SVG "photo"
   (a gradient backdrop in the item's color family with a bear or
   shirt silhouette + the name) so the photo feature is visible
   out of the gate. Encoded inline as data URLs — no network
   fetches, no copyright concerns, ~700 bytes per item.
   ============================================================ */

const _ICONS = {
  bear:
      '<g transform="translate(100 90)" fill="rgba(255,255,255,.92)">'
    + '<circle cx="-25" cy="-30" r="14"/><circle cx="25" cy="-30" r="14"/>'
    + '<circle cx="0" cy="5" r="32"/></g>'
    + '<circle cx="89" cy="91" r="3.5" fill="#0d1117"/>'
    + '<circle cx="111" cy="91" r="3.5" fill="#0d1117"/>'
    + '<ellipse cx="100" cy="106" rx="5" ry="3" fill="#0d1117"/>'
    + '<path d="M 91 113 Q 100 118 109 113" stroke="#0d1117" stroke-width="2" '
    + 'fill="none" stroke-linecap="round"/>',
  elephant:
      '<g fill="rgba(255,255,255,.92)">'
    + '<ellipse cx="100" cy="100" rx="36" ry="28"/>'
    + '<ellipse cx="68" cy="95" rx="14" ry="20"/>'
    + '<ellipse cx="132" cy="95" rx="14" ry="20"/>'
    + '<path d="M 95 120 Q 95 142 112 140 Q 122 132 112 122 Z"/>'
    + '</g>'
    + '<circle cx="88" cy="95" r="3" fill="#0d1117"/>'
    + '<circle cx="112" cy="95" r="3" fill="#0d1117"/>',
  dinosaur:
      '<g fill="rgba(255,255,255,.92)">'
    + '<path d="M 55 115 L 60 92 L 82 82 L 112 82 L 132 90 L 148 96 L 148 106 L 132 106 L 122 100 L 110 106 L 98 110 L 75 116 Z"/>'
    + '<path d="M 55 115 L 33 108 L 28 114 L 50 122 Z"/>'
    + '<path d="M 90 110 L 86 122 L 94 124 L 96 112 Z"/>'
    + '</g>'
    + '<circle cx="138" cy="96" r="2" fill="#0d1117"/>',
  spider:
      '<g fill="rgba(255,255,255,.92)">'
    + '<circle cx="100" cy="98" r="18"/>'
    + '<circle cx="100" cy="84" r="10"/>'
    + '</g>'
    + '<g stroke="rgba(255,255,255,.92)" stroke-width="2.5" stroke-linecap="round" fill="none">'
    + '<path d="M 84 90 L 64 80"/><path d="M 82 98 L 60 96"/>'
    + '<path d="M 82 106 L 60 112"/><path d="M 84 113 L 64 124"/>'
    + '<path d="M 116 90 L 136 80"/><path d="M 118 98 L 140 96"/>'
    + '<path d="M 118 106 L 140 112"/><path d="M 116 113 L 136 124"/>'
    + '</g>'
    + '<circle cx="96" cy="82" r="2" fill="#0d1117"/>'
    + '<circle cx="104" cy="82" r="2" fill="#0d1117"/>',
  lizard:
      '<g fill="rgba(255,255,255,.92)">'
    + '<path d="M 35 108 Q 60 92 90 102 Q 120 112 150 98 L 158 102 L 155 110 Q 125 122 95 112 Q 60 102 35 115 Z"/>'
    + '<path d="M 50 92 L 53 87 L 56 92 Z"/>'
    + '<path d="M 68 89 L 71 84 L 74 89 Z"/>'
    + '<path d="M 86 92 L 89 87 L 92 92 Z"/>'
    + '<path d="M 104 95 L 107 90 L 110 95 Z"/>'
    + '<path d="M 122 97 L 125 92 L 128 97 Z"/>'
    + '</g>'
    + '<circle cx="148" cy="100" r="2" fill="#0d1117"/>',
  donkey:
      '<g fill="rgba(255,255,255,.92)">'
    + '<ellipse cx="100" cy="108" rx="30" ry="35"/>'
    + '<ellipse cx="86" cy="70" rx="6" ry="20" transform="rotate(-15 86 70)"/>'
    + '<ellipse cx="114" cy="70" rx="6" ry="20" transform="rotate(15 114 70)"/>'
    + '</g>'
    + '<circle cx="92" cy="100" r="3" fill="#0d1117"/>'
    + '<circle cx="108" cy="100" r="3" fill="#0d1117"/>'
    + '<ellipse cx="100" cy="128" rx="8" ry="5" fill="#0d1117"/>',
  shirt:
      '<path d="M 70 55 L 88 45 L 100 60 L 112 45 L 130 55 L 145 90 L 130 95 L 130 145 L 70 145 L 70 95 L 55 90 Z" '
    + 'fill="rgba(255,255,255,.85)" stroke="rgba(0,0,0,.2)" stroke-width="1.5"/>'
};

function _demoPhoto(label, hue, kind) {
  const c1 = `hsl(${hue},60%,40%)`;
  const c2 = `hsl(${(hue + 30) % 360},70%,22%)`;
  const icon = _ICONS[kind] || _ICONS.bear;
  const safe = String(label).replace(/[<>&]/g, '');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    + `<stop offset="0" stop-color="${c1}"/>`
    + `<stop offset="1" stop-color="${c2}"/>`
    + '</linearGradient></defs>'
    + '<rect width="200" height="200" fill="url(#g)"/>'
    + icon
    + `<text x="100" y="175" text-anchor="middle" font-family="system-ui,sans-serif" `
    + `font-size="13" font-weight="600" fill="rgba(255,255,255,.96)">${safe}</text>`
    + '</svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const DEMO_ITEMS = [
  {
    id: 'demo_001',
    name: 'Princess',
    category: 'Beanie Baby',
    sku: 'BB-0001',
    upc: '',
    brand: 'Ty Inc.',
    color: 'Royal purple',
    material: 'Plush, PE pellets',
    country: 'Indonesia',
    location: 'Bin A-3',
    quantity: 1,
    bb_year: 1997,
    bb_birthday: '',
    bb_swing_gen: '4th Gen (1996-98)',
    bb_tush_gen: '5th Gen Tush (1997)',
    bb_swing_cond: 'Mint (no creases/bends)',
    bb_tush_cond: 'Mint',
    bb_style_num: '4300',
    bb_pellets: 'PE Pellets',
    bb_errors: '',
    bb_rarity: 'Retired 1999-04-13. Diana Memorial bear. PE pellets version.',
    has_variations: false,
    condition: 'New With Tags (NWT)',
    condition_notes: 'Mint hang tag, mint tush tag, no fading.',
    has_packaging: 'No',
    environment: 'Smoke-free & Pet-free home',
    listing_title: 'VTG 1997 Ty Princess Diana Beanie Baby PE Pellets Mint Tags',
    listing_desc: 'Authentic Ty Princess Beanie Baby, 1997 Diana Memorial release with PE pellets. Both tags mint condition.',
    listing_desc_ebay: '', listing_desc_poshmark: '',
    tags: 'vintage, 90s, beanie baby, ty, princess, diana, rare, NWT',
    cost: '5.00', price: '45.00', min_price: '38.00', sold_price: '',
    status: 'Listed - Both', sold_platform: '',
    date_listed: '2026-04-25', date_sold: '',
    url_poshmark: 'https://poshmark.com/listing/example-1',
    url_ebay: 'https://ebay.com/itm/example-1',
    ebay_item_number: '285123456789',
    weight_value: '4', weight_unit: 'oz', dim_unit: 'in',
    box_length: '6', box_width: '4', box_height: '3',
    package_type: 'Padded Mailer / Bubble Mailer',
    carrier: 'USPS Ground Advantage', ship_cost: '4.50',
    photos: [_demoPhoto('Princess', 280)],
    research_ebay_avg: '42.00', research_ebay_date: '2026-04-22',
    research_ebay_notes: 'eBay sold listings, last 5 avg',
    research_poshmark_avg: '50.00', research_poshmark_date: '2026-04-22',
    research_poshmark_notes: '',
    research_guide_avg: '40.00', research_guide_date: '',
    research_guide_notes: '',
    private_notes: 'Picked up at estate sale for $5, original owner kept in display case.',
    created_at: '2026-04-22T10:15:00Z', updated_at: '2026-04-25T14:30:00Z'
  },
  {
    id: 'demo_002',
    name: 'Peanut the Royal Blue Elephant',
    category: 'Beanie Baby',
    sku: 'BB-0002',
    brand: 'Ty Inc.',
    color: 'Royal blue (dark)',
    material: 'Plush, PVC pellets',
    bb_year: 1995, bb_birthday: '1995-01-25',
    bb_swing_gen: '3rd Gen (1995)', bb_tush_gen: '2nd Gen Tush (1994)',
    bb_swing_cond: 'Mint (no creases/bends)', bb_tush_cond: 'Mint',
    bb_style_num: '4062', bb_pellets: 'PVC Pellets',
    bb_rarity: 'Royal Blue version, 1995 production error. Only ~2000 made.',
    condition: 'New With Tags (NWT)',
    listing_title: 'RARE 1995 Ty Peanut Royal Blue Elephant PVC Pellets Mint',
    cost: '400.00', price: '1200.00', min_price: '950.00',
    status: 'Listed - eBay',
    date_listed: '2026-04-20',
    url_ebay: 'https://ebay.com/itm/example-2',
    ebay_item_number: '285234567890',
    research_ebay_avg: '1100.00', research_ebay_date: '2026-04-20',
    research_ebay_notes: 'Recent sold range $950-$1300',
    research_guide_avg: '1500.00',
    quantity: 1, photos: [_demoPhoto('Peanut Royal Blue', 220, 'elephant')],
    created_at: '2026-04-19T08:00:00Z', updated_at: '2026-04-20T09:45:00Z'
  },
  {
    id: 'demo_003',
    name: 'Patti the Platypus',
    category: 'Beanie Baby',
    sku: 'BB-0003',
    brand: 'Ty Inc.',
    color: 'Magenta',
    bb_year: 1993, bb_birthday: '1993-01-06',
    bb_style_num: '4025',
    condition: 'Like New / Excellent Used',
    listing_title: 'Ty Patti the Platypus Beanie Baby 1993 Magenta',
    cost: '8.00', item_tax: '0.50',
    other_expenses: '0.50', other_expenses_notes: 'Bubble mailer + label tape',
    price: '35.00', sold_price: '32.00',
    status: 'Sold', sold_platform: 'Poshmark',
    date_listed: '2026-04-10', date_sold: '2026-04-18',
    url_poshmark: 'https://poshmark.com/listing/example-3',
    poshmark_order_number: 'P-65a1f23b',
    fee_poshmark: '6.40',
    quantity: 1, photos: [_demoPhoto('Patti the Platypus', 320)],
    created_at: '2026-04-08T12:00:00Z', updated_at: '2026-04-18T16:20:00Z'
  },
  {
    id: 'demo_004',
    name: 'Halo the Bear',
    category: 'Beanie Baby',
    sku: 'BB-0004',
    brand: 'Ty Inc.',
    color: 'White with iridescent halo',
    bb_year: 1998, bb_style_num: '4208',
    condition: 'New With Tags (NWT)',
    cost: '4.00', price: '25.00',
    status: 'Draft',
    quantity: 1, photos: [_demoPhoto('Halo', 200)],
    private_notes: 'Need to photograph the iridescent halo properly.',
    created_at: '2026-04-28T09:00:00Z', updated_at: '2026-04-28T09:00:00Z'
  },
  {
    id: 'demo_005',
    name: 'Rex the Tyrannosaurus',
    category: 'Beanie Baby',
    sku: 'BB-0005',
    brand: 'Ty Inc.',
    color: 'Tie-dye orange/yellow/red',
    material: 'Plush, PVC pellets',
    bb_year: 1995,
    bb_swing_gen: '3rd Gen (1995)', bb_tush_gen: '2nd Gen Tush (1994)',
    bb_style_num: '4086', bb_pellets: 'PVC Pellets',
    bb_rarity: 'Retired 1996-06-15. Part of dinosaur trio (Rex/Steg/Bronty), all retired together — highly valuable.',
    condition: 'Like New / Excellent Used',
    listing_title: 'RARE 1995 Ty Rex T-Rex Tie-Dye Beanie Baby PVC Retired',
    cost: '50.00', price: '850.00', min_price: '700.00',
    status: 'Listed - eBay',
    date_listed: '2026-04-22',
    research_ebay_avg: '825.00', research_ebay_date: '2026-04-22',
    research_guide_avg: '900.00',
    quantity: 1, photos: [_demoPhoto('Rex T-Rex', 15, 'dinosaur')],
    created_at: '2026-04-21T11:30:00Z', updated_at: '2026-04-22T10:00:00Z'
  },
  {
    id: 'demo_006',
    name: 'Iggy the Iguana',
    category: 'Beanie Baby',
    sku: 'BB-0006',
    brand: 'Ty Inc.',
    color: 'Solid blue with no tongue',
    bb_year: 1997, bb_birthday: '1997-08-12',
    bb_style_num: '4038',
    bb_errors: 'No tongue version (early production error)',
    bb_rarity: 'Material mix-up with Rainbow — solid blue no-tongue is the rarer variant.',
    condition: 'Very Good',
    cost: '3.00', price: '18.00',
    status: 'Listed - Poshmark',
    date_listed: '2026-04-15',
    url_poshmark: 'https://poshmark.com/listing/example-6',
    quantity: 1, photos: [_demoPhoto('Iggy Iguana', 210, 'lizard')],
    created_at: '2026-04-14T13:00:00Z', updated_at: '2026-04-15T09:00:00Z'
  },
  {
    id: 'demo_007',
    name: 'Glory the Bear',
    category: 'Beanie Baby',
    sku: 'BB-0007',
    brand: 'Ty Inc.',
    color: 'White with American flag',
    bb_year: 1998, bb_birthday: '1997-07-04',
    bb_style_num: '4188',
    condition: 'New With Tags (NWT)',
    cost: '6.00', item_tax: '0.40',
    other_expenses: '0.50', other_expenses_notes: 'Bubble mailer',
    price: '40.00', sold_price: '38.00',
    status: 'Sold', sold_platform: 'eBay',
    date_listed: '2026-03-30', date_sold: '2026-04-12',
    ebay_item_number: '285456789012',
    ship_cost: '4.95', postage_paid: '4.20',
    fee_ebay_fvf: '5.04', fee_ebay_fvf_shipping: '0.66', fee_ebay_per_order: '0.30',
    quantity: 1, photos: [_demoPhoto('Glory', 350)],
    created_at: '2026-03-28T15:00:00Z', updated_at: '2026-04-12T18:30:00Z'
  },
  {
    id: 'demo_008',
    name: '2000 Holiday Teddy',
    category: 'Beanie Baby',
    sku: 'BB-0008',
    brand: 'Ty Inc.',
    color: 'Red with snowflake pattern',
    bb_year: 2000, bb_birthday: '2000-12-14',
    bb_style_num: '4332',
    condition: 'New With Tags (NWT)',
    cost: '5.00', price: '30.00',
    status: 'Ready to List',
    quantity: 1, photos: [_demoPhoto('Holiday Teddy 2000', 0)],
    created_at: '2026-04-26T10:00:00Z', updated_at: '2026-04-26T10:00:00Z'
  },
  {
    id: 'demo_009',
    name: 'Spinner the Spider',
    category: 'Beanie Baby',
    sku: 'BB-0009',
    brand: 'Ty Inc.',
    color: 'Black/orange',
    bb_year: 1996, bb_birthday: '1996-10-28',
    bb_style_num: '4036',
    bb_rarity: 'Halloween-season spider. Retired 1998-09-19.',
    condition: 'Like New / Excellent Used',
    cost: '4.00', price: '22.00',
    status: 'Listed - eBay',
    date_listed: '2026-04-18',
    quantity: 1, photos: [_demoPhoto('Spinner Spider', 25, 'spider')],
    created_at: '2026-04-17T16:00:00Z', updated_at: '2026-04-18T11:00:00Z'
  },
  {
    id: 'demo_010',
    name: 'Lefty the Donkey',
    category: 'Beanie Baby',
    sku: 'BB-0010',
    brand: 'Ty Inc.',
    color: 'Grey with USA flag',
    bb_year: 1996, bb_birthday: '1996-07-04',
    bb_style_num: '4085',
    bb_rarity: '1996 political bear — short shelf life, retired 1997-01-01.',
    condition: 'New With Tags (NWT)',
    cost: '10.00', item_tax: '0.65',
    other_expenses: '0.75', other_expenses_notes: 'Padded mailer + thank-you note',
    price: '65.00', sold_price: '60.00',
    status: 'Sold', sold_platform: 'eBay',
    date_listed: '2026-03-15', date_sold: '2026-04-02',
    ebay_item_number: '285567890123',
    ship_cost: '5.50', postage_paid: '4.85',
    fee_ebay_fvf: '7.95', fee_ebay_fvf_shipping: '0.73', fee_ebay_per_order: '0.30',
    quantity: 1, photos: [_demoPhoto('Lefty Donkey', 230, 'donkey')],
    created_at: '2026-03-14T09:00:00Z', updated_at: '2026-04-02T14:00:00Z'
  },
  {
    id: 'demo_011',
    name: 'Vintage Levi\'s Trucker Jacket',
    category: 'Clothing',
    sku: 'CLT-0001',
    brand: 'Levi\'s',
    model: 'Type III Trucker',
    size: 'Medium',
    color: 'Medium wash blue',
    material: '100% cotton denim',
    country: 'USA',
    location: 'Closet rack',
    quantity: 1,
    condition: 'Very Good',
    condition_notes: 'Light fading consistent with age, no rips or stains, all buttons original.',
    has_packaging: 'No',
    listing_title: 'Vintage 90s Levi\'s Type III Trucker Jacket Medium Wash Mens M',
    cost: '15.00', price: '85.00',
    status: 'Listed - Both',
    date_listed: '2026-04-23',
    weight_value: '1.5', weight_unit: 'lb',
    photos: [_demoPhoto("Vintage Levi's", 215, 'shirt')],
    created_at: '2026-04-22T17:00:00Z', updated_at: '2026-04-23T10:00:00Z'
  },
  {
    id: 'demo_012',
    name: 'Garcia the Bear',
    category: 'Beanie Baby',
    sku: 'BB-0011',
    brand: 'Ty Inc.',
    color: 'Tie-dye',
    bb_year: 1995, bb_birthday: '1995-08-01',
    bb_style_num: '4051',
    bb_rarity: 'Tie-dye Grateful Dead tribute. Each one has unique coloring.',
    has_variations: true,
    variation_description: 'Each Garcia has a unique tie-dye pattern — colors and swirls vary',
    condition: 'New With Tags (NWT)',
    cost: '5.00', price: '35.00',
    status: 'Ready to List',
    quantity: 1, photos: [_demoPhoto('Garcia', 290)],
    created_at: '2026-04-27T12:00:00Z', updated_at: '2026-04-27T12:00:00Z'
  }
];
