import express, { type Express } from "express";
import type { Server } from "node:http";
import type { Orchestrator } from "../orchestrator.js";
import type { CodexAppServer } from "../codex/appServer.js";
import type { Logger } from "../logging/logger.js";
import type { Settings } from "../types.js";
import { createSlackIntegration, type SlackIntegration } from "../slack/routes.js";
import { renderWebchat } from "./webchat.js";
import { WebchatBackend } from "./webchatBackend.js";

export class HttpServer {
  private server: Server | null = null;
  private slackIntegration: SlackIntegration | null = null;
  private readonly webchatBackend: WebchatBackend;

  constructor(
    private readonly orchestrator: Orchestrator,
    private readonly codex: CodexAppServer,
    private readonly settingsProvider: () => Settings,
    private readonly logger: Logger,
    private readonly port: number,
    private readonly host = "127.0.0.1",
  ) {
    this.webchatBackend = new WebchatBackend(codex, settingsProvider, logger);
  }

  async start(): Promise<number> {
    const app = this.createApp();
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server = null;
        reject(error);
      };
      this.server = app.listen(this.port, this.host, () => {
        this.server?.off("error", onError);
        resolve();
      });
      this.server.on("upgrade", (request, socket, head) => {
        if (!this.webchatBackend.handleUpgrade(request, socket, head)) socket.destroy();
      });
      this.server.once("error", onError);
    });
    const address = this.server!.address();
    return typeof address === "object" && address ? address.port : this.port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    this.webchatBackend.stop();
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    );
    this.server = null;
  }

  private createApp(): Express {
    const app = express();
    this.slackIntegration = createSlackIntegration(
      this.settingsProvider,
      this.orchestrator,
      this.logger,
    );
    if (this.slackIntegration) {
      app.use("/slack", this.slackIntegration.router);
      this.slackIntegration.start();
    }
    app.use(express.json());
    this.webchatBackend.registerRoutes(app);
    app.get("/chat", (_request, response) => {
      const snapshot = this.orchestrator.snapshot();
      response.type("html").send(renderWebchat(snapshot));
    });
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
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: #0a0c10;
        color: #c9d1d9;
        font: 13px/1.5 "Menlo", "Monaco", "Consolas", "Courier New", monospace;
        min-height: 100vh;
      }
      #terminal {
        padding: 18px 20px 32px;
        white-space: pre;
        overflow-x: auto;
      }
      .bold { font-weight: 700; color: #e6edf3; }
      .green { color: #3fb950; }
      .cyan { color: #58a6ff; }
      .magenta { color: #bc8cff; }
      .yellow { color: #d29922; }
      .red { color: #f85149; }
      .orange { color: #e3b341; }
      .gray { color: #6e7681; }
      .dim { opacity: 0.6; }
      .issue-btn {
        background: none;
        border: none;
        font: inherit;
        color: #58a6ff;
        cursor: pointer;
        padding: 0;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .issue-btn:hover { color: #79c0ff; }
      #detail-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        z-index: 10;
        align-items: center;
        justify-content: center;
      }
      #detail-overlay.open { display: flex; }
      #detail-box {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 20px;
        max-width: 700px;
        width: 90vw;
        max-height: 80vh;
        overflow: auto;
        position: relative;
      }
      #detail-close {
        position: absolute;
        top: 10px; right: 14px;
        background: none; border: none;
        color: #6e7681; font-size: 18px; cursor: pointer;
        font-family: inherit;
      }
      #detail-close:hover { color: #e6edf3; }
      #detail-content {
        white-space: pre;
        font: 12px/1.5 "Menlo", "Monaco", "Consolas", monospace;
        color: #adbac7;
      }
    </style>
  </head>
  <body>
    <div id="terminal">loading…</div>
    <div id="detail-overlay">
      <div id="detail-box">
        <button id="detail-close" title="Close">✕</button>
        <pre id="detail-content"></pre>
      </div>
    </div>
    <script>
      window.__INITIAL_STATE__ = ${JSON.stringify(snapshot)};
      const stateUrl = "/api/v1/state";

      const esc = (v) => String(v ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

      const span = (cls, text) => \`<span class="\${cls}">\${esc(text)}</span>\`;
      const bold = (t) => \`<span class="bold">\${esc(t)}</span>\`;
      const green = (t) => span("green", t);
      const cyan = (t) => span("cyan", t);
      const magenta = (t) => span("magenta", t);
      const yellow = (t) => span("yellow", t);
      const gray = (t) => span("gray", t);
      const red = (t) => span("red", t);
      const orange = (t) => span("orange", t);
      const dim = (t) => span("dim", t);

      function issueBtn(id) {
        return \`<button class="issue-btn" data-issue="\${esc(id)}">\${esc(id)}</button>\`;
      }

      function fmtCount(n) {
        return String(n ?? 0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
      }

      function fmtRuntime(secs) {
        secs = Math.max(0, secs ?? 0);
        const m = Math.floor(secs / 60), s = secs % 60;
        return \`\${m}m \${s}s\`;
      }

      function fmtDueIn(ms) {
        const s = Math.floor(ms / 1000), millis = ms % 1000;
        return \`\${s}.\${String(millis).padStart(3, "0")}s\`;
      }

      function fmtAge(startedAt) {
        if (!startedAt) return "n/a";
        const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
        return fmtRuntime(secs);
      }

      function compactSession(id) {
        if (!id) return "n/a";
        if (id.length > 10) return id.slice(0, 4) + "..." + id.slice(-6);
        return id;
      }

      function pad(s, w, right) {
        s = String(s ?? "").replace(/\\s+/g, " ").trim();
        if (s.length > w) s = s.slice(0, w - 3) + "...";
        return right ? s.padStart(w) : s.padEnd(w);
      }

      function stateColor(state, event) {
        if (!state && !event) return gray;
        const s = String(state ?? event ?? "").toLowerCase();
        if (s.includes("error") || s.includes("fail") || s.includes("crash")) return red;
        if (s.includes("retry") || s.includes("backoff")) return orange;
        if (s.includes("complet") || s.includes("done") || s.includes("success")) return magenta;
        if (s.includes("run") || s.includes("start") || s.includes("active")) return green;
        return cyan;
      }

      function renderRateLimits(rl) {
        if (!rl) return gray("unavailable");
        const limitId = rl.limit_id || rl.limit_name || "unknown";
        const fmtBucket = (b) => {
          if (!b) return "n/a";
          const rem = b.remaining ?? b.remaining_tokens;
          const lim = b.limit ?? b.limit_tokens;
          const reset = b.reset_in_seconds ?? b.resetInSeconds;
          let s = (rem != null && lim != null) ? \`\${fmtCount(rem)}/\${fmtCount(lim)}\`
                : rem != null ? \`remaining \${fmtCount(rem)}\`
                : lim != null ? \`limit \${fmtCount(lim)}\` : "n/a";
          if (reset != null) s += \` reset \${fmtCount(reset)}s\`;
          return s;
        };
        const credits = rl.credits;
        let creditsStr = "credits n/a";
        if (credits) {
          if (credits.unlimited) creditsStr = "credits unlimited";
          else if (credits.has_credits && credits.balance != null) creditsStr = \`credits \${credits.balance.toFixed(2)}\`;
          else if (credits.has_credits) creditsStr = "credits available";
          else creditsStr = "credits none";
        }
        return yellow(limitId) + gray(" | ") + cyan(\`primary \${fmtBucket(rl.primary)}\`) +
               gray(" | ") + cyan(\`secondary \${fmtBucket(rl.secondary)}\`) +
               gray(" | ") + green(creditsStr);
      }

      function renderRunningRows(running, eventWidth) {
        const W = { id: 8, stage: 14, pid: 8, age: 12, tok: 10, sess: 14 };
        const hdr = [pad("ID",W.id), pad("STAGE",W.stage), pad("PID",W.pid),
                     pad("AGE / TURN",W.age), pad("TOKENS",W.tok,true), pad("SESSION",W.sess),
                     pad("EVENT", eventWidth)].join(" ");
        const sep = "─".repeat(W.id+W.stage+W.pid+W.age+W.tok+W.sess+eventWidth+6);
        let rows = [\`│   \${gray(hdr)}\`, \`│   \${gray(sep)}\`];

        if (!running.length) {
          rows.push("│  " + gray("No active agents"));
          rows.push("│");
          return rows;
        }

        for (const r of [...running].sort((a,b) => String(a.issue_identifier).localeCompare(String(b.issue_identifier)))) {
          const id = pad(r.issue_identifier ?? "unknown", W.id);
          const stage = pad(r.last_event ?? r.state ?? "unknown", W.stage);
          const pid = pad(r.worker_host ?? "n/a", W.pid);
          const age = pad(fmtAge(r.started_at) + (r.turn_count ? \` / \${r.turn_count}\` : ""), W.age);
          const tok = pad(fmtCount(r.tokens?.total_tokens ?? 0), W.tok, true);
          const sess = pad(compactSession(r.session_id), W.sess);
          const evt = pad(r.last_message ?? r.last_event ?? "none", eventWidth);
          const col = stateColor(r.state, r.last_event);
          const dot = col === red ? red("●") : col === green ? green("●") : col === magenta ? magenta("●") : col === orange ? orange("●") : cyan("●");
          rows.push(\`│ \${dot} \${cyan(id)} \${col(stage)} \${yellow(pid)} \${magenta(age)} \${yellow(tok)} \${cyan(sess)} \${col(evt)}\`);
        }
        rows.push("│");
        return rows;
      }

      function renderRetryRows(retrying) {
        if (!retrying.length) return ["│  " + gray("No queued retries")];
        return [...retrying]
          .sort((a, b) => (a.due_in_ms ?? 0) - (b.due_in_ms ?? 0))
          .map((r) => {
            const err = r.error ? " " + dim(\`error=\${String(r.error).replace(/\\s+/g,' ').slice(0,96)}\`) : "";
            return \`│  \${orange("↻")} \${red(r.issue_identifier ?? "unknown")} \${yellow(\`attempt=\${r.attempt ?? 0}\`)}\${dim(" in ")}\${cyan(fmtDueIn(r.due_in_ms ?? 0))}\${err}\`;
          });
      }

      function renderQueuedRows(queued) {
        if (!queued.length) return ["│  " + gray("No queued Slack jobs")];
        return [...queued].map((q) => {
          const title = q.title ? " " + dim(String(q.title).replace(/\\s+/g, " ").slice(0, 96)) : "";
          return \`│  \${yellow("•")} \${cyan(q.issue_identifier ?? "unknown")} \${green(q.source ?? "queued")}\${title}\`;
        });
      }

      function renderCandidateRows(candidates, pollError, tracker) {
        const rows = [];
        if (tracker?.kind === "memory") {
          rows.push("│  " + orange("Tracker is in-memory; Linear issues are not polled."));
          rows.push("│  " + gray("Create WORKFLOW.md with tracker.kind: linear (see WORKFLOW.example.md)."));
          rows.push("│");
          return rows;
        }
        if (pollError) {
          rows.push("│  " + red("Poll failed: " + String(pollError).slice(0, 120)));
          rows.push("│");
        }
        if (!candidates.length) {
          rows.push("│  " + gray("No active Linear issues in configured states"));
          rows.push("│");
          return rows;
        }
        for (const c of [...candidates].sort((a, b) => String(a.issue_identifier).localeCompare(String(b.issue_identifier)))) {
          const id = c.issue_identifier ?? "unknown";
          const state = c.state ?? "unknown";
          const title = c.title ? dim(" " + String(c.title).replace(/\\s+/g, " ").slice(0, 72)) : "";
          if (c.dispatchable) {
            rows.push(\`│  \${green("▶")} \${issueBtn(id)} \${cyan(state)}\${title} \${green("dispatchable")}\`);
          } else {
            const reason = c.skip_reason ? dim(" (" + c.skip_reason + ")") : "";
            rows.push(\`│  \${yellow("○")} \${issueBtn(id)} \${cyan(state)}\${title}\${reason}\`);
          }
        }
        rows.push("│");
        return rows;
      }

      function render(snapshot) {
        const counts = snapshot.counts ?? {};
        const health = snapshot.health ?? {};
        const totals = snapshot.codex_totals ?? {};
        const running = snapshot.running ?? [];
        const retrying = snapshot.retrying ?? [];
        const queued = snapshot.queued ?? [];
        const tracker = snapshot.tracker ?? {};
        const lastPoll = snapshot.last_poll ?? {};
        const candidates = lastPoll.candidates ?? [];
        const pollError = lastPoll.error ?? null;
        const maxAgents = (counts.running ?? 0) + (health.available_slots ?? 0);
        const polling = health.polling ?? "unknown";
        const nextPoll = health.next_poll_due_at ? new Date(health.next_poll_due_at).toLocaleTimeString() : null;
        const time = snapshot.generated_at ? new Date(snapshot.generated_at).toLocaleTimeString() : "n/a";

        const EVENT_WIDTH = Math.max(20, Math.min(60, Math.floor((window.innerWidth - 200) / 8) - 66));

        const lines = [];
        lines.push(bold("╭─ S.T.A.R.K STATUS"));
        lines.push(bold("│ Tracker: ") + cyan(String(tracker.kind ?? "unknown")) + (tracker.project_slug ? gray(" | project ") + gray(tracker.project_slug) : ""));
        lines.push(bold("│ Agents: ") + green(String(counts.running ?? 0)) + gray("/") + gray(String(maxAgents)));
        lines.push(bold("│ Runtime: ") + magenta(fmtRuntime(totals.seconds_running)));
        lines.push(bold("│ Tokens: ") + yellow(\`in \${fmtCount(totals.input_tokens)}\`) + gray(" | ") + yellow(\`out \${fmtCount(totals.output_tokens)}\`) + gray(" | ") + yellow(\`total \${fmtCount(totals.total_tokens)}\`));
        lines.push(bold("│ Rate Limits: ") + renderRateLimits(snapshot.rate_limits));
        lines.push(bold("│ Next poll: ") + (polling === "checking_now" ? cyan("checking now…") : nextPoll ? gray(nextPoll) : gray("n/a")));
        lines.push(bold("│ Updated: ") + gray(time));
        lines.push(bold("├─ Linear candidates"));
        lines.push("│");
        for (const row of renderCandidateRows(candidates, pollError, tracker)) lines.push(row);
        lines.push(bold("├─ Running"));
        lines.push("│");
        for (const row of renderRunningRows(running, EVENT_WIDTH)) lines.push(row);
        lines.push(bold("├─ Slack queue"));
        lines.push("│");
        for (const row of renderQueuedRows(queued)) lines.push(row);
        lines.push(bold("├─ Backoff queue"));
        lines.push("│");
        for (const row of renderRetryRows(retrying)) lines.push(row);
        lines.push(bold("╰─"));

        const recentEvents = (snapshot.recent_events ?? []).slice(0, 12);
        if (recentEvents.length) {
          lines.push("");
          lines.push(bold("╭─ Recent Events"));
          for (const ev of recentEvents) {
            const at = ev.at ? gray("  " + new Date(ev.at).toLocaleTimeString()) : "";
            const issueLink = ev.issue_identifier ? " " + issueBtn(ev.issue_identifier) : "";
            const msg = ev.message ? " " + esc(String(ev.message).slice(0, 80)) : "";
            lines.push(\`│  \${cyan(ev.event ?? "")}\${at}\${issueLink}\${msg}\`);
          }
          lines.push(bold("╰─"));
        }

        document.getElementById("terminal").innerHTML = lines.join("\\n");
        document.querySelectorAll(".issue-btn").forEach((btn) => {
          btn.onclick = () => inspectIssue(btn.dataset.issue);
        });
      }

      async function loadState() {
        const res = await fetch(stateUrl);
        if (!res.ok) throw new Error("state request failed");
        render(await res.json());
      }

      async function refreshNow() {
        await fetch("/api/v1/refresh", { method: "POST" });
        await loadState();
      }

      async function inspectIssue(identifier) {
        const res = await fetch("/api/v1/" + encodeURIComponent(identifier));
        const data = await res.json();
        document.getElementById("detail-content").textContent = JSON.stringify(data, null, 2);
        document.getElementById("detail-overlay").classList.add("open");
      }

      document.getElementById("detail-close").onclick = () => {
        document.getElementById("detail-overlay").classList.remove("open");
      };
      document.getElementById("detail-overlay").onclick = (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
      };

      render(window.__INITIAL_STATE__);
      setInterval(() => loadState().catch(() => {
        document.getElementById("terminal").innerHTML += "\\n" + \`<span class="red">connection lost — retrying…</span>\`;
      }), 2000);
    </script>
  </body>
</html>`;
}
