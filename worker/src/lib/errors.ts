/**
 * A typed error that routes can throw; `index.ts` turns it into a JSON response.
 * Replaces the scattered `res.status(400).json({ error })` calls from server.ts.
 */
export class ApiError extends Error {
  status: number;
  extra: Record<string, unknown>;

  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.extra = extra;
  }
}

export function badRequest(message: string, extra?: Record<string, unknown>): ApiError {
  return new ApiError(400, message, extra);
}

export function serverError(message: string, extra?: Record<string, unknown>): ApiError {
  return new ApiError(500, message, extra);
}
