// The website: paste code, preview it live, then download the app and send the widget straight into it.
const $ = (id) => document.getElementById(id);
const CW = window.CodeWidget;
const REPO = "https://github.com/thomaslrw/CodeWidget";
// Replaced with the commit on publish, so browsers always fetch the newest examples.
const V = "dev";
const FILES = {
  macArm: "CodeWidget-mac-arm64.dmg",
  macIntel: "CodeWidget-mac-x64.dmg",
  windows: "CodeWidget-windows-x64-setup.exe",
  linux: "CodeWidget-linux-x86_64.AppImage",
};
const fileUrl = (f) => `${REPO}/releases/latest/download/${f}`;

// The page opens on the first example (the AI shipping streak), so the preview shows something real straight away.

const PROMPT = (w, h) =>
  `Make me a desktop widget as ONE self-contained HTML file: HTML, CSS and JavaScript all inline, no build step. ` +
  `You can load libraries from a CDN if needed. It will be shown in a ${w} x ${h} pixel window, so make it fill the whole window ` +
  `(use 100vw and 100vh) and look good at that size. Give it a rounded, solid or slightly see-through background, because the window ` +
  `itself is transparent. It can be fully interactive (buttons, inputs, clicks). Save any data with localStorage so it's still there ` +
  `after a restart. Reply with only the code.\n\nThe widget: [describe your widget here]`;

const code = $("code");
const preset = $("preset");
const frameBox = $("frameBox");
const stage = $("stage");
const preview = $("preview");

const DRAFT = "cw-draft-v2";
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private browsing */
    }
  },
};

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

// Sizes come only from the presets.
const size = () => {
  const [w, h] = preset.value.split("x");
  return { width: CW.clampSize(w, 400), height: CW.clampSize(h, 200) };
};
/** Picks the preset for a size (or the closest one when an old size isn't a preset). */
function setPreset(width, height) {
  let best = preset.options[0];
  let gap = Infinity;
  for (const o of preset.options) {
    const [w, h] = o.value.split("x").map(Number);
    const d = Math.abs(w - width) + Math.abs(h - height);
    if (d < gap) {
      gap = d;
      best = o;
    }
  }
  preset.value = best.value;
}

// ---------- Preview ----------

function layout() {
  const { width, height } = size();
  frameBox.style.width = `${width}px`;
  frameBox.style.height = `${height}px`;
  const scale = Math.min(1, (stage.clientWidth - 32) / width, (stage.clientHeight - 32) / height);
  frameBox.style.transform = `scale(${Math.max(0.05, scale)})`;
  $("previewSize").textContent = `${width} x ${height}${scale < 1 ? ` (shown at ${Math.round(scale * 100)}%)` : ""}`;
}

let timer = null;
function render() {
  preview.srcdoc = CW.toDocument(code.value);
}
function changed() {
  store.set(DRAFT, code.value);
  clearTimeout(timer);
  timer = setTimeout(render, 350);
}


code.addEventListener("input", changed);
code.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.metaKey || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  document.execCommand("insertText", false, "  ");
});
preset.addEventListener("change", () => {
  store.set(DRAFT_SIZE, preset.value);
  layout();
});
window.addEventListener("resize", layout);
$("clear").onclick = () => {
  code.value = "";
  changed();
  code.focus();
};
$("prompt").onclick = async () => {
  const { width, height } = size();
  await copy(PROMPT(width, height));
  toast("Prompt copied. Paste it into Claude or ChatGPT.");
};

// ---------- The right download for this computer ----------

async function detect() {
  const ua = navigator.userAgent;
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(platform) && !/Android/i.test(ua)) return "linux";
  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) {
    // Chrome and Edge can tell Apple silicon from Intel. Safari can't, and almost every Mac sold since 2021 is Apple silicon.
    try {
      const v = await navigator.userAgentData.getHighEntropyValues(["architecture"]);
      if (v.architecture === "x86") return "macIntel";
    } catch {
      /* not available */
    }
    return "macArm";
  }
  return "unknown";
}

const LABELS = {
  macArm: "Download for Mac",
  macIntel: "Download for Mac (Intel)",
  windows: "Download for Windows",
  linux: "Download for Linux",
};

const INSTALL = {
  mac: `<ol>
      <li>Open the downloaded file and drag <b>CodeWidget</b> into <b>Applications</b>.</li>
      <li>Open CodeWidget. Your Mac says <i>"Apple could not verify..."</i>. Click <b>Done</b>.</li>
      <li>Open <b>System Settings</b>, go to <b>Privacy &amp; Security</b>, scroll down and click <b>Open Anyway</b> next to CodeWidget.</li>
      <li>Enter your password. You only do this once.</li>
    </ol>`,
  windows: `<ol>
      <li>Open the downloaded file.</li>
      <li>If you see <i>"Windows protected your PC"</i>, click <b>More info</b>, then <b>Run anyway</b>. You only do this once.</li>
      <li>CodeWidget opens by itself when it's installed.</li>
    </ol>`,
  linux: `<ol>
      <li>Make the file runnable: right-click it, open <b>Properties</b> and allow it to run as a program (or run <kbd>chmod +x CodeWidget-linux-x86_64.AppImage</kbd>).</li>
      <li>Double-click it to open CodeWidget.</li>
    </ol>`,
};

(async () => {
  const os = await detect();
  const btn = $("dlBtn");
  const other = (pairs) => pairs.map(([label, f]) => `<a href="${fileUrl(f)}">${label}</a>`).join(" &middot; ");
  if (os === "unknown") {
    $("dlText").textContent = "Pick your computer:";
    btn.textContent = "See all downloads";
    btn.href = `${REPO}/releases/latest`;
    $("dlOther").innerHTML = other([
      ["Mac (Apple silicon)", FILES.macArm],
      ["Mac (Intel)", FILES.macIntel],
      ["Windows", FILES.windows],
      ["Linux", FILES.linux],
    ]);
    $("installSteps").innerHTML = INSTALL.mac;
    return;
  }
  btn.textContent = LABELS[os];
  btn.href = fileUrl(FILES[os]);
  for (const a of document.querySelectorAll("[data-download]")) a.textContent = LABELS[os].replace("Download for ", "Get it for ");
  if (os === "macArm") $("dlOther").innerHTML = `Older Mac with an Intel chip? ${other([["Download the Intel version", FILES.macIntel]])}`;
  if (os === "macIntel") $("dlOther").innerHTML = `Mac with an M chip? ${other([["Download the Apple silicon version", FILES.macArm]])}`;
  if (os === "windows" || os === "linux") $("dlOther").innerHTML = `Other computers: ${other([["Mac", FILES.macArm], ["Windows", FILES.windows], ["Linux", FILES.linux]].filter(([, f]) => f !== FILES[os]))}`;
  $("installSteps").innerHTML = os.startsWith("mac") ? INSTALL.mac : INSTALL[os];
})();

// ---------- Add to desktop ----------

$("add").onclick = async () => {
  if (!code.value.trim()) {
    toast("Paste some code first");
    return code.focus();
  }
  await copy(code.value);
  $("download").scrollIntoView({ behavior: "smooth" });
  toast("Code copied. Now get the app.");
};

$("openApp").onclick = async () => {
  if (!code.value.trim()) {
    toast("Paste some code at the top first");
    return $("maker").scrollIntoView({ behavior: "smooth" });
  }
  await copy(code.value);
  const { width, height } = size();
  const params = new URLSearchParams({ code: CW.encodeText(code.value), name: $("name").value, w: width, h: height });
  window.location.href = `codewidget://open?${params}`;
};

// ---------- Examples ----------

const EXAMPLES = [
  {
    file: "examples/ai-streak.html",
    name: "AI shipping streak",
    width: 760,
    height: 300,
    about: "A year of days you built something with AI, with streaks and a monthly trend. Click any day to log it.",
  },
  {
    file: "examples/prompt-library.html",
    name: "Prompt library",
    width: 360,
    height: 420,
    about: "Your best prompts, one click to copy. Comes with five good ones. Add your own with +.",
  },
  {
    file: "examples/ai-news.html",
    name: "AI news",
    width: 360,
    height: 420,
    about: "The most talked-about AI stories from the last two days, refreshed every 15 minutes.",
  },
];

function fitExamples() {
  for (const frame of document.querySelectorAll(".example-stage iframe")) {
    const box = frame.parentElement;
    const w = Number(frame.dataset.w);
    const h = Number(frame.dataset.h);
    const scale = Math.min(1, (box.clientWidth - 24) / w, (box.clientHeight - 24) / h);
    frame.style.transform = `scale(${scale})`;
  }
}

async function loadExamples() {
  const list = $("exampleList");
  for (const ex of EXAMPLES) {
    let source = "";
    try {
      source = await (await fetch(`${ex.file}?v=${V}`)).text();
    } catch {
      continue;
    }
    const card = document.createElement("div");
    card.className = "example";
    card.innerHTML = `<div class="example-stage"><iframe title="" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" allow="clipboard-write" loading="lazy"></iframe></div>
      <div class="example-info"><h3></h3><p></p><div class="row"><span></span><button class="btn small">Use this</button></div></div>`;
    const frame = card.querySelector("iframe");
    frame.title = ex.name;
    frame.dataset.w = ex.width;
    frame.dataset.h = ex.height;
    frame.style.width = `${ex.width}px`;
    frame.style.height = `${ex.height}px`;
    frame.srcdoc = CW.toDocument(source);
    card.querySelector("h3").textContent = ex.name;
    card.querySelector("p").textContent = ex.about;
    card.querySelector(".row span").textContent = `${ex.width} x ${ex.height}`;
    card.querySelector("button").onclick = () => {
      code.value = source;
      $("name").value = ex.name;
      setPreset(ex.width, ex.height);
      store.set(DRAFT_SIZE, preset.value);
      layout();
      changed();
      render();
      $("maker").scrollIntoView({ behavior: "smooth" });
      toast(`${ex.name} loaded. Press Add to desktop when you're ready.`);
    };
    list.append(card);
  }
  fitExamples();
}
window.addEventListener("resize", fitExamples);

// ---------- Start ----------

// What someone pasted before is kept; first-time visitors get the AI shipping streak.
const DRAFT_SIZE = "cw-draft-size";
(async () => {
  const draft = store.get(DRAFT);
  if (draft !== null && draft.trim()) {
    code.value = draft;
    const [w, h] = (store.get(DRAFT_SIZE) || "760x300").split("x").map(Number);
    setPreset(w, h);
  } else {
    try {
      code.value = await (await fetch(`${EXAMPLES[0].file}?v=${V}`)).text();
      $("name").value = EXAMPLES[0].name;
    } catch {
      code.value = "";
    }
    setPreset(EXAMPLES[0].width, EXAMPLES[0].height);
  }
  layout();
  render();
  loadExamples();
})();
