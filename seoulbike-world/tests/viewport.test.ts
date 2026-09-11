import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createViewportResizer } from '../lib/world/viewport';

test('mobile update rows and viewport changes retain a zoomed and rotated camera', () => {
  const camera = new PerspectiveCamera(39, 390 / 620, 0.2, 1800);
  const target = new Vector3(28, 4, -15);
  camera.position.set(49, 31, 62);
  camera.lookAt(target);
  camera.zoom = 1.3;
  camera.updateProjectionMatrix();
  const position = camera.position.clone();
  const orientation = camera.quaternion.clone();
  const calls: number[][] = [];
  const resize = createViewportResizer(
    camera,
    {
      setSize: (w, h) => {
        calls.push([w, h]);
      },
    },
    390,
    620,
  );

  // The updating message appears and disappears repeatedly, then the device rotates.
  const sizes = [
    [390, 590],
    [390, 620],
    [390, 590],
    [390, 620],
    [844, 200],
  ];
  for (const [w, h] of sizes) {
    resize(w, h);
    assert.deepEqual(camera.position, position);
    assert.ok(camera.quaternion.equals(orientation));
    assert.equal(camera.zoom, 1.3);
    assert.equal(camera.aspect, w / h);
    const expected = new PerspectiveCamera(39, w / h, 0.2, 1800);
    expected.zoom = 1.3;
    expected.updateProjectionMatrix();
    assert.deepEqual(
      camera.projectionMatrix.elements,
      expected.projectionMatrix.elements,
    );
    assert.ok(
      camera
        .getWorldDirection(new Vector3())
        .distanceTo(target.clone().sub(position).normalize()) < 1e-12,
    );
  }
  assert.deepEqual(calls, sizes);
});

test('duplicate and transient invalid sizes do not disturb the drawing surface', () => {
  const camera = new PerspectiveCamera(39, 390 / 620, 0.2, 1800);
  const calls: number[][] = [];
  const resize = createViewportResizer(
    camera,
    {
      setSize: (w, h) => {
        calls.push([w, h]);
      },
    },
    390,
    620,
  );
  const projection = camera.projectionMatrix.clone();
  for (const [w, h] of [
    [390, 620],
    [0, 620],
    [390, 0],
    [-1, 620],
    [NaN, 620],
    [390, Infinity],
  ])
    resize(w, h);
  assert.deepEqual(calls, []);
  assert.deepEqual(camera.projectionMatrix, projection);
  resize(320, 344);
  resize(320, 344);
  assert.deepEqual(calls, [[320, 344]]);
});
