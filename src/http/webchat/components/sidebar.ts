/* ── Sidebar component ──────────────────────────────────────────────────── */

const SVG = {
  bolt: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  plus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  inbox: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>`,
  agents: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 10-16 0"/></svg>`,
  wflow: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  tools: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`,
  key: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
  bell: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  dots: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
};

function navItem(id: string, icon: string, label: string, badgeId?: string): string {
  return `
  <div class="nav-item" data-nav="${id}">
    ${icon} ${label}
    ${badgeId ? `<span class="nav-badge" id="${badgeId}">0</span>` : ""}
  </div>`;
}

export function renderSidebar(): string {
  return `
<aside id="sidebar">

  <div id="sidebar-head">
    <div class="brand-mark">${SVG.bolt}</div>
    <div>
      <div class="brand-name">Multi-Agent</div>
      <div class="brand-sub">S.T.A.R.K · Autonomy</div>
    </div>
  </div>

  <div id="sidebar-body">
    <button id="new-conv-btn">${SVG.plus} New Conversation</button>

    <div class="nav-section">
      ${navItem("inbox", SVG.inbox, "Inbox", "badge-inbox")}
      ${navItem("agents", SVG.agents, "Agents", "badge-agents")}
      ${navItem("wflow", SVG.wflow, "Workflows")}
      ${navItem("tools", SVG.tools, "Tools")}
      ${navItem("apikeys", SVG.key, "API Keys")}
      ${navItem("notifs", SVG.bell, "Notifications", "badge-notif")}
    </div>

    <div class="sidebar-label">Conversations</div>

    <div id="conv-list"></div>
  </div>

  <div id="sidebar-foot">
    <div class="user-av">SD</div>
    <div>
      <div class="user-name">Senior Developer</div>
      <div class="user-role">Pro Plan</div>
    </div>
    <div class="user-menu">${SVG.dots}</div>
  </div>

</aside>`;
}
