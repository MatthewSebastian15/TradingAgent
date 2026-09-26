// Auto-fit grids: a column is added only when a whole card fits, so long values never
// squeeze. Cards: min 11rem, at most 4 columns (0.75rem gaps → 2.25rem for 3 gaps).
export const CARD_GRID =
  'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(max(11rem,calc((100%_-_2.25rem)/4)),1fr))]';

// Form fields: min 10rem, no column cap (inputs are narrow).
export const FIELD_GRID =
  'grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]';
