export const REFRESH_THRESHOLD = 68;
export const MAX_PULL_DISTANCE = 112;
export const PULL_DRAG_SCALE = 0.52;

const REFRESH_VELOCITY_THRESHOLD = 0.11;

export function getPullRefreshDistance(deltaY: number) {
  const linearDistance = Math.max(deltaY, 0) * PULL_DRAG_SCALE;
  if (linearDistance <= REFRESH_THRESHOLD) return linearDistance;
  const range = MAX_PULL_DISTANCE - REFRESH_THRESHOLD;
  return REFRESH_THRESHOLD + range * (1 - Math.exp(-(linearDistance - REFRESH_THRESHOLD) / range));
}

export function shouldTriggerPullRefresh(distance: number, elapsedMs: number) {
  if (distance >= REFRESH_THRESHOLD) return true;
  const safeElapsedMs = Math.max(elapsedMs, 1);
  return distance >= REFRESH_THRESHOLD / 2 && distance / safeElapsedMs > REFRESH_VELOCITY_THRESHOLD;
}
