// Turns whatever someone pasted into a full HTML page a widget window can load.
// People paste straight from Claude or ChatGPT, so markdown code fences are stripped, and a bare snippet
// (just some HTML, or HTML with a <style> and <script>) is wrapped in a page with a transparent background.

/** Removes a ```html ... ``` (or plain ```) fence around the code, and any chat text outside it. */
function stripFences(code) {
  const text = String(code ?? "");
  const fence = text.match(/```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)```/);
  return (fence ? fence[1] : text).trim();
}

/** True when the code is already a whole page (it has its own <html> or <body>). */
function isFullPage(code) {
  return /<html[\s>]|<body[\s>]|<!doctype html/i.test(code);
}

const BASE_STYLE =
  "html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}";

/** The page a widget (or the preview) shows for the pasted code. */
function toDocument(code) {
  const body = stripFences(code);
  if (!body) return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLE}</style></head><body></body></html>`;
  if (isFullPage(body)) return body;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_STYLE}</style></head><body>${body}</body></html>`;
}

/** Keeps a widget size sensible: whole pixels between 60 and 4000. */
function clampSize(n, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(4000, Math.max(60, v));
}

module.exports = { stripFences, isFullPage, toDocument, clampSize };
