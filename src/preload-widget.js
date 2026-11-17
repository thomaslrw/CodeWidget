// The widget frame's only way to talk to the app (move, resize, pin, edit, hide).
// The widget's own code runs in an iframe inside this frame and can't reach any of this.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cwFrame", {
  info: () => ipcRenderer.invoke("widget:info"),
  resize: (width, height) => ipcRenderer.send("widget:resize", width, height),
  resized: () => ipcRenderer.send("widget:resized"),
  hide: () => ipcRenderer.send("widget:hide"),
  toggleTop: () => ipcRenderer.send("widget:toggleTop"),
  edit: () => ipcRenderer.send("widget:edit"),
  onState: (fn) => ipcRenderer.on("widget:state", (_e, s) => fn(s)),
});
