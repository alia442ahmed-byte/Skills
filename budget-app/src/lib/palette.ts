/**
 * Categorical palette from the data-viz reference instance, in its fixed slot order.
 * Validated with scripts/validate_palette.js in both modes: every check PASSes
 * (light mode carries a sub-3:1 contrast WARN, so charts using it ship visible
 * direct labels and a table view as the documented relief).
 *
 * Colors are assigned to categories in slot order and never cycled by rank —
 * a category keeps its color as other categories come and go.
 */
export const CATEGORICAL = [
  { light: '#2a78d6', dark: '#3987e5', name: 'Blue' },
  { light: '#eb6834', dark: '#d95926', name: 'Orange' },
  { light: '#1baf7a', dark: '#199e70', name: 'Aqua' },
  { light: '#eda100', dark: '#c98500', name: 'Yellow' },
  { light: '#e87ba4', dark: '#d55181', name: 'Magenta' },
  { light: '#008300', dark: '#008300', name: 'Green' },
  { light: '#4a3aa7', dark: '#9085e9', name: 'Violet' },
  { light: '#e34948', dark: '#e66767', name: 'Red' },
] as const

export const OTHER_COLOR = { light: '#898781', dark: '#898781' }

/** Status colors are reserved — never reused as a series color. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

export function slotColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length].light
}

/** Map a stored (light) hex to the step chosen for the dark surface. */
export function forMode(lightHex: string, dark: boolean): string {
  if (!dark) return lightHex
  const slot = CATEGORICAL.find((c) => c.light.toLowerCase() === lightHex.toLowerCase())
  return slot ? slot.dark : lightHex
}
