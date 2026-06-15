import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { AppError } from "../utils/errors";

export const validate =
  (schema: Joi.ObjectSchema, property: "body" | "query" | "params" = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
    if (error) {
      return next(new AppError(error.details.map((d) => d.message).join(", "), 400));
    }
    req[property] = value;
    next();
  };
