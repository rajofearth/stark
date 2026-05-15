#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { defaultLogFile } from "./logging/logger.js";
import { StarkRuntime } from "./index.js";

const guardrailFlag = "i-understand-that-this-will-be-running-without-the-usual-guardrails";

async function main(argv: string[]): Promise<void> {
  const program = new Command()
    .name("stark")
    .description("S.T.A.R.K - System for Task Automation, Reasoning & Knowledge")
    .argument("[workflow]", "path to WORKFLOW.md", "WORKFLOW.md")
    .option("--logs-root <path>", "directory for S.T.A.R.K logs")
    .option("--port <port>", "HTTP dashboard port", parsePort)
    .option("--no-dashboard", "run without the local dashboard")
    .option("--no-open", "do not open the dashboard in a browser")
    .option("-y, --yes", "acknowledge unattended agent execution risk")
    .option(`--${guardrailFlag}`, "acknowledge unattended agent execution risk")
    .allowExcessArguments(false);

  program.parse(argv, { from: "user" });
  const options = program.opts();

  if (!options.yes && !options[camelGuardrailFlag()]) {
    throw new Error(acknowledgementBanner());
  }

  const workflowPath = resolve(program.args[0] ?? "WORKFLOW.md");
  if (!existsSync(workflowPath) || !statSync(workflowPath).isFile()) {
    throw new Error(`Workflow file not found: ${workflowPath}`);
  }

  const logsRoot = options.logsRoot ? resolve(options.logsRoot) : undefined;
  const dashboardEnabledOverride =
    program.getOptionValueSource("dashboard") === "cli" ? options.dashboard : undefined;
  const runtime = new StarkRuntime({
    workflowPath,
    logFile: logsRoot ? defaultLogFile(logsRoot) : defaultLogFile(),
    portOverride: options.port,
    dashboardEnabledOverride,
  });
  await runtime.start();
  const dashboardUrl = runtime.dashboardUrl();
  if (options.open && dashboardUrl) {
    openUrl(dashboardUrl);
  }

  const shutdown = async () => {
    await runtime.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0) {
    throw new Error("port must be a non-negative integer");
  }
  return port;
}

function camelGuardrailFlag(): string {
  return guardrailFlag.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

function acknowledgementBanner(): string {
  return [
    "This S.T.A.R.K implementation is an engineering preview.",
    "Codex may run unattended according to the selected workflow and sandbox policy.",
    "To proceed, start with `--yes`.",
  ].join("\n");
}

function openUrl(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args =
    process.platform === "darwin"
      ? [url]
      : process.platform === "win32"
        ? ["/c", "start", "", url]
        : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
}
