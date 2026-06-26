import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { createLogger } from "../utils/logger";

const log = createLogger("Error");

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppError) {
    log.warn(`${req.method} ${req.originalUrl} -> ${err.statusCode}: ${err.message}`, {
      requestId: req.requestId,
      details: err.details,
    });
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }
  log.error(`Unhandled error on ${req.method} ${req.originalUrl}`, {
    requestId: req.requestId,
    message: err.message,
    stack: err.stack,
  });
  return res.status(500).json({ success: false, message: "Internal server error" });
};

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
