import type { PerspectiveCamera, WebGLRenderer } from 'three';

// Queue layout measurements; flush immediately before rendering so a cleared
// drawing buffer is never presented between ResizeObserver and the next frame.
export function createViewportResizer(
  camera: PerspectiveCamera,
  renderer: Pick<WebGLRenderer, 'setSize'>,
  initialWidth: number,
  initialHeight: number,
) {
  let previousWidth = initialWidth;
  let previousHeight = initialHeight;
  let pending: [number, number] | null = null;
  return {
    queue(width: number, height: number) {
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      )
        return;
      pending =
        width === previousWidth && height === previousHeight
          ? null
          : [width, height];
    },
    flush() {
      if (!pending) return;
      const [width, height] = pending;
      pending = null;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      previousWidth = width;
      previousHeight = height;
    },
  };
}
