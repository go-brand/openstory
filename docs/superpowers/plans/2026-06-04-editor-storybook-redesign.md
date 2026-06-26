# Editor Storybook-Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop editor flat and Storybook-matched — edge-to-edge white/dark canvas, an icon toolbar (reload · zoom · measure · grid · outline · viewport · pop-out) with every tool functional, and a Controls/Code tabbed right panel.

**Architecture:** Measure/grid/outline run *inside* the preview iframe (`@gobrand/openstory-runtime`), toggled by `os:*` postMessages from the host toolbar. Zoom/viewport/reload/pop-out act on the iframe element host-side. Zoom/addon/tab state is renderer-local React state in `MainApp`.

**Tech Stack:** TypeScript, React, Tailwind CSS 4 (oklch tokens), Electron, vitest (jsdom), Hugeicons.

**Spec:** `docs/superpowers/specs/2026-06-04-editor-storybook-redesign-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `packages/runtime/src/addons/outline.ts` (new) | `setOutlineEnabled` — inject/remove the global outline `<style>` |
| `packages/runtime/src/addons/grid.ts` (new) | `setGridEnabled` — fixed grid overlay element |
| `packages/runtime/src/addons/measure.ts` (new) | `computeBoxModel` (pure) + `setMeasureEnabled` (canvas overlay) |
| `packages/runtime/src/addons/index.ts` (new) | `AddonName`/`AddonState` types + `applyAddons` registry |
| `packages/runtime/src/preview-host.tsx` (mod) | Handle `os:addon`/`os:reload`; remount key; apply addon state |
| `apps/desktop/src/styles.css` (mod) | Flat Storybook surfaces (light+dark); toolbar tokens |
| `apps/desktop/src/components/ui/button.tsx` (mod) | Flatten variants (drop heavy ring/shadow) |
| `apps/desktop/src/lib/icons.ts` (mod) | Re-export toolbar icons |
| `apps/desktop/src/lib/preview-view.ts` (new) | Zoom helpers + `AddonName`/`AddonState` (host copy) |
| `apps/desktop/src/lib/use-harness-bridge.ts` (mod) | Sync addon state to iframe; expose `reload()` |
| `apps/desktop/src/views/main-app.tsx` (mod) | Edge-to-edge canvas, zoom wrapper, view state, wiring |
| `apps/desktop/src/components/toolbar.tsx` (mod) | Icon toolbar + `ToolButton` |
| `apps/desktop/src/components/right-panel.tsx` (mod) | Controls/Code tab header |

**Run order:** runtime addons (1–5) are self-contained and testable first; host visuals (6–7), shared helpers (8–9), then the coupled editor-shell UI (10) which rewrites toolbar + main-app + right-panel together to keep the build green; finally full verification (11).

**pnpm filters:** `@gobrand/openstory-runtime`, `openstory-desktop`.

---

## Task 1: Outline addon (runtime)

**Files:**
- Create: `packages/runtime/src/addons/outline.ts`
- Test: `packages/runtime/src/addons/outline.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/runtime/src/addons/outline.test.ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { setOutlineEnabled } from "./outline";

afterEach(() => setOutlineEnabled(false));

describe("setOutlineEnabled", () => {
  it("injects a <style id=os-outline> when enabled", () => {
    setOutlineEnabled(true);
    const el = document.getElementById("os-outline");
    expect(el?.tagName).toBe("STYLE");
    expect(el?.textContent).toContain("outline");
  });

  it("removes the style when disabled", () => {
    setOutlineEnabled(true);
    setOutlineEnabled(false);
    expect(document.getElementById("os-outline")).toBeNull();
  });

  it("is idempotent — enabling twice keeps a single node", () => {
    setOutlineEnabled(true);
    setOutlineEnabled(true);
    expect(document.querySelectorAll("#os-outline")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-runtime test -- outline`
Expected: FAIL — "Cannot find module './outline'".

- [ ] **Step 3: Implement**

```ts
// packages/runtime/src/addons/outline.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-runtime test -- outline`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/addons/outline.ts packages/runtime/src/addons/outline.test.ts
git commit -m "feat(runtime): outline addon — toggle global element outlines"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 2: Grid addon (runtime)

**Files:**
- Create: `packages/runtime/src/addons/grid.ts`
- Test: `packages/runtime/src/addons/grid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/runtime/src/addons/grid.test.ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { setGridEnabled } from "./grid";

afterEach(() => setGridEnabled(false));

describe("setGridEnabled", () => {
  it("appends a fixed, non-interactive grid overlay when enabled", () => {
    setGridEnabled(true);
    const el = document.getElementById("os-grid");
    expect(el?.tagName).toBe("DIV");
    expect(el?.style.position).toBe("fixed");
    expect(el?.style.pointerEvents).toBe("none");
    expect(el?.style.backgroundImage).toContain("linear-gradient");
  });

  it("removes the overlay when disabled", () => {
    setGridEnabled(true);
    setGridEnabled(false);
    expect(document.getElementById("os-grid")).toBeNull();
  });

  it("is idempotent — enabling twice keeps a single node", () => {
    setGridEnabled(true);
    setGridEnabled(true);
    expect(document.querySelectorAll("#os-grid")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-runtime test -- grid`
Expected: FAIL — "Cannot find module './grid'".

- [ ] **Step 3: Implement**

```ts
// packages/runtime/src/addons/grid.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-runtime test -- grid`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/addons/grid.ts packages/runtime/src/addons/grid.test.ts
git commit -m "feat(runtime): grid addon — toggle a fixed grid overlay"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 3: Measure addon — box-model geometry + overlay (runtime)

The geometry (`computeBoxModel`) is a pure function and is unit-tested. The canvas
drawing + pointer wiring (`setMeasureEnabled`) is thin and browser-only (not unit-tested).

**Files:**
- Create: `packages/runtime/src/addons/measure.ts`
- Test: `packages/runtime/src/addons/measure.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/runtime/src/addons/measure.test.ts
import { describe, it, expect } from "vitest";
import { computeBoxModel } from "./measure";

describe("computeBoxModel", () => {
  // border-box rect is 100×40 at (10,20); margin 5 all sides; border 2 all
  // sides; padding 3 all sides.
  const border = { x: 10, y: 20, width: 100, height: 40 };
  const edges = { top: 5, right: 5, bottom: 5, left: 5 };
  const bw = { top: 2, right: 2, bottom: 2, left: 2 };
  const pad = { top: 3, right: 3, bottom: 3, left: 3 };

  it("expands the margin box outward from the border box", () => {
    const { margin } = computeBoxModel(border, edges, bw, pad);
    expect(margin).toEqual({ x: 5, y: 15, width: 110, height: 50 });
  });

  it("keeps the border box equal to the input rect", () => {
    const { border: b } = computeBoxModel(border, edges, bw, pad);
    expect(b).toEqual(border);
  });

  it("shrinks the padding box inward by border widths", () => {
    const { padding } = computeBoxModel(border, edges, bw, pad);
    expect(padding).toEqual({ x: 12, y: 22, width: 96, height: 36 });
  });

  it("shrinks the content box inward by border then padding", () => {
    const { content } = computeBoxModel(border, edges, bw, pad);
    expect(content).toEqual({ x: 15, y: 25, width: 90, height: 30 });
  });

  it("never produces negative dimensions", () => {
    const tiny = { x: 0, y: 0, width: 4, height: 4 };
    const big = { top: 10, right: 10, bottom: 10, left: 10 };
    const { content } = computeBoxModel(tiny, edges, big, big);
    expect(content.width).toBeGreaterThanOrEqual(0);
    expect(content.height).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-runtime test -- measure`
Expected: FAIL — "Cannot find module './measure'".

- [ ] **Step 3: Implement**

```ts
// packages/runtime/src/addons/measure.ts
export type Rect = { x: number; y: number; width: number; height: number };
export type EdgeSizes = { top: number; right: number; bottom: number; left: number };
export type BoxModel = { margin: Rect; border: Rect; padding: Rect; content: Rect };

// Given an element's border-box rect (getBoundingClientRect) plus its computed
// margin / border-width / padding edges, derive the four nested CSS box-model
// rectangles. Margin expands outward; padding and content shrink inward.
export function computeBoxModel(
  border: Rect,
  margin: EdgeSizes,
  borderWidth: EdgeSizes,
  padding: EdgeSizes,
): BoxModel {
  const marginRect: Rect = {
    x: border.x - margin.left,
    y: border.y - margin.top,
    width: border.width + margin.left + margin.right,
    height: border.height + margin.top + margin.bottom,
  };
  const paddingRect: Rect = {
    x: border.x + borderWidth.left,
    y: border.y + borderWidth.top,
    width: Math.max(0, border.width - borderWidth.left - borderWidth.right),
    height: Math.max(0, border.height - borderWidth.top - borderWidth.bottom),
  };
  const contentRect: Rect = {
    x: paddingRect.x + padding.left,
    y: paddingRect.y + padding.top,
    width: Math.max(0, paddingRect.width - padding.left - padding.right),
    height: Math.max(0, paddingRect.height - padding.top - padding.bottom),
  };
  return { margin: marginRect, border: { ...border }, padding: paddingRect, content: contentRect };
}

// ── Browser-only overlay (not unit-tested) ──────────────────────────────────
const CANVAS_ID = "os-measure";
const COLOR = {
  margin: "rgba(246,178,107,0.45)",
  border: "rgba(255,229,153,0.45)",
  padding: "rgba(147,196,125,0.45)",
  content: "rgba(111,168,220,0.55)",
};

let rafId = 0;
let moveHandler: ((e: PointerEvent) => void) | null = null;
let resizeHandler: (() => void) | null = null;

function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function fillRect(ctx: CanvasRenderingContext2D, r: Rect, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.width, r.height);
}

function drawLabel(ctx: CanvasRenderingContext2D, r: Rect, text: string): void {
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  const padX = 5;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 18;
  const x = Math.max(2, r.x);
  const y = Math.max(2, r.y - h - 2);
  ctx.fillStyle = "rgba(24,24,27,0.92)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2);
}

// Toggle a full-window canvas that draws the hovered element's box model.
export function setMeasureEnabled(on: boolean, doc: Document = document): void {
  const existing = doc.getElementById(CANVAS_ID) as HTMLCanvasElement | null;
  if (!on) {
    if (moveHandler) doc.removeEventListener("pointermove", moveHandler, true);
    if (resizeHandler) doc.defaultView?.removeEventListener("resize", resizeHandler);
    if (rafId) cancelAnimationFrame(rafId);
    moveHandler = null;
    resizeHandler = null;
    rafId = 0;
    existing?.remove();
    return;
  }
  if (existing) return;

  const view = doc.defaultView;
  if (!view) return;
  const canvas = doc.createElement("canvas");
  canvas.id = CANVAS_ID;
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  doc.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = view.devicePixelRatio || 1;

  resizeHandler = () => {
    const w = doc.documentElement.clientWidth;
    const h = doc.documentElement.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };
  resizeHandler();

  moveHandler = (e: PointerEvent) => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const el = doc.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el || el.id === CANVAS_ID) return;
      const r = el.getBoundingClientRect();
      const s = view.getComputedStyle(el);
      const box = computeBoxModel(
        { x: r.x, y: r.y, width: r.width, height: r.height },
        { top: px(s.marginTop), right: px(s.marginRight), bottom: px(s.marginBottom), left: px(s.marginLeft) },
        { top: px(s.borderTopWidth), right: px(s.borderRightWidth), bottom: px(s.borderBottomWidth), left: px(s.borderLeftWidth) },
        { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) },
      );
      fillRect(ctx, box.margin, COLOR.margin);
      fillRect(ctx, box.border, COLOR.border);
      fillRect(ctx, box.padding, COLOR.padding);
      fillRect(ctx, box.content, COLOR.content);
      drawLabel(ctx, box.border, `${Math.round(r.width)} × ${Math.round(r.height)}`);
    });
  };

  doc.addEventListener("pointermove", moveHandler, true);
  view.addEventListener("resize", resizeHandler);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-runtime test -- measure`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/addons/measure.ts packages/runtime/src/addons/measure.test.ts
git commit -m "feat(runtime): measure addon — box-model geometry + canvas overlay"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 4: Addons registry (runtime)

**Files:**
- Create: `packages/runtime/src/addons/index.ts`
- Test: `packages/runtime/src/addons/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/runtime/src/addons/index.test.ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { applyAddons } from "./index";

afterEach(() => applyAddons({ outline: false, grid: false, measure: false }));

describe("applyAddons", () => {
  it("turns on exactly the enabled overlays", () => {
    applyAddons({ outline: true, grid: false, measure: false });
    expect(document.getElementById("os-outline")).not.toBeNull();
    expect(document.getElementById("os-grid")).toBeNull();
    expect(document.getElementById("os-measure")).toBeNull();
  });

  it("turns overlays off when re-applied with false", () => {
    applyAddons({ outline: true, grid: true, measure: false });
    applyAddons({ outline: false, grid: false, measure: false });
    expect(document.getElementById("os-outline")).toBeNull();
    expect(document.getElementById("os-grid")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-runtime test -- "addons/index"`
Expected: FAIL — "Cannot find module './index'".

- [ ] **Step 3: Implement**

```ts
// packages/runtime/src/addons/index.ts
import { setOutlineEnabled } from "./outline.js";
import { setGridEnabled } from "./grid.js";
import { setMeasureEnabled } from "./measure.js";

export type AddonName = "outline" | "grid" | "measure";
export type AddonState = Record<AddonName, boolean>;

// Reconcile the live overlays to the desired state. Each setter is idempotent,
// so calling this on every state change is safe.
export function applyAddons(state: AddonState, doc: Document = document): void {
  setOutlineEnabled(state.outline, doc);
  setGridEnabled(state.grid, doc);
  setMeasureEnabled(state.measure, doc);
}

export { computeBoxModel } from "./measure.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-runtime test -- "addons/index"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/addons/index.ts packages/runtime/src/addons/index.test.ts
git commit -m "feat(runtime): addons registry — applyAddons reconciler"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 5: Wire addons into the preview host (runtime)

**Files:**
- Modify: `packages/runtime/src/preview-host.tsx`

No new unit test (message wiring in React is verified by typecheck + build + the existing `preview-host.test.tsx`). Provide the exact edits.

- [ ] **Step 1: Add imports**

At the top of `packages/runtime/src/preview-host.tsx`, after the existing `bridge.js` import, add:
```ts
import { applyAddons, type AddonState } from "./addons/index.js";
```

- [ ] **Step 2: Add addon + remount state and handlers in `App`**

In the `App` component, after the existing `const [selection, setSelection] = useState<ActiveSelection | null>(readSelectionFromUrl);` line, add:
```ts
  const [addons, setAddons] = useState<AddonState>({
    outline: false,
    grid: false,
    measure: false,
  });
  const [remountKey, setRemountKey] = useState(0);
```

- [ ] **Step 3: Handle `os:*` messages**

In `App`'s `handleMessage`, before the `const msg = parseBridgeMessage(event.data);` line, add raw handling for the host's addon/reload messages (these are not part of the `pl:*` bridge schema):
```ts
      const raw = event.data as { type?: string; addon?: keyof AddonState; enabled?: boolean };
      if (raw?.type === "os:addon" && raw.addon) {
        const addon = raw.addon;
        const enabled = Boolean(raw.enabled);
        setAddons((a) => ({ ...a, [addon]: enabled }));
        return;
      }
      if (raw?.type === "os:reload") {
        setRemountKey((k) => k + 1);
        return;
      }
```

- [ ] **Step 4: Apply addon state via effect**

In `App`, add a new effect after the existing message-listener effect:
```ts
  // Reconcile overlays to the toggled state. Setters are idempotent.
  useEffect(() => {
    applyAddons(addons);
  }, [addons]);
```

- [ ] **Step 5: Remount the story on reload**

Change the final render of `App` so the stage remounts when `remountKey` changes:
```ts
  if (!selection) return <FallbackMessage text="Waiting for selection..." />;
  return <PreviewStage key={remountKey} config={config} selection={selection} />;
```

- [ ] **Step 6: Verify typecheck, build, and existing tests**

Run: `pnpm --filter @gobrand/openstory-runtime typecheck && pnpm --filter @gobrand/openstory-runtime build && pnpm --filter @gobrand/openstory-runtime test`
Expected: PASS (existing `preview-host` tests still green; no type errors).

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/preview-host.tsx
git commit -m "feat(runtime): preview host handles os:addon / os:reload"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 6: Flat Storybook tokens + button flatten (desktop)

**Files:**
- Modify: `apps/desktop/src/styles.css`
- Modify: `apps/desktop/src/components/ui/button.tsx`

Visual change — verified by typecheck + build (and the manual smoke in Task 11).

- [ ] **Step 1: Add Storybook surface + toolbar tokens (light)**

In `apps/desktop/src/styles.css`, in the `:root` block, change `--border` and `--input`, and add the new tokens. Replace these two lines:
```css
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
```
with:
```css
  --border: #e3e8ee;
  --input: #e3e8ee;
```
Then, just before the closing `}` of `:root` (after the `--destructive` line), add:
```css
  /* Editor surfaces (Storybook light): white canvas + bar, slate icons. */
  --canvas: #ffffff;
  --toolbar: #ffffff;
  --toolbar-icon: #73828c;
  --toolbar-icon-hover: #2e3438;
```

- [ ] **Step 2: Add Storybook surface + toolbar tokens (dark)**

In the `.dark` block, change the canvas/surface values to Storybook's charcoals. Replace:
```css
  --background: #09090b;
  --background-1: #0c0c0e;
  --background-2: #141417;
  --background-3: #1b1b1f;
```
with:
```css
  --background: #1b1c1d;
  --background-1: #222425;
  --background-2: #222425;
  --background-3: #292c2e;
```
Replace:
```css
  --card: #141417;
```
with:
```css
  --card: #222425;
```
Replace:
```css
  --sidebar: #0c0c0e;
```
with:
```css
  --sidebar: #222425;
```
Then, just before the `color-scheme: dark;` line, add:
```css
  /* Editor surfaces (Storybook dark). */
  --canvas: #1b1c1d;
  --toolbar: #292c2e;
  --toolbar-icon: #9aa4ad;
  --toolbar-icon-hover: #ffffff;
```

- [ ] **Step 3: Map the new tokens for Tailwind**

In the `@theme inline` block, before the closing `}`, add:
```css
  --color-canvas: var(--canvas);
  --color-toolbar: var(--toolbar);
  --color-toolbar-icon: var(--toolbar-icon);
  --color-toolbar-icon-hover: var(--toolbar-icon-hover);
```

- [ ] **Step 4: Flatten the Button primitive**

In `apps/desktop/src/components/ui/button.tsx`, replace the `buttonVariants` `variant` block (the `primary`/`secondary`/`ghost`/`active` entries) with flatter versions (drop the heavy `shadow-*`/`ring` cues; keep a calm hover and a flat active):
```ts
      variant: {
        primary: "bg-brand text-primary-foreground hover:bg-brand/90",
        secondary: "bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.09]",
        ghost: "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
        active: "bg-brand-soft text-brand hover:bg-brand-soft",
      },
```

- [ ] **Step 5: Verify typecheck + build**

Run: `pnpm --filter openstory-desktop typecheck && pnpm --filter openstory-desktop build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/styles.css apps/desktop/src/components/ui/button.tsx
git commit -m "feat(desktop): flat Storybook surfaces + toolbar tokens; flatten buttons"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 7: Toolbar icons (desktop)

**Files:**
- Modify: `apps/desktop/src/lib/icons.ts`

The toolbar needs icons for: reload, zoom in, zoom out, reset, measure (ruler), grid, outline (dashed square), plus monitor/smartphone/external-link/shrink (already exported).

- [ ] **Step 1: Add re-exports**

In `apps/desktop/src/lib/icons.ts`, add these names to the existing `export { … } from "@hugeicons/core-free-icons";` block:
```ts
  RefreshIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  Ruler01Icon,
  GridIcon,
  DashedLine02Icon,
  RecordIcon,
```

**Verify the names exist:** `@hugeicons/core-free-icons` export names vary by version. Before committing, confirm each name is a real export:
```bash
node -e "const m=require('@hugeicons/core-free-icons'); for (const n of ['RefreshIcon','ZoomInAreaIcon','ZoomOutAreaIcon','Ruler01Icon','GridIcon','DashedLine02Icon','RecordIcon']) console.log(n, !!m[n])"
```
For any that prints `false`, find the nearest real export and use it instead (e.g. `grep` the package's `dist` for a similar name): reload → `RefreshIcon`/`ReloadIcon`/`ArrowReloadHorizontalIcon`; zoom → `ZoomInAreaIcon`/`SearchAdd01Icon`/`ZoomIcon`; reset → `RefreshIcon`; ruler → `Ruler01Icon`/`RulerIcon`; grid → `GridIcon`/`Grid01Icon`; outline → `DashedLine02Icon`/`SelectionIcon`/`Tag01Icon`. Update both this file and the icon names referenced in Task 10's toolbar to match the chosen exports. Use the same name in both places.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: PASS (no "has no exported member" errors from `lib/icons`).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/lib/icons.ts
git commit -m "feat(desktop): re-export toolbar icons (zoom, reload, ruler, grid, outline)"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 8: Zoom helpers + addon types (desktop)

**Files:**
- Create: `apps/desktop/src/lib/preview-view.ts`
- Test: `apps/desktop/src/lib/preview-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/lib/preview-view.test.ts
import { describe, it, expect } from "vitest";
import { clampZoom, zoomStep, zoomLabel, ZOOM_MIN, ZOOM_MAX } from "./preview-view";

describe("clampZoom", () => {
  it("clamps below min and above max", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("zoomStep", () => {
  it("steps up and down by a multiplicative factor, clamped", () => {
    expect(zoomStep(1, 1)).toBeCloseTo(1.25);
    expect(zoomStep(1, -1)).toBeCloseTo(0.8);
    expect(zoomStep(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(zoomStep(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});

describe("zoomLabel", () => {
  it("renders a rounded percentage", () => {
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(1.25)).toBe("125%");
    expect(zoomLabel(0.8)).toBe("80%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter openstory-desktop test -- preview-view`
Expected: FAIL — "Cannot find module './preview-view'".

- [ ] **Step 3: Implement**

```ts
// apps/desktop/src/lib/preview-view.ts
// Renderer-local view state for the editor canvas: zoom + which preview addons
// are active. (Addons run inside the iframe; see @gobrand/openstory-runtime.)

export const ADDONS = ["outline", "grid", "measure"] as const;
export type AddonName = (typeof ADDONS)[number];
export type AddonState = Record<AddonName, boolean>;

export const NO_ADDONS: AddonState = { outline: false, grid: false, measure: false };

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;
const ZOOM_FACTOR = 1.25;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// Multiplicative zoom step (Storybook-style): in multiplies, out divides.
export function zoomStep(z: number, dir: 1 | -1): number {
  return clampZoom(dir === 1 ? z * ZOOM_FACTOR : z / ZOOM_FACTOR);
}

export function zoomLabel(z: number): string {
  return `${Math.round(z * 100)}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter openstory-desktop test -- preview-view`
Expected: PASS (3 describes).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/preview-view.ts apps/desktop/src/lib/preview-view.test.ts
git commit -m "feat(desktop): zoom helpers + addon-state types"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 9: Sync addon state to the iframe + expose reload (desktop)

**Files:**
- Modify: `apps/desktop/src/lib/use-harness-bridge.ts`

Extend the bridge hook to (a) post `os:addon` for each addon whenever addon state changes and on `pl:ready`, and (b) return a `reload()` that posts `os:reload`. The new `addons` param is optional so the existing call site keeps compiling until Task 10.

- [ ] **Step 1: Add imports + signature**

In `apps/desktop/src/lib/use-harness-bridge.ts`, add the import:
```ts
import { ADDONS, NO_ADDONS, type AddonState } from "./preview-view";
```
Change the hook signature to accept addons and return a reload handle:
```ts
export function useHarnessBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  selection: AppState["selection"],
  api: Api,
  addons: AddonState = NO_ADDONS,
): { reload: () => void } {
```

- [ ] **Step 2: Add addon-posting refs**

After the existing `postRef` block (and before `propOverridesKey`), add a ref that posts all addon states to the iframe, plus a stable `reload`:
```ts
  const addonsRef = useRef(addons);
  addonsRef.current = addons;

  const postAddonsRef = useRef<() => void>(() => {});
  postAddonsRef.current = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    for (const addon of ADDONS) {
      win.postMessage({ type: "os:addon", addon, enabled: addonsRef.current[addon] }, "*");
    }
  };

  const reload = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: "os:reload" }, "*");
  };
```

- [ ] **Step 3: Post addons on change**

Add an effect after the existing `propOverrides` effect:
```ts
  // Re-post addon toggles whenever they change.
  const addonsKey = JSON.stringify(addons);
  useEffect(() => {
    postAddonsRef.current();
  }, [addonsKey]);
```

- [ ] **Step 4: Re-post addons on `pl:ready`**

In the `onMessage` handler inside the readiness effect, extend the `pl:ready` branch so addons are re-applied after a (re)load:
```ts
      if (type === "pl:ready") {
        postRef.current();
        postAddonsRef.current();
      }
```

- [ ] **Step 5: Return the reload handle**

At the end of the hook body, add:
```ts
  return { reload };
```

- [ ] **Step 6: Verify typecheck + build**

Run: `pnpm --filter openstory-desktop typecheck && pnpm --filter openstory-desktop build`
Expected: PASS. (The existing `useHarnessBridge(iframeRef, state.selection, api)` call still compiles — `addons` defaults, return value is ignored.)

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/lib/use-harness-bridge.ts
git commit -m "feat(desktop): bridge syncs addon state + exposes reload"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 10: Editor shell — edge-to-edge canvas, zoom, icon toolbar, Controls/Code tabs (desktop)

These three files change in lockstep (shared prop contracts), so they're one task to keep the build green. Visual change — verified by typecheck + build + the manual smoke in Task 11.

**Files:**
- Modify: `apps/desktop/src/components/toolbar.tsx`
- Modify: `apps/desktop/src/components/right-panel.tsx`
- Modify: `apps/desktop/src/views/main-app.tsx`

- [ ] **Step 1: Rewrite the toolbar**

Replace the entire contents of `apps/desktop/src/components/toolbar.tsx` with:
```tsx
import type { AppState, ManifestComponent } from "../../electron/types";
import type { Api } from "../lib/api";
import type { AddonName, AddonState } from "../lib/preview-view";
import { zoomLabel } from "../lib/preview-view";
import { cn } from "../lib/utils";
import {
  HugeiconsIcon,
  ComputerIcon,
  SmartPhone01Icon,
  LinkSquare02Icon,
  ArrowShrink02Icon,
  RefreshIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  Ruler01Icon,
  GridIcon,
  DashedLine02Icon,
} from "../lib/icons";

type Story = ManifestComponent["stories"][number] | undefined;

const ADDON_ICONS: Record<AddonName, typeof Ruler01Icon> = {
  measure: Ruler01Icon,
  grid: GridIcon,
  outline: DashedLine02Icon,
};
const ADDON_LABELS: Record<AddonName, string> = {
  measure: "Measure",
  grid: "Grid",
  outline: "Outline",
};

// Icon-only canvas toolbar (Storybook-style): reload · zoom · addons · viewport · pop-out.
export function Toolbar({
  state,
  api,
  component,
  story,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  addons,
  onToggleAddon,
  onReload,
}: {
  state: AppState;
  api: Api;
  component: ManifestComponent | undefined;
  story: Story;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  addons: AddonState;
  onToggleAddon: (addon: AddonName) => void;
  onReload: () => void;
}) {
  function setViewport(viewport: "desktop" | "mobile") {
    if (component && story) {
      api?.invoke("preview:set", { componentId: component.id, storyId: story.id, viewport });
    }
  }

  const noPreview = !component;

  return (
    <div className="no-drag flex h-11 shrink-0 items-center gap-1 border-b border-border bg-toolbar px-2">
      <ToolButton title="Reload" icon={RefreshIcon} disabled={noPreview} onClick={onReload} />
      <Divider />
      <ToolButton title="Zoom out" icon={ZoomOutAreaIcon} disabled={noPreview} onClick={onZoomOut} />
      <span className="min-w-[38px] text-center text-[11px] tabular-nums text-toolbar-icon">
        {zoomLabel(zoom)}
      </span>
      <ToolButton title="Zoom in" icon={ZoomInAreaIcon} disabled={noPreview} onClick={onZoomIn} />
      <ToolButton
        title="Reset zoom"
        icon={RefreshIcon}
        disabled={noPreview || zoom === 1}
        onClick={onZoomReset}
      />
      <Divider />
      {(["measure", "grid", "outline"] as const).map((addon) => (
        <ToolButton
          key={addon}
          title={ADDON_LABELS[addon]}
          icon={ADDON_ICONS[addon]}
          active={addons[addon]}
          disabled={noPreview}
          onClick={() => onToggleAddon(addon)}
        />
      ))}

      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-foreground/[0.04] p-0.5">
          {(["desktop", "mobile"] as const).map((v) => {
            const on = state.selection.viewport === v;
            return (
              <button
                key={v}
                type="button"
                disabled={noPreview}
                onClick={() => setViewport(v)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors disabled:opacity-40",
                  on
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <HugeiconsIcon
                  icon={v === "desktop" ? ComputerIcon : SmartPhone01Icon}
                  className="size-3.5"
                />
                {v === "desktop" ? "Desktop" : "Mobile"}
              </button>
            );
          })}
        </div>
        <Divider />
        <ToolButton
          title={state.detachedOpen ? "Pop in" : "Open in new window"}
          icon={state.detachedOpen ? ArrowShrink02Icon : LinkSquare02Icon}
          onClick={() => api?.invoke(state.detachedOpen ? "preview:popIn" : "preview:popOut")}
        />
      </div>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

function ToolButton({
  title,
  icon,
  onClick,
  active = false,
  disabled = false,
}: {
  title: string;
  icon: typeof RefreshIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px]",
        active
          ? "bg-brand-soft text-brand"
          : "text-toolbar-icon hover:bg-foreground/[0.06] hover:text-toolbar-icon-hover",
      )}
    >
      <HugeiconsIcon icon={icon} />
    </button>
  );
}
```
(If Task 7 chose different icon export names, use those same names in the import + `ADDON_ICONS` here.)

- [ ] **Step 2: Add the Controls/Code tab header to the right panel**

In `apps/desktop/src/components/right-panel.tsx`, change the `RightPanel` component to own a tab row. Replace the import of `PanelMode` and the `RightPanel` function (lines importing `PanelMode` from `./toolbar`, and the `RightPanel` definition) with:

Replace:
```tsx
import type { PanelMode } from "./toolbar";
```
with:
```tsx
export type PanelTab = "controls" | "code";
```
Replace the whole `RightPanel` function (the `export function RightPanel({ … }) { … }` block) with:
```tsx
export function RightPanel({
  tab,
  onTabChange,
  state,
  api,
  component,
  story,
  onSetControl,
}: {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  state: AppState;
  api: Api;
  component: ManifestComponent;
  story: Story;
  onSetControl: (name: string, value: unknown) => void;
}) {
  return (
    <aside className="flex w-[320px] flex-col overflow-hidden border-l border-border bg-sidebar">
      <div className="flex h-11 shrink-0 items-center gap-4 border-b border-border px-4">
        {(["controls", "code"] as const).map((t) => {
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTabChange(t)}
              className={cn(
                "relative flex h-11 items-center text-[12px] transition-colors",
                on ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "controls" ? "Controls" : "Code"}
              {on && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />
              )}
            </button>
          );
        })}
      </div>
      {tab === "code" ? (
        <CodePanel state={state} api={api} component={component} story={story} />
      ) : (
        <InspectPanel state={state} component={component} story={story} onSetControl={onSetControl} />
      )}
    </aside>
  );
}
```
Add `cn` to the imports at the top of the file:
```tsx
import { cn } from "../lib/utils";
```
In `InspectPanel`, remove the now-redundant `SectionHeader` (the tab names the section). Change the `<section …>` block so it no longer renders `SectionHeader` — replace:
```tsx
        <section className="flex flex-col gap-3">
          <SectionHeader
            icon={<HugeiconsIcon icon={SlidersHorizontalIcon} className="size-3" />}
            title="Controls"
            subtitle="Tweak props live"
          />
          <div className="flex flex-col gap-4">
```
with:
```tsx
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-4">
```
Then delete the now-unused `SectionHeader` function and drop `SlidersHorizontalIcon` from the `lib/icons` import in this file (leave `HugeiconsIcon` and `Copy01Icon`). Run typecheck (Step 4) to confirm no unused-symbol errors remain.

- [ ] **Step 3: Wire the editor shell in `main-app.tsx`**

In `apps/desktop/src/views/main-app.tsx`:

(a) Update imports — replace:
```tsx
import { Toolbar, type PanelMode } from "../components/toolbar";
import { RightPanel } from "../components/right-panel";
```
with:
```tsx
import { Toolbar } from "../components/toolbar";
import { RightPanel, type PanelTab } from "../components/right-panel";
import { NO_ADDONS, clampZoom, zoomStep, type AddonName, type AddonState } from "../lib/preview-view";
```

(b) Replace the state + bridge lines. Replace:
```tsx
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useHarnessBridge(iframeRef, state.selection, api);

  const [panelMode, setPanelMode] = useState<PanelMode>("inspect");
  const [paletteOpen, setPaletteOpen] = useState(false);
```
with:
```tsx
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [addons, setAddons] = useState<AddonState>(NO_ADDONS);
  const [panelTab, setPanelTab] = useState<PanelTab>("controls");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { reload } = useHarnessBridge(iframeRef, state.selection, api, addons);

  function toggleAddon(addon: AddonName) {
    setAddons((a) => ({ ...a, [addon]: !a[addon] }));
  }
```

(c) Replace the `<Toolbar … />` element with the new props:
```tsx
          <Toolbar
            state={state}
            api={api}
            component={component}
            story={story}
            zoom={zoom}
            onZoomIn={() => setZoom((z) => zoomStep(z, 1))}
            onZoomOut={() => setZoom((z) => zoomStep(z, -1))}
            onZoomReset={() => setZoom(1)}
            addons={addons}
            onToggleAddon={toggleAddon}
            onReload={reload}
          />
```

(d) Replace the canvas container (the `<div className="relative flex flex-1 items-center justify-center overflow-auto p-6">` block down through its closing `</div>`) with an edge-to-edge, zoomable canvas:
```tsx
          <div className="relative flex-1 overflow-auto bg-canvas">
            {state.iframeUrl ? (
              <div
                className="h-full w-full origin-top-left"
                style={{
                  transform: `scale(${clampZoom(zoom)})`,
                  width: `${100 / clampZoom(zoom)}%`,
                  height: `${100 / clampZoom(zoom)}%`,
                }}
              >
                <iframe
                  ref={iframeRef}
                  src={state.iframeUrl}
                  className="h-full w-full border-0 bg-transparent"
                />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <CanvasEmpty vite={state.vite} />
              </div>
            )}
            {docsComponent && <DocsStub componentName={docsComponent.id} />}
            {state.iframeUrl && !component && !docsComponent && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas p-6">
                <CanvasEmpty vite={state.vite} emptyRepo />
              </div>
            )}
          </div>
```

(e) Replace the right-panel render. Replace:
```tsx
        {component && panelMode && (
          <RightPanel
            mode={panelMode}
            state={state}
            api={api}
            component={component}
            story={story}
            onSetControl={setControl}
          />
        )}
```
with:
```tsx
        {component && (
          <RightPanel
            tab={panelTab}
            onTabChange={setPanelTab}
            state={state}
            api={api}
            component={component}
            story={story}
            onSetControl={setControl}
          />
        )}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm --filter openstory-desktop typecheck && pnpm --filter openstory-desktop build`
Expected: PASS. (No remaining references to `PanelMode`/`panelMode`/`setPanelMode`. If typecheck flags an unused import like `Separator` or `PackageIcon` in `toolbar.tsx`, they were removed in the rewrite — ensure no dangling imports remain.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/toolbar.tsx apps/desktop/src/components/right-panel.tsx apps/desktop/src/views/main-app.tsx
git commit -m "feat(desktop): edge-to-edge canvas, zoom, icon toolbar, Controls/Code tabs"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 11: Full verification + manual smoke

- [ ] **Step 1: Whole monorepo green**

Run: `pnpm -w typecheck && pnpm -w test`
Expected: PASS — runtime (outline/grid/measure/index + preview-host), desktop (preview-view + existing build-tree/search/selection).

Run: `pnpm --filter openstory-desktop build`
Expected: PASS.

- [ ] **Step 2: Manual smoke — the redesign**

Run: `pnpm --filter openstory-desktop dev`, load `examples/linkedin-starter`, and confirm:
- Canvas is **edge-to-edge white** (no floating bordered card, no gray margin).
- Toolbar is the **icon row**: reload · zoom out · % · zoom in · reset · | · measure · grid · outline · … · Desktop/Mobile · | · pop-out. No component pill.
- **Zoom** in/out changes the preview scale and the % label; reset returns to 100% (and is disabled at 100%).
- **Reload** remounts the preview (component re-renders).
- **Grid** overlays gridlines; **Outline** outlines every element; **Measure** draws the box-model on hover. Each toggles on/off and shows the blue active state.
- Right panel shows **Controls / Code tabs** (blue underline on active); switching tabs swaps the body; editing a control still updates the preview.
- **Pop out** opens the detached window; the icon flips to Pop in.
- Toggle **dark mode** (settings): canvas `#1b1c1d`, surfaces `#222425`, bar `#292c2e`, hairline borders — matches Storybook dark. Re-check each tool in dark.

- [ ] **Step 3: Fix-and-regress (only if a defect surfaces)**

If the manual smoke surfaces a defect, fix it under superpowers:systematic-debugging and add a regression test (pure helper if possible) before re-running Step 1. No code change expected here otherwise.

---

## Notes for the implementer

- **Run order matters:** runtime addons (1–5) ship first and independently; the desktop UI tasks (6–10) build on the host helpers. Don't fix a later task's type error inside an earlier task — each task's verify step must pass on its own (Task 9 keeps the old call site compiling via the optional `addons` param; Task 10 then consumes it).
- **`os:*` messages bypass the `pl:*` bridge schema** on purpose (Task 5 handles them raw before `parseBridgeMessage`), so `bridge.ts` needs no change.
- **Idempotent setters:** every addon `setEnabled` no-ops if already in the desired state, so posting all three addons on every change / on `pl:ready` is safe.
- **Icon names are the one external unknown** (Task 7) — verify against the installed `@hugeicons/core-free-icons` and keep the chosen names consistent between `lib/icons.ts` and `toolbar.tsx`.
- **Zoom width trick:** scaling the iframe with `transform: scale` and setting its wrapper `width/height` to `100/zoom %` keeps the scaled content filling the canvas (Storybook's approach), with `overflow:auto` enabling scroll when zoomed in.
```
