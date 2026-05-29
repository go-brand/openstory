import { describe, it, expect } from 'vitest';
import { buildHarnessEntry } from './harness-loader';

describe('buildHarnessEntry', () => {
  it('imports the consumer config and mounts the runtime', () => {
    const code = buildHarnessEntry('/abs/path/openstory.config.ts');
    expect(code).toContain("from '@gobrand/openstory-runtime'");
    expect(code).toContain("from '/abs/path/openstory.config.ts'");
    expect(code).toContain('mountPreviewHost');
  });

  it('normalizes Windows backslash paths to forward slashes', () => {
    const code = buildHarnessEntry('C:\\Users\\me\\proj\\openstory.config.ts');
    expect(code).toContain("from 'C:/Users/me/proj/openstory.config.ts'");
    expect(code).not.toContain('\\');
  });
});

import { buildManifest } from './plugin';
import { deriveControls } from '@gobrand/openstory-config';
import type { OpenStoryConfig } from '@gobrand/openstory-config';

describe('buildManifest', () => {
  it('emits variants with props and inferred controls', () => {
    const config = {
      previews: [
        {
          id: 'linkedin',
          platform: 'linkedin',
          component: () => null,
          fixtures: [
            { id: 'a', label: 'A', props: { text: 'hi', dark: true } },
            { id: 'b', label: 'B', props: { text: 'yo' } },
          ],
        },
      ],
    } as OpenStoryConfig;
    const manifest = buildManifest(config);
    expect(manifest.previews[0]).toEqual({
      id: 'linkedin',
      platform: 'linkedin',
      variants: [
        { id: 'a', label: 'A', props: { text: 'hi', dark: true } },
        { id: 'b', label: 'B', props: { text: 'yo' } },
      ],
      controls: deriveControls(config.previews[0].fixtures),
    });
  });
});
