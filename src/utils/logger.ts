import config from "../config";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";
const SCOPE_COLOR = "\x1b[35m"; // magenta

const getMinLevel = (): LogLevel => {
  const fromEnv = (process.env.LOG_LEVEL || "").toLowerCase();
  if (fromEnv === "debug" || fromEnv === "info" || fromEnv === "warn" || fromEnv === "error") {
    return fromEnv;
  }
  return config().NODE_ENV === "production" ? "info" : "debug";
};

const shouldLog = (level: LogLevel): boolean => LEVEL_ORDER[level] >= LEVEL_ORDER[getMinLevel()];

const SENSITIVE_KEYS = ["nin", "encryptednin", "nindata", "password", "token", "secret", "authorization", "sdksessiontoken"];

/** Show only the last 4 characters of a sensitive value (e.g. NIN -> *******8901). */
export const maskValue = (value?: string | null): string => {
  if (!value) return "";
  const str = String(value);
  if (str.length <= 4) return "*".repeat(str.length);
  return `${"*".repeat(str.length - 4)}${str.slice(-4)}`;
};

const redact = (input: unknown, depth = 0): unknown => {
  if (depth > 4 || input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map((item) => redact(item, depth + 1));
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase()) && typeof val === "string") {
        out[key] = maskValue(val);
      } else {
        out[key] = redact(val, depth + 1);
      }
    }
    return out;
  }
  return input;
};

const formatMeta = (meta?: unknown): string => {
  if (meta === undefined) return "";
  try {
    return " " + JSON.stringify(redact(meta));
  } catch {
    return " [unserializable meta]";
  }
};

const write = (level: LogLevel, scope: string, message: string, meta?: unknown) => {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  const colorize = process.stdout.isTTY;
  const levelTag = level.toUpperCase().padEnd(5);
  const line = colorize
    ? `${COLORS[level]}${ts} ${levelTag}${RESET} ${SCOPE_COLOR}[${scope}]${RESET} ${message}${formatMeta(meta)}`
    : `${ts} ${levelTag} [${scope}] ${message}${formatMeta(meta)}`;

  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(line);
};

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  child(childScope: string): Logger;
}

export const createLogger = (scope: string): Logger => ({
  debug: (message, meta) => write("debug", scope, message, meta),
  info: (message, meta) => write("info", scope, message, meta),
  warn: (message, meta) => write("warn", scope, message, meta),
  error: (message, meta) => write("error", scope, message, meta),
  child: (childScope) => createLogger(`${scope}:${childScope}`),
});

export const logger = createLogger("App");
