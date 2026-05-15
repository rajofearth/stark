/* ── Right panel component ──────────────────────────────────────────────── */

const fileIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const linkIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`;

/* ── helpers ── */
function taskSection(
  num: string,
  title: string,
  count: string,
  items: Array<{ done: boolean; label: string; sub?: string }>,
): string {
  return `
  <div class="task-sec">
    <div class="task-sec-hdr">
      <span class="task-num">${num}</span>
      <span class="task-title">${title}</span>
      <span class="task-cnt">${count}</span>
    </div>
    ${items
      .map(
        (i) => `
    <div class="task-row">
      <div class="task-chk${i.done ? " done" : ""}"></div>
      <div>
        <div class="task-text">${i.label}</div>
        ${i.sub ? `<div class="task-sub">${fileIcon} ${i.sub}</div>` : ""}
      </div>
    </div>`,
      )
      .join("")}
  </div>`;
}

function activityItem(
  initials: string,
  name: string,
  desc: string,
  time: string,
  special?: boolean,
): string {
  const avStyle = special ? ' style="color:var(--t);border-color:var(--bd-1);"' : "";
  return `
  <div class="act-item">
    <div class="act-av"${avStyle}>${initials}</div>
    <div style="flex:1;">
      <div class="act-name">${name}</div>
      <div class="act-desc">${desc}</div>
    </div>
    <div class="act-time">${time}</div>
  </div>`;
}

function agentItem(initials: string, name: string): string {
  return `
  <div class="ag-item">
    <div class="ag-av">${initials}</div>
    <div class="ag-name">${name}</div>
    <div class="ag-dot"></div>
  </div>`;
}

/* ── Tasks pane ── */
function tasksPane(): string {
  return `
  <div class="rpane active" id="pane-tasks">
    <div class="rp-sec">
      <div class="rp-sec-hdr">
        <span class="rp-label">Current Plan</span>
        <span class="rp-meta" id="plan-source" style="font-size:9px;letter-spacing:0.04em;">WAITING</span>
      </div>
    </div>

    <div class="rp-sec">
      <div class="rp-sec-hdr">
        <span class="rp-label">Progress</span>
        <span class="rp-meta" id="progress-label">0 / 0</span>
      </div>
      <div class="prog-track"><div class="prog-fill" id="progress-bar" style="width:0%"></div></div>
    </div>

    <div id="plan-list">
      <div class="note-box">When Stark proposes a plan, it will appear here and update while the response streams.</div>
    </div>
  </div>`;
}

/* ── Agents pane ── */
function agentsPane(): string {
  return `
  <div class="rpane" id="pane-agents">
    <div class="rp-sec">
      <div class="rp-sec-hdr">
        <span class="rp-label">Activity Feed</span>
        <span style="font-size:10px;color:var(--t-m);cursor:pointer;">View all</span>
      </div>
    </div>

    <div id="activity-feed">
      ${activityItem("S", "Stark", "Direct webchat ready", "now", true)}
    </div>

    <div class="rp-sec" style="padding-bottom:8px;">
      <div class="rp-sec-hdr">
        <span class="rp-label">Active Agents</span>
        <span class="rp-meta" id="agents-count">1 / 1</span>
      </div>
    </div>

    <div id="agent-list">
      ${agentItem("S", "Stark")}
    </div>

    <!-- Live orchestrator (shown when real agents are running) -->
    <div id="live-section">
      <div class="rp-sec" style="padding-bottom:8px;">
        <div class="rp-sec-hdr">
          <span class="rp-label">Live Orchestrator</span>
          <span class="rp-meta" id="live-count">0</span>
        </div>
      </div>
      <div id="live-agent-list"></div>
    </div>

    <div class="rp-sec" style="padding-bottom:4px;">
      <span class="rp-label">Context</span>
    </div>
    <div>
      <div class="sub-label">Workspace</div>
      <div class="ctx-row">${fileIcon} Direct Stark webchat</div>
    </div>
  </div>`;
}

/* ── Details pane ── */
function detailsPane(): string {
  return `
  <div class="rpane" id="pane-details">
    <div class="rp-sec" style="padding-bottom:8px;">
      <span class="rp-label">Conversation Details</span>
    </div>
    <div class="det-row"><span class="det-k">Created</span>      <span class="det-v" id="det-created">—</span></div>
    <div class="det-row"><span class="det-k">Thread</span>       <span class="det-v" id="det-thread">—</span></div>
    <div class="det-row"><span class="det-k">Turn</span>         <span class="det-v" id="det-turn">—</span></div>
    <div class="det-row"><span class="det-k">Model</span>        <span class="det-v" id="det-model">Stark App Server</span></div>
    <div class="det-row"><span class="det-k">Workspace</span>    <span class="det-v" id="det-workspace">—</span></div>
    <div class="det-row"><span class="det-k">Tracker</span>      <span class="det-v" id="det-tracker">—</span></div>
    <div class="det-row"><span class="det-k">Status</span>       <span class="det-v" id="det-status">—</span></div>
    <div class="det-row"><span class="det-k">Agents</span>       <span class="det-v" id="det-agents">—</span></div>
    <div class="det-row"><span class="det-k">Total tokens</span> <span class="det-v" id="det-tokens">—</span></div>
    <div class="det-row"><span class="det-k">Input / output</span><span class="det-v" id="det-io-tokens">—</span></div>
    <div class="det-row"><span class="det-k">Cached</span>       <span class="det-v" id="det-cached-tokens">—</span></div>
    <div class="det-row"><span class="det-k">Context used / window</span><span class="det-v" id="det-context">not reported</span></div>
    <div class="det-row"><span class="det-k">Cost estimate</span><span class="det-v" id="det-cost">not reported</span></div>
    <div class="det-row"><span class="det-k">Runtime</span>      <span class="det-v" id="det-runtime">—</span></div>
    <div class="rp-sec" style="padding:10px 14px 4px;"><span class="rp-label">Files worked with</span></div>
    <div id="det-files"><div class="note-box compact">No file activity yet.</div></div>
    <div class="det-row">
      <span class="det-k">Pipeline</span>
      <span class="det-v" style="color:var(--t-m);font-size:10px;">Direct Stark</span>
    </div>
    <div class="note-box">
      <strong style="color:var(--t-s);">Direct Stark session.</strong><br>
      Token, context, and cost rows update when the Codex runtime reports usage. If the runtime omits cost or context fields, the row stays marked as not reported.
    </div>
  </div>`;
}

export function renderRightPanel(): string {
  return `
<aside id="rpanel">
  <div id="rpanel-tabs">
    <div class="rpanel-tab active" data-tab="tasks">Tasks</div>
    <div class="rpanel-tab" data-tab="agents">Agents</div>
    <div class="rpanel-tab" data-tab="details">Details</div>
  </div>
  <div id="rpanel-body">
    ${tasksPane()}
    ${agentsPane()}
    ${detailsPane()}
  </div>
</aside>`;
}
