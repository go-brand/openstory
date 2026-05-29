import { describe, it, expect } from 'vitest';
import { defineOpenStoryConfig, deriveControls } from './define';

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

describe('deriveControls', () => {
  const fixtures = [
    {
      id: 'a',
      label: 'A',
      props: { text: 'hi', count: 2, dark: true, author: { name: 'x' } },
    },
    { id: 'b', label: 'B', props: { text: 'yo', extra: 'z' } },
  ];

  it('infers primitive control kinds and unions keys across fixtures', () => {
    const controls = deriveControls(fixtures);
    expect(controls).toEqual([
      { name: 'text', kind: 'text' },
      { name: 'count', kind: 'number' },
      { name: 'dark', kind: 'boolean' },
      { name: 'extra', kind: 'text' },
    ]);
  });

  it('skips non-primitive props (objects/arrays/functions)', () => {
    const controls = deriveControls([
      {
        id: 'a',
        label: 'A',
        props: { author: { name: 'x' }, tags: [1], fn: () => {} },
      },
    ]);
    expect(controls).toEqual([]);
  });

  it('drops a prop that is primitive in one fixture but non-primitive in another', () => {
    const controls = deriveControls([
      { id: 'a', label: 'A', props: { value: 'hi' } },
      { id: 'b', label: 'B', props: { value: { nested: true } } },
    ]);
    expect(controls).toEqual([]);
  });

  it('drops a prop that is only ever null/undefined', () => {
    const controls = deriveControls([
      { id: 'a', label: 'A', props: { value: null } },
      { id: 'b', label: 'B', props: { value: undefined } },
    ]);
    expect(controls).toEqual([]);
  });

  it('returns an empty array for empty fixtures', () => {
    expect(deriveControls([])).toEqual([]);
  });
});
