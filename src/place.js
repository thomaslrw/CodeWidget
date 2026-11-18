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

const GRID = 16; // the invisible desktop grid every drop snaps to

const overlaps = (x, y, w, h, others) =>
  others.some((r) => x < r.x + r.w + GAP && x + w + GAP > r.x && y < r.y + r.h + GAP && y + h + GAP > r.y);

/**
 * Where a dropped widget should end up, like Mac widgets:
 * 1. Close to a screen edge or another widget: it lines up with it, with an even gap.
 * 2. Anywhere else: it snaps to an invisible grid across the desktop.
 * 3. If that spot is on top of another widget, it moves to the nearest free spot instead.
 */
function snap(b, area, others) {
  const near = others.filter(
    (r) => b.x < r.x + r.w + 80 && b.x + b.w + 80 > r.x && b.y < r.y + r.h + 80 && b.y + b.h + 80 > r.y,
  );
  const xs = [area.x + GAP, area.x + area.width - GAP - b.w];
  const ys = [area.y + GAP, area.y + area.height - GAP - b.h];
  for (const r of near) {
    xs.push(r.x, r.x + r.w - b.w, r.x + r.w + GAP, r.x - GAP - b.w);
    ys.push(r.y, r.y + r.h - b.h, r.y + r.h + GAP, r.y - GAP - b.h);
  }
  const toGrid = (v, start) => start + Math.round((v - start) / GRID) * GRID;
  const pick = (v, list, start) => {
    const c = list.reduce((best, n) => (Math.abs(n - v) < Math.abs(best - v) ? n : best), Infinity);
    return Math.abs(c - v) <= SNAP ? c : toGrid(v, start);
  };
  // Keep it on the screen.
  const minX = area.x + GAP, maxX = area.x + area.width - GAP - b.w;
  const minY = area.y + GAP, maxY = area.y + area.height - GAP - b.h;
  const clamp = (v, lo, hi) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));
  let x = clamp(pick(b.x, xs, area.x + GAP), minX, maxX);
  let y = clamp(pick(b.y, ys, area.y + GAP), minY, maxY);

  if (overlaps(x, y, b.w, b.h, others)) {
    // Find the nearest free spot: grid spots plus spots lined up with other widgets.
    const cx = [...xs], cy = [...ys];
    for (const r of others) {
      cx.push(r.x, r.x + r.w + GAP, r.x - GAP - b.w);
      cy.push(r.y, r.y + r.h + GAP, r.y - GAP - b.h);
    }
    for (let v = minX; v <= maxX; v += GRID) cx.push(v);
    for (let v = minY; v <= maxY; v += GRID) cy.push(v);
    let best = null;
    for (const px of cx) {
      if (px < minX || px > maxX) continue;
      for (const py of cy) {
        if (py < minY || py > maxY || overlaps(px, py, b.w, b.h, others)) continue;
        const d = (px - b.x) ** 2 + (py - b.y) ** 2;
        if (!best || d < best.d) best = { x: px, y: py, d };
      }
    }
    if (best) ({ x, y } = best);
  }
  return { x: Math.round(x), y: Math.round(y) };
}

module.exports = { freeSpot, snap, GAP, SNAP, GRID };
