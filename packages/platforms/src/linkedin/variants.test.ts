import { describe, it, expect } from 'vitest';
import { LINKEDIN_VARIANTS } from './variants';

describe('LINKEDIN_VARIANTS', () => {
  it('contains exactly nine canonical variants', () => {
    expect(LINKEDIN_VARIANTS).toHaveLength(9);
  });

  it('includes the show-more text variant', () => {
    const ids = LINKEDIN_VARIANTS.map((v) => v.id);
    expect(ids).toContain('text-long-show-more');
  });

  it('all variants have id and label', () => {
    for (const v of LINKEDIN_VARIANTS) {
      expect(v.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(v.label.length).toBeGreaterThan(0);
    }
  });
});
