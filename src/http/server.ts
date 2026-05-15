import express, { type Express } from "express";
import type { Server } from "node:http";
import type { Orchestrator } from "../orchestrator.js";

export class HttpServer {
  private server: Server | null = null;

  constructor(
    private readonly orchestrator: Orchestrator,
    private readonly port: number,
    private readonly host = "127.0.0.1",
  ) {}

  async start(): Promise<number> {
    const app = this.createApp();
    await new Promise<void>((resolve) => {
      this.server = app.listen(this.port, this.host, () => resolve());
    });
    const address = this.server!.address();
    return typeof address === "object" && address ? address.port : this.port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    );
    this.server = null;
  }

  private createApp(): Express {
    const app = express();
    app.use(express.json());
    app.get("/", (_request, response) => {
      const snapshot = this.orchestrator.snapshot();
      response.type("html").send(renderDashboard(snapshot));
    });
    app.get("/api/v1/state", (_request, response) => response.json(this.orchestrator.snapshot()));
    app.get("/api/v1/:issue_identifier", (request, response) => {
      const payload = this.orchestrator.issueSnapshot(request.params.issue_identifier);
      if (!payload) {
        response.status(404).json({
          error: {
            code: "issue_not_found",
            message: `Issue not found: ${request.params.issue_identifier}`,
          },
        });
        return;
      }
      response.json(payload);
    });
    app.post("/api/v1/refresh", (_request, response) => {
      response.status(202).json(this.orchestrator.requestRefresh());
    });
    app.all(
      ["/api/v1/state", "/api/v1/:issue_identifier", "/api/v1/refresh"],
      (_request, response) => {
        response
          .status(405)
          .json({ error: { code: "method_not_allowed", message: "Method not allowed" } });
      },
    );
    app.use((_request, response) => {
      response.status(404).json({ error: { code: "not_found", message: "Not found" } });
    });
    return app;
  }
}

function renderDashboard(snapshot: Record<string, any>): string {
  const runningRows = (snapshot.running ?? [])
    .map(
      (row: any) =>
        `<tr><td>${escapeHtml(row.issue_identifier)}</td><td>${escapeHtml(row.state)}</td><td>${escapeHtml(row.session_id ?? "")}</td><td>${row.turn_count}</td><td>${escapeHtml(row.last_event ?? "")}</td></tr>`,
    )
    .join("");
  const retryRows = (snapshot.retrying ?? [])
    .map(
      (row: any) =>
        `<tr><td>${escapeHtml(row.issue_identifier)}</td><td>${row.attempt}</td><td>${escapeHtml(row.due_at)}</td><td>${escapeHtml(row.error ?? "")}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html>
  <head><title>S.T.A.R.K</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body>
    <h1>S.T.A.R.K</h1>
    <p>Generated at ${escapeHtml(snapshot.generated_at)}</p>
    <h2>Running (${snapshot.counts?.running ?? 0})</h2>
    <table><thead><tr><th>Issue</th><th>State</th><th>Session</th><th>Turns</th><th>Last event</th></tr></thead><tbody>${runningRows}</tbody></table>
    <h2>Retrying (${snapshot.counts?.retrying ?? 0})</h2>
    <table><thead><tr><th>Issue</th><th>Attempt</th><th>Due</th><th>Error</th></tr></thead><tbody>${retryRows}</tbody></table>
    <h2>Codex totals</h2>
    <pre>${escapeHtml(JSON.stringify(snapshot.codex_totals, null, 2))}</pre>
  </body>
</html>`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
