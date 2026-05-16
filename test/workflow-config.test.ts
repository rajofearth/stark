import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parseSettings } from "../src/config/schema.js";
import {
  defaultWorkflow,
  loadWorkflow,
  parseWorkflow,
  WorkflowStore,
} from "../src/workflow/workflow.js";
import { Logger } from "../src/logging/logger.js";

describe("workflow and config", () => {
  test("parses YAML front matter and prompt body", () => {
    const workflow = parseWorkflow(
      "---\ntracker:\n  kind: memory\n---\nHello {{ issue.identifier }}\n",
    );
    expect(workflow.config).toEqual({ tracker: { kind: "memory" } });
    expect(workflow.promptTemplate).toBe("Hello {{ issue.identifier }}");
  });

  test("accepts prompt-only workflow files", () => {
    const workflow = parseWorkflow("Prompt only\n");
    expect(workflow.config).toEqual({});
    expect(workflow.promptTemplate).toBe("Prompt only");
  });

  test("resolves defaults, env secrets, and workspace root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stark-config-"));
    const workflowPath = join(dir, "WORKFLOW.md");
    await writeFile(
      workflowPath,
      "---\ntracker:\n  kind: linear\n  api_key: $LINEAR_API_KEY\n  project_slug: project\nworkspace:\n  root: ./work\n---\nPrompt\n",
    );
    const workflow = await loadWorkflow(workflowPath);
    const settings = parseSettings(workflow.config, workflowPath, { LINEAR_API_KEY: "token" });
    expect(settings.tracker.apiKey).toBe("token");
    expect(settings.polling.intervalMs).toBe(30_000);
    expect(settings.workspace.root).toContain("work");
    expect(settings.codex.command).toBe("codex app-server");
    expect(settings.server.port).toBe(4000);
  });

  test("allows workflows to disable the default dashboard", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stark-config-"));
    const workflowPath = join(dir, "WORKFLOW.md");
    await writeFile(
      workflowPath,
      "---\ntracker:\n  kind: memory\nserver:\n  port: null\n---\nPrompt\n",
    );
    const workflow = await loadWorkflow(workflowPath);
    const settings = parseSettings(workflow.config, workflowPath);
    expect(settings.server.port).toBeNull();
  });

  test("provides a default parent workflow when no workflow file exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stark-config-"));
    const workflowPath = join(dir, "missing-WORKFLOW.md");
    const store = new WorkflowStore(workflowPath, new Logger({ stderr: false }));
    await store.start();
    const workflow = await store.current();
    await store.stop();
    expect(workflow.config).toMatchObject({ tracker: { kind: "memory" } });
    expect(workflow.promptTemplate).toContain("Slack-controlled autonomous coding agent");
  });

  test("auto-enables Slack when secrets are present without workflow config", () => {
    const settings = parseSettings(defaultWorkflow().config, "/tmp/stark/WORKFLOW.md", {
      SLACK_BOT_TOKEN: "xoxb-token",
      SLACK_SIGNING_SECRET: "secret",
    });
    expect(settings.slack.enabled).toBe(true);
  });

  test("webchat usage ledger defaults under workspace root (not the workflow file directory)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stark-ws-"));
    const nested = join(dir, "nested");
    const workflowPath = join(nested, "WORKFLOW.md");
    const dataRoot = join(dir, "data");
    await mkdir(nested, { recursive: true });
    await writeFile(
      workflowPath,
      `---
tracker:
  kind: memory
workspace:
  root: ${JSON.stringify(dataRoot)}
---
P
`,
    );
    const workflow = await loadWorkflow(workflowPath);
    const settings = parseSettings(workflow.config, workflowPath);
    expect(settings.webchat.usageLedgerPath).toBe(resolve(dataRoot, ".stark", "usage-events.jsonl"));
  });

  test("STARK_WEBCHAT_USAGE_LEDGER overrides ledger path", () => {
    const settings = parseSettings(defaultWorkflow().config, "/tmp/any/WORKFLOW.md", {
      STARK_WEBCHAT_USAGE_LEDGER: "/tmp/custom-usage.jsonl",
    });
    expect(settings.webchat.usageLedgerPath).toBe(resolve("/tmp/custom-usage.jsonl"));
  });

  test("embeds published vendor list prices without webchat YAML", () => {
    const settings = parseSettings(defaultWorkflow().config, "/tmp/stark/WORKFLOW.md");
    expect(settings.webchat.modelPricing["gpt-4o"]?.inputPerMillionUsd).toBe(2.5);
    expect(settings.webchat.defaultModel).toBe("gpt-4o");
  });

  test("does not require approval for agent tasks by default", () => {
    const settings = parseSettings(defaultWorkflow().config, "/tmp/stark/WORKFLOW.md");
    expect(settings.slack.requireApprovalFor).toEqual([
      "artifact_upload",
      "github_pr",
      "new_project",
    ]);
  });
});
