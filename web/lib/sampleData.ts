import type { Document, IndexSchema } from 'polysearch';

/** The index/core name used across all engines in the demo. */
export const INDEX = 'products';

export const schema: IndexSchema = {
  fields: {
    title: { type: 'text' },
    description: { type: 'text' },
    category: { type: 'keyword' },
    price: { type: 'float' },
    discontinued: { type: 'boolean' },
  },
};

/** A small retail-style corpus (furniture/lighting), enough to make the
 * cross-engine differences interesting without being heavy to index. */
export const products: Document[] = [
  {
    id: '1',
    title: 'Table lamp BORRE',
    description: 'Warm oak table lamp, perfect on a bedside or side table',
    category: 'lighting',
    price: 39,
    discontinued: false,
  },
  {
    id: '2',
    title: 'Desk lamp NEX',
    description: 'Adjustable LED desk lamp with a brushed metal arm',
    category: 'lighting',
    price: 25,
    discontinued: false,
  },
  {
    id: '3',
    title: 'Oak dining table EGENS',
    description: 'Solid oak dining table that seats six',
    category: 'tables',
    price: 299,
    discontinued: false,
  },
  {
    id: '4',
    title: 'Floor lamp HALDEN',
    description: 'Tall floor lamp from a discontinued line',
    category: 'lighting',
    price: 59,
    discontinued: true,
  },
  {
    id: '5',
    title: 'Bedside table OAKEN',
    description: 'Small oak bedside table with a drawer',
    category: 'tables',
    price: 79,
    discontinued: false,
  },
  {
    id: '6',
    title: 'Reading lamp LUMEN',
    description: 'Focused reading light that clamps to a desk or table',
    category: 'lighting',
    price: 45,
    discontinued: false,
  },
  {
    id: '7',
    title: 'Coffee table SVAL',
    description: 'Low oak coffee table for the living room',
    category: 'tables',
    price: 149,
    discontinued: false,
  },
  {
    id: '8',
    title: 'Pendant lamp NORD',
    description: 'Hanging pendant lamp for above a dining table',
    category: 'lighting',
    price: 89,
    discontinued: false,
  },
  {
    id: '9',
    title: 'Dining chair STAVN',
    description: 'Stackable oak dining chair with a padded seat',
    category: 'chairs',
    price: 49,
    discontinued: false,
  },
  {
    id: '10',
    title: 'Office chair ERGO',
    description: 'Ergonomic mesh office chair with lumbar support',
    category: 'chairs',
    price: 129,
    discontinued: false,
  },
  {
    id: '11',
    title: 'Bookshelf TARM',
    description: 'Tall oak bookshelf with five open shelves',
    category: 'storage',
    price: 119,
    discontinued: false,
  },
  {
    id: '12',
    title: 'Bed frame VINGE',
    description: 'Double bed frame in oak veneer with slatted base',
    category: 'beds',
    price: 349,
    discontinued: false,
  },
  {
    id: '13',
    title: 'Garden table SOLVIK',
    description: 'Foldable outdoor garden table in weatherproof acacia',
    category: 'outdoor',
    price: 99,
    discontinued: false,
  },
  {
    id: '14',
    title: 'Bedside lamp GLIM',
    description: 'Compact bedside lamp with a fabric shade',
    category: 'lighting',
    price: 29,
    discontinued: false,
  },
];
