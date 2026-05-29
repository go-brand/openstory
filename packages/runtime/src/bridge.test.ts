import { describe, it, expect } from 'vitest';
import { parseBridgeMessage, type BridgeMessage } from './bridge';

describe('parseBridgeMessage', () => {
  it('accepts a valid pl:render message', () => {
    const msg = {
      type: 'pl:render',
      previewId: 'linkedin',
      variantId: 'text-short',
      viewport: 'desktop',
    } as const;

    const result = parseBridgeMessage(msg);
    expect(result?.type).toBe('pl:render');
  });

  it('rejects unknown types', () => {
    expect(parseBridgeMessage({ type: 'pl:unknown' })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(parseBridgeMessage('not-an-object')).toBeNull();
    expect(parseBridgeMessage(null)).toBeNull();
  });
});
