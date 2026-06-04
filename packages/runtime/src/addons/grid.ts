const GRID_ID = "os-grid";
const MAJOR = 100; // px — major gridlines
const MINOR = 10; // px — minor gridlines
const MAJOR_LINE = "rgba(120,120,255,0.18)";
const MINOR_LINE = "rgba(120,120,255,0.10)";

// Toggle a fixed, pointer-transparent grid overlay over the preview document.
export function setGridEnabled(on: boolean, doc: Document = document): void {
  const existing = doc.getElementById(GRID_ID);
  if (!on) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const el = doc.createElement("div");
  el.id = GRID_ID;
  el.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483646",
    `background-image:linear-gradient(${MAJOR_LINE} 1px,transparent 1px),linear-gradient(90deg,${MAJOR_LINE} 1px,transparent 1px),linear-gradient(${MINOR_LINE} 1px,transparent 1px),linear-gradient(90deg,${MINOR_LINE} 1px,transparent 1px)`,
    `background-size:${MAJOR}px ${MAJOR}px,${MAJOR}px ${MAJOR}px,${MINOR}px ${MINOR}px,${MINOR}px ${MINOR}px`,
  ].join(";");
  doc.body.appendChild(el);
}
