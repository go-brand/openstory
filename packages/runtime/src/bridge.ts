export type RenderMessage = {
  type: "pl:render";
  componentId: string;
  storyId: string;
  viewport: "desktop" | "mobile";
  /** Per-selection layout override; absent falls back to the component's
   *  declared `layout`. Applies to both story and docs render modes. */
  layout?: "padded" | "centered" | "fullscreen";
  fixtureOverrides?: Record<string, unknown>;
  /**
   * `story` (default) renders the single selected fixture on the canvas; `docs`
   * renders the component's auto-docs page — title + every story stacked
   * vertically in one scrollable document, mirroring Storybook's Docs view.
   * In docs mode `storyId`/`fixtureOverrides` are ignored.
   * `page` renders a feature doc: trusted project HTML with embedded stories.
   */
  mode?: "story" | "docs" | "page";
  /** Present only in `page` mode: the feature doc's rendered HTML + embed ids. */
  pageHtml?: string;
  pageEmbeds?: string[];
};

export type ReadyMessage = {
  type: "pl:ready";
};

export type ManifestMessage = {
  type: "pl:manifest";
  components: Array<{
    id: string;
    group: string;
    stories: Array<{ id: string; label: string }>;
  }>;
};

export type SizeMessage = {
  type: "pl:size";
  width: number;
  height: number;
};

/** Where a clicked in-doc link should navigate. Posted by DocHost (runtime) to
 *  the manager via `pl:navigate`; the manager maps each kind to a selection IPC.
 *  `external` opens in the user's real browser. */
export type NavigateTarget =
  | { kind: "page"; id: string }
  | { kind: "docs"; componentId: string }
  | { kind: "story"; componentId: string; storyId: string }
  | { kind: "external"; href: string };

export type NavigateMessage = {
  type: "pl:navigate";
  target: NavigateTarget;
};

export type BridgeMessage =
  | RenderMessage
  | ReadyMessage
  | ManifestMessage
  | SizeMessage
  | NavigateMessage;

const KNOWN_TYPES = new Set<BridgeMessage["type"]>([
  "pl:render",
  "pl:ready",
  "pl:manifest",
  "pl:size",
  "pl:navigate",
]);

export function parseBridgeMessage(input: unknown): BridgeMessage | null {
  if (typeof input !== "object" || input === null) return null;
  const candidate = input as { type?: unknown };
  if (typeof candidate.type !== "string") return null;
  if (!KNOWN_TYPES.has(candidate.type as BridgeMessage["type"])) return null;
  return input as BridgeMessage;
}
