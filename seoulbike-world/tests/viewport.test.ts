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

  // Genuine viewport changes must preserve the user-controlled camera pose.
  const sizes = [
    [390, 590],
    [390, 620],
    [390, 590],
    [390, 620],
    [844, 200],
  ];
  for (const [w, h] of sizes) {
    resize.queue(w, h);
    resize.flush();
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
    resize.queue(w, h);
  resize.flush();
  assert.deepEqual(calls, []);
  assert.deepEqual(camera.projectionMatrix, projection);
  resize.queue(320, 344);
  resize.flush();
  resize.queue(320, 344);
  resize.flush();
  assert.deepEqual(calls, [[320, 344]]);
});

test('resize observations leave the displayed frame intact until the render boundary', () => {
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
  resize.queue(390, 590);
  resize.queue(320, 344);
  assert.deepEqual(calls, []);
  assert.deepEqual(camera.projectionMatrix, projection);
  resize.flush();
  assert.deepEqual(calls, [[320, 344]]);
  resize.flush();
  assert.equal(calls.length, 1);

  // Several layout notifications can settle back to the current size in one frame.
  resize.queue(320, 320);
  resize.queue(320, 344);
  resize.flush();
  assert.equal(calls.length, 1);
});
