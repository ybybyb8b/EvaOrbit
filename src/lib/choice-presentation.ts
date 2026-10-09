/** Count every selectable entry, including an empty/reset option. */
export function usesCapsules(optionCount: number, searchable = false) {
  return !searchable && optionCount > 0 && optionCount <= 5;
}
