import type { ZodSchema } from 'zod';
import { ValidationError } from './error.middleware.js';

export function validateBody<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    throw new ValidationError('Validation failed', details);
  }
  return result.data;
}

export function validateQuery<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    throw new ValidationError('Invalid query parameters', details);
  }
  return result.data;
}
