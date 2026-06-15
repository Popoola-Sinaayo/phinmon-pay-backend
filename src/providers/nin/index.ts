import config from "../../config";
import { MockNINProvider } from "./mock.provider";
import { NubanNINProvider } from "./nuban.provider";
import { NINProvider } from "./types";

let instance: NINProvider | null = null;

export const getNINProvider = (): NINProvider => {
  if (instance) return instance;

  const cfg = config();
  if (cfg.NIN_PROVIDER === "nuban" && cfg.NUBAN_API_KEY) {
    instance = new NubanNINProvider();
  } else {
    if (cfg.NIN_PROVIDER === "nuban") {
      console.warn("[NIN] NUBAN_API_KEY not set, falling back to mock provider");
    }
    instance = new MockNINProvider();
  }
  return instance;
};
