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
} = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { toDocument, clampSize, readOpenLink } = require("./code");

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

/** Puts a saved position back on a screen that still exists, or centres the widget. */
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
  const a = screen.getPrimaryDisplay().workArea;
  const n = widgetWindows.size % 8;
  return {
    x: Math.round(a.x + (a.width - w.width) / 2 + n * 28),
    y: Math.round(a.y + (a.height - w.height) / 2 + n * 28),
  };
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
    moveTimer = setTimeout(() => rememberBounds(w.id), 250);
  });
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

// ---------- Tray (menu bar on Mac) ----------

function buildTrayMenu() {
  if (!tray) return;
  const items = [
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
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    platform: process.platform,
    version: app.getVersion(),
  }));
  ipcMain.handle("settings:setOpenAtLogin", (_e, on) => {
    app.setLoginItemSettings({ openAtLogin: !!on, args: ["--hidden"] });
    return app.getLoginItemSettings().openAtLogin;
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
  lockDown();
  protocol.handle("cw", handleRequest);
  registerIpc();
  createTray();
  store.widgets.filter((w) => !w.hidden).forEach(openWidget);
  const atLogin = process.argv.includes("--hidden") || app.getLoginItemSettings().wasOpenedAtLogin;
  if (!atLogin || store.widgets.length === 0 || pendingImport) openEditor();
});
