// The frame around one widget: loads its code in a sandboxed iframe and handles move, resize, pin, edit and hide.
const id = new URLSearchParams(location.search).get("id") || "";
const frame = document.getElementById("w");
const topBtn = document.getElementById("top");
frame.src = `cw://w-${id}/`;

const show = (s) => s && topBtn.classList.toggle("active", !!s.onTop);
window.cwFrame.info().then(show);
window.cwFrame.onState(show);

topBtn.onclick = () => window.cwFrame.toggleTop();
document.getElementById("edit").onclick = () => window.cwFrame.edit();
document.getElementById("hide").onclick = () => window.cwFrame.hide();

// Resize from the corner grip. Pointer capture keeps the drag going even when the pointer leaves the window.
const grip = document.getElementById("resize");
let start = null;
let queued = null;
grip.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  grip.setPointerCapture(e.pointerId);
  start = { x: e.screenX, y: e.screenY, w: window.innerWidth, h: window.innerHeight };
  document.body.classList.add("resizing");
});
grip.addEventListener("pointermove", (e) => {
  if (!start) return;
  const size = [start.w + (e.screenX - start.x), start.h + (e.screenY - start.y)];
  if (!queued) {
    requestAnimationFrame(() => {
      window.cwFrame.resize(queued[0], queued[1]);
      queued = null;
    });
  }
  queued = size;
});
const end = () => {
  if (!start) return;
  start = null;
  document.body.classList.remove("resizing");
  setTimeout(() => window.cwFrame.resized(), 50);
};
grip.addEventListener("pointerup", end);
grip.addEventListener("pointercancel", end);
