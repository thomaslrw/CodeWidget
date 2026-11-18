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

test("a drop far from everything stays where it was put", () => {
  assert.deepStrictEqual(snap({ x: 500, y: 400, w: 200, h: 200 }, area, []), { x: 500, y: 400 });
});
