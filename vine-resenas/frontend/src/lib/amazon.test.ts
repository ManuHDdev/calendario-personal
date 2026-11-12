import { describe, expect, it } from 'vitest';
import { amazonUrl } from './amazon';

describe('amazonUrl', () => {
  it('builds the amazon.es /dp/ url for a valid ASIN', () => {
    expect(amazonUrl('B0FQBYHJ17')).toBe('https://www.amazon.es/dp/B0FQBYHJ17');
  });
  it('rejects anything that is not 10 chars of A-Z0-9', () => {
    for (const bad of ['', 'b0fqbyhj17', 'B0FQBYHJ1', 'B0FQBYHJ170', 'B0FQ/../17', 'B0FQBYHJ1?']) {
      expect(amazonUrl(bad)).toBeNull();
    }
  });
});
