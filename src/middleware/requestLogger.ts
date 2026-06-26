import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger";

const log = createLogger("HTTP");

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const statusLevel = (status: number): "info" | "warn" | "error" => {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID().slice(0, 8);
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const start = process.hrtime.bigint();

  log.info(`--> ${req.method} ${req.originalUrl}`, {
    requestId,
    ip: req.ip,
  });

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const level = statusLevel(res.statusCode);
    log[level](
      `<-- ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`,
      {
        requestId,
        userId: req.user?._id?.toString(),
      }
    );
  });

  next();
};
