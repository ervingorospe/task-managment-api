import { baseSlug } from './slug.helper';

describe('baseSlug', () => {
  it('lowercases and hyphenates a normal name', () => {
    expect(baseSlug('Acme Studio')).toBe('acme-studio');
  });

  it('strips special characters, mapping & to "and"', () => {
    expect(baseSlug("O'Brien & Sons, Inc.")).toBe('obrien-and-sons-inc');
  });

  it('falls back to "org" when the name produces an empty slug', () => {
    expect(baseSlug('!!!')).toBe('org');
  });

  it('falls back to "org" for an empty string', () => {
    expect(baseSlug('')).toBe('org');
  });
});
