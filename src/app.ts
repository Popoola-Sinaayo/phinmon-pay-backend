import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import config from "./config";
import { connectToDB } from "./database/connection";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import verificationRoutes from "./modules/verification/verification.routes";
import surveysRoutes from "./modules/surveys/surveys.routes";
import responsesRoutes from "./modules/responses/responses.routes";
import walletsRoutes from "./modules/wallets/wallets.routes";
import paymentsRoutes from "./modules/payments/payments.routes";
import billingRoutes from "./modules/billing/billing.routes";
import adminRoutes from "./modules/admin/admin.routes";

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
app.use("/api/v1/billing", billingRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use(errorHandler);

connectToDB()
  .then(() => {
    app.listen(config().PORT, () => {
      console.log(`Phinmon API running on port ${config().PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });

export default app;
