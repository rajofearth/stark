import { spawn } from "node:child_process";
import { once } from "node:events";

export interface CommandResult {
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
}

export async function runHostScript(
  script: string,
  options: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  const { command, args } = hostShellCommand(script);
  return runCommand(command, args, options);
}

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const [status, signal] = (await once(child, "exit")) as [number | null, NodeJS.Signals | null];
  clearTimeout(timer);
  return { stdout, stderr, status, signal };
}

export function hostShellCommand(script: string): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    };
  }
  return { command: "sh", args: ["-lc", script] };
}

export function sshShellCommand(script: string): string {
  return `bash -lc ${shellEscape(script)}`;
}

export function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}
