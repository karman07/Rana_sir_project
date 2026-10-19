import type { NextFunction, Request, Response } from 'express';

/** Removes Mongo operator keys (`$where`, `$ne`, ...) and dotted keys from user input, in place. */
export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    value.forEach(sanitize);
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) delete obj[key];
      else sanitize(obj[key]);
    }
  }
  return value;
}

// Express 5 makes req.query a getter, so mutate in place instead of reassigning.
export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction) {
  sanitize(req.body);
  sanitize(req.query);
  sanitize(req.params);
  next();
}
