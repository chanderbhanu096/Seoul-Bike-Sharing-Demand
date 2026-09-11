import type { PerspectiveCamera, WebGLRenderer } from 'three';

// Layout changes resize the drawing surface, never the user's camera pose.
export function createViewportResizer(
  camera: PerspectiveCamera,
  renderer: Pick<WebGLRenderer, 'setSize'>,
  initialWidth: number,
  initialHeight: number,
) {
  let previousWidth = initialWidth;
  let previousHeight = initialHeight;
  return (width: number, height: number) => {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      (width === previousWidth && height === previousHeight)
    )
      return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    previousWidth = width;
    previousHeight = height;
  };
}
