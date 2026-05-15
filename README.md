# S.T.A.R.K

**S.T.A.R.K** stands for **System for Task Automation, Reasoning & Knowledge**.

This is a TypeScript recreation of the Symphony automation service. It polls Linear for eligible work, creates per-issue workspaces, runs Codex in app-server mode, and exposes logs plus an optional local dashboard/API.

## Requirements

- Node.js 22 or newer.
- A `codex` executable that supports `app-server`.
- A Linear API token when using `tracker.kind: linear`.
- macOS or Windows for local execution. SSH workers are POSIX shell oriented.

## Install And Build

```sh
npm install
npm run build
```

## Run

```sh
export LINEAR_API_KEY=...
npm start -- ./WORKFLOW.md
```

Optional flags:

- `--logs-root <path>` writes logs to `<path>/stark.log`.
- `--port <port>` sets the dashboard and JSON API port. The default is `4000`.
- `--no-open` starts without opening the dashboard in your browser.
- `--no-dashboard` starts without the dashboard/API.

## Dashboard

The dashboard is designed for operating active S.T.A.R.K runs. It shows:

- runtime health, poll status, capacity, and token totals
- active agent runs with workspace/session details
- retry queue timing and errors
- recent orchestration and Codex events
- issue detail inspection by clicking an issue identifier

The page refreshes itself every two seconds and includes a manual refresh button that triggers an immediate poll/reconciliation cycle.

## Slack Jarvis Mode

S.T.A.R.K can expose Slack endpoints from the same HTTP server as the dashboard. For local development, run the server on port `4000`, expose it with ngrok, then configure Slack callbacks to the ngrok URL:

```sh
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_SIGNING_SECRET=...
export STARK_PUBLIC_BASE_URL=https://example.ngrok-free.app
ngrok http 4000
npm start -- ./WORKFLOW.md --no-open
```

Slack endpoints:

- Slash command: `POST /slack/commands`
- Event subscriptions: `POST /slack/events`
- Interactivity: `POST /slack/interactions`

Enable the integration in `WORKFLOW.md`:

```yaml
slack:
  enabled: true
  bot_token: $SLACK_BOT_TOKEN
  signing_secret: $SLACK_SIGNING_SECRET
  allowed_channel_ids: ["C0123456789"]
  allowed_user_ids: ["U0123456789"]
  artifact_roots: ["./assets", "~/stark-workspaces"]
github:
  enabled: true
  allowed_repo_roots: ["~/stark-workspaces"]
```

Supported commands include `status`, `refresh`, `issue <id>`, `artifact <keywords>`, `approvals`, `approve <id>`, `reject <id>`, `pr <repo-path> [title]`, and `new-project <instructions>`. @mention Stark or send any other text to run an agent task. Artifact uploads, PR creation, and new projects are approval-gated by default; agent tasks run immediately.

## Cross-Platform Notes

On macOS and POSIX hosts, local hooks run through `sh -lc`. On Windows, local hooks run through PowerShell. Write `WORKFLOW.md` hooks for the target host shell, or use SSH workers for POSIX remote execution.

Workspace paths are resolved and checked with platform-aware containment rules before Codex starts. Codex is always launched with the per-issue workspace as cwd.

## Quality Gates

```sh
npm run all
```

Live Linear/Codex integration is intentionally gated:

```sh
export LINEAR_API_KEY=...
npm run e2e
```
