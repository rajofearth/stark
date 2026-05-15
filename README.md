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
npm run build
node dist/src/cli.js --i-understand-that-this-will-be-running-without-the-usual-guardrails ./WORKFLOW.md
```

Optional flags:

- `--logs-root <path>` writes logs to `<path>/stark.log`.
- `--port <port>` enables the dashboard and JSON API at `/`, `/api/v1/state`, `/api/v1/<issue_identifier>`, and `/api/v1/refresh`.

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
