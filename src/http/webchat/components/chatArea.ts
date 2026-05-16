/* ── Chat area component ────────────────────────────────────────────────── */

import { renderBillingPanel } from "./billing.js";

const SVG = {
  edit:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  share: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  star:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  more:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>`,
  clip:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`,
  code:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  grid:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
  at:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94"/></svg>`,
  send:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
};

interface Chip { icon: string; title: string; desc: string; text: string; }

const CHIPS: Chip[] = [
  { icon: '◈', title: 'Build a REST API',      desc: 'Auth, rate limiting, docs',    text: 'Build a REST API with authentication and rate limiting' },
  { icon: '◉', title: 'Analytics Dashboard',   desc: 'Real-time SaaS metrics',       text: 'Create a real-time analytics dashboard for SaaS metrics' },
  { icon: '▶', title: 'CI/CD Pipeline',         desc: 'Test, build, deploy',          text: 'Set up a CI/CD pipeline with automated testing and deployment' },
  { icon: '◎', title: 'TypeScript Migration',   desc: 'Strict mode, full types',      text: 'Refactor the codebase to use TypeScript with strict mode' },
];

export function renderChatArea(): string {
  return `
<main id="main">
<div id="view-chat" class="view-panel">

  <!-- Header -->
  <div id="chat-header">
    <div id="chat-title-wrap">
      <div id="chat-title">
        <span id="chat-title-text">Analytics Dashboard</span>
        <span class="edit-btn" title="Rename">${SVG.edit}</span>
      </div>
      <div id="chat-meta">
        <span id="meta-agents">6 agents</span> · Updated <span id="meta-time">2m ago</span>
      </div>
    </div>
    <div class="hdr-actions">
      <button class="hdr-btn" id="share-btn">${SVG.share} Share</button>
      <div class="hdr-icon-btn" title="Bookmark">${SVG.star}</div>
      <div class="hdr-icon-btn" title="More">${SVG.more}</div>
    </div>
  </div>

  <!-- Messages -->
  <div id="messages-wrap" role="log" aria-live="polite"></div>

  <!-- Empty state -->
  <div id="empty-state">
    <div class="empty-mark">⚡</div>
    <div class="empty-title">What shall we build?</div>
    <div class="empty-sub">Describe a task and your multi-agent team will plan, coordinate, and execute it.</div>
    <div class="chips-grid">
      ${CHIPS.map(c => `
      <div class="chip" data-suggest="${c.text}">
        <span class="chip-icon">${c.icon}</span>
        <span class="chip-title">${c.title}</span>
        <span class="chip-desc">${c.desc}</span>
      </div>`).join('')}
    </div>
  </div>

  <!-- Typing indicator -->
  <div id="typing-indicator" class="msg-agent" style="padding:0 20px 8px;">
    <div class="msg-agent-av" id="typing-av">S</div>
    <div class="msg-agent-body">
      <div class="msg-agent-header"><strong id="typing-name">S.T.A.R.K</strong> · thinking</div>
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  </div>

  <!-- Input -->
  <div id="input-area">
    <div id="input-box">
      <textarea id="chat-input" rows="1" placeholder="Ask anything or @mention an agent…"></textarea>
      <div id="input-bar">
        <div class="tool-strip">
          <button class="tool-btn" title="Attach">${SVG.clip}</button>
          <button class="tool-btn" title="Code">${SVG.code}</button>
          <button class="tool-btn" title="Layout">${SVG.grid}</button>
          <button class="tool-btn" title="@mention">${SVG.at}</button>
        </div>
        <button id="send-btn" disabled title="Send (Enter)">${SVG.send}</button>
      </div>
    </div>
  </div>

</div>
${renderBillingPanel()}
</main>`;
}
