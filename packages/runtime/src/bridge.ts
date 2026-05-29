export type RenderMessage = {
  type: 'pl:render';
  previewId: string;
  variantId: string;
  viewport: 'desktop' | 'mobile';
  fixtureOverrides?: Record<string, unknown>;
};

export type ReadyMessage = {
  type: 'pl:ready';
};

export type ManifestMessage = {
  type: 'pl:manifest';
  previews: Array<{
    id: string;
    platform: string;
    variants: Array<{ id: string; label: string }>;
  }>;
};

export type SizeMessage = {
  type: 'pl:size';
  width: number;
  height: number;
};

export type BridgeMessage =
  | RenderMessage
  | ReadyMessage
  | ManifestMessage
  | SizeMessage;

const KNOWN_TYPES = new Set<BridgeMessage['type']>([
  'pl:render',
  'pl:ready',
  'pl:manifest',
  'pl:size',
]);

export function parseBridgeMessage(input: unknown): BridgeMessage | null {
  if (typeof input !== 'object' || input === null) return null;
  const candidate = input as { type?: unknown };
  if (typeof candidate.type !== 'string') return null;
  if (!KNOWN_TYPES.has(candidate.type as BridgeMessage['type'])) return null;
  return input as BridgeMessage;
}
