import type { ComponentType, ReactNode } from 'react';

export type Viewport = {
  width: number;
  height?: number;
  dpr?: number;
};

export type Platform =
  | 'linkedin'
  | 'x'
  | 'instagram'
  | 'tiktok'
  | 'threads'
  | 'facebook'
  | 'youtube'
  | 'bluesky';

export type Fixture<TProps = unknown> = {
  id: string;
  label: string;
  props: TProps;
  notes?: string;
};

// =============================================================================
// Control derivation (editable controls inferred from fixture prop values)
// =============================================================================

export type ManifestControl = {
  name: string;
  kind: 'text' | 'boolean' | 'number';
};

function controlKind(value: unknown): ManifestControl['kind'] | 'skip' | null {
  if (value === null || value === undefined) return null; // no kind yet, keep looking
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'skip'; // object / array / function / ReactNode — not inline-editable
}

/**
 * Infer an editable control per prop from the fixtures' values. Keys are unioned
 * across all fixtures in first-seen order; a prop that is ever non-primitive is
 * dropped; a prop that is only ever null/undefined is dropped.
 */
export function deriveControls(fixtures: Fixture[]): ManifestControl[] {
  const order: string[] = [];
  const kinds = new Map<string, ManifestControl['kind'] | 'skip' | null>();

  for (const fixture of fixtures) {
    const props = (fixture.props ?? {}) as Record<string, unknown>;
    for (const [name, value] of Object.entries(props)) {
      if (!kinds.has(name)) {
        order.push(name);
        kinds.set(name, null);
      }
      const current = kinds.get(name);
      if (current === 'skip') continue;
      const k = controlKind(value);
      if (k === 'skip') kinds.set(name, 'skip');
      else if (k && current === null) kinds.set(name, k);
    }
  }

  return order
    .map((name) => ({ name, kind: kinds.get(name) }))
    .filter(
      (c): c is ManifestControl =>
        c.kind === 'text' || c.kind === 'boolean' || c.kind === 'number'
    );
}

export type PreviewDef<TProps = unknown> = {
  id: string;
  platform: Platform;
  component: ComponentType<TProps>;
  fixtures: Fixture<TProps>[];
  viewports?: Partial<Record<'desktop' | 'mobile', Viewport>>;
};

// A registered preview, erased of its TProps so heterogeneous previews coexist
// in `previews[]`. ComponentType<never> accepts any component (contravariance).
export type RegisteredPreview = {
  id: string;
  platform: Platform;
  component: ComponentType<never>;
  fixtures: Fixture<unknown>[];
  viewports?: Partial<Record<'desktop' | 'mobile', Viewport>>;
};

export type OpenStoryConfig = {
  previews: RegisteredPreview[];
  providers?: ComponentType<{ children: ReactNode }>;
  styles?: string[];
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
    };

export type StoriesDef<TProps> = {
  /** The component being previewed. */
  component: ComponentType<TProps>;
  /** Which social platform this maps to. */
  platform: Platform;
  /** Optional explicit id; defaults to the component's displayName/name. */
  id?: string;
  /** Per-platform viewport overrides. Defaults are applied per platform. */
  viewports?: Partial<Record<'desktop' | 'mobile', Viewport>>;
  /**
   * The stories. Keys become both the id (kebab-cased) and the human label
   * (Title Cased). Pass either the props object directly or
   * `{ args, label?, notes? }` for more control.
   */
  stories: Record<string, Story<TProps>>;
};

function humanize(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

function isLonghandStory<TProps>(
  story: Story<TProps>
): story is { args: TProps; label?: string; notes?: string } {
  return (
    typeof story === 'object' &&
    story !== null &&
    'args' in (story as Record<string, unknown>)
  );
}

/**
 * Define a set of stories for a single component. Storybook-style DX:
 *
 * ```tsx
 * export default defineStories({
 *   component: LinkedinPreview,
 *   platform: 'linkedin',
 *   stories: {
 *     ShortText: { text: 'Hello', author: { ... } },
 *     LongText: { args: { text: '...' }, label: 'Long (show more)' },
 *   },
 * })
 * ```
 *
 * Returns a `RegisteredPreview` ready to drop into `previews: [...]`.
 */
export function defineStories<TProps>(
  def: StoriesDef<TProps>
): RegisteredPreview {
  const fixtures: Fixture<unknown>[] = Object.entries(def.stories).map(
    ([key, story]) => {
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
      return fixture;
    }
  );

  const componentName =
    def.component.displayName ?? def.component.name ?? 'preview';
  const autoId = kebabCase(componentName.replace(/Preview$/, '')) || 'preview';

  const result: RegisteredPreview = {
    id: def.id ?? autoId,
    platform: def.platform,
    component: def.component as unknown as ComponentType<never>,
    fixtures,
  };
  if (def.viewports !== undefined) {
    result.viewports = def.viewports;
  }
  return result;
}
