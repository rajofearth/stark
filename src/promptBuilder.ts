import { Liquid } from "liquidjs";
import type { Issue, LinearOrchestrationSettings, TaskKind, WorkflowDefinition } from "./types.js";
import { renderOrchestratorRules, renderPhasePlaybook } from "./workflow/linearOrchestration.js";

const defaultPromptTemplate = `You are working on a Linear issue.

Identifier: {{ issue.identifier }}
Title: {{ issue.title }}

Body:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}
`;

const engine = new Liquid({
  strictVariables: true,
  strictFilters: true,
});

export interface PromptContext {
  taskKind: TaskKind;
  linearOrchestration: LinearOrchestrationSettings;
}

export async function buildPrompt(
  workflow: WorkflowDefinition,
  issue: Issue,
  attempt: number | null = null,
  context?: PromptContext,
): Promise<string> {
  const template =
    workflow.promptTemplate.trim() === "" ? defaultPromptTemplate : workflow.promptTemplate;
  const taskKind = context?.taskKind ?? "linear";
  const linearOrchestration = context?.linearOrchestration;
  const playbook =
    taskKind === "linear" && linearOrchestration?.enabled
      ? buildLinearPlaybook(linearOrchestration, issue)
      : "";
  const phase = issue.state;
  try {
    const body = await engine.parseAndRender(template, {
      issue: issueForTemplate(issue),
      attempt,
      task_kind: taskKind,
      taskKind,
      phase,
      playbook,
    });
    if (taskKind === "linear" && playbook && !body.includes(playbook)) {
      return `${body.trim()}\n\n${playbook}`;
    }
    return body;
  } catch (reason) {
    throw new Error(
      `template_render_error:${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }
}

function buildLinearPlaybook(settings: LinearOrchestrationSettings, issue: Issue): string {
  const phasePlaybook = renderPhasePlaybook(settings, issue.state);
  const sections = [renderOrchestratorRules(issue.identifier)];
  if (phasePlaybook) {
    sections.push("## Current phase playbook", "", phasePlaybook);
  }
  return sections.join("\n");
}

function issueForTemplate(issue: Issue): Record<string, unknown> {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    state: issue.state,
    branch_name: issue.branchName,
    branchName: issue.branchName,
    url: issue.url,
    labels: issue.labels,
    blocked_by: issue.blockedBy,
    blockedBy: issue.blockedBy,
    created_at: issue.createdAt?.toISOString() ?? null,
    createdAt: issue.createdAt?.toISOString() ?? null,
    updated_at: issue.updatedAt?.toISOString() ?? null,
    updatedAt: issue.updatedAt?.toISOString() ?? null,
  };
}
