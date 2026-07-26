import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * Must run after requireAuth — relies on req.user being populated.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden('You do not have permission to perform this action'));
      return;
    }

    next();
  };
}
