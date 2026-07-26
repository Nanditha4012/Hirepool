import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';

const BEARER_PREFIX = 'Bearer ';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    next(ApiError.unauthorized('Missing or invalid Authorization header'));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token'));
  }
}
