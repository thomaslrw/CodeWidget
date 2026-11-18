// Where widgets go on the screen. Pure maths, so it can be tested without Electron.
// Rectangles are { x, y, w, h }. An area is a screen's work area { x, y, width, height }.
const GAP = 16; // space between widgets, and between widgets and the screen edge
const SNAP = 14; // how close a drop has to be before it snaps

/**
 * The first free spot for a new widget: starts at the top right and fills downwards, then leftwards,
 * like Mac widgets. Returns null when there's no room left.
 */
function freeSpot(area, taken, width, height) {
  const clear = (x, y) =>
    !taken.some((r) => x < r.x + r.w + GAP && x + width + GAP > r.x && y < r.y + r.h + GAP && y + height + GAP > r.y);
  for (let x = area.x + area.width - GAP - width; x >= area.x + GAP; x -= 8) {
    for (let y = area.y + GAP; y + height <= area.y + area.height - GAP; y += 8) {
      if (clear(x, y)) return { x, y };
    }
  }
  return null;
}

/** Where a dropped widget should end up: lined up with a nearby screen edge or widget, if it's close. */
function snap(b, area, others) {
  const xs = [area.x + GAP, area.x + area.width - GAP - b.w];
  const ys = [area.y + GAP, area.y + area.height - GAP - b.h];
  for (const r of others) {
    const near = b.x < r.x + r.w + 80 && b.x + b.w + 80 > r.x && b.y < r.y + r.h + 80 && b.y + b.h + 80 > r.y;
    if (!near) continue;
    xs.push(r.x, r.x + r.w - b.w, r.x + r.w + GAP, r.x - GAP - b.w);
    ys.push(r.y, r.y + r.h - b.h, r.y + r.h + GAP, r.y - GAP - b.h);
  }
  const closest = (v, list) => list.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), Infinity);
  const cx = closest(b.x, xs);
  const cy = closest(b.y, ys);
  return {
    x: Math.round(Math.abs(cx - b.x) <= SNAP ? cx : b.x),
    y: Math.round(Math.abs(cy - b.y) <= SNAP ? cy : b.y),
  };
}

module.exports = { freeSpot, snap, GAP, SNAP };
