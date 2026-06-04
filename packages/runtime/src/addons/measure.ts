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
        {
          top: px(s.marginTop),
          right: px(s.marginRight),
          bottom: px(s.marginBottom),
          left: px(s.marginLeft),
        },
        {
          top: px(s.borderTopWidth),
          right: px(s.borderRightWidth),
          bottom: px(s.borderBottomWidth),
          left: px(s.borderLeftWidth),
        },
        {
          top: px(s.paddingTop),
          right: px(s.paddingRight),
          bottom: px(s.paddingBottom),
          left: px(s.paddingLeft),
        },
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
