import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';

export const ping = asyncHandler(async (req: Request, res: Response) => {
  res.json({ message: 'Signed in as company', userId: req.user!.id });
});
