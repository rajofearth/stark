import { normalizeIssueState } from "../config/schema.js";
import type {
  LinearOrchestrationSettings,
  LinearPhaseDef,
  LinearSubagentDef,
  TaskKind,
} from "../types.js";

export type { LinearOrchestrationSettings, LinearPhaseDef, LinearSubagentDef, TaskKind };

export const DEFAULT_LINEAR_ORCHESTRATION: LinearOrchestrationSettings = {
  enabled: true,
  phases: {
    todo: {
      subagents: [
        { id: "task_analyzer", purpose: "Break down acceptance criteria, scope, and risks" },
        { id: "codebase_explorer", purpose: "Map relevant code paths and integration points" },
        { id: "researcher", purpose: "Gather external docs, APIs, or prior art as needed" },
        {
          id: "architect_planner",
          purpose: "Synthesize findings into an implementation plan",
        },
      ],
      deliverables: [
        "Post the implementation plan as a Linear comment",
        "Move the issue to In Progress when the plan is sufficient to start work",
      ],
    },
    in_progress: {
      subagents: [
        { id: "coder", purpose: "Implement the planned changes in the workspace" },
        {
          id: "qa_reviewer",
          purpose: "Run tests and perform code review on the implementation",
        },
        { id: "debugger", purpose: "Diagnose and fix failures found during QA" },
        {
          id: "documenter",
          purpose: "Document changes and summarize outcomes when useful",
        },
      ],
      deliverables: [
        "Complete implement → QA → fix loops until validation passes",
        "Post a Linear comment with final changes, validation results, and links or media",
        "Invoke Documenter when documentation or a polished summary is needed",
        "Move the issue to Human Review when ready for humans",
      ],
    },
    merging: {
      subagents: [
        {
          id: "coder",
          purpose: "Open or update the pull request and ensure it is merge-ready",
        },
      ],
      deliverables: [
        "File the PR via approved GitHub tooling when required",
        "Add the PR link in a Linear comment",
      ],
    },
  },
};

export function normalizeLinearOrchestration(raw: unknown): LinearOrchestrationSettings {
  if (!raw || typeof raw !== "object") {
    return cloneDefaults();
  }
  const record = raw as Record<string, unknown>;
  const enabled =
    typeof record.enabled === "boolean" ? record.enabled : DEFAULT_LINEAR_ORCHESTRATION.enabled;
  const phasesRaw = record.phases;
  if (!phasesRaw || typeof phasesRaw !== "object" || Array.isArray(phasesRaw)) {
    return { enabled, phases: cloneDefaults().phases };
  }
  const phases: Record<string, LinearPhaseDef> = { ...cloneDefaults().phases };
  for (const [phaseKey, phaseValue] of Object.entries(phasesRaw)) {
    const normalizedKey = normalizeIssueState(phaseKey).replace(/\s+/g, "_");
    const merged = mergePhase(phases[normalizedKey], phaseValue);
    if (merged) phases[normalizedKey] = merged;
  }
  return { enabled, phases };
}

export function phaseKeyForState(state: string): string | null {
  const normalized = normalizeIssueState(state).replace(/\s+/g, "_");
  if (normalized in DEFAULT_LINEAR_ORCHESTRATION.phases) return normalized;
  return null;
}

export function renderPhasePlaybook(settings: LinearOrchestrationSettings, state: string): string {
  const phaseKey = phaseKeyForState(state);
  if (!phaseKey) return "";
  const phase = settings.phases[phaseKey];
  if (!phase) return "";
  const lines: string[] = [
    `### Phase: ${state}`,
    "",
    "Subagents to spawn (via Codex subagent tooling when specialized work is needed):",
  ];
  for (const subagent of phase.subagents) {
    lines.push(`- **${subagent.id}**: ${subagent.purpose}`);
  }
  lines.push("", "Deliverables for this phase:");
  for (const deliverable of phase.deliverables) {
    lines.push(`- ${deliverable}`);
  }
  return lines.join("\n");
}

export function renderOrchestratorRules(issueIdentifier: string): string {
  return [
    "## Linear orchestrator role",
    "",
    `You are the **orchestrator** for Linear ticket \`${issueIdentifier}\`.`,
    "",
    "- Spawn Codex subagents for specialized work; synthesize their outputs before acting.",
    "- Use the `linear_graphql` tool for Linear comments and workflow state changes.",
    "- Choose subagent order and parallelism; skip roles that add no value for this ticket.",
    "- Do not implement large bodies of work inline when a subagent role is more appropriate.",
    "",
    "## Anti-patterns",
    "",
    "- Do not move to Human Review without meaningful validation when implementation was required.",
    "- Do not open a PR while the issue is still in Todo.",
    "- Do not apply this Linear playbook to Slack or `SLACK-*` ad-hoc tasks.",
  ].join("\n");
}

export function buildContinuationPrompt(
  taskKind: TaskKind,
  state: string,
  turn: number,
  maxTurns: number,
  settings: LinearOrchestrationSettings,
  commentReply = false,
): string {
  if (commentReply) {
    return [
      "Continuation guidance:",
      "",
      "- Finish addressing the human's reply and post a new comment via commentCreate (parentId = their reply id).",
      "- Do not commentUpdate the workpad or existing comments for this conversation.",
      "- Do not change issue state unless clearly required.",
    ].join("\n");
  }
  const base = [
    "Continuation guidance:",
    "",
    `- The previous Codex turn completed normally, but the issue is still in an active state.`,
    `- This is continuation turn #${turn} of ${maxTurns} for the current agent run.`,
    "- Resume from the current workspace and thread context instead of restarting from scratch.",
    "- Prior instructions and turn context are already in this thread; do not restate them before acting.",
  ];
  if (taskKind !== "linear" || !settings.enabled) {
    base.push(
      "- Focus on the remaining work and do not end the turn while the issue stays active unless you are truly blocked.",
    );
    return base.join("\n");
  }
  const phaseKey = phaseKeyForState(state);
  const phaseHint = phaseContinuationHint(phaseKey);
  base.push(
    `- Current Linear state: **${state}**.`,
    phaseHint,
    "- You remain the orchestrator: spawn subagents as needed, then synthesize and update Linear.",
    "- Do not end the turn while the issue stays active unless you are truly blocked.",
  );
  if (phaseKey && settings.phases[phaseKey]) {
    base.push("", "Phase reminder:", renderPhasePlaybook(settings, state));
  }
  return base.join("\n");
}

function phaseContinuationHint(phaseKey: string | null): string {
  switch (phaseKey) {
    case "todo":
      return "- Resume planning subagents or post the plan and advance to In Progress when ready.";
    case "in_progress":
      return "- Resume the implement → QA → debug loop, or hand off to Human Review with a summary comment when ready.";
    case "merging":
      return "- Focus on PR creation or updates and add the PR link in Linear.";
    default:
      return "- Continue orchestrating toward the next workflow handoff for this state.";
  }
}

function mergePhase(base: LinearPhaseDef | undefined, raw: unknown): LinearPhaseDef | null {
  if (!raw || typeof raw !== "object") return base ?? null;
  const record = raw as Record<string, unknown>;
  const subagents = normalizeSubagents(record.subagents, base?.subagents ?? []);
  const deliverables = normalizeStringList(record.deliverables, base?.deliverables ?? []);
  if (subagents.length === 0 && deliverables.length === 0) return base ?? null;
  return {
    subagents: subagents.length > 0 ? subagents : (base?.subagents ?? []),
    deliverables: deliverables.length > 0 ? deliverables : (base?.deliverables ?? []),
  };
}

function normalizeSubagents(raw: unknown, fallback: LinearSubagentDef[]): LinearSubagentDef[] {
  if (!Array.isArray(raw)) return fallback;
  const parsed: LinearSubagentDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const purpose = typeof record.purpose === "string" ? record.purpose.trim() : "";
    if (!id) continue;
    parsed.push({ id, purpose: purpose || id });
  }
  return parsed.length > 0 ? parsed : fallback;
}

function normalizeStringList(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const parsed = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function cloneDefaults(): LinearOrchestrationSettings {
  return {
    enabled: DEFAULT_LINEAR_ORCHESTRATION.enabled,
    phases: structuredClone(DEFAULT_LINEAR_ORCHESTRATION.phases),
  };
}
