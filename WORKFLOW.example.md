---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: "your-linear-project-slug"
  active_states:
    - Todo
    - In Progress
    - Merging
  terminal_states:
    - Done
    - Canceled
    - Cancelled
    - Duplicate
polling:
  interval_ms: 5000
workspace:
  root: ~/stark-workspaces
hooks:
  after_create: |
    git clone --depth 1 https://github.com/your-org/your-repo.git .
agent:
  max_concurrent_agents: 1
  max_turns: 6
  linear_orchestration:
    enabled: true
    phases:
      todo:
        subagents:
          - id: task_analyzer
            purpose: "Break down acceptance criteria, scope, and risks"
          - id: codebase_explorer
            purpose: "Map relevant code paths and integration points"
          - id: researcher
            purpose: "Gather external docs, APIs, or prior art as needed"
          - id: architect_planner
            purpose: "Synthesize findings into an implementation plan"
        deliverables:
          - "Post the implementation plan as a Linear comment"
          - "Move the issue to In Progress when the plan is sufficient to start work"
      in_progress:
        subagents:
          - id: coder
            purpose: "Implement the planned changes in the workspace"
          - id: qa_reviewer
            purpose: "Run tests and perform code review on the implementation"
          - id: debugger
            purpose: "Diagnose and fix failures found during QA"
          - id: documenter
            purpose: "Document changes and summarize outcomes when useful"
        deliverables:
          - "Complete implement → QA → fix loops until validation passes"
          - "Post a Linear comment with final changes, validation results, and links or media"
          - "Invoke Documenter when documentation or a polished summary is needed"
          - "Move the issue to Human Review when ready for humans"
      merging:
        subagents:
          - id: coder
            purpose: "Open or update the pull request and ensure it is merge-ready"
        deliverables:
          - "File the PR via approved GitHub tooling when required"
          - "Add the PR link in a Linear comment"
codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
server:
  port: 4000
slack:
  enabled: false
  bot_token: $SLACK_BOT_TOKEN
  signing_secret: $SLACK_SIGNING_SECRET
  allowed_channel_ids:
    - C0123456789
  allowed_user_ids:
    - U0123456789
  public_base_url: $STARK_PUBLIC_BASE_URL
  artifact_roots:
    - ./assets
    - ~/stark-workspaces
github:
  enabled: false
  allowed_repo_roots:
    - ~/stark-workspaces
---

You are working on a Linear ticket `{{ issue.identifier }}`.

Title: {{ issue.title }}
Status: {{ issue.state }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

{% if playbook %}
{{ playbook }}
{% endif %}

Work autonomously inside the provided workspace. Keep progress in the tracker using the available Linear tooling and move the ticket to the workflow-defined handoff state when validated.

## Linear orchestration (reference)

When `task_kind` is `linear`, you are the **orchestrator**. Spawn Codex subagents for specialized work and synthesize their outputs.

| State           | Subagent roles                                                    | Outcomes                                          |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| **Todo**        | Task Analyzer, Codebase Explorer, Researcher, Architect / Planner | Plan comment → **In Progress**                    |
| **In Progress** | Coder, QA Reviewer, Debugger / Fixer; Documenter when useful      | Summary with changes and media → **Human Review** |
| **Merging**     | Coder (PR focus)                                                  | PR link in Linear comment                         |

Anti-patterns: do not skip QA before Human Review without cause; do not open a PR in Todo; do not apply this playbook to Slack or `SLACK-*` tasks.

## Comment replies (all non-terminal states)

Stark polls every non-terminal issue for humans replying in-thread to the API token user's comments. The agent must post a **new** `commentCreate` reply (`parentId` = the human's comment)—not edit the workpad or use `commentUpdate` for chat.

Optional `comment_reply_states` in tracker config narrows watch to specific state names only; omit it to watch all non-terminal issues.
