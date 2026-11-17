// The editor: paste code, see it live, add it to the desktop, and manage saved widgets.
const $ = (id) => document.getElementById(id);
const code = $("code");
const nameField = $("name");
const preset = $("preset");
const widthField = $("width");
const heightField = $("height");
const frameBox = $("frameBox");
const preview = $("preview");
const stage = $("stage");
const addBtn = $("add");
const cancelBtn = $("cancel");
const list = $("list");

const EXAMPLE = `<!-- An example widget: a clock. Replace this with your own code. -->
<div class="clock">
  <div id="time">00:00</div>
  <div id="date"></div>
</div>
<style>
  .clock {
    height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: rgba(12, 12, 12, 0.85); color: #fff; border-radius: 22px;
    font-family: -apple-system, "Segoe UI", sans-serif;
  }
  #time { font-size: 64px; font-weight: 700; letter-spacing: -2px; }
  #date { font-size: 15px; color: #9a9a9a; margin-top: 4px; }
</style>
<script>
  function tick() {
    const now = new Date();
    document.getElementById("time").textContent =
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    document.getElementById("date").textContent =
      now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  }
  tick();
  setInterval(tick, 1000);
</script>`;

const PROMPT = (w, h) =>
  `Make me a desktop widget as ONE self-contained HTML file: HTML, CSS and JavaScript all inline, no build step. ` +
  `You can load libraries from a CDN if needed. It will be shown in a ${w} x ${h} pixel window, so make it fill the whole window ` +
  `(use 100vw and 100vh) and look good at that size. Give it a rounded, solid or slightly see-through background, because the window ` +
  `itself is transparent. It can be fully interactive (buttons, inputs, clicks). Save any data with localStorage so it's still there ` +
  `after a restart. Reply with only the code.\n\nThe widget: [describe your widget here]`;

let editingId = null;
let previewTimer = null;

const storage = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* not available */
    }
  },
};

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

const size = () => ({
  width: Math.min(4000, Math.max(60, Math.round(Number(widthField.value) || 400))),
  height: Math.min(4000, Math.max(60, Math.round(Number(heightField.value) || 200))),
});

// The preview is the real size, scaled down only when it doesn't fit the pane.
function layoutPreview() {
  const { width, height } = size();
  frameBox.style.width = `${width}px`;
  frameBox.style.height = `${height}px`;
  const scale = Math.min(1, (stage.clientWidth - 40) / width, (stage.clientHeight - 40) / height);
  frameBox.style.transform = `scale(${Math.max(0.05, scale)})`;
  $("previewSize").textContent = `${width} x ${height}${scale < 1 ? ` (shown at ${Math.round(scale * 100)}%)` : ""}`;
}

async function refreshPreview() {
  await window.cw.setPreview(code.value);
  preview.src = `cw://preview/?v=${Date.now()}`;
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 350);
  if (!editingId) storage.set("draft", code.value);
}

function syncPreset() {
  const v = `${widthField.value}x${heightField.value}`;
  preset.value = [...preset.options].some((o) => o.value === v) ? v : "custom";
}

function setSize(w, h) {
  widthField.value = w;
  heightField.value = h;
  syncPreset();
  layoutPreview();
}

function setMode(id) {
  editingId = id;
  addBtn.textContent = id ? "Update widget" : "Add widget";
  cancelBtn.hidden = !id;
  renderList();
}

async function startEdit(id) {
  const w = await window.cw.get(id);
  if (!w) return;
  code.value = w.code;
  nameField.value = w.name;
  setSize(w.width, w.height);
  setMode(id);
  refreshPreview();
}

function stopEdit() {
  setMode(null);
  code.value = storage.get("draft") ?? "";
  nameField.value = "";
  refreshPreview();
}

let widgets = [];
async function loadList() {
  widgets = await window.cw.list();
  renderList();
}

function button(label, onClick, on) {
  const b = document.createElement("button");
  b.textContent = label;
  if (on) b.classList.add("on");
  b.onclick = onClick;
  return b;
}

function renderList() {
  list.textContent = "";
  if (!widgets.length) {
    const p = document.createElement("div");
    p.className = "empty";
    p.textContent = "No widgets yet. Paste some code and press Add widget.";
    list.append(p);
    return;
  }
  for (const w of widgets) {
    const item = document.createElement("div");
    item.className = `item${w.id === editingId ? " editing" : ""}`;
    const meta = document.createElement("div");
    meta.className = "meta";
    const b = document.createElement("b");
    b.textContent = w.name;
    const s = document.createElement("small");
    s.textContent = `${w.width} x ${w.height}${w.hidden ? ", hidden" : ""}`;
    meta.append(b, s);
    const acts = document.createElement("div");
    acts.className = "acts";
    acts.append(
      button("Edit", () => startEdit(w.id)),
      button(w.hidden ? "Show" : "Hide", () => window.cw.setHidden(w.id, !w.hidden)),
      button("Pin", () => window.cw.setOnTop(w.id, !w.onTop), w.onTop),
      button("Remove", async () => {
        if (!confirm(`Remove "${w.name}"? Its saved data goes too.`)) return;
        await window.cw.remove(w.id);
        if (editingId === w.id) stopEdit();
      }),
    );
    item.append(meta, acts);
    list.append(item);
  }
}

// ---------- Events ----------

code.addEventListener("input", schedulePreview);
// Tab inserts two spaces instead of leaving the box.
code.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.metaKey || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  document.execCommand("insertText", false, "  ");
});

preset.addEventListener("change", () => {
  if (preset.value === "custom") return widthField.focus();
  const [w, h] = preset.value.split("x");
  setSize(w, h);
});
for (const f of [widthField, heightField]) {
  f.addEventListener("input", () => {
    syncPreset();
    layoutPreview();
  });
}
window.addEventListener("resize", layoutPreview);

$("reload").onclick = refreshPreview;
$("clear").onclick = () => {
  code.value = "";
  schedulePreview();
  code.focus();
};
$("prompt").onclick = async () => {
  const { width, height } = size();
  await window.cw.copy(PROMPT(width, height));
  toast("Prompt copied. Paste it into Claude or ChatGPT.");
};
cancelBtn.onclick = stopEdit;

addBtn.onclick = async () => {
  if (!code.value.trim()) {
    toast("Paste some code first");
    return code.focus();
  }
  const input = { name: nameField.value, code: code.value, ...size() };
  if (editingId) {
    await window.cw.update(editingId, input);
    toast("Widget updated");
    stopEdit();
  } else {
    await window.cw.add(input);
    toast("Added to your desktop");
  }
};

$("login").addEventListener("change", async (e) => {
  e.target.checked = await window.cw.setOpenAtLogin(e.target.checked);
});

window.cw.onChanged(loadList);
window.cw.onEdit(startEdit);

// ---------- Start ----------

(async () => {
  const draft = storage.get("draft");
  code.value = draft === null ? EXAMPLE : draft;
  layoutPreview();
  refreshPreview();
  await loadList();
  const s = await window.cw.settings();
  $("login").checked = !!s.openAtLogin;
  const pending = await window.cw.pendingEdit();
  if (pending) startEdit(pending);
})();
