import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import { User, IUser } from "../modules/users/user.model";
import { AppError } from "../utils/errors";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) {
      throw new AppError("Authentication required", 401);
    }

    const decoded = jwt.verify(token, config().JWT_SECRET) as { id: string };
    const user = await User.findById(decoded.id);
    if (!user) {
      throw new AppError("User not found", 401);
    }
    if (user.status === "SUSPENDED") {
      throw new AppError("Your account has been suspended", 403, { code: "ACCOUNT_SUSPENDED" });
    }
    req.user = user;
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
};

export const requireRole =
  (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("Forbidden", 403));
    }
    next();
  };

export const requireNinVerified = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user?.ninVerified) {
    return next(new AppError("NIN verification required", 403));
  }
  next();
};

export const requirePremium = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user?.ninVerified || !req.user?.livenessVerified) {
    return next(new AppError("Premium verification required", 403));
  }
  next();
};
