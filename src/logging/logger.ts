import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Level = "debug" | "info" | "warn" | "error";

export interface LoggerOptions {
  logFile?: string | null;
  stderr?: boolean;
}

export class Logger {
  private logFile: string | null;
  private stderr: boolean;

  constructor(options: LoggerOptions = {}) {
    this.logFile = options.logFile ? resolve(options.logFile) : null;
    this.stderr = options.stderr ?? true;
    if (this.logFile) {
      mkdirSync(dirname(this.logFile), { recursive: true });
    }
  }

  debug(message: string, context: Record<string, unknown> = {}): void {
    this.write("debug", message, context);
  }

  info(message: string, context: Record<string, unknown> = {}): void {
    this.write("info", message, context);
  }

  warn(message: string, context: Record<string, unknown> = {}): void {
    this.write("warn", message, context);
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.write("error", message, context);
  }

  child(context: Record<string, unknown>): Logger {
    const parent = this;
    return new (class extends Logger {
      override debug(message: string, extra: Record<string, unknown> = {}): void {
        parent.debug(message, { ...context, ...extra });
      }
      override info(message: string, extra: Record<string, unknown> = {}): void {
        parent.info(message, { ...context, ...extra });
      }
      override warn(message: string, extra: Record<string, unknown> = {}): void {
        parent.warn(message, { ...context, ...extra });
      }
      override error(message: string, extra: Record<string, unknown> = {}): void {
        parent.error(message, { ...context, ...extra });
      }
    })({ stderr: false });
  }

  private write(level: Level, message: string, context: Record<string, unknown>): void {
    const line = `${new Date().toISOString()} level=${level} message=${quote(message)}${formatContext(
      context,
    )}\n`;
    if (this.stderr) {
      const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
      stream.write(line);
    }
    if (this.logFile) {
      appendFileSync(this.logFile, line);
    }
  }
}

export function defaultLogFile(logsRoot = "log"): string {
  return resolve(logsRoot, "stark.log");
}

function formatContext(context: Record<string, unknown>): string {
  const parts = Object.entries(context)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${quote(redact(value))}`);
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
}

function quote(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return JSON.stringify(text ?? null);
}

function redact(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.length > 20 && /^[A-Za-z0-9_\-./+=]+$/.test(value)) return "[redacted]";
  return value;
}

export const logger = new Logger();
