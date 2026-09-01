import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Express 4 does not forward rejected promises to the error middleware, so every
 * async route is wrapped rather than relying on each handler to try/catch.
 */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    void Promise.resolve(handler(request, response, next)).catch(next)
  }
}
