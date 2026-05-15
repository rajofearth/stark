/* Monochrome theme — every color is a shade of gray or white */
export function renderStyles(): string {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* ── Tones (darkest → lightest) ───────────────────────── */
  --bg:      #0c0c0c;
  --bg-1:    #111111;
  --bg-2:    #181818;
  --bg-3:    #1e1e1e;
  --bg-4:    #252525;
  --bd:      #2d2d2d;
  --bd-1:    #3a3a3a;
  --t-m:     #555555;
  --t-s:     #888888;
  --t:       #cccccc;
  --t-p:     #f2f2f2;
  --w:       #ffffff;

  /* ── Radii ────────────────────────────────────────────── */
  --r:    4px;
  --r-lg: 6px;

  /* ── Dimensions ───────────────────────────────────────── */
  --sidebar-w: 216px;
  --rpanel-w:  288px;

  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI",
               Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.55;
  color: var(--t);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

html, body { height: 100%; overflow: hidden; }

/* ── Scrollbar ──────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-4); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bd-1); }

/* ══════════════════════════════════════════════════════════
   LAYOUT
══════════════════════════════════════════════════════════ */
#app {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr var(--rpanel-w);
  height: 100vh;
  overflow: hidden;
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════════ */
#sidebar {
  background: var(--bg-1);
  border-right: 1px solid var(--bd);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#sidebar-head {
  padding: 14px 13px 11px;
  border-bottom: 1px solid var(--bd);
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}
.brand-mark {
  width: 26px; height: 26px;
  border: 1px solid var(--bd-1);
  border-radius: var(--r);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.brand-name { font-size: 12px; font-weight: 700; color: var(--t-p); letter-spacing: -0.01em; }
.brand-sub  { font-size: 10px; color: var(--t-m); letter-spacing: 0.02em; }

#sidebar-body { flex: 1; overflow-y: auto; padding: 6px 0; }

/* New conversation */
#new-conv-btn {
  display: flex; align-items: center; gap: 7px;
  width: calc(100% - 16px);
  margin: 6px 8px 2px;
  padding: 6px 10px;
  background: none;
  border: 1px solid var(--bd-1);
  border-radius: var(--r);
  color: var(--t-s);
  font-size: 12px; font-weight: 500;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
#new-conv-btn:hover { border-color: var(--t-m); color: var(--t-p); background: var(--bg-2); }

/* Nav */
.nav-section { padding: 4px 0; }
.nav-item {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 13px;
  color: var(--t-s);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.nav-item:hover  { background: var(--bg-2); color: var(--t); }
.nav-item.active { background: var(--bg-3); color: var(--t-p); }
.nav-item svg { opacity: 0.6; flex-shrink: 0; }
.nav-item:hover svg, .nav-item.active svg { opacity: 1; }
.nav-badge {
  margin-left: auto;
  font-size: 10px; font-weight: 600; color: var(--t-m);
  font-variant-numeric: tabular-nums;
}
.nav-badge.live { color: var(--t-p); }

/* Divider label */
.sidebar-label {
  padding: 9px 13px 3px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--t-m);
}

/* Conversations */
.conv-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 13px;
  cursor: pointer;
  transition: background 0.1s;
}
.conv-item:hover  { background: var(--bg-2); }
.conv-item.active { background: var(--bg-3); }
.conv-icon {
  width: 20px; height: 20px; border-radius: var(--r);
  background: var(--bg-3); border: 1px solid var(--bd);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; flex-shrink: 0; margin-top: 1px;
}
.conv-info { flex: 1; min-width: 0; }
.conv-title { font-size: 12px; font-weight: 500; color: var(--t-p); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-time  { font-size: 10px; color: var(--t-m); }
.conv-live  { width: 5px; height: 5px; border-radius: 50%; background: var(--t-s); flex-shrink: 0; margin-top: 8px; }
.conv-item.active .conv-live { background: var(--w); }

/* Footer */
#sidebar-foot {
  padding: 9px 13px;
  border-top: 1px solid var(--bd);
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0;
}
.user-av {
  width: 24px; height: 24px; border-radius: 50%;
  border: 1px solid var(--bd-1);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--t-p);
  flex-shrink: 0;
}
.user-name { font-size: 12px; font-weight: 600; color: var(--t-p); }
.user-role { font-size: 10px; color: var(--t-m); }
.user-menu {
  width: 20px; height: 20px; border-radius: var(--r);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--t-m);
  transition: background 0.1s, color 0.1s;
  margin-left: auto;
}
.user-menu:hover { background: var(--bg-3); color: var(--t-p); }

/* ══════════════════════════════════════════════════════════
   MAIN CHAT
══════════════════════════════════════════════════════════ */
#main {
  display: flex; flex-direction: column;
  background: var(--bg);
  overflow: hidden;
  min-width: 0;
}

/* Header */
#chat-header {
  padding: 11px 18px;
  border-bottom: 1px solid var(--bd);
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-1);
  flex-shrink: 0;
}
#chat-title-wrap { flex: 1; min-width: 0; }
#chat-title {
  font-size: 14px; font-weight: 700; color: var(--t-p);
  display: flex; align-items: center; gap: 5px;
  letter-spacing: -0.01em;
}
.edit-btn { color: var(--t-m); cursor: pointer; opacity: 0; transition: opacity 0.12s; }
#chat-title:hover .edit-btn { opacity: 1; }
#chat-meta { font-size: 11px; color: var(--t-m); margin-top: 1px; }
.hdr-actions { display: flex; align-items: center; gap: 5px; }
.hdr-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 9px;
  background: none;
  border: 1px solid var(--bd);
  border-radius: var(--r);
  color: var(--t-s); font-size: 11px; font-weight: 500;
  cursor: pointer; transition: border-color 0.1s, color 0.1s, background 0.1s;
}
.hdr-btn:hover { border-color: var(--bd-1); color: var(--t-p); background: var(--bg-2); }
.hdr-icon-btn {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--bd); border-radius: var(--r);
  cursor: pointer; color: var(--t-m);
  transition: border-color 0.1s, color 0.1s, background 0.1s;
}
.hdr-icon-btn:hover { border-color: var(--bd-1); color: var(--t-p); background: var(--bg-2); }

/* ── Messages area ──────────────────────────────────────── */
#messages-wrap {
  flex: 1; overflow-y: auto;
  padding: 18px 20px;
  display: flex; flex-direction: column; gap: 0;
}

/* User message */
.msg-user { display: flex; justify-content: flex-end; margin: 5px 0; }
.msg-user-inner { max-width: 68%; }
.msg-user-bubble {
  background: var(--bg-2);
  border: 1px solid var(--bd-1);
  border-radius: var(--r-lg) var(--r-lg) 2px var(--r-lg);
  padding: 9px 13px;
  color: var(--t-p);
  font-size: 13px; line-height: 1.55;
}
.msg-user-meta { text-align: right; font-size: 10px; color: var(--t-m); margin-top: 3px; padding-right: 2px; }

/* Agent message */
.msg-agent { display: flex; gap: 9px; margin: 10px 0; max-width: 90%; }
.msg-agent-av {
  width: 26px; height: 26px; border-radius: 50%;
  border: 1px solid var(--bd);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-size: 9px; font-weight: 700;
  color: var(--t-s); margin-top: 1px;
  background: var(--bg-2);
}
.msg-agent-body { flex: 1; min-width: 0; }
.msg-agent-header { font-size: 11px; color: var(--t-m); margin-bottom: 5px; }
.msg-agent-header strong { color: var(--t); font-weight: 600; }

/* Thinking block */
.thinking-block {
  margin-bottom: 7px;
  border: 1px solid var(--bd);
  border-radius: var(--r);
  overflow: hidden;
}
.thinking-trigger {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 9px;
  background: var(--bg-2);
  cursor: pointer; user-select: none;
  font-size: 11px; color: var(--t-m);
  transition: background 0.1s;
}
.thinking-trigger:hover { background: var(--bg-3); }
.thinking-caret { font-size: 7px; transition: transform 0.18s; opacity: 0.6; }
.thinking-block.open .thinking-caret { transform: rotate(90deg); }
.thinking-pulse {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--t-m); flex-shrink: 0;
  animation: blink 1.8s infinite;
}
.thinking-body { max-height: 0; overflow: hidden; transition: max-height 0.22s ease; }
.thinking-block.open .thinking-body { max-height: 400px; }
.thinking-text {
  padding: 9px 11px;
  font-size: 11px; color: var(--t-s);
  line-height: 1.65; background: var(--bg-1);
  border-top: 1px solid var(--bd);
}

/* Planning block */
.planning-block {
  margin: 6px 0;
  border: 1px solid var(--bd);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--bg-1);
}
.planning-header {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 12px;
  cursor: pointer; user-select: none;
  font-size: 11px; font-weight: 600; color: var(--t-s);
  transition: background 0.1s;
}
.planning-header:hover { background: var(--bg-2); }
.planning-caret { font-size: 7px; transition: transform 0.18s; opacity: 0.5; }
.planning-block.collapsed .planning-caret { transform: rotate(-90deg); }
.planning-body { overflow: hidden; transition: max-height 0.28s ease; max-height: 600px; }
.planning-block.collapsed .planning-body { max-height: 0; }
.planning-inner { padding: 0 12px 12px; border-top: 1px solid var(--bd); }
.planning-shimmer {
  font-size: 11px; color: var(--t-m); padding: 8px 0 9px;
  animation: blink 2s infinite;
}
.planning-agent-row {
  display: flex; align-items: center; gap: 9px;
  padding: 6px 8px; border-radius: var(--r);
  transition: background 0.1s;
}
.planning-agent-row:hover { background: var(--bg-2); }
.pa-av {
  width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid var(--bd);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; color: var(--t-s);
  flex-shrink: 0;
}
.pa-name   { font-size: 11px; font-weight: 600; color: var(--t); }
.pa-status { font-size: 10px; color: var(--t-m); }
.pa-menu   { margin-left: auto; color: var(--t-m); cursor: pointer; opacity: 0; transition: opacity 0.1s; }
.planning-agent-row:hover .pa-menu { opacity: 1; }

/* Code block */
.code-block { margin: 7px 0; border: 1px solid var(--bd); border-radius: var(--r); overflow: hidden; }
.code-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 10px;
  background: var(--bg-2); border-bottom: 1px solid var(--bd);
}
.code-filename { font-size: 10px; color: var(--t-s); font-family: "Menlo","Monaco","Consolas",monospace; }
.code-copy {
  font-size: 10px; color: var(--t-m);
  background: none; border: none; cursor: pointer;
  padding: 1px 5px; border-radius: 3px;
  transition: background 0.1s, color 0.1s;
  display: flex; align-items: center; gap: 3px;
}
.code-copy:hover { background: var(--bg-3); color: var(--t-p); }
.code-body {
  padding: 10px 12px;
  font-family: "Menlo","Monaco","Consolas",monospace;
  font-size: 11px; line-height: 1.7;
  color: var(--t); overflow-x: auto; white-space: pre;
  background: var(--bg-1);
}
/* Syntax tones — desaturated for mono theme */
.hl-kw  { color: #aaaaaa; font-weight: 600; }
.hl-str { color: var(--t); opacity: 0.75; }
.hl-cmt { color: var(--t-m); font-style: italic; }
.hl-tag { color: var(--t-p); }
.hl-num { color: var(--t-s); }

/* System message */
.msg-sys {
  display: flex; align-items: flex-start; gap: 11px;
  margin: 10px 0; padding: 12px 14px;
  border: 1px solid var(--bd-1); border-left-width: 2px;
  border-radius: var(--r-lg);
  background: var(--bg-1);
}
.msg-sys.ok   { border-left-color: var(--t-s); }
.msg-sys.warn { border-left-color: var(--t-m); }
.sys-icon {
  width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid var(--bd-1);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-size: 11px; color: var(--t);
  margin-top: 1px;
}
.sys-title { font-size: 12px; font-weight: 600; color: var(--t-p); }
.sys-sub   { font-size: 11px; color: var(--t-s); margin-top: 2px; }
.sys-actions { display: flex; gap: 7px; margin-top: 9px; }

/* Notification card */
.notif-card {
  margin: 9px 0; border: 1px solid var(--bd);
  border-radius: var(--r-lg); overflow: hidden;
  background: var(--bg-1);
}
.notif-head {
  display: flex; align-items: center; gap: 9px;
  padding: 10px 12px; border-bottom: 1px solid var(--bd);
}
.notif-icon {
  width: 26px; height: 26px; border-radius: var(--r);
  border: 1px solid var(--bd-1);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; flex-shrink: 0;
}
.notif-title { font-size: 12px; font-weight: 600; color: var(--t-p); }
.notif-time  { font-size: 10px; color: var(--t-m); }
.notif-body  { padding: 9px 12px; }
.notif-msg   { font-size: 12px; color: var(--t); }
.notif-sub   { font-size: 10px; color: var(--t-m); margin-top: 2px; }
.notif-acts  { display: flex; gap: 6px; margin-top: 9px; }

/* Check badge */
.check-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--t-s); margin-top: 5px; }

/* Markdown content */
.md-content h1,.md-content h2,.md-content h3 { color: var(--t-p); margin: 7px 0 3px; font-weight: 700; }
.md-content h1 { font-size: 15px; } .md-content h2 { font-size: 13px; } .md-content h3 { font-size: 12px; }
.md-content p { margin: 3px 0; color: var(--t); }
.md-content ul,.md-content ol { padding-left: 16px; margin: 3px 0; }
.md-content li { margin: 2px 0; }
.md-content code { background: var(--bg-3); border-radius: 2px; padding: 1px 4px; font-family: "Menlo","Monaco","Consolas",monospace; font-size: 10px; color: var(--t-p); }
.md-content strong { color: var(--t-p); font-weight: 600; }
.md-content blockquote { border-left: 2px solid var(--bd-1); padding: 3px 10px; color: var(--t-s); margin: 5px 0; }
.md-link { color: var(--t-p); text-decoration: underline; text-underline-offset: 2px; }
.md-link:hover { color: var(--w); }

/* Runtime/tool events */
.runtime-events { display: flex; flex-direction: column; gap: 5px; margin: 5px 0 7px; }
.runtime-block {
  display: flex; align-items: flex-start; gap: 7px;
  border: 1px solid var(--bd); border-radius: var(--r);
  background: var(--bg-1); padding: 6px 8px;
}
.runtime-block.failed { border-color: var(--bd-1); }
.runtime-dot {
  width: 17px; height: 17px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--bd-1); color: var(--t-s); font-size: 10px; margin-top: 1px;
}
.runtime-title { font-size: 11px; font-weight: 600; color: var(--t); }
.runtime-detail { font-size: 10px; color: var(--t-m); margin-top: 1px; word-break: break-word; }
.runtime-hidden { display: none; }
.runtime-toggle {
  align-self: flex-start; background: none; border: none; padding: 1px 2px;
  color: var(--t-m); font-size: 10px; cursor: pointer; text-decoration: underline;
  text-underline-offset: 2px;
}
.runtime-toggle:hover { color: var(--t); }

/* ── Buttons ────────────────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: var(--r);
  font-size: 11px; font-weight: 500;
  cursor: pointer; border: 1px solid var(--bd);
  background: none; color: var(--t);
  transition: border-color 0.1s, color 0.1s, background 0.1s;
}
.btn:hover { border-color: var(--bd-1); color: var(--t-p); background: var(--bg-2); }
.btn-filled { background: var(--t); color: var(--bg); border-color: var(--t); font-weight: 600; }
.btn-filled:hover { background: var(--w); color: var(--bg); border-color: var(--w); }
.btn-sm { padding: 3px 9px; font-size: 10px; }

/* ── Input area ─────────────────────────────────────────── */
#input-area {
  padding: 10px 18px 14px;
  border-top: 1px solid var(--bd);
  background: var(--bg-1);
  flex-shrink: 0;
}
#input-box {
  background: var(--bg-2);
  border: 1px solid var(--bd-1);
  border-radius: var(--r-lg);
  overflow: hidden;
  transition: border-color 0.15s;
}
#input-box:focus-within { border-color: var(--t-m); }
#chat-input {
  width: 100%; min-height: 40px; max-height: 140px;
  background: none; border: none; outline: none;
  color: var(--t-p); font-size: 13px;
  padding: 10px 14px 5px;
  resize: none; line-height: 1.5;
  font-family: inherit;
}
#chat-input::placeholder { color: var(--t-m); }
#input-bar { display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; }
.tool-strip { display: flex; align-items: center; gap: 1px; }
.tool-btn {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--r); cursor: pointer; color: var(--t-m);
  background: none; border: none;
  transition: background 0.1s, color 0.1s;
}
.tool-btn:hover { background: var(--bg-3); color: var(--t); }
#send-btn {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--t); color: var(--bg);
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.12s, transform 0.1s;
}
#send-btn:hover { background: var(--w); transform: scale(1.06); }
#send-btn:disabled { background: var(--bg-4); color: var(--t-m); cursor: not-allowed; transform: none; }

/* ── Empty state ────────────────────────────────────────── */
#empty-state { display: none; }
#empty-state.show {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 40px; text-align: center;
  flex: 1;
}
.empty-mark {
  width: 48px; height: 48px; border-radius: var(--r-lg);
  border: 1px solid var(--bd-1);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
}
.empty-title { font-size: 20px; font-weight: 700; color: var(--t-p); letter-spacing: -0.02em; }
.empty-sub { font-size: 13px; color: var(--t-m); max-width: 340px; line-height: 1.6; }
.chips-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; width: 100%; max-width: 420px; }
.chip {
  background: var(--bg-2); border: 1px solid var(--bd);
  border-radius: var(--r); padding: 9px 12px;
  font-size: 11px; color: var(--t-s); cursor: pointer; text-align: left;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.chip:hover { border-color: var(--bd-1); color: var(--t-p); background: var(--bg-3); }
.chip-icon { font-size: 14px; margin-bottom: 3px; display: block; }
.chip-title { font-weight: 600; display: block; color: var(--t); }
.chip-desc  { font-size: 10px; color: var(--t-m); display: block; margin-top: 1px; }

/* ── Typing indicator ───────────────────────────────────── */
#typing-indicator { display: none; }
#typing-indicator.show { display: flex; }
.typing-dots { display: flex; gap: 3px; align-items: center; padding: 6px 10px; }
.typing-dot  {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--t-m); animation: bounce 1.1s infinite;
}
.typing-dot:nth-child(2) { animation-delay: 0.18s; }
.typing-dot:nth-child(3) { animation-delay: 0.36s; }

/* ══════════════════════════════════════════════════════════
   RIGHT PANEL
══════════════════════════════════════════════════════════ */
#rpanel {
  border-left: 1px solid var(--bd);
  background: var(--bg-1);
  display: flex; flex-direction: column; overflow: hidden;
}
#rpanel-tabs {
  display: flex; border-bottom: 1px solid var(--bd);
  flex-shrink: 0;
}
.rpanel-tab {
  flex: 1; padding: 10px 4px; text-align: center;
  font-size: 11px; font-weight: 500; color: var(--t-m);
  cursor: pointer; border-bottom: 1px solid transparent;
  transition: color 0.12s, border-color 0.12s;
  margin-bottom: -1px;
}
.rpanel-tab:hover { color: var(--t); }
.rpanel-tab.active { color: var(--t-p); border-bottom-color: var(--t-s); }
#rpanel-body { flex: 1; overflow-y: auto; }
.rpane { display: none; }
.rpane.active { display: block; }

/* Tasks */
.rp-sec { padding: 12px 14px; border-bottom: 1px solid var(--bd); }
.rp-sec-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
.rp-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--t-s); }
.rp-meta  { font-size: 10px; color: var(--t-m); }
.prog-track { height: 2px; background: var(--bg-4); border-radius: 1px; overflow: hidden; }
.prog-fill  { height: 100%; background: var(--t-s); border-radius: 1px; transition: width 0.4s ease; }

.task-sec { padding: 9px 14px; border-bottom: 1px solid var(--bd); }
.task-sec-hdr { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
.task-num   { font-size: 10px; font-weight: 700; color: var(--t-m); width: 14px; flex-shrink: 0; }
.task-title { font-size: 11px; font-weight: 600; color: var(--t); flex: 1; }
.task-cnt   { font-size: 10px; color: var(--t-m); }
.task-row { display: flex; align-items: flex-start; gap: 7px; padding: 3px 0; margin-left: 21px; }
.task-chk {
  width: 13px; height: 13px; border-radius: 50%;
  border: 1px solid var(--bd-1);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: 2px;
  transition: border-color 0.12s, background 0.12s;
}
.task-chk.done { border-color: var(--t-s); background: var(--t-s); }
.task-chk.done::after {
  content: ""; width: 5px; height: 3px;
  border: 1px solid var(--bg); border-top: none; border-right: none;
  transform: rotate(-45deg) translateY(-1px); display: block;
}
.task-text { font-size: 11px; color: var(--t); }
.task-sub  { font-size: 10px; color: var(--t-m); display: flex; align-items: center; gap: 2px; margin-top: 1px; }

/* Agents pane */
.act-item {
  display: flex; align-items: flex-start; gap: 9px;
  padding: 7px 14px; border-bottom: 1px solid var(--bd);
}
.act-av {
  width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid var(--bd); background: var(--bg-2);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; color: var(--t-s);
  flex-shrink: 0;
}
.act-name { font-size: 11px; font-weight: 600; color: var(--t); }
.act-desc { font-size: 10px; color: var(--t-m); }
.act-time { font-size: 10px; color: var(--t-m); white-space: nowrap; }

.ag-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; border-bottom: 1px solid var(--bd);
}
.ag-av {
  width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid var(--bd); background: var(--bg-2);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; color: var(--t-s);
  flex-shrink: 0;
}
.ag-name { flex: 1; font-size: 11px; color: var(--t); }
.ag-dot  { width: 5px; height: 5px; border-radius: 50%; background: var(--t-s); }

.ctx-row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 14px; font-size: 11px; color: var(--t-s);
  cursor: pointer; transition: background 0.1s;
}
.ctx-row:hover { background: var(--bg-2); color: var(--t-p); }
.ctx-more { padding: 3px 14px; font-size: 10px; color: var(--t-m); cursor: pointer; }
.ctx-more:hover { color: var(--t); }
.sub-label {
  padding: 7px 14px 2px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--t-m);
}

/* Details pane */
.det-row {
  display: flex; align-items: flex-start;
  justify-content: space-between;
  padding: 7px 14px; border-bottom: 1px solid var(--bd); gap: 10px;
}
.det-k { font-size: 10px; color: var(--t-m); white-space: nowrap; }
.det-v { font-size: 11px; color: var(--t); text-align: right; word-break: break-all; }
.note-box {
  margin: 12px 14px;
  padding: 9px 11px;
  border: 1px solid var(--bd); border-radius: var(--r);
  font-size: 10px; color: var(--t-m); line-height: 1.65;
  background: var(--bg-2);
}
.note-box code { color: var(--t-s); font-family: "Menlo","Monaco",monospace; font-size: 9px; }

/* ── Live section ───────────────────────────────────────── */
#live-section { display: none; }

/* ── Toast ──────────────────────────────────────────────── */
#toast {
  position: fixed; bottom: 20px; left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: var(--bg-3);
  border: 1px solid var(--bd-1);
  border-radius: var(--r-lg);
  padding: 8px 14px;
  font-size: 11px; color: var(--t-p);
  box-shadow: 0 6px 24px rgba(0,0,0,0.5);
  opacity: 0; transition: opacity 0.22s, transform 0.22s;
  z-index: 999; pointer-events: none;
  display: flex; align-items: center; gap: 6px;
}
#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ── Connection badge ───────────────────────────────────── */
#conn-badge {
  position: fixed; bottom: 14px; right: calc(var(--rpanel-w) + 12px);
  font-size: 10px; color: var(--t-m);
  background: var(--bg-2); border: 1px solid var(--bd);
  border-radius: 20px; padding: 2px 9px;
  display: flex; align-items: center; gap: 4px;
  opacity: 0; transition: opacity 0.25s; pointer-events: none; z-index: 100;
}
#conn-badge.show { opacity: 1; }
#conn-badge .cd { width: 4px; height: 4px; border-radius: 50%; background: var(--t-m); }
#conn-badge.ok .cd { background: var(--t-s); }
#conn-badge.err .cd { background: var(--t-m); }

/* ── Animations ─────────────────────────────────────────── */
@keyframes blink  { 0%,100%{opacity:.4} 50%{opacity:1} }
@keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
`;
}
