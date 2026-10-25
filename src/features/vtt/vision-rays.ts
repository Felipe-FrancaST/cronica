/** The summed-area index skips rays across empty rectangles. Any potentially
 * obstructed rectangle still uses the original exact ray and corner rules. */
export function createSightTest(blocks: Uint8Array, width: number, height: number) {
  if (!blocks.some(Boolean))
    return (_fromX: number, _fromY: number, _toX: number, _toY: number) => true;
  const stride = width + 1,
    prefix = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      count += blocks[y * width + x] ? 1 : 0;
      prefix[(y + 1) * stride + x + 1] = prefix[y * stride + x + 1] + count;
    }
  }
  return (fromX: number, fromY: number, toX: number, toY: number) => {
    const x0 = Math.min(fromX, toX),
      x1 = Math.max(fromX, toX) + 1;
    const y0 = Math.min(fromY, toY),
      y1 = Math.max(fromY, toY) + 1;
    const count =
      prefix[y1 * stride + x1] -
      prefix[y0 * stride + x1] -
      prefix[y1 * stride + x0] +
      prefix[y0 * stride + x0];
    // A wall at the source or destination doesn't obstruct the segment's interior.
    const endpoints =
      (blocks[fromY * width + fromX] ? 1 : 0) +
      (fromX === toX && fromY === toY ? 0 : blocks[toY * width + toX] ? 1 : 0);
    return count <= endpoints || traceSightRay(blocks, width, height, fromX, fromY, toX, toY);
  };
}

/** Exact grid ray used when an obstruction can intersect the ray. */
export function traceSightRay(
  blocks: Uint8Array,
  width: number,
  height: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  let x = fromX,
    y = fromY;
  const dx = Math.abs(toX - x),
    dy = Math.abs(toY - y);
  const sx = x < toX ? 1 : -1,
    sy = y < toY ? 1 : -1;
  let err = dx - dy;
  while (x !== toX || y !== toY) {
    const prevX = x,
      prevY = y,
      twice = err * 2;
    if (twice > -dy) {
      err -= dy;
      x += sx;
    }
    if (twice < dx) {
      err += dx;
      y += sy;
    }
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    // A blocked target may be seen, but nothing behind it may be seen.
    if (x !== toX || y !== toY) {
      if (blocks[y * width + x]) return false;
      // Prevent diagonal peeking through a two-wall corner.
      if (x !== prevX && y !== prevY && blocks[prevY * width + x] && blocks[y * width + prevX])
        return false;
    }
  }
  return true;
}
