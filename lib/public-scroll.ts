export const LANDING_SCROLL_DURATION_MS = 720;
export const LANDING_SCROLL_GAP_PX = 16;

type LandingScrollTarget = {
  currentTop: number;
  targetViewportTop: number;
  headerViewportBottom: number;
  scrollHeight: number;
  viewportHeight: number;
  gap?: number;
};

export function calculateLandingScrollTop({
  currentTop,
  targetViewportTop,
  headerViewportBottom,
  scrollHeight,
  viewportHeight,
  gap = LANDING_SCROLL_GAP_PX,
}: LandingScrollTarget) {
  const maximumTop = Math.max(0, scrollHeight - viewportHeight);
  const headerOffset = Math.max(0, headerViewportBottom);
  return Math.min(
    maximumTop,
    Math.max(0, currentTop + targetViewportTop - headerOffset - gap),
  );
}

export function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}
