export type SectionSwipeIntent = "pending" | "horizontal" | "vertical";

export const sectionSwipeEdge = 30;

export function sectionSwipeIntent(dx: number, dy: number): SectionSwipeIntent {
  if (Math.hypot(dx, dy) < 12) return "pending";
  return Math.abs(dx) > Math.abs(dy) * 1.35 ? "horizontal" : "vertical";
}

export function sectionSwipeStep({ dx, velocityX, width, index, count }: {
  dx: number;
  velocityX: number;
  width: number;
  index: number;
  count: number;
}) {
  const target = index + (dx < 0 ? 1 : -1);
  if (target < 0 || target >= count) return null;
  const distance = Math.max(56, Math.min(76, width * 0.16));
  return Math.abs(dx) >= distance || (Math.abs(dx) >= 28 && Math.abs(velocityX) >= 0.45) ? target : null;
}
