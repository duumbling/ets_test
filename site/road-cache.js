/* ETS2 Navigator static road layer. Pre-rasterized once; panning requires no graph traversal. */
(function (root, factory) {
  'use strict';
  const lib = factory();
  root.ETS2RoadCache = lib;
  if (typeof module === 'object' && module.exports) module.exports = lib;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(points, roads, bounds, maxDimension = 3072) {
    if (!points?.length || !roads?.length) throw new Error('Road cache needs points and roads');
    const size = Math.min(4096, Math.max(512, Math.round(maxDimension)));
    const padding = 8;
    const scale = (size - padding * 2) / Math.max(bounds.dx, bounds.dz);
    const minX = bounds.cx - bounds.dx / 2 - padding / scale;
    const minZ = bounds.cz - bounds.dz / 2 - padding / scale;
    const width = Math.min(size, Math.ceil(bounds.dx * scale + padding * 2));
    const height = Math.min(size, Math.ceil(bounds.dz * scale + padding * 2));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Canvas 2D is unavailable');

    context.strokeStyle = '#355266';
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    for (let i = 0; i < roads.length; i++) {
      const [from, to] = roads[i];
      const a = points[from], b = points[to];
      context.moveTo((a[0] - minX) * scale, (a[1] - minZ) * scale);
      context.lineTo((b[0] - minX) * scale, (b[1] - minZ) * scale);
    }
    context.stroke();

    // Draw only the portion of the cached image that intersects the viewport.
    // No edge iteration, clipping of individual links or raster rebuild on drag.
    function draw(target, worldScale, left, top, cx, cz, viewportWidth, viewportHeight) {
      const pixelScale = worldScale / scale;
      const x = left + (minX - cx) * worldScale;
      const y = top + (minZ - cz) * worldScale;
      const sourceX = Math.max(0, -x / pixelScale);
      const sourceY = Math.max(0, -y / pixelScale);
      const sourceRight = Math.min(width, (viewportWidth - x) / pixelScale);
      const sourceBottom = Math.min(height, (viewportHeight - y) / pixelScale);
      const sw = sourceRight - sourceX, sh = sourceBottom - sourceY;
      if (sw <= 0 || sh <= 0) return;
      target.drawImage(canvas, sourceX, sourceY, sw, sh,
        x + sourceX * pixelScale, y + sourceY * pixelScale,
        sw * pixelScale, sh * pixelScale);
    }

    return { draw, width, height };
  }

  return { create };
});
