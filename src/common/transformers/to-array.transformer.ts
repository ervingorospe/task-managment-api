import type { TransformFnParams } from 'class-transformer';

/**
 * A query param repeated in the URL (`?filterBy=a&filterBy=b`) arrives as
 * an array; given once (`?filterBy=a`) it arrives as a bare string. This
 * normalizes either shape to always-an-array, so `@IsArray()` below it
 * validates consistently regardless of how many values the caller sent.
 */
export function toArray({ value }: TransformFnParams): unknown[] | undefined {
  if (value == null) return undefined;
  // Array.isArray's stdlib type guard narrows to `any[]` regardless of the
  // input's declared type — the cast just restates what the guard already
  // checked at runtime, in terms TypeScript's own types can carry forward.
  return (Array.isArray(value) ? value : [value]) as unknown[];
}
