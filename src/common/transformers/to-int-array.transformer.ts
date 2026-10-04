import type { TransformFnParams } from 'class-transformer';

/** Same shape-normalization as toArray(), then coerces every entry to a
 * number — for query params that are always numeric ids (memberIds,
 * projectIds, ...), where the caller wants `number[]` directly rather
 * than filtering/parsing elsewhere. */
export function toIntArray({ value }: TransformFnParams): number[] | undefined {
  if (value == null) return undefined;
  const arr = (Array.isArray(value) ? value : [value]) as unknown[];
  return arr.map(Number);
}
