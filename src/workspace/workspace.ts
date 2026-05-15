import { existsSync, lstatSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { Issue, Settings, WorkerHost } from "../types.js";
import type { Logger } from "../logging/logger.js";
import { ensureInsideRoot, sanitizeWorkspaceKey } from "../pathSafety.js";
import { runCommand, runHostScript, shellEscape, sshShellCommand } from "../shell.js";

export interface WorkspaceResult {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
}

export class WorkspaceManager {
  constructor(
    private settingsProvider: () => Settings,
    private readonly logger: Logger,
  ) {}

  async createForIssue(
    issueOrIdentifier: Issue | string | null,
    workerHost: WorkerHost = null,
  ): Promise<WorkspaceResult> {
    const issueContext = issueLogContext(issueOrIdentifier);
    const workspaceKey = sanitizeWorkspaceKey(issueContext.issueIdentifier);
    const workspacePath = join(this.settingsProvider().workspace.root, workspaceKey);
    const normalizedPath = workerHost
      ? workspacePath
      : await ensureInsideRoot(workspacePath, this.settingsProvider().workspace.root);
    const createdNow = await this.ensureWorkspace(normalizedPath, workerHost);
    const afterCreate = this.settingsProvider().hooks.afterCreate;
    if (createdNow && afterCreate) {
      await this.runHook("after_create", afterCreate, normalizedPath, issueContext, workerHost);
    }
    return { path: normalizedPath, workspaceKey, createdNow };
  }

  async remove(workspacePath: string, workerHost: WorkerHost = null): Promise<void> {
    if (!workerHost) {
      if (existsSync(workspacePath)) {
        await ensureInsideRoot(workspacePath, this.settingsProvider().workspace.root);
        await this.runBeforeRemove(workspacePath, null);
      }
      await rm(workspacePath, { recursive: true, force: true });
      return;
    }
    await this.runBeforeRemove(workspacePath, workerHost);
    const result = await runCommand(
      "ssh",
      [workerHost, sshShellCommand(`rm -rf ${shellEscape(workspacePath)}`)],
      {
        cwd: process.cwd(),
        timeoutMs: this.settingsProvider().hooks.timeoutMs,
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `workspace_remove_failed:${workerHost}:${result.status}:${result.stdout}${result.stderr}`,
      );
    }
  }

  async removeIssueWorkspaces(identifier: string, workerHost: WorkerHost = null): Promise<void> {
    const workspace = join(
      this.settingsProvider().workspace.root,
      sanitizeWorkspaceKey(identifier),
    );
    if (workerHost) {
      await this.remove(workspace, workerHost).catch((reason) =>
        this.logger.warn("Workspace cleanup failed", {
          issue_identifier: identifier,
          worker_host: workerHost,
          reason: String(reason),
        }),
      );
      return;
    }
    const hosts = this.settingsProvider().worker.sshHosts;
    if (hosts.length > 0) {
      await Promise.all(hosts.map((host) => this.removeIssueWorkspaces(identifier, host)));
      return;
    }
    await this.remove(workspace, null).catch((reason) =>
      this.logger.warn("Workspace cleanup failed", {
        issue_identifier: identifier,
        reason: String(reason),
      }),
    );
  }

  async runBeforeRun(
    workspacePath: string,
    issueOrIdentifier: Issue | string | null,
    workerHost: WorkerHost = null,
  ): Promise<void> {
    const hook = this.settingsProvider().hooks.beforeRun;
    if (hook)
      await this.runHook(
        "before_run",
        hook,
        workspacePath,
        issueLogContext(issueOrIdentifier),
        workerHost,
      );
  }

  async runAfterRun(
    workspacePath: string,
    issueOrIdentifier: Issue | string | null,
    workerHost: WorkerHost = null,
  ): Promise<void> {
    const hook = this.settingsProvider().hooks.afterRun;
    if (!hook) return;
    await this.runHook(
      "after_run",
      hook,
      workspacePath,
      issueLogContext(issueOrIdentifier),
      workerHost,
    ).catch((reason) =>
      this.logger.warn("Workspace after_run hook failed", {
        workspace: workspacePath,
        reason: String(reason),
      }),
    );
  }

  private async ensureWorkspace(workspacePath: string, workerHost: WorkerHost): Promise<boolean> {
    if (!workerHost) {
      if (existsSync(workspacePath) && lstatSync(workspacePath).isDirectory()) return false;
      if (existsSync(workspacePath)) await rm(workspacePath, { recursive: true, force: true });
      await mkdir(workspacePath, { recursive: true });
      return true;
    }
    const script = [
      "set -eu",
      `workspace=${shellEscape(workspacePath)}`,
      'if [ -d "$workspace" ]; then created=0; elif [ -e "$workspace" ]; then rm -rf "$workspace"; mkdir -p "$workspace"; created=1; else mkdir -p "$workspace"; created=1; fi',
      'cd "$workspace"',
      'printf "__STARK_WORKSPACE__\\t%s\\t%s\\n" "$created" "$(pwd -P)"',
    ].join("\n");
    const result = await runCommand("ssh", [workerHost, sshShellCommand(script)], {
      cwd: process.cwd(),
      timeoutMs: this.settingsProvider().hooks.timeoutMs,
    });
    if (result.status !== 0)
      throw new Error(
        `workspace_prepare_failed:${workerHost}:${result.status}:${result.stdout}${result.stderr}`,
      );
    const marker = result.stdout
      .split(/\r?\n/)
      .map((line) => line.split("\t"))
      .find((parts) => parts[0] === "__STARK_WORKSPACE__");
    if (!marker) throw new Error(`workspace_prepare_failed:invalid_output:${result.stdout}`);
    return marker[1] === "1";
  }

  private async runBeforeRemove(workspacePath: string, workerHost: WorkerHost): Promise<void> {
    const hook = this.settingsProvider().hooks.beforeRemove;
    if (!hook) return;
    await this.runHook(
      "before_remove",
      hook,
      workspacePath,
      { issueId: null, issueIdentifier: basename(workspacePath) },
      workerHost,
    ).catch((reason) =>
      this.logger.warn("Workspace before_remove hook failed", {
        workspace: workspacePath,
        reason: String(reason),
      }),
    );
  }

  private async runHook(
    hookName: string,
    script: string,
    workspacePath: string,
    issueContext: IssueContext,
    workerHost: WorkerHost,
  ): Promise<void> {
    this.logger.info("Running workspace hook", {
      hook: hookName,
      issue_id: issueContext.issueId ?? "n/a",
      issue_identifier: issueContext.issueIdentifier,
      workspace: workspacePath,
      worker_host: workerHost ?? "local",
    });
    const timeoutMs = this.settingsProvider().hooks.timeoutMs;
    const result = workerHost
      ? await runCommand(
          "ssh",
          [workerHost, sshShellCommand(`cd ${shellEscape(workspacePath)} && ${script}`)],
          { cwd: process.cwd(), timeoutMs },
        )
      : await runHostScript(script, { cwd: resolve(workspacePath), timeoutMs });
    if (result.status !== 0) {
      const output = truncate(`${result.stdout}${result.stderr}`);
      this.logger.warn("Workspace hook failed", {
        hook: hookName,
        workspace: workspacePath,
        status: result.status,
        output,
      });
      throw new Error(`workspace_hook_failed:${hookName}:${result.status}:${output}`);
    }
  }
}

interface IssueContext {
  issueId: string | null;
  issueIdentifier: string;
}

function issueLogContext(issueOrIdentifier: Issue | string | null): IssueContext {
  if (typeof issueOrIdentifier === "string")
    return { issueId: null, issueIdentifier: issueOrIdentifier };
  if (issueOrIdentifier)
    return {
      issueId: issueOrIdentifier.id,
      issueIdentifier: issueOrIdentifier.identifier || "issue",
    };
  return { issueId: null, issueIdentifier: "issue" };
}

function truncate(output: string, maxBytes = 2048): string {
  return Buffer.byteLength(output) <= maxBytes
    ? output
    : `${output.slice(0, maxBytes)}... (truncated)`;
}
