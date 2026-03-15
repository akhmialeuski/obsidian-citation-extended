/**
 * Discriminated union representing either a successful value or an error.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Wrap a successful value in a Result.
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Wrap an error in a Result.
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
