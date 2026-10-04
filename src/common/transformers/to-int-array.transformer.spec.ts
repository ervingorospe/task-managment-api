import { toIntArray } from './to-int-array.transformer';

function params(value: unknown) {
  return { value } as Parameters<typeof toIntArray>[0];
}

describe('toIntArray', () => {
  it('returns undefined for null', () => {
    expect(toIntArray(params(null))).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(toIntArray(params(undefined))).toBeUndefined();
  });

  it('wraps and coerces a single value to a one-element number array', () => {
    expect(toIntArray(params('5'))).toEqual([5]);
  });

  it('coerces every entry of an existing array to a number', () => {
    expect(toIntArray(params(['1', '2', 3]))).toEqual([1, 2, 3]);
  });
});
