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
