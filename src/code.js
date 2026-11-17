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

/** Code shared from the website in a codewidget://open link: base64url text in the "code" parameter. */
function readOpenLink(link) {
  try {
    const url = new URL(link);
    if (url.protocol !== "codewidget:") return null;
    const raw = url.searchParams.get("code") || "";
    const code = decodeText(raw);
    if (!code.trim()) return null;
    return {
      code,
      name: (url.searchParams.get("name") || "").slice(0, 60),
      width: clampSize(url.searchParams.get("w"), 400),
      height: clampSize(url.searchParams.get("h"), 200),
    };
  } catch {
    return null;
  }
}

/** base64url (as the website writes it) back to text. */
function decodeText(b64) {
  const s = String(b64).replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") return Buffer.from(s, "base64").toString("utf8");
  return decodeURIComponent(escape(atob(s)));
}

/** Text to base64url, for building a codewidget://open link. */
function encodeText(text) {
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(String(text), "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(String(text))));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const api = { stripFences, isFullPage, toDocument, clampSize, readOpenLink, decodeText, encodeText };
// The same file runs in the app (Node) and on the website (a plain script), so the preview matches.
if (typeof module !== "undefined" && module.exports) module.exports = api;
else if (typeof window !== "undefined") window.CodeWidget = api;
