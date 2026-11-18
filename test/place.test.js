const test = require("node:test");
const assert = require("node:assert");
const { freeSpot, snap } = require("../src/place");

const area = { x: 0, y: 25, width: 1440, height: 850 };

test("first widget goes in the top right corner", () => {
  assert.deepStrictEqual(freeSpot(area, [], 400, 200), { x: 1440 - 16 - 400, y: 25 + 16 });
});

test("next widgets stack below, then start a new column, never overlapping", () => {
  const taken = [];
  for (let i = 0; i < 8; i++) {
    const s = freeSpot(area, taken, 400, 200);
    assert.ok(s, `widget ${i} found a spot`);
    for (const r of taken) {
      const overlap = s.x < r.x + r.w && s.x + 400 > r.x && s.y < r.y + r.h && s.y + 200 > r.y;
      assert.ok(!overlap, `widget ${i} overlaps`);
    }
    assert.ok(s.x >= 16 && s.y >= 41 && s.x + 400 <= 1424 && s.y + 200 <= 859);
    taken.push({ x: s.x, y: s.y, w: 400, h: 200 });
  }
  assert.strictEqual(taken[1].x, taken[0].x);
  assert.strictEqual(taken[1].y, taken[0].y + 200 + 16);
});

test("returns null when the screen is full", () => {
  assert.strictEqual(freeSpot(area, [{ x: 0, y: 0, w: 1440, h: 900 }], 200, 200), null);
});

test("a drop near the screen edge snaps to it", () => {
  assert.deepStrictEqual(snap({ x: 1030, y: 50, w: 400, h: 200 }, area, []), { x: 1024, y: 41 });
});

test("a drop near another widget lines up with it", () => {
  const other = { x: 600, y: 300, w: 300, h: 200 };
  assert.deepStrictEqual(snap({ x: 607, y: 522, w: 300, h: 200 }, area, [other]), { x: 600, y: 516 });
});

test("a drop in open space snaps to the desktop grid", () => {
  // Grid starts 16px in from the top left of the work area (x 16, y 41) and steps every 16px.
  assert.deepStrictEqual(snap({ x: 503, y: 402, w: 200, h: 200 }, area, []), { x: 496, y: 409 });
});

test("a drop on top of another widget moves to the nearest free spot", () => {
  const other = { x: 400, y: 300, w: 400, h: 200 };
  const s = snap({ x: 420, y: 320, w: 200, h: 200 }, area, [other]);
  const hit = s.x < other.x + other.w + 16 && s.x + 200 + 16 > other.x && s.y < other.y + other.h + 16 && s.y + 200 + 16 > other.y;
  assert.ok(!hit, JSON.stringify(s));
  assert.ok(Math.hypot(s.x - 420, s.y - 320) < 260, "stays close to where it was dropped");
});

test("a drop half off the screen is pulled back on", () => {
  const s = snap({ x: 1300, y: 800, w: 400, h: 200 }, area, []);
  assert.deepStrictEqual(s, { x: 1024, y: 659 });
});
