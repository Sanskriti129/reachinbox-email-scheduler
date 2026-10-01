import type { Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

/** An error that carries the HTTP status it should be reported with. */
export const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

/**
 * Wrap a route that returns data: JSON on success, 400 for validation errors,
 * the error's own status for expected failures, a generic 500 (logged) otherwise.
 */
export const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>, successStatus = 200): RequestHandler =>
  async (req, res) => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) res.status(successStatus).json(data);
    } catch (e) {
      if (e instanceof ZodError) {
        res.status(400).json({ error: e.issues[0]?.message ?? 'Invalid request', issues: e.issues });
        return;
      }
      const status = (e as { status?: number }).status ?? 500;
      if (status >= 500) console.error(`[api] ${req.method} ${req.path}`, e);
      res.status(status).json({ error: status >= 500 ? 'Something went wrong' : (e as Error).message });
    }
  };
