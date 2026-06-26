import config from "../../config";
import { qoreIdClient } from "../qoreid/qoreid.client";
import { MockNINProvider } from "./mock.provider";
import { NubanNINProvider } from "./nuban.provider";
import { QoreIdNINProvider } from "./qoreid.provider";
import { NINProvider } from "./types";
import { createLogger } from "../../utils/logger";

const log = createLogger("NIN");

let instance: NINProvider | null = null;

export const getNINProvider = (): NINProvider => {
  if (instance) return instance;

  const cfg = config();
  if (cfg.NIN_PROVIDER === "qoreid" && qoreIdClient.isConfigured()) {
    log.info("Using QoreID NIN provider");
    instance = new QoreIdNINProvider();
  } else if (cfg.NIN_PROVIDER === "nuban" && cfg.NUBAN_API_KEY) {
    log.info("Using NUBAN NIN provider");
    instance = new NubanNINProvider();
  } else {
    if (cfg.NIN_PROVIDER === "qoreid") {
      log.warn("QoreID credentials not set, falling back to mock provider");
    } else if (cfg.NIN_PROVIDER === "nuban") {
      log.warn("NUBAN_API_KEY not set, falling back to mock provider");
    } else {
      log.info("Using mock NIN provider");
    }
    instance = new MockNINProvider();
  }
  return instance;
};
