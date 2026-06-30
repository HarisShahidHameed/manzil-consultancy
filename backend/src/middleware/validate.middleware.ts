import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { sendError } from '../utils/response';

type Source = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodSchema, source: Source = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors: Record<string, string[]> = {};
      result.error.issues.forEach(issue => {
        const key = issue.path.join('.') || 'root';
        if (!errors[key]) errors[key] = [];
        errors[key].push(issue.message);
      });
      sendError(res, 'Validation failed', 422, errors);
      return;
    }
    req[source] = result.data;
    next();
  };
