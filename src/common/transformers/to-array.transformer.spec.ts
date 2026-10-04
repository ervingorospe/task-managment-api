import { toArray } from './to-array.transformer';

function params(value: unknown) {
  return { value } as Parameters<typeof toArray>[0];
}

describe('toArray', () => {
  it('returns undefined for null', () => {
    expect(toArray(params(null))).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(toArray(params(undefined))).toBeUndefined();
  });

  it('wraps a single value in an array', () => {
    expect(toArray(params('a'))).toEqual(['a']);
  });

  it('passes an existing array through unchanged', () => {
    expect(toArray(params(['a', 'b']))).toEqual(['a', 'b']);
  });
});
