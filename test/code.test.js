const test = require("node:test");
const assert = require("node:assert");
const { stripFences, isFullPage, toDocument, clampSize } = require("../src/code");

test("strips a markdown fence and the chat text around it", () => {
  const pasted = "Here's your widget:\n```html\n<div>Hi</div>\n```\nEnjoy!";
  assert.strictEqual(stripFences(pasted), "<div>Hi</div>");
});

test("leaves code without a fence alone", () => {
  assert.strictEqual(stripFences("  <p>x</p>  "), "<p>x</p>");
});

test("wraps a snippet in a transparent page", () => {
  const doc = toDocument("<div id=a>1</div><script>a.textContent=2</script>");
  assert.match(doc, /^<!doctype html>/);
  assert.match(doc, /background:transparent/);
  assert.match(doc, /<body><div id=a>1<\/div><script>/);
});

test("keeps a full page as it is", () => {
  const page = "<!DOCTYPE html><html><body>x</body></html>";
  assert.ok(isFullPage(page));
  assert.strictEqual(toDocument(page), page);
});

test("an empty paste gives an empty page, not an error", () => {
  assert.match(toDocument(""), /<body><\/body>/);
});

test("sizes are kept between 60 and 4000", () => {
  assert.strictEqual(clampSize(10, 300), 60);
  assert.strictEqual(clampSize(99999, 300), 4000);
  assert.strictEqual(clampSize("abc", 300), 300);
  assert.strictEqual(clampSize(250.6, 300), 251);
});

test("a link from the website round-trips the code, name and size", () => {
  const { encodeText, readOpenLink } = require("../src/code");
  const code = "<b>héllo ✓</b>\n<script>let a = 1 + 2 / 3;</script>";
  const link = `codewidget://open?code=${encodeText(code)}&name=My%20widget&w=320&h=9`;
  assert.deepStrictEqual(readOpenLink(link), { code, name: "My widget", width: 320, height: 60 });
});

test("links that aren't ours, or have no code, are ignored", () => {
  const { readOpenLink } = require("../src/code");
  assert.strictEqual(readOpenLink("https://example.com/?code=abc"), null);
  assert.strictEqual(readOpenLink("codewidget://open"), null);
  assert.strictEqual(readOpenLink("not a link"), null);
});
