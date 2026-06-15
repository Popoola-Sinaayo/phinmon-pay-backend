import config from "../../config";
import { MockLivenessProvider } from "./mock.provider";
import { LivenessProvider } from "./types";

let instance: LivenessProvider | null = null;

export const getLivenessProvider = (): LivenessProvider => {
  if (instance) return instance;
  instance = new MockLivenessProvider();
  if (config().LIVENESS_PROVIDER !== "mock") {
    console.warn("[Liveness] Only mock provider available in MVP; using mock");
  }
  return instance;
};
