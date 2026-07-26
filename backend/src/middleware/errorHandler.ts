import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ message: err.message });
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
