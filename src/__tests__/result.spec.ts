import { ok, err, Result } from '../result';

describe('Result', () => {
  describe('ok()', () => {
    it('should create a success result with the given value', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect((result as { ok: true; value: number }).value).toBe(42);
    });

    it('should preserve string values', () => {
      const result = ok('hello');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('hello');
      }
    });

    it('should preserve complex object values', () => {
      const obj = { a: 1, b: [2, 3] };
      const result = ok(obj);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(obj);
      }
    });
  });

  describe('err()', () => {
    it('should create a failure result with the given error', () => {
      const error = new Error('boom');
      const result = err(error);
      expect(result.ok).toBe(false);
      expect((result as { ok: false; error: Error }).error).toBe(error);
    });

    it('should preserve custom error types', () => {
      class CustomError extends Error {
        constructor(public code: string) {
          super(`code: ${code}`);
        }
      }
      const error = new CustomError('NOT_FOUND');
      const result: Result<string, CustomError> = err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CustomError);
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('discriminated union narrowing', () => {
    it('should narrow to value branch when ok is true', () => {
      const result: Result<number, Error> = ok(10);
      if (result.ok) {
        const value: number = result.value;
        expect(value).toBe(10);
      } else {
        fail('Expected ok result');
      }
    });

    it('should narrow to error branch when ok is false', () => {
      const result: Result<number, Error> = err(new Error('fail'));
      if (!result.ok) {
        const error: Error = result.error;
        expect(error.message).toBe('fail');
      } else {
        fail('Expected err result');
      }
    });
  });
});
