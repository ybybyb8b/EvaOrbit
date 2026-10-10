/** Count visible choices; empty/reset values are represented by deselection. */
export function usesCapsules(optionCount: number, searchable = false) {
  return !searchable && optionCount > 0 && optionCount <= 5;
}
