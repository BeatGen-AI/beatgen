/**
 * Card dimension constants for consistent UI design
 */

// Card Heights
export const CARD_HEIGHTS = {
  // Display cards (track cards, project cards)
  DISPLAY_CARD: 200,
  DISPLAY_CARD_HEADER: 40,
  DISPLAY_CARD_FOOTER: 40,
  
  // Content preview area is calculated as: DISPLAY_CARD - HEADER - FOOTER
  get DISPLAY_CARD_CONTENT() {
    return this.DISPLAY_CARD - this.DISPLAY_CARD_HEADER - this.DISPLAY_CARD_FOOTER;
  },
  
  // Other card types can be added here in the future
  COMPACT_CARD: 120,
  LARGE_CARD: 300,
} as const;

// Card Widths (if needed in the future)
export const CARD_WIDTHS = {
  DEFAULT: 'w-full',
  COMPACT: 'w-64',
  LARGE: 'w-96',
} as const;

// Helper function to get CSS class for card height
export const getCardHeightClass = (height: number): string => {
  return `h-[${height}px]`;
};

// Helper function to get inline style for card height
export const getCardHeightStyle = (height: number): React.CSSProperties => {
  return { height: `${height}px` };
};