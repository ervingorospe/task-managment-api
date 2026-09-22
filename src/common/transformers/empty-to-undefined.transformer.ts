import { Transform } from 'class-transformer';

/**
 * `@IsOptional()` only skips validation for `undefined`/`null` — not `""`.
 * A frontend form's blank optional field (email, timezone, etc.) sends an
 * empty string, which then hits whatever format validator sits below
 * `@IsOptional()` (`@IsEmail()`, `@IsTimeZone()`, ...) and fails even
 * though the field was legitimately left blank. Put this decorator above
 * `@IsOptional()` to normalize `""` to `undefined` first.
 */
export function EmptyToUndefined() {
  return Transform(({ value }) => (value === '' ? undefined : value));
}
