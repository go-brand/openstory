import { describe, it, expect } from 'vitest';
import {
  defineOpenStoryConfig,
  deriveControls,
} from '@gobrand/openstory-config';
import { buildHarnessEntry } from './harness-loader';
import { buildManifest } from './plugin';

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

describe('buildManifest', () => {
  it('emits variants with props and inferred controls', () => {
    const config = defineOpenStoryConfig({
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
    });
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

  it('returns no previews for an empty config', () => {
    const config = defineOpenStoryConfig({ previews: [] });
    expect(buildManifest(config)).toEqual({ previews: [] });
  });

  it('emits empty variants and controls for a preview with zero fixtures', () => {
    const config = defineOpenStoryConfig({
      previews: [
        {
          id: 'linkedin',
          platform: 'linkedin',
          component: () => null,
          fixtures: [],
        },
      ],
    });
    expect(buildManifest(config).previews[0]).toEqual({
      id: 'linkedin',
      platform: 'linkedin',
      variants: [],
      controls: [],
    });
  });
});
