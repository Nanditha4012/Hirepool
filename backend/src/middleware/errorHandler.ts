import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    // `code` is omitted rather than sent as null when unset, so the response
    // shape for every existing error is byte-for-byte what it was.
    res.status(err.statusCode).json(
      err.code ? { message: err.message, code: err.code } : { message: err.message },
    );
    return;
  }

  // Controllers validate request bodies with `schema.parse(req.body)`, which
  // throws a ZodError on bad input. Without this branch that fell through to
  // the generic 500 below, so a plainly malformed request (e.g. signing up
  // with role "admin", which is not in the self-signup enum) was reported as
  // a server fault instead of a client error.
  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Validation failed',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  console.error(err);

  const body: Record<string, unknown> = { message: 'Internal server error' };

  if (env.NODE_ENV !== 'production' && err instanceof Error) {
    body.detail = err.message;
    body.stack = err.stack;
  }

  res.status(500).json(body);
}
