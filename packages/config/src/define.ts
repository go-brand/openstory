import type { ComponentType, ReactNode } from "react";
import type { Preset } from "./presets.js";
import type { OpenStoryIdentityConfig } from "./identity.js";

export type Viewport = {
  width: number;
  height?: number;
  dpr?: number;
};

export type PreviewPadding =
  | number
  | {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };

export type Fixture<TProps = unknown> = {
  id: string;
  label: string;
  props: TProps;
  notes?: string;
  /** Extra preview chrome around this fixture, outside the component itself. */
  previewPadding?: PreviewPadding;
};

// =============================================================================
// Control derivation (editable controls inferred from fixture prop values)
// =============================================================================

export type ManifestControl = {
  name: string;
  kind: "text" | "boolean" | "number" | "select" | "radio";
  /** Allowed values; present only for `select` / `radio`. */
  options?: string[];
};

export type ManifestDoc = {
  /** Unique key: frontmatter `id`, else kebab of the filename sans ".stories.md". */
  id: string;
  /** Display label: frontmatter `title`, else humanized filename. */
  title: string;
  /** Slash-delimited sidebar path. "" means the sidebar root. */
  group: string;
  /** Auto-derived workspace section (package basename) or null. */
  section: string | null;
  /** Markdown body rendered to HTML (Node side), with `:::story` already
   *  replaced by `<div data-openstory-story="<id>">` placeholders. */
  html: string;
  /** Story ids referenced by `:::story` directives, in document order. */
  embeds: string[];
  /** Absolute path of the source `.md` file (Code panel + section derivation). */
  sourcePath: string;
  /** Optional frontmatter metadata. */
  status?: "shipped" | "beta" | "planned";
  owner?: string;
};

function controlKind(value: unknown): ManifestControl["kind"] | "skip" | null {
  if (value === null || value === undefined) return null; // no kind yet, keep looking
  if (typeof value === "string") return "text";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "skip"; // object / array / function / ReactNode — not inline-editable
}

/**
 * Infer an editable control per prop from the fixtures' values. Keys are unioned
 * across all fixtures in first-seen order; a prop that is ever non-primitive is
 * dropped; a prop that is only ever null/undefined is dropped.
 */
export function deriveControls(fixtures: Fixture[]): ManifestControl[] {
  const order: string[] = [];
  const kinds = new Map<string, ManifestControl["kind"] | "skip" | null>();

  for (const fixture of fixtures) {
    const props = (fixture.props ?? {}) as Record<string, unknown>;
    for (const [name, value] of Object.entries(props)) {
      if (!kinds.has(name)) {
        order.push(name);
        kinds.set(name, null);
      }
      const current = kinds.get(name);
      if (current === "skip") continue;
      const k = controlKind(value);
      if (k === "skip") kinds.set(name, "skip");
      else if (k && current === null) kinds.set(name, k);
    }
  }

  return order
    .map((name) => ({ name, kind: kinds.get(name) }))
    .filter(
      (c): c is ManifestControl => c.kind === "text" || c.kind === "boolean" || c.kind === "number",
    );
}

/**
 * Merge type-derived controls over value-inferred ones. Types are
 * authoritative (they know an enum from free text); props with no type info
 * fall back to `deriveControls`. With an empty `typeControls`, output is
 * identical to `deriveControls(fixtures)` — preserving zero-config behavior.
 *
 * Every prop the component's types declare becomes a control, Storybook-style:
 * fixture props come first in first-seen order (matching `deriveControls`),
 * then any typed prop absent from every fixture is appended in `typeControls`
 * order. A typed-only prop starts unset and edits in from its widget.
 */
export function mergeControls(
  fixtures: Fixture[],
  typeControls: Record<string, ManifestControl> = {},
): ManifestControl[] {
  const valueDerived = new Map(deriveControls(fixtures).map((c) => [c.name, c]));

  const order: string[] = [];
  const seen = new Set<string>();
  for (const fixture of fixtures) {
    const props = (fixture.props ?? {}) as Record<string, unknown>;
    for (const name of Object.keys(props)) {
      if (!seen.has(name)) {
        seen.add(name);
        order.push(name);
      }
    }
  }
  // Append typed props that no fixture exercises, so the panel exposes the
  // component's full prop surface rather than only what stories happen to set.
  for (const name of Object.keys(typeControls)) {
    if (!seen.has(name)) {
      seen.add(name);
      order.push(name);
    }
  }

  const out: ManifestControl[] = [];
  for (const name of order) {
    const fromType = typeControls[name];
    if (fromType) {
      out.push(fromType);
      continue;
    }
    const fromValue = valueDerived.get(name);
    if (fromValue) out.push(fromValue);
  }
  return out;
}

export type ComponentDef<TProps = unknown> = {
  id: string;
  /** Slash-delimited sidebar path, e.g. "Design System/Forms/Button". Omit to
   *  place the component at the sidebar root, labeled by component name. */
  group?: string;
  /** Named render preset (viewport + chrome). Omit for the neutral default. */
  preset?: string;
  /** Extra preview chrome around every fixture, outside the component itself. */
  previewPadding?: PreviewPadding;
  component: ComponentType<TProps>;
  fixtures: Fixture<TProps>[];
  viewports?: Partial<Record<"desktop" | "mobile", Viewport>>;
  /**
   * Path (relative to the project root) of the file shown in the desktop app's
   * "Code" panel — typically the component's source file. The vite-plugin
   * resolves it to an absolute path when building the manifest. Omit to fall
   * back to a generated usage snippet.
   */
  sourcePath?: string;
};

// A registered component, erased of its TProps so heterogeneous components coexist
// in `components[]`. ComponentType<never> accepts any component (contravariance).
export type RegisteredComponent = {
  id: string;
  /** Human display label for the sidebar (decoupled from the unique id).
   *  Always set by defineStories; optional for raw literals. */
  name?: string;
  group?: string;
  preset?: string;
  /** Extra preview chrome around every fixture, outside the component itself. */
  previewPadding?: PreviewPadding;
  component: ComponentType<never>;
  fixtures: Fixture<unknown>[];
  viewports?: Partial<Record<"desktop" | "mobile", Viewport>>;
  /** Project-root-relative source file for the "Code" panel. See ComponentDef. */
  sourcePath?: string;
};

export type OpenStoryConfig = {
  /** Optional human-facing labels for the containing repository and this runnable workspace. */
  identity?: OpenStoryIdentityConfig;
  components?: RegisteredComponent[];
  /** Glob patterns (relative to project root) for auto-discovered story files.
   *  Omit for the default ["**\/*.stories.{ts,tsx}"]. */
  stories?: string[];
  providers?: ComponentType<{ children: ReactNode }>;
  styles?: string[];
  /** User-defined render presets, merged over the built-ins. */
  presets?: Record<string, Preset>;
};

export function defineOpenStoryConfig<C extends OpenStoryConfig>(config: C): C {
  return config;
}

// =============================================================================
// Story-based API (Storybook CSF-inspired)
// =============================================================================

/** A single story. Shorthand: just the props. Longhand: { args, label?, notes? } */
export type Story<TProps> =
  | TProps
  | {
      args: TProps;
      label?: string;
      notes?: string;
      /** Extra preview chrome for this story, outside the component itself. */
      previewPadding?: PreviewPadding;
    };

export type StoriesDef<TProps> = {
  /** The component being previewed. */
  component: ComponentType<TProps>;
  /** Slash-delimited sidebar path. Omit to place at the sidebar root. */
  group?: string;
  /** Named render preset (viewport + chrome). Omit for the neutral default. */
  preset?: string;
  /** Extra preview chrome around every story, outside the component itself. */
  previewPadding?: PreviewPadding;
  /** Optional explicit id; defaults to the component's displayName/name. */
  id?: string;
  /** Explicit viewport overrides; otherwise derived from the preset. */
  viewports?: Partial<Record<"desktop" | "mobile", Viewport>>;
  /**
   * Path (relative to the project root) of the file shown in the desktop app's
   * "Code" panel — typically the component's source file. Omit to fall back to
   * a generated usage snippet.
   */
  sourcePath?: string;
  /**
   * The stories. Keys become both the id (kebab-cased) and the human label
   * (Title Cased). Pass either the props object directly or
   * `{ args, label?, notes? }` for more control.
   */
  stories: Record<string, Story<TProps>>;
};

export function humanize(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

function isLonghandStory<TProps>(
  story: Story<TProps>,
): story is { args: TProps; label?: string; notes?: string; previewPadding?: PreviewPadding } {
  return (
    typeof story === "object" && story !== null && "args" in (story as Record<string, unknown>)
  );
}

/**
 * Define a set of stories for a single component. Storybook-style DX:
 *
 * ```tsx
 * export default defineStories({
 *   component: Button,
 *   group: 'Design System',
 *   stories: {
 *     Primary: { variant: 'primary', children: 'Save' },
 *     Danger: { args: { variant: 'danger', children: 'Delete' }, label: 'Destructive' },
 *   },
 * })
 * ```
 *
 * Returns a `RegisteredComponent` ready to drop into `components: [...]`.
 */
export function defineStories<TProps>(def: StoriesDef<TProps>): RegisteredComponent {
  const fixtures: Fixture<unknown>[] = Object.entries(def.stories).map(([key, story]) => {
    const longhand = isLonghandStory(story);
    const args = longhand ? story.args : story;
    const label = longhand ? (story.label ?? humanize(key)) : humanize(key);
    const fixture: Fixture<unknown> = {
      id: kebabCase(key),
      label,
      props: args as unknown,
    };
    if (longhand && story.notes !== undefined) {
      fixture.notes = story.notes;
    }
    if (longhand && story.previewPadding !== undefined) {
      fixture.previewPadding = story.previewPadding;
    }
    return fixture;
  });

  const componentName = def.component.displayName ?? def.component.name ?? "Component";
  // Strip a trailing "Preview" (legacy social-preview components like
  // `LinkedinPreview` → "Linkedin"); harmless for normally-named components.
  const base = componentName.replace(/Preview$/, "");
  const name = humanize(base) || "Component";
  const autoId = kebabCase(base) || "component";

  const result: RegisteredComponent = {
    id: def.id ?? autoId,
    name,
    component: def.component as unknown as ComponentType<never>,
    fixtures,
  };
  if (def.group !== undefined) result.group = def.group;
  if (def.preset !== undefined) result.preset = def.preset;
  if (def.previewPadding !== undefined) result.previewPadding = def.previewPadding;
  if (def.viewports !== undefined) {
    result.viewports = def.viewports;
  }
  if (def.sourcePath !== undefined) {
    result.sourcePath = def.sourcePath;
  }
  return result;
}
