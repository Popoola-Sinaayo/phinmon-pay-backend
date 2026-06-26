import config from "../../config";
import { qoreIdClient } from "../qoreid/qoreid.client";
import { MockLivenessProvider } from "./mock.provider";
import { QoreIdLivenessProvider } from "./qoreid.provider";
import { LivenessProvider } from "./types";
import { createLogger } from "../../utils/logger";

const log = createLogger("Liveness");

let instance: LivenessProvider | null = null;

export const getLivenessProvider = (): LivenessProvider => {
  if (instance) return instance;

  const cfg = config();
  if (cfg.LIVENESS_PROVIDER === "qoreid" && qoreIdClient.isConfigured()) {
    log.info("Using QoreID liveness provider", {
      productCode: cfg.QOREID_NIN_LIVENESS_PRODUCT_CODE,
    });
    instance = new QoreIdLivenessProvider();
  } else {
    if (cfg.LIVENESS_PROVIDER === "qoreid") {
      log.warn("QoreID credentials not set, falling back to mock provider");
    } else {
      log.info("Using mock liveness provider");
    }
    instance = new MockLivenessProvider();
  }
  return instance;
};

export const isLivenessEnabled = (): boolean => {
  const cfg = config();
  return cfg.FEATURE_LIVENESS || (cfg.LIVENESS_PROVIDER === "qoreid" && qoreIdClient.isConfigured());
};
