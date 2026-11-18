// macOS: keep widgets on the desktop.
// By default macOS treats every window the same, so "Click wallpaper to reveal desktop" (and Show Desktop)
// sweeps widgets off the screen with everything else. Marking the window "stationary" tells macOS it
// belongs to the desktop, like Apple's own widgets, so it stays put.
// Electron has no setting for this, so it's set directly with a tiny call into macOS (via koffi).
// If anything goes wrong the widget still works, it just behaves like a normal window.
let api = null;

function load() {
  if (api !== null) return api;
  api = false;
  try {
    const koffi = require("koffi");
    const objc = koffi.load("/usr/lib/libobjc.A.dylib");
    api = {
      sel: objc.func("sel_registerName", "uint64_t", ["str"]),
      get: objc.func("objc_msgSend", "uint64_t", ["uint64_t", "uint64_t"]),
      set: objc.func("objc_msgSend", "void", ["uint64_t", "uint64_t", "uint64_t"]),
    };
  } catch (e) {
    console.error("Could not keep widgets on the desktop", e);
  }
  return api;
}

const ALL_SPACES = 1n << 0n;
const MANAGED = 1n << 2n;
const TRANSIENT = 1n << 3n;
const STATIONARY = 1n << 4n;
const IGNORES_CYCLE = 1n << 6n;

function stickToDesktop(win) {
  if (process.platform !== "darwin" || !win || win.isDestroyed()) return false;
  const a = load();
  if (!a) return false;
  try {
    const view = win.getNativeWindowHandle().readBigUInt64LE(0);
    const nsWindow = BigInt(a.get(view, a.sel("window")));
    if (!nsWindow) return false;
    const now = BigInt(a.get(nsWindow, a.sel("collectionBehavior")));
    const next = (now & ~(MANAGED | TRANSIENT)) | STATIONARY | ALL_SPACES | IGNORES_CYCLE;
    a.set(nsWindow, a.sel("setCollectionBehavior:"), next);
    return true;
  } catch (e) {
    console.error("Could not keep this widget on the desktop", e);
    return false;
  }
}

module.exports = { stickToDesktop };
