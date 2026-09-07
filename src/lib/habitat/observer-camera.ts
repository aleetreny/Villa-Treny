export type ViewSize = { width: number; height: number };
export type CameraMemory = { zoom: number | null; left: number; top: number };

/** Whole-pixel scales only. At 1× a tiny viewport must scroll; it never clips silently. */
export function fitRoom(view: ViewSize, art: ViewSize): number {
  return Math.max(1, Math.min(5, Math.floor(Math.min((view.width - 4) / art.width, (view.height - 4) / art.height))));
}

export function roomCamera(view: ViewSize, art: ViewSize, choice: number | null) {
  const zoom = choice ?? fitRoom(view, art);
  const padding = choice === null ? 4 : 20;
  const width = Math.max(view.width, art.width * zoom + padding);
  const height = Math.max(view.height, art.height * zoom + padding);
  return { zoom, width, height, x: Math.floor((width - art.width * zoom) / 2), y: Math.floor((height - art.height * zoom) / 2) };
}

/** Keep the whole 44px resident within the visible region, including their head. */
export function followScroll(view: ViewSize, canvas: ViewSize, center: { x: number; y: number }) {
  return { left: Math.max(0, Math.min(canvas.width - view.width, Math.round(center.x - view.width / 2))),
    top: Math.max(0, Math.min(canvas.height - view.height, Math.round(center.y - view.height / 2))) };
}
