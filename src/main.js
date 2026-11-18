// CodeWidget: paste widget code, preview it, and pin it to the desktop as its own window.
//
// Pages are served from a private cw:// scheme:
//   cw://app/...      the app's own pages (the editor and the widget frame)
//   cw://preview/     the code currently in the editor
//   cw://w-<id>/      one saved widget. Each widget has its own origin, so its localStorage is its own and
//                     survives restarts.
// Widget code runs in a sandboxed iframe with no access to Node, the file system or the app's internals.
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  protocol,
  shell,
  screen,
  session,
  clipboard,
  nativeImage,
  net,
} = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { toDocument, clampSize, readOpenLink } = require("./code");
const { freeSpot, snap } = require("./place");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "cw",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

// A second launch (e.g. a codewidget:// link on Windows or Linux) hands its link to the running app and quits.
const launchLink = process.argv.find((a) => typeof a === "string" && a.startsWith("codewidget://")) || null;
if (!app.requestSingleInstanceLock({ link: launchLink })) {
  app.quit();
  process.exit(0);
}

const RENDERER = path.join(__dirname, "..", "renderer");
const ASSETS = path.join(__dirname, "..", "assets");
const IS_MAC = process.platform === "darwin";

// ---------- Saved widgets ----------

let storePath = "";
let store = { widgets: [] };
let saveTimer = null;

function loadStore() {
  storePath = path.join(app.getPath("userData"), "widgets.json");
  try {
    const data = JSON.parse(fs.readFileSync(storePath, "utf8"));
    if (data && Array.isArray(data.widgets)) store = data;
  } catch {
    store = { widgets: [] };
  }
}

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const tmp = `${storePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, storePath);
  } catch (e) {
    console.error("Could not save widgets", e);
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

const findWidget = (id) => store.widgets.find((w) => w.id === id);
const summary = (w) => ({
  id: w.id,
  name: w.name,
  width: w.width,
  height: w.height,
  onTop: !!w.onTop,
  hidden: !!w.hidden,
});

// ---------- Serving pages ----------

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let previewCode = "";

const htmlResponse = (body) => new Response(body, { headers: { "content-type": TYPES[".html"] } });
const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });

function handleRequest(request) {
  const url = new URL(request.url);
  const host = url.hostname;
  const page = url.pathname === "/" || url.pathname === "/index.html";
  if (host === "app") {
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "editor.html";
    const file = path.normalize(path.join(RENDERER, rel));
    if (!file.startsWith(RENDERER + path.sep)) return notFound();
    try {
      const body = fs.readFileSync(file);
      return new Response(body, { headers: { "content-type": TYPES[path.extname(file)] || "application/octet-stream" } });
    } catch {
      return notFound();
    }
  }
  if (host === "preview" && page) return htmlResponse(toDocument(previewCode));
  const m = host.match(/^w-([a-z0-9]+)$/);
  if (m && page) {
    const w = findWidget(m[1]);
    if (w) return htmlResponse(toDocument(w.code));
  }
  return notFound();
}

// ---------- Windows ----------

let editor = null;
let pendingEdit = null;
let tray = null;
const widgetWindows = new Map(); // widget id -> BrowserWindow

function notifyEditor() {
  if (editor && !editor.isDestroyed()) editor.webContents.send("widgets:changed");
  buildTrayMenu();
}

function openEditor(editId) {
  if (editor && !editor.isDestroyed()) {
    if (editor.isMinimized()) editor.restore();
    editor.show();
    editor.focus();
    if (editId) editor.webContents.send("editor:edit", editId);
    return;
  }
  pendingEdit = editId || null;
  editor = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 780,
    minHeight: 520,
    title: "CodeWidget",
    backgroundColor: "#0b0b0b",
    show: false,
    autoHideMenuBar: true,
    icon: path.join(ASSETS, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload-editor.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  editor.loadURL("cw://app/editor.html");
  editor.once("ready-to-show", () => editor.show());
  editor.on("closed", () => {
    editor = null;
  });
}

// ---------- Placing widgets ----------
// New widgets go into the first free spot, starting at the top right of the main screen and filling
// downwards then leftwards, like Mac widgets. They never land on top of another widget.
// When a widget is dragged and dropped near a screen edge or another widget, it snaps into line.
/** The current spot of every other visible widget. */
function otherRects(skipId) {
  const rects = [];
  for (const o of store.widgets) {
    if (o.id === skipId || o.hidden) continue;
    const win = widgetWindows.get(o.id);
    if (win && !win.isDestroyed()) {
      const b = win.getBounds();
      rects.push({ x: b.x, y: b.y, w: b.width, h: b.height });
    } else if (Number.isFinite(o.x) && Number.isFinite(o.y)) {
      rects.push({ x: o.x, y: o.y, w: o.width, h: o.height });
    }
  }
  return rects;
}

function freeSpotFor(width, height, skipId) {
  const a = screen.getPrimaryDisplay().workArea;
  const spot = freeSpot(a, otherRects(skipId), width, height);
  if (spot) return spot;
  // The screen is full: centre it, nudged so it doesn't sit exactly on another one.
  const n = widgetWindows.size % 8;
  return {
    x: Math.round(a.x + (a.width - width) / 2 + n * 28),
    y: Math.round(a.y + (a.height - height) / 2 + n * 28),
  };
}

/** Puts a saved position back on a screen that still exists, or finds a free spot. */
function placeOnScreen(w) {
  const displays = screen.getAllDisplays();
  const fits =
    Number.isFinite(w.x) &&
    Number.isFinite(w.y) &&
    displays.some((d) => {
      const a = d.workArea;
      return w.x + 40 > a.x && w.y + 20 > a.y && w.x < a.x + a.width - 40 && w.y < a.y + a.height - 20;
    });
  if (fits) return { x: w.x, y: w.y };
  return freeSpotFor(w.width, w.height, w.id);
}

/** Snaps a dropped widget into line with the screen edges and nearby widgets. */
function snapWidget(id) {
  const win = widgetWindows.get(id);
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const { x, y } = snap({ x: b.x, y: b.y, w: b.width, h: b.height }, screen.getDisplayMatching(b).workArea, otherRects(id));
  if (x !== b.x || y !== b.y) win.setPosition(x, y);
  rememberBounds(id);
}

function rememberBounds(id) {
  const win = widgetWindows.get(id);
  const w = findWidget(id);
  if (!win || win.isDestroyed() || !w) return;
  const b = win.getBounds();
  Object.assign(w, { x: b.x, y: b.y, width: b.width, height: b.height });
  save();
}

function openWidget(w) {
  const existing = widgetWindows.get(w.id);
  if (existing && !existing.isDestroyed()) {
    existing.showInactive();
    return existing;
  }
  const pos = placeOnScreen(w);
  const win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: w.width,
    height: w.height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false, // resized with the frame's own grip, which works the same on every system
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: !!w.onTop,
    show: false,
    title: w.name || "Widget",
    webPreferences: {
      preload: path.join(__dirname, "preload-widget.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  try {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false, skipTransformProcessType: true });
  } catch {
    // Not supported on every system.
  }
  win.loadURL(`cw://app/widget.html?id=${w.id}`);
  win.once("ready-to-show", () => win.showInactive());
  let moveTimer = null;
  win.on("move", () => {
    clearTimeout(moveTimer);
    // Linux has no "moved" event, so it snaps once the widget has stopped moving.
    moveTimer = setTimeout(() => (process.platform === "linux" ? snapWidget(w.id) : rememberBounds(w.id)), 300);
  });
  // Mac and Windows: snap once, when the drag ends.
  win.on("moved", () => snapWidget(w.id));
  win.on("closed", () => widgetWindows.delete(w.id));
  widgetWindows.set(w.id, win);
  return win;
}

function closeWidgetWindow(id) {
  const win = widgetWindows.get(id);
  if (win && !win.isDestroyed()) win.destroy();
  widgetWindows.delete(id);
}

function setHidden(id, hidden) {
  const w = findWidget(id);
  if (!w) return;
  w.hidden = !!hidden;
  if (w.hidden) closeWidgetWindow(id);
  else openWidget(w);
  save();
  notifyEditor();
}

function setOnTop(id, onTop) {
  const w = findWidget(id);
  if (!w) return;
  w.onTop = !!onTop;
  const win = widgetWindows.get(id);
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(w.onTop);
    win.webContents.send("widget:state", summary(w));
  }
  save();
  notifyEditor();
}

const idOfSender = (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  for (const [id, w] of widgetWindows) if (w === win) return id;
  return null;
};

// ---------- Open at login ----------
// Widgets are drawn by the app, so the app has to be running for them to show. Opening at login keeps
// them on the desktop after a restart. It's on by default (the first time the app runs) and can be
// turned off in the editor or the menu bar menu.
// Mac and Windows use the system setting. Linux has no system setting, so the app writes a standard
// autostart file (only for the AppImage, which has a fixed path to start).
const LINUX_AUTOSTART = path.join(app.getPath("home"), ".config", "autostart", "codewidget.desktop");

function getOpenAtLogin() {
  if (process.platform === "linux") return fs.existsSync(LINUX_AUTOSTART);
  return app.getLoginItemSettings().openAtLogin;
}

function setOpenAtLogin(on) {
  try {
    if (process.platform !== "linux") {
      app.setLoginItemSettings({ openAtLogin: on, args: ["--hidden"] });
    } else if (!on) {
      fs.rmSync(LINUX_AUTOSTART, { force: true });
    } else if (process.env.APPIMAGE) {
      fs.mkdirSync(path.dirname(LINUX_AUTOSTART), { recursive: true });
      fs.writeFileSync(
        LINUX_AUTOSTART,
        `[Desktop Entry]\nType=Application\nName=CodeWidget\nExec="${process.env.APPIMAGE}" --hidden\nX-GNOME-Autostart-enabled=true\n`,
      );
    }
  } catch (e) {
    console.error("Could not change open at login", e);
  }
}

// ---------- Updates ----------
// The app checks GitHub for a newer release and shows a small notice with a Download button.
// It never downloads or installs anything by itself.
const DOWNLOAD_URL = "https://thomaslrw.github.io/CodeWidget/#download";
let update = null;

function isNewer(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function checkForUpdate() {
  try {
    const res = await net.fetch("https://api.github.com/repos/thomaslrw/CodeWidget/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "CodeWidget" },
    });
    if (!res.ok) return;
    const version = String((await res.json()).tag_name || "").replace(/^v/i, "");
    if (!/^\d+(\.\d+){0,2}$/.test(version) || !isNewer(version, app.getVersion())) return;
    update = { version, url: DOWNLOAD_URL };
    if (editor && !editor.isDestroyed()) editor.webContents.send("update:available", update);
    buildTrayMenu();
  } catch {
    // Offline or GitHub unreachable: try again later.
  }
}

// ---------- Tray (menu bar on Mac) ----------

function buildTrayMenu() {
  if (!tray) return;
  const items = [
    ...(update ? [{ label: `Update available (v${update.version})`, click: () => shell.openExternal(DOWNLOAD_URL) }] : []),
    { label: "Open CodeWidget", click: () => openEditor() },
    { type: "separator" },
    ...store.widgets.map((w) => ({
      label: w.name || "Untitled widget",
      type: "checkbox",
      checked: !w.hidden,
      click: (item) => setHidden(w.id, !item.checked),
    })),
    ...(store.widgets.length ? [{ type: "separator" }] : []),
    {
      label: "Show all widgets",
      enabled: store.widgets.length > 0,
      click: () => store.widgets.forEach((w) => w.hidden && setHidden(w.id, false)),
    },
    {
      label: "Hide all widgets",
      enabled: store.widgets.length > 0,
      click: () => store.widgets.forEach((w) => !w.hidden && setHidden(w.id, true)),
    },
    { type: "separator" },
    {
      label: "Open at login (keeps widgets on your desktop)",
      type: "checkbox",
      checked: getOpenAtLogin(),
      click: (item) => {
        setOpenAtLogin(item.checked);
        store.openAtLoginSet = true;
        save();
        buildTrayMenu();
        if (editor && !editor.isDestroyed()) editor.webContents.send("settings:changed");
      },
    },
    { label: "Quit CodeWidget", click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, IS_MAC ? "trayTemplate.png" : "tray.png"));
  if (IS_MAC) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("CodeWidget");
  if (!IS_MAC) tray.on("click", () => openEditor());
  buildTrayMenu();
}

// ---------- Messages from the pages ----------

function registerIpc() {
  ipcMain.handle("update:get", () => update);
  ipcMain.handle("update:open", () => shell.openExternal(DOWNLOAD_URL));

  ipcMain.handle("preview:set", (_e, code) => {
    previewCode = String(code ?? "");
    return true;
  });

  ipcMain.handle("widgets:list", () => store.widgets.map(summary));
  ipcMain.handle("widgets:get", (_e, id) => {
    const w = findWidget(id);
    return w ? { ...summary(w), code: w.code } : null;
  });

  ipcMain.handle("widgets:add", (_e, input) => {
    const w = {
      id: crypto.randomBytes(6).toString("hex"),
      name: String(input?.name || "").trim().slice(0, 60) || `Widget ${store.widgets.length + 1}`,
      code: String(input?.code ?? ""),
      width: clampSize(input?.width, 300),
      height: clampSize(input?.height, 200),
      onTop: false,
      hidden: false,
    };
    store.widgets.push(w);
    const win = openWidget(w);
    rememberBounds(w.id);
    save();
    notifyEditor();
    return { id: w.id, shown: !!win };
  });

  ipcMain.handle("widgets:update", (_e, id, input) => {
    const w = findWidget(id);
    if (!w) return false;
    w.name = String(input?.name || "").trim().slice(0, 60) || w.name;
    w.code = String(input?.code ?? "");
    w.width = clampSize(input?.width, w.width);
    w.height = clampSize(input?.height, w.height);
    w.hidden = false;
    const win = widgetWindows.get(id);
    if (win && !win.isDestroyed()) {
      win.setBounds({ width: w.width, height: w.height });
      win.webContents.reload();
      win.showInactive();
    } else openWidget(w);
    save();
    notifyEditor();
    return true;
  });

  ipcMain.handle("widgets:remove", (_e, id) => {
    closeWidgetWindow(id);
    store.widgets = store.widgets.filter((w) => w.id !== id);
    save();
    notifyEditor();
    return true;
  });

  ipcMain.handle("widgets:setHidden", (_e, id, hidden) => setHidden(id, hidden));
  ipcMain.handle("widgets:setOnTop", (_e, id, onTop) => setOnTop(id, onTop));

  ipcMain.handle("editor:pendingEdit", () => {
    const id = pendingEdit;
    pendingEdit = null;
    return id;
  });

  ipcMain.handle("editor:pendingImport", () => {
    const data = pendingImport;
    pendingImport = null;
    return data;
  });

  ipcMain.handle("clipboard:write", (_e, text) => {
    clipboard.writeText(String(text ?? ""));
    return true;
  });

  ipcMain.handle("settings:get", () => ({
    openAtLogin: getOpenAtLogin(),
    platform: process.platform,
    version: app.getVersion(),
  }));
  ipcMain.handle("settings:setOpenAtLogin", (_e, on) => {
    setOpenAtLogin(!!on);
    store.openAtLoginSet = true;
    save();
    buildTrayMenu();
    return getOpenAtLogin();
  });

  // From a widget's own frame. The widget is worked out from the window that sent the message.
  ipcMain.handle("widget:info", (event) => {
    const id = idOfSender(event);
    const w = id && findWidget(id);
    return w ? summary(w) : null;
  });
  ipcMain.on("widget:resize", (event, width, height) => {
    const id = idOfSender(event);
    const win = id && widgetWindows.get(id);
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    win.setBounds({ x: b.x, y: b.y, width: clampSize(width, b.width), height: clampSize(height, b.height) });
  });
  ipcMain.on("widget:resized", (event) => {
    const id = idOfSender(event);
    if (!id) return;
    rememberBounds(id);
    notifyEditor();
  });
  ipcMain.on("widget:hide", (event) => {
    const id = idOfSender(event);
    if (id) setHidden(id, true);
  });
  ipcMain.on("widget:toggleTop", (event) => {
    const id = idOfSender(event);
    const w = id && findWidget(id);
    if (w) setOnTop(id, !w.onTop);
  });
  ipcMain.on("widget:edit", (event) => {
    const id = idOfSender(event);
    if (id) openEditor(id);
  });
}

// ---------- Opening code from the website (codewidget://open?code=...) ----------

let pendingImport = null;

function handleOpenLink(link) {
  const data = readOpenLink(link);
  if (!data) return;
  pendingImport = data;
  if (!app.isReady()) return; // picked up when the editor first loads
  if (editor && !editor.isDestroyed()) {
    editor.webContents.send("editor:import", data);
    pendingImport = null;
  }
  openEditor();
}

const linkIn = (argv) => argv.find((a) => typeof a === "string" && a.startsWith("codewidget://"));

// Mac sends links here (before or after the app is ready).
app.on("open-url", (event, link) => {
  event.preventDefault();
  handleOpenLink(link);
});

// ---------- Safety ----------

function lockDown() {
  // Widgets can't ask for the camera, microphone, location or anything else.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(["clipboard-sanitized-write", "fullscreen"].includes(permission));
  });
  app.on("web-contents-created", (_e, contents) => {
    // Links that open a new window go to the normal browser instead.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    // A page can never replace the editor or a widget frame with a website.
    contents.on("will-navigate", (event, url) => {
      if (url.startsWith("cw://")) return;
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    });
  });
}

// ---------- Start ----------

// Windows and Linux open links by starting the app again with the link as an argument.
app.on("second-instance", (_e, argv, _cwd, extra) => {
  const link = (extra && extra.link) || linkIn(argv);
  if (link) handleOpenLink(link);
  else openEditor();
});
app.on("activate", () => openEditor());
// Keep running in the tray when the editor is closed, so the widgets stay on the desktop.
app.on("window-all-closed", () => {});
app.on("before-quit", saveNow);

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient("codewidget", process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient("codewidget");
}
{
  const link = linkIn(process.argv);
  if (link) handleOpenLink(link);
}

app.whenReady().then(() => {
  loadStore();
  if (!store.openAtLoginSet && !process.defaultApp) {
    setOpenAtLogin(true);
    store.openAtLoginSet = true;
    save();
  }
  lockDown();
  protocol.handle("cw", handleRequest);
  registerIpc();
  createTray();
  store.widgets.filter((w) => !w.hidden).forEach(openWidget);
  checkForUpdate();
  setInterval(checkForUpdate, 6 * 60 * 60 * 1000);
  const atLogin = process.argv.includes("--hidden") || app.getLoginItemSettings().wasOpenedAtLogin;
  if (!atLogin || store.widgets.length === 0 || pendingImport) openEditor();
});
