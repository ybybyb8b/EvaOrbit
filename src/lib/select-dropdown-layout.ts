export function selectDropdownLayout(field: { left: number; top: number; bottom: number; width: number }, viewport: { left: number; top: number; width: number; height: number }, contentHeight: number) {
  const bottom = viewport.top + viewport.height;
  const below = bottom - field.bottom - 14;
  const above = Math.min(field.top, bottom) - viewport.top - 14;
  const flip = below < 180 && above > below;
  const maxHeight = Math.max(0, Math.min(320, viewport.height - 24, flip ? above : below));
  const height = Math.min(contentHeight, maxHeight);
  const width = Math.max(0, Math.min(field.width, viewport.width - 24));
  return {
    width,
    left: Math.max(viewport.left + 12, Math.min(field.left, viewport.left + viewport.width - width - 12)),
    top: Math.max(viewport.top + 12, Math.min(flip ? field.top - 6 - height : field.bottom + 6, bottom - height - 12)),
    maxHeight,
  };
}
