import type { Viewport } from "./define.js";

/**
 * A named render preset: the canvas width(s) a preview renders at and the
 * chrome background painted behind it. OpenStory ships only a neutral `default`;
 * projects define their own presets in `openstory.config.ts` (a design-system
 * column width, a wide docs page, a narrow panel — whatever the project needs).
 */
export type Preset = {
  viewport: { desktop: Viewport; mobile?: Viewport };
  chrome?: { background?: string };
};

/** Neutral canvas behind components with no preset — light enough that white
 *  components show a visible edge, dark enough to read as intentional. */
export const DEFAULT_BACKGROUND = "#f4f4f5";

/**
 * Built-in presets. Only `default` (used when a preview names no preset) ships
 * with OpenStory — the core is not tied to any particular kind of component or
 * platform. Projects add their own presets via `presets` in their config.
 */
export const BUILTIN_PRESETS: Record<string, Preset> = {
  default: {
    viewport: { desktop: { width: 600 }, mobile: { width: 360 } },
    chrome: { background: DEFAULT_BACKGROUND },
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
