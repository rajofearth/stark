import { Liquid } from "liquidjs";
import type {
  CommentReplyTrigger,
  Issue,
  LinearOrchestrationSettings,
  TaskKind,
  WorkflowDefinition,
} from "./types.js";
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
  commentReply?: CommentReplyTrigger | null;
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
  const commentReply = context?.commentReply ?? issue.commentReply ?? null;
  const playbook =
    taskKind === "linear" && linearOrchestration?.enabled && !commentReply
      ? buildLinearPlaybook(linearOrchestration, issue)
      : "";
  const phase = issue.state;
  const commentReplyBlock = commentReply ? renderCommentReplyPrompt(issue, commentReply) : "";
  try {
    const body = await engine.parseAndRender(template, {
      issue: issueForTemplate(issue),
      attempt,
      task_kind: taskKind,
      taskKind,
      phase,
      playbook,
      comment_reply: commentReplyBlock,
      commentReply: commentReplyBlock,
    });
    const sections = [body.trim()];
    if (commentReplyBlock && !body.includes("Linear comment reply"))
      sections.push(commentReplyBlock);
    else if (taskKind === "linear" && playbook && !body.includes(playbook)) sections.push(playbook);
    return sections.filter(Boolean).join("\n\n");
  } catch (reason) {
    throw new Error(
      `template_render_error:${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }
}

export function renderCommentReplyPrompt(issue: Issue, trigger: CommentReplyTrigger): string {
  const author = trigger.replyAuthorName ?? "A teammate";
  return [
    "## Linear comment reply (priority)",
    "",
    "A human replied in-thread to one of your Linear comments. Address their message and post your answer as a **new threaded comment** using `linear_graphql` and `commentCreate`.",
    "",
    `**From:** ${author}`,
    "",
    "**Their reply:**",
    "",
    trigger.replyBody.trim(),
    "",
    "**Your comment they replied to:**",
    "",
    trigger.parentBody.trim().slice(0, 4000),
    "",
    "Required: create a new reply (do not edit existing comments):",
    "",
    "```graphql",
    "mutation Reply($input: CommentCreateInput!) {",
    "  commentCreate(input: $input) {",
    "    success",
    "    comment { id url }",
    "  }",
    "}",
    "```",
    "",
    "Example variables:",
    "",
    "```json",
    JSON.stringify(
      {
        input: {
          issueId: issue.id,
          parentId: trigger.replyCommentId,
          body: "<your reply markdown>",
        },
      },
      null,
      2,
    ),
    "```",
    "",
    "Instructions:",
    "",
    "- Use `parentId` = the human's reply comment id so your answer appears directly under their message.",
    "- Do **not** use `commentUpdate` on the workpad or any existing comment for this conversational reply.",
    "- Do **not** put the reply only in your Codex final message; it must exist on Linear.",
    "- If the reply only needs a short clarification, a brief new comment is enough.",
    "- Update `## Codex Workpad` only when plan, acceptance criteria, or validation materially change—and prefer referencing the workpad in a new comment rather than editing it for chat.",
    "- Do not change issue state unless the reply clearly requires it.",
    "- Be concise and specific.",
  ].join("\n");
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
