import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseSettings } from "../src/config/schema.js";
import { loadWorkflow, parseWorkflow } from "../src/workflow/workflow.js";

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
});
