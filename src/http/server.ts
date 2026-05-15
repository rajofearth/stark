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
  return `<!doctype html>
<html>
  <head>
    <title>S.T.A.R.K</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      :root {
        color-scheme: dark;
        --bg: #080b12;
        --panel: #101622;
        --panel-2: #151d2c;
        --text: #e8edf7;
        --muted: #8f9bae;
        --line: #263247;
        --accent: #7dd3fc;
        --green: #86efac;
        --yellow: #fde68a;
        --red: #fca5a5;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: radial-gradient(circle at top left, #152033 0, var(--bg) 42rem);
        color: var(--text);
        font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      header {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 24px;
        border-bottom: 1px solid var(--line);
        background: rgba(8, 11, 18, 0.86);
        backdrop-filter: blur(14px);
      }
      h1 { margin: 0; font-size: 18px; letter-spacing: 0.12em; }
      button {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 9px 12px;
        color: var(--text);
        background: var(--panel-2);
        cursor: pointer;
      }
      button:hover { border-color: var(--accent); }
      main { padding: 24px; display: grid; gap: 20px; }
      .muted { color: var(--muted); }
      .cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
      .card, section {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(21, 29, 44, 0.92), rgba(16, 22, 34, 0.92));
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      }
      .card { padding: 16px; }
      .card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
      .card .value { margin-top: 6px; font-size: 28px; font-weight: 700; }
      section { overflow: hidden; }
      section h2 { margin: 0; padding: 16px 18px; border-bottom: 1px solid var(--line); font-size: 15px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid rgba(38, 50, 71, 0.72); vertical-align: top; }
      th { color: var(--muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; }
      tr:hover td { background: rgba(125, 211, 252, 0.04); }
      .pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 999px; padding: 3px 8px; color: var(--muted); }
      .ok { color: var(--green); }
      .warn { color: var(--yellow); }
      .bad { color: var(--red); }
      .grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr); gap: 20px; }
      .events { list-style: none; margin: 0; padding: 0; }
      .events li { padding: 12px 16px; border-bottom: 1px solid rgba(38, 50, 71, 0.72); }
      .events strong { color: var(--accent); }
      pre {
        margin: 0;
        padding: 16px;
        max-height: 360px;
        overflow: auto;
        color: #dbeafe;
        background: #05070c;
      }
      .empty { padding: 22px; color: var(--muted); }
      @media (max-width: 960px) {
        .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>S.T.A.R.K</h1>
        <div class="muted">System for Task Automation, Reasoning &amp; Knowledge</div>
      </div>
      <div>
        <span id="status" class="pill">loading</span>
        <button id="refresh">Refresh now</button>
      </div>
    </header>
    <main>
      <div class="cards">
        <div class="card"><div class="label">Running</div><div id="running-count" class="value">0</div></div>
        <div class="card"><div class="label">Retrying</div><div id="retrying-count" class="value">0</div></div>
        <div class="card"><div class="label">Available Slots</div><div id="slots-count" class="value">0</div></div>
        <div class="card"><div class="label">Completed</div><div id="completed-count" class="value">0</div></div>
        <div class="card"><div class="label">Tokens</div><div id="tokens-count" class="value">0</div></div>
      </div>
      <div class="grid">
        <section>
          <h2>Active Agent Runs</h2>
          <div id="running"></div>
        </section>
        <section>
          <h2>Runtime Health</h2>
          <pre id="health"></pre>
        </section>
      </div>
      <div class="grid">
        <section>
          <h2>Retry Queue</h2>
          <div id="retrying"></div>
        </section>
        <section>
          <h2>Codex Totals</h2>
          <pre id="totals"></pre>
        </section>
      </div>
      <div class="grid">
        <section>
          <h2>Recent Events</h2>
          <ul id="events" class="events"></ul>
        </section>
        <section>
          <h2>Issue Detail</h2>
          <pre id="detail">Click an issue identifier to inspect it.</pre>
        </section>
      </div>
    </main>
    <script>
      window.__INITIAL_STATE__ = ${JSON.stringify(snapshot)};
      const stateUrl = "/api/v1/state";
      const $ = (id) => document.getElementById(id);
      const escapeHtml = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

      async function loadState() {
        const res = await fetch(stateUrl);
        if (!res.ok) throw new Error("state request failed");
        render(await res.json());
      }

      async function refreshNow() {
        $("status").textContent = "refreshing";
        await fetch("/api/v1/refresh", { method: "POST" });
        await loadState();
      }

      async function inspectIssue(identifier) {
        const res = await fetch("/api/v1/" + encodeURIComponent(identifier));
        $("detail").textContent = JSON.stringify(await res.json(), null, 2);
      }

      function render(snapshot) {
        $("status").textContent = (snapshot.health?.polling ?? "unknown") + " · " + new Date(snapshot.generated_at).toLocaleTimeString();
        $("running-count").textContent = snapshot.counts?.running ?? 0;
        $("retrying-count").textContent = snapshot.counts?.retrying ?? 0;
        $("slots-count").textContent = snapshot.health?.available_slots ?? 0;
        $("completed-count").textContent = snapshot.counts?.completed ?? 0;
        $("tokens-count").textContent = snapshot.codex_totals?.total_tokens ?? 0;
        $("health").textContent = JSON.stringify(snapshot.health ?? {}, null, 2);
        $("totals").textContent = JSON.stringify(snapshot.codex_totals ?? {}, null, 2);
        $("running").innerHTML = table(snapshot.running ?? [], ["issue_identifier", "state", "turn_count", "last_event", "workspace_path"], true);
        $("retrying").innerHTML = table(snapshot.retrying ?? [], ["issue_identifier", "attempt", "due_in_ms", "error", "worker_host"], true);
        $("events").innerHTML = (snapshot.recent_events ?? []).map((event) => \`
          <li>
            <strong>\${escapeHtml(event.event)}</strong>
            <span class="muted">\${escapeHtml(event.at)}</span><br>
            \${event.issue_identifier ? '<button data-issue="' + escapeHtml(event.issue_identifier) + '">' + escapeHtml(event.issue_identifier) + '</button>' : ''}
            \${escapeHtml(event.message)}
          </li>\`).join("") || '<li class="empty">No events yet.</li>';
        document.querySelectorAll("[data-issue]").forEach((button) => {
          button.onclick = () => inspectIssue(button.dataset.issue);
        });
      }

      function table(rows, columns, linkIssue) {
        if (!rows.length) return '<div class="empty">Nothing to show.</div>';
        return \`<table><thead><tr>\${columns.map((column) => '<th>' + escapeHtml(column.replaceAll("_", " ")) + '</th>').join("")}</tr></thead><tbody>\${rows.map((row) => '<tr>' + columns.map((column) => cell(row, column, linkIssue)).join("") + '</tr>').join("")}</tbody></table>\`;
      }

      function cell(row, column, linkIssue) {
        const value = row[column] ?? "";
        if (column === "issue_identifier" && linkIssue) {
          return '<td><button data-issue="' + escapeHtml(value) + '">' + escapeHtml(value) + '</button></td>';
        }
        return '<td>' + escapeHtml(typeof value === "object" ? JSON.stringify(value) : value) + '</td>';
      }

      $("refresh").onclick = refreshNow;
      render(window.__INITIAL_STATE__);
      setInterval(() => loadState().catch((error) => { $("status").textContent = "offline"; console.error(error); }), 2000);
    </script>
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
