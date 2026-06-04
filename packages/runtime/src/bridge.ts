export type RenderMessage = {
  type: "pl:render";
  componentId: string;
  storyId: string;
  viewport: "desktop" | "mobile";
  fixtureOverrides?: Record<string, unknown>;
  /**
   * `story` (default) renders the single selected fixture on the canvas; `docs`
   * renders the component's auto-docs page — title + every story stacked
   * vertically in one scrollable document, mirroring Storybook's Docs view.
   * In docs mode `storyId`/`fixtureOverrides` are ignored.
   */
  mode?: "story" | "docs";
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

export type BridgeMessage = RenderMessage | ReadyMessage | ManifestMessage | SizeMessage;

const KNOWN_TYPES = new Set<BridgeMessage["type"]>([
  "pl:render",
  "pl:ready",
  "pl:manifest",
  "pl:size",
]);

export function parseBridgeMessage(input: unknown): BridgeMessage | null {
  if (typeof input !== "object" || input === null) return null;
  const candidate = input as { type?: unknown };
  if (typeof candidate.type !== "string") return null;
  if (!KNOWN_TYPES.has(candidate.type as BridgeMessage["type"])) return null;
  return input as BridgeMessage;
}
