import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cropRectangle,
  constrainCrop,
  rotatedSize,
  INITIAL_CROP,
} from '../src/features/media/crop';

test('crop geometry selects the shown area and accounts for quarter-turn rotation', () => {
  assert.deepEqual(cropRectangle(1200, 600, 1, INITIAL_CROP), {
    x: 300,
    y: 0,
    width: 600,
    height: 600,
  });
  assert.deepEqual(cropRectangle(1200, 600, 1, { ...INITIAL_CROP, x: 1 }), {
    x: 600,
    y: 0,
    width: 600,
    height: 600,
  });
  assert.deepEqual(cropRectangle(1200, 600, 1, { ...INITIAL_CROP, zoom: 2 }), {
    x: 450,
    y: 150,
    width: 300,
    height: 300,
  });
  assert.deepEqual(cropRectangle(1200, 600, 1, { ...INITIAL_CROP, rotation: 90 }), {
    x: 0,
    y: 300,
    width: 600,
    height: 600,
  });
  assert.deepEqual(cropRectangle(1200, 600, 2, INITIAL_CROP), {
    x: 0,
    y: 0,
    width: 1200,
    height: 600,
  });
});
test('dragging, keyboard motion and zoom cannot expose empty borders on any image orientation', () => {
  for (const [width, height] of [
    [1200, 600],
    [600, 1200],
    [16, 16],
    [1, 10],
  ])
    for (const aspect of [1, 16 / 9, 4 / 3, 3 / 4])
      for (const rotation of [0, 90, 180, 270])
        for (const zoom of [0.5, 1, 2, 6, 10])
          for (const x of [-1, 0, 0.5, 1, 2]) {
            const state = constrainCrop(width, height, aspect, { x, y: 1 - x, rotation, zoom });
            const r = cropRectangle(width, height, aspect, state),
              size = rotatedSize(width, height, rotation);
            assert.ok(
              r.x >= 0 &&
                r.y >= 0 &&
                r.x + r.width <= size.width + 1e-8 &&
                r.y + r.height <= size.height + 1e-8,
            );
            assert.ok(Math.abs(r.width / r.height - aspect) < 1e-8);
            assert.ok(state.zoom >= 1 && state.zoom <= 6);
          }
});
