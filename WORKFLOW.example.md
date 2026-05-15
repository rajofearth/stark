---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: "your-linear-project-slug"
  active_states:
    - Todo
    - In Progress
    - Merging
    - Rework
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
codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
server:
  port: 4000
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

Work autonomously inside the provided workspace. Keep progress in the tracker using the available Linear tooling and move the ticket to the workflow-defined handoff state when validated.
