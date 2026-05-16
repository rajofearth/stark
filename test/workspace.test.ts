import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { Logger } from "../src/logging/logger.js";
import { sanitizeWorkspaceKey } from "../src/pathSafety.js";
import type { Settings } from "../src/types.js";
import { publishedModelPricingDefaults } from "../src/config/publishedModelPricing.js";
import { DEFAULT_LINEAR_ORCHESTRATION } from "../src/workflow/linearOrchestration.js";
import { WorkspaceManager } from "../src/workspace/workspace.js";

describe("workspace manager", () => {
  test("sanitizes identifiers", () => {
    expect(sanitizeWorkspaceKey("MT/Det")).toBe("MT_Det");
  });

  test("runs after_create once and reuses workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "stark-workspace-"));
    const settings = baseSettings(root);
    const manager = new WorkspaceManager(() => settings, new Logger({ stderr: false }));
    const first = await manager.createForIssue("MT-1");
    expect(await readFile(join(first.path, "created.txt"), "utf8")).toContain("created");
    await writeFile(join(first.path, "progress.txt"), "keep");
    const second = await manager.createForIssue("MT-1");
    expect(second.path).toBe(first.path);
    expect(second.createdNow).toBe(false);
    expect(await readFile(join(second.path, "progress.txt"), "utf8")).toBe("keep");
  });
});

function baseSettings(root: string): Settings {
  return {
    tracker: {
      kind: "memory",
      endpoint: "",
      apiKey: null,
      projectSlug: null,
      assignee: null,
      activeStates: ["Todo"],
      terminalStates: ["Done"],
      commentReplyStates: [],
    },
    polling: { intervalMs: 1000 },
    workspace: { root },
    worker: { sshHosts: [], maxConcurrentAgentsPerHost: null },
    agent: {
      maxConcurrentAgents: 1,
      maxTurns: 1,
      maxRetryBackoffMs: 1000,
      maxConcurrentAgentsByState: {},
      linearOrchestration: DEFAULT_LINEAR_ORCHESTRATION,
    },
    codex: {
      command: "codex app-server",
      approvalPolicy: "never",
      threadSandbox: "workspace-write",
      turnSandboxPolicy: null,
      turnTimeoutMs: 1000,
      readTimeoutMs: 1000,
      stallTimeoutMs: 0,
    },
    hooks: {
      afterCreate:
        process.platform === "win32"
          ? "Set-Content created.txt created"
          : "echo created > created.txt",
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 5000,
    },
    observability: { dashboardEnabled: true, refreshMs: 1000, renderIntervalMs: 16 },
    server: { port: null, host: "127.0.0.1" },
    slack: {
      enabled: false,
      botToken: null,
      signingSecret: null,
      allowedChannelIds: [],
      allowedUserIds: [],
      publicBaseUrl: null,
      commandName: "/stark",
      artifactRoots: [],
      requireApprovalFor: ["artifact_upload", "github_pr", "new_project"],
    },
    github: { enabled: false, allowedRepoRoots: [], prTimeoutMs: 120_000 },
    webchat: {
      usageLedgerPath: join(root, ".stark", "usage-events.jsonl"),
      modelPricing: publishedModelPricingDefaults(),
      defaultModel: "gpt-4o",
    },
  };
}
