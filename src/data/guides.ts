export type GuideCategory = 'Design' | 'Printing' | 'Keepsakes';

export interface PrintGuide {
  id: string;
  category: GuideCategory;
  readTime: string;
  title: string;
  summary: string;
  serviceId: string;
  photoSrc?: string;
  photoAlt?: string;
  points: readonly string[];
}

export const PRINT_GUIDES: readonly PrintGuide[] = [
  {
    id: 'file-prep-clarity',
    category: 'Design',
    readTime: '4 minutes',
    title: 'Preparing Clean Artwork Files Before Sending Your Print Inquiry',
    summary:
      'Simple resolution, margin, and text-outline checks that keep prints crisp on paper, magnets, and mugs.',
    serviceId: 'document-printing',
    photoSrc: '/rjhub-shop-interior.jpg',
    photoAlt: 'Inside the RJ HUB Printing studio workstation',
    points: [
      'Export logos or crests as high-resolution PNG or PDF files so edges remain crisp.',
      'Leave clear breathing room around borders for trimmed cards, magnets, and laminated IDs.',
      'Include exact quantity and target size in your inquiry message to speed up review.',
    ],
  },
  {
    id: 'matte-vs-gloss-lamination',
    category: 'Printing',
    readTime: '3 minutes',
    title: 'Choosing Between Matte and Gloss Lamination Film',
    summary:
      'Pick the film finish that matches how your certificates, menus, or store signs will be handled.',
    serviceId: 'lamination',
    photoSrc: '/blog/lamination-sign.jpg',
    photoAlt: 'Glossy laminated storefront menu signage sealed against moisture',
    points: [
      'Choose gloss film for vibrant photo colors, IDs, and wipe-clean storefront signage.',
      'Choose matte film for certificates and signs displayed under bright room lighting.',
      'Count front-and-back sheets ahead of time so film sizes can be matched cleanly.',
    ],
  },
  {
    id: 'event-souvenir-planning',
    category: 'Keepsakes',
    readTime: '5 minutes',
    title: 'Planning Custom Event Souvenirs and Refrigerator Magnets',
    summary:
      'How to coordinate favors, names, and dates for birthdays, reunions, and school recognition days.',
    serviceId: 'souvenir-making',
    photoSrc: '/blog/event-magnets.jpg',
    photoAlt: 'Custom 70th birthday clear acrylic refrigerator magnet keepsakes',
    points: [
      'Confirm recipient counts with a small spare allowance before finalizing layout proofs.',
      'Share your celebration date and theme colors in your first inquiry note.',
      'Pair matching refrigerator magnets with boxed event tokens for cohesive keepsake sets.',
    ],
  },
  {
    id: 'color-vs-monochrome-docs',
    category: 'Printing',
    readTime: '3 minutes',
    title: 'School Uniform Crest Prints & Multi-Run Event Packages',
    summary:
      'Crisp crest alignment, clean packaging, and batch print prep for school and barangay orders.',
    serviceId: 'document-printing',
    photoSrc: '/blog/school-prints.jpg',
    photoAlt: 'Packaged custom school emblem shirt print from Andili Elementary School',
    points: [
      'Confirm emblem placement size alongside quantity before final pressing or printing.',
      'List how many total packed sets you need per size or recipient group.',
      'Double-check final artwork spelling and crest colors before sending files for production.',
    ],
  },
  {
    id: 'laser-engraving-artwork',
    category: 'Design',
    readTime: '4 minutes',
    title: 'Custom Keychain Inserts & Precision Keepsake Layouts',
    summary:
      'Sharp portraits, legible names, and balanced margins for double-sided keychains and laser engravings.',
    serviceId: 'custom-keychains',
    photoSrc: '/blog/custom-keychains.jpg',
    photoAlt: 'Individually sealed 18th birthday custom acrylic photo keychains',
    points: [
      'Provide high-resolution portraits centered inside safe crop margins for acrylic keychains.',
      'Submit typed recipient name lists carefully proofread for capitalization and dates.',
      'Mention the base item type and piece count in your inquiry notes.',
    ],
  },
  {
    id: 'custom-mug-layouts',
    category: 'Keepsakes',
    readTime: '4 minutes',
    title: 'Designing Wrap-Around Custom Mugs for Gifts and Teams',
    summary:
      'Balance logos, photos, and individual names cleanly around the mug handle.',
    serviceId: 'mug-customization',
    photoSrc: '/blog/custom-mugs.jpg',
    photoAlt: 'Batch of custom printed christening ceramic mugs at RJ HUB Printing',
    points: [
      'Decide whether all mugs share one graphic or carry individual recipient names.',
      'Keep key faces and text centered away from the handle zone.',
      'Include total mug count and target pickup date when sending your inquiry.',
    ],
  },
] as const;
