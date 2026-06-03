import type { Viewport } from "./define.js";

/**
 * A named render preset: the canvas width(s) a preview renders at and the
 * chrome background painted behind it. Social platforms ship as built-in
 * presets; users add their own in `openstory.config.ts`.
 */
export type Preset = {
  viewport: { desktop: Viewport; mobile?: Viewport };
  chrome?: { background?: string };
};

/** Neutral canvas behind components with no preset — light enough that white
 *  components show a visible edge, dark enough to read as intentional. */
export const DEFAULT_BACKGROUND = "#f4f4f5";

/**
 * Built-in presets. `default` is used when a preview names no preset. The eight
 * social presets carry the canonical post widths and background colors that used
 * to live in `DEFAULT_PLATFORM_WIDTHS` (runtime) and `PLATFORM_BG` (desktop).
 */
export const BUILTIN_PRESETS: Record<string, Preset> = {
  default: {
    viewport: { desktop: { width: 600 }, mobile: { width: 360 } },
    chrome: { background: DEFAULT_BACKGROUND },
  },
  linkedin: {
    viewport: { desktop: { width: 552 }, mobile: { width: 360 } },
    chrome: { background: "#f3f2ef" },
  },
  x: {
    viewport: { desktop: { width: 600 }, mobile: { width: 360 } },
    chrome: { background: "#000000" },
  },
  instagram: {
    viewport: { desktop: { width: 470 }, mobile: { width: 360 } },
    chrome: { background: "#fafafa" },
  },
  tiktok: {
    viewport: { desktop: { width: 540 }, mobile: { width: 360 } },
    chrome: { background: "#000000" },
  },
  threads: {
    viewport: { desktop: { width: 600 }, mobile: { width: 360 } },
    chrome: { background: "#101010" },
  },
  facebook: {
    viewport: { desktop: { width: 524 }, mobile: { width: 360 } },
    chrome: { background: "#f0f2f5" },
  },
  youtube: {
    viewport: { desktop: { width: 720 }, mobile: { width: 360 } },
    chrome: { background: "#0f0f0f" },
  },
  bluesky: {
    viewport: { desktop: { width: 600 }, mobile: { width: 360 } },
    chrome: { background: "#ffffff" },
  },
};

/** Merge user-defined presets over the built-ins (user wins on name clash). */
export function resolvePresets(userPresets?: Record<string, Preset>): Record<string, Preset> {
  return { ...BUILTIN_PRESETS, ...userPresets };
}

/** A fully-resolved render block: concrete widths per viewport + background. */
export type ResolvedRender = {
  viewport: { desktop: Viewport; mobile: Viewport };
  background: string;
};

/**
 * Resolve a preview's render block. Resolution order per viewport:
 * explicit `viewports` > named `preset` > `default` preset.
 */
export function resolveRender(
  preview: { preset?: string; viewports?: Partial<Record<"desktop" | "mobile", Viewport>> },
  presets: Record<string, Preset>,
): ResolvedRender {
  const fallback = presets.default ?? BUILTIN_PRESETS.default!;
  const preset = (preview.preset && presets[preview.preset]) || fallback;
  const desktop = preview.viewports?.desktop ?? preset.viewport.desktop;
  const mobile = preview.viewports?.mobile ?? preset.viewport.mobile ?? fallback.viewport.mobile!;
  const background = preset.chrome?.background ?? DEFAULT_BACKGROUND;
  return { viewport: { desktop, mobile }, background };
}
