// The editor page's only way to talk to the app.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cw", {
  setPreview: (code) => ipcRenderer.invoke("preview:set", code),
  list: () => ipcRenderer.invoke("widgets:list"),
  get: (id) => ipcRenderer.invoke("widgets:get", id),
  add: (input) => ipcRenderer.invoke("widgets:add", input),
  update: (id, input) => ipcRenderer.invoke("widgets:update", id, input),
  remove: (id) => ipcRenderer.invoke("widgets:remove", id),
  setHidden: (id, hidden) => ipcRenderer.invoke("widgets:setHidden", id, hidden),
  setOnTop: (id, onTop) => ipcRenderer.invoke("widgets:setOnTop", id, onTop),
  pendingEdit: () => ipcRenderer.invoke("editor:pendingEdit"),
  pendingImport: () => ipcRenderer.invoke("editor:pendingImport"),
  onImport: (fn) => ipcRenderer.on("editor:import", (_e, data) => fn(data)),
  copy: (text) => ipcRenderer.invoke("clipboard:write", text),
  settings: () => ipcRenderer.invoke("settings:get"),
  setOpenAtLogin: (on) => ipcRenderer.invoke("settings:setOpenAtLogin", on),
  onChanged: (fn) => ipcRenderer.on("widgets:changed", () => fn()),
  onEdit: (fn) => ipcRenderer.on("editor:edit", (_e, id) => fn(id)),
});
