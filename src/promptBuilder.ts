import { Liquid } from "liquidjs";
import type { Issue, WorkflowDefinition } from "./types.js";

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

export async function buildPrompt(
  workflow: WorkflowDefinition,
  issue: Issue,
  attempt: number | null = null,
): Promise<string> {
  const template =
    workflow.promptTemplate.trim() === "" ? defaultPromptTemplate : workflow.promptTemplate;
  try {
    return await engine.parseAndRender(template, {
      issue: issueForTemplate(issue),
      attempt,
    });
  } catch (reason) {
    throw new Error(
      `template_render_error:${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }
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
