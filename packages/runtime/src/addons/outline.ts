const STYLE_ID = "os-outline";

// Color-code outlines by element type for legibility (Storybook addon-outline
// approach, trimmed). Applied globally with !important so component styles
// can't suppress them.
const outlineCSS = `
body * { outline: 1px solid rgba(99,102,241,0.18) !important; outline-offset: -1px !important; }
body div { outline-color: rgba(59,130,246,0.22) !important; }
body span { outline-color: rgba(16,185,129,0.30) !important; }
body a { outline-color: rgba(236,72,153,0.30) !important; }
body button { outline-color: rgba(245,158,11,0.35) !important; }
body img, body svg { outline-color: rgba(139,92,246,0.35) !important; }
body p, body h1, body h2, body h3, body h4, body h5, body h6 { outline-color: rgba(244,63,94,0.28) !important; }
body input, body select, body textarea { outline-color: rgba(20,184,166,0.35) !important; }
`;

// Toggle a global element-outline stylesheet inside the preview document.
export function setOutlineEnabled(on: boolean, doc: Document = document): void {
  const existing = doc.getElementById(STYLE_ID);
  if (!on) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = outlineCSS;
  doc.head.appendChild(style);
}
