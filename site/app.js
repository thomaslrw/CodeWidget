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

// The website always starts fresh: a refresh brings back the original examples and editor, even after
// someone has clicked around in them (the widgets save to this page's storage while they play).
try {
  localStorage.clear();
} catch {
  /* storage blocked */
}

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
  // Desktop: a big editor with a roomy preview, the widget scaled to fit inside it.
  // Phones: the preview box is just tall enough for the widget, so it doesn't waste space.
  const big = window.innerWidth > 820;
  const boxH = 520;
  const scale = big
    ? Math.max(0.05, Math.min(1, (stage.clientWidth - 48) / width, (boxH - 48) / height))
    : Math.max(0.05, Math.min(1, (stage.clientWidth - 40) / width, 560 / height));
  frameBox.style.transform = `scale(${scale})`;
  stage.style.height = big ? `${boxH}px` : `${Math.round(height * scale) + 40}px`;
  $("previewSize").textContent = `${width} x ${height}${scale < 1 ? ` (shown at ${Math.round(scale * 100)}%)` : ""}`;
}

let timer = null;
function render() {
  preview.srcdoc = CW.toDocument(code.value);
}
function changed() {
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
  layout();
});
window.addEventListener("resize", layout);
// Make it obvious the editor is real: a hint and a soft glow until the first click or keypress.
const codePane = $("codePane");
codePane.classList.add("idle");
const woke = () => codePane.classList.remove("idle");
code.addEventListener("focus", woke);
code.addEventListener("input", woke);
$("editHint").onclick = () => {
  code.focus();
  code.setSelectionRange(0, 0);
  code.scrollTop = 0;
};
$("paste").onclick = async () => {
  woke();
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) throw new Error("empty");
    code.value = text;
    changed();
    code.focus();
  } catch {
    code.focus();
    code.select();
    toast(`Press ${/Mac/.test(navigator.platform) ? "Cmd" : "Ctrl"}+V to paste your code`);
  }
};
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
  const pill = document.querySelector(`.os-pill[data-os="${os.startsWith("mac") ? "mac" : os}"]`);
  if (pill) pill.classList.add("on");
  btn.textContent = LABELS[os];
  btn.href = fileUrl(FILES[os]);
  // The download button at the bottom of the page gets the same file.
  for (const a of document.querySelectorAll("[data-direct]")) a.href = btn.href;
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
    about: "",
    editorOnly: true,
  },
  {
    file: "examples/bug-radar.html",
    name: "App bug radar",
    width: 360,
    height: 420,
    about: "Watches your app's errors in Sentry and lights up when a new bug appears. Shows demo data until you connect your Sentry.",
  },
  {
    file: "examples/founder-dashboard.html",
    name: "Founder dashboard",
    width: 360,
    height: 420,
    about: "",
  },
  {
    file: "examples/ai-news.html",
    name: "AI news",
    width: 360,
    height: 420,
    about: "The most talked-about AI stories from the last two days, refreshed every 15 minutes.",
  },
  {
    file: "examples/ai-orb.html",
    name: "AI orb",
    width: 360,
    height: 420,
    about: "",
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
  // The first one is already in the editor, so it isn't repeated here.
  for (const ex of EXAMPLES.filter((e) => !e.editorOnly)) {
    let source = "";
    try {
      source = await (await fetch(`${ex.file}?v=${V}`)).text();
    } catch {
      continue;
    }
    const card = document.createElement("div");
    card.className = "example";
    card.innerHTML = `<div class="example-stage"><iframe title="" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" allow="clipboard-write" loading="lazy"></iframe></div>
      <div class="example-info"><h3></h3><button class="btn small">Use this</button></div>`;
    const frame = card.querySelector("iframe");
    frame.title = ex.name;
    frame.dataset.w = ex.width;
    frame.dataset.h = ex.height;
    frame.style.width = `${ex.width}px`;
    frame.style.height = `${ex.height}px`;
    frame.srcdoc = CW.toDocument(source);
    card.querySelector("h3").textContent = ex.name;
    card.querySelector("button").onclick = () => {
      code.value = source;
      $("name").value = ex.name;
      setPreset(ex.width, ex.height);
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

// ---------- The live desktop in the hero ----------

const desk = $("desk");
const showcase = $("showcase");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function fitDesk() {
  if (!desk) return;
  desk.style.transform = `scale(${showcase.clientWidth / 1200})`;
}
window.addEventListener("resize", fitDesk);

/** Places a desktop widget at its spot and size, scaled, and loads its code. */
async function mountDeskWidget(el) {
  const w = Number(el.dataset.w);
  const h = Number(el.dataset.h);
  const sc = Number(el.dataset.s);
  el.style.left = `${el.dataset.x}px`;
  el.style.top = `${el.dataset.y}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  if (!el.classList.contains("fly")) el.style.transform = `scale(${sc})`;
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.setAttribute("tabindex", "-1");
  frame.title = "";
  el.append(frame);
  try {
    frame.srcdoc = CW.toDocument(await (await fetch(`${el.dataset.src}?v=${V}`)).text());
  } catch {
    /* leave it empty */
  }
}

function menuClock() {
  const c = $("mbClock");
  if (!c) return;
  const now = new Date();
  c.textContent = `${now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}  ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

// The story in three seconds: code is pasted, the preview builds, the widget flies onto the desktop.
const TYPED = [
  ["c", "<!-- AI orb: ask anything -->"],
  ["", '<div class="w">'],
  ["", '  <canvas id="orb"></canvas>'],
  ["", '  <form id="ask">'],
  ["", '    <input placeholder="Ask anything...">'],
  ["", "  </form>"],
  ["", "</div>"],
  ["k", "<style>"],
  ["", "  .w { background: #000; ... }"],
  ["k", "</style>"],
  ["k", "<script>"],
  ["", "  fetch(\"api.anthropic.com/...\")"],
  ["k", "</script>"],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function playStory() {
  const win = $("cwWin");
  const flyer = $("flyer");
  const typer = $("typer");
  if (!win || !flyer) return;
  // Where the widget sits in the editor window's preview pane (x 620 to 890, y 180 to 480 on the desk),
  // and where it ends up on the desktop.
  const fx = Number(flyer.dataset.x);
  const fy = Number(flyer.dataset.y);
  const fw = Number(flyer.dataset.w);
  const fh = Number(flyer.dataset.h);
  const ps = Math.min(246 / fw, 276 / fh);
  const px = 620 + (270 - fw * ps) / 2;
  const py = 180 + (300 - fh * ps) / 2;
  const inPreview = `translate(${px - fx}px, ${py - fy}px) scale(${ps})`;
  const onDesk = `scale(${flyer.dataset.s})`;
  if (reduceMotion) {
    win.classList.add("gone");
    flyer.style.transform = onDesk;
    flyer.style.opacity = 1;
    return;
  }
  flyer.style.transition = "none";
  flyer.style.transform = inPreview;
  await sleep(900);
  for (const [cls, line] of TYPED) {
    const span = document.createElement("span");
    if (cls) span.className = cls;
    typer.append(span);
    for (let i = 0; i < line.length; i += 3) {
      span.textContent = line.slice(0, i + 3);
      await sleep(14);
    }
    typer.append("\n");
  }
  win.classList.add("done");
  flyer.style.transition = "opacity .5s ease";
  flyer.style.opacity = 1;
  await sleep(900);
  $("cwAdd").classList.add("press");
  await sleep(250);
  $("cwAdd").classList.remove("press");
  flyer.style.transition = "";
  flyer.style.transform = onDesk;
  win.classList.add("gone");
}

if (desk) {
  fitDesk();
  menuClock();
  setInterval(menuClock, 15000);
  document.querySelectorAll(".dw").forEach(mountDeskWidget);
  // Start the story once the desktop is on screen.
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) {
      obs.disconnect();
      playStory();
    }
  }, { threshold: 0.35 }).observe(showcase);
}

// ---------- Fade in as sections come into view ----------

const revealer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add("in");
      revealer.unobserve(e.target);
    }
  }
}, { threshold: 0.08 });
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

// ---------- Live numbers from GitHub: stars and the latest version ----------

fetch("https://api.github.com/repos/thomaslrw/CodeWidget")
  .then((r) => r.json())
  .then((d) => {
    if (typeof d.stargazers_count === "number" && d.stargazers_count > 0) {
      $("stars").textContent = `★ ${d.stargazers_count.toLocaleString()} on GitHub`;
    }
  })
  .catch(() => {});
fetch(`${REPO.replace("github.com", "api.github.com/repos")}/releases/latest`)
  .then((r) => r.json())
  .then((d) => {
    if (d.tag_name) $("version").textContent = `Version ${d.tag_name.replace(/^v/, "")} · free`;
  })
  .catch(() => {});

// ---------- Start ----------

// What someone pasted before is kept; first-time visitors get the AI shipping streak.
// Every visit opens on the AI shipping streak.
(async () => {
  try {
    code.value = await (await fetch(`${EXAMPLES[0].file}?v=${V}`)).text();
    $("name").value = EXAMPLES[0].name;
  } catch {
    code.value = "";
  }
  setPreset(EXAMPLES[0].width, EXAMPLES[0].height);
  layout();
  render();
  loadExamples();
})();
