import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import config from "./config";
import { connectToDB } from "./database/connection";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { logger } from "./utils/logger";

import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import verificationRoutes from "./modules/verification/verification.routes";
import surveysRoutes from "./modules/surveys/surveys.routes";
import responsesRoutes from "./modules/responses/responses.routes";
import walletsRoutes from "./modules/wallets/wallets.routes";
import paymentsRoutes from "./modules/payments/payments.routes";
import adminRoutes from "./modules/admin/admin.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import configRoutes from "./modules/config/config.routes";
import { sweepExpiredReservations } from "./modules/responses/reservation.service";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config().FRONTEND_URL,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ success: true, status: "ok", service: "insightpay-api" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", usersRoutes);
app.use("/api/v1/verification", verificationRoutes);
app.use("/api/v1/surveys", surveysRoutes);
app.use("/api/v1/responses", responsesRoutes);
app.use("/api/v1/wallet", walletsRoutes);
app.use("/api/v1/payments", paymentsRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/config", configRoutes);

app.use(errorHandler);

const RESERVATION_SWEEP_INTERVAL_MS = 60 * 1000;

connectToDB()
  .then(() => {
    app.listen(config().PORT, () => {
      logger.info(`Phinmon API running on port ${config().PORT}`, {
        env: config().NODE_ENV,
        ninProvider: config().NIN_PROVIDER,
        livenessProvider: config().LIVENESS_PROVIDER,
      });
    });

    // Periodically release slots held by abandoned/expired task sessions so
    // capacity frees up even if the client never calls the release endpoint.
    const sweep = setInterval(() => {
      sweepExpiredReservations().catch((err) => {
        logger.error("Reservation sweep failed", { error: (err as Error).message });
      });
    }, RESERVATION_SWEEP_INTERVAL_MS);
    sweep.unref?.();
  })
  .catch((err) => {
    logger.error("Failed to start server", { error: (err as Error).message });
    process.exit(1);
  });

export default app;
