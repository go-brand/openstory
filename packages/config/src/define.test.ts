import { describe, it, expect } from 'vitest';
import { defineOpenStoryConfig } from './define';

describe('defineOpenStoryConfig', () => {
  it('returns the config unchanged', () => {
    const config = defineOpenStoryConfig({
      previews: [
        {
          id: 'linkedin',
          platform: 'linkedin',
          component: () => null,
          fixtures: [{ id: 'short', label: 'Short', props: {} }],
        },
      ],
    });

    expect(config.previews).toHaveLength(1);
    expect(config.previews[0].id).toBe('linkedin');
  });

  it('preserves provider component when given', () => {
    const Providers = ({ children }: { children: React.ReactNode }) => children;
    const config = defineOpenStoryConfig({
      previews: [],
      providers: Providers,
    });

    expect(config.providers).toBe(Providers);
  });
});
