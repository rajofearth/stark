/* Premium dark workspace theme — subtle depth, glass panels, soft blue glow */
export function renderStyles(): string {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* ── Premium dark tones ───────────────────────────────── */
  --bg:      #070b14;
  --bg-1:    rgba(10, 15, 26, 0.88);
  --bg-2:    rgba(17, 24, 39, 0.72);
  --bg-3:    rgba(255, 255, 255, 0.055);
  --bg-4:    rgba(255, 255, 255, 0.085);
  --bd:      rgba(255, 255, 255, 0.08);
  --bd-1:    rgba(255, 255, 255, 0.14);
  --t-m:     #5d6780;
  --t-s:     #8b96ad;
  --t:       #d6dce8;
  --t-p:     #f4f7fb;
  --w:       #ffffff;
  --accent:  #3b82f6;
  --accent-2:#60a5fa;
  --accent-soft: rgba(59, 130, 246, 0.12);
  --accent-glow: rgba(59, 130, 246, 0.22);
  --shadow-soft: 0 10px 32px rgba(0,0,0,0.26);
  --shadow-glow: 0 0 28px rgba(59,130,246,0.10);

  /* ── Radii ────────────────────────────────────────────── */
  --r:    10px;
  --r-md: 14px;
  --r-lg: 18px;

  /* ── Dimensions ───────────────────────────────────────── */
  --sidebar-w: 240px;
  --rpanel-w:  272px;
  --bg-hover:  rgba(255, 255, 255, 0.04);

  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI",
               Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.55;
  color: var(--t);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

/* ── Micro-effects: smooth global transitions ───────────── */
*, *::before, *::after {
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

html, body { height: 100%; overflow: hidden; }
body {
  background:
    radial-gradient(circle at top center, rgba(59,130,246,0.09), transparent 34%),
    radial-gradient(circle at 78% 18%, rgba(96,165,250,0.05), transparent 28%),
    var(--bg);
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
  background-size: 52px 52px;
  pointer-events: none;
  opacity: 0.32;
  z-index: 0;
}

/* ── Scrollbar ──────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-4); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bd-1); }

/* ══════════════════════════════════════════════════════════
   LAYOUT
══════════════════════════════════════════════════════════ */
#app {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr var(--rpanel-w);
  height: 100vh;
  overflow: hidden;
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════════ */
#sidebar {
  background: linear-gradient(180deg, rgba(10,15,26,0.92), rgba(7,11,20,0.96));
  backdrop-filter: blur(18px);
  border-right: 1px solid var(--bd);
  box-shadow: inset -1px 0 rgba(255,255,255,0.035);
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
  width: 28px; height: 28px;
  border: 1px solid rgba(59,130,246,0.28);
  border-radius: var(--r);
  background: var(--accent-soft);
  box-shadow: var(--shadow-glow);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  animation: glowPulse 5s ease-in-out infinite;
}
.brand-name { font-size: 12px; font-weight: 700; color: var(--t-p); letter-spacing: -0.01em; }
.brand-sub  { font-size: 10px; color: var(--t-m); letter-spacing: 0.02em; }

#sidebar-body { flex: 1; overflow-y: auto; padding: 6px 0; }

/* New conversation */
#new-conv-btn {
  display: flex; align-items: center; gap: 7px;
  width: calc(100% - 16px);
  margin: 8px 8px 4px;
  padding: 7px 11px;
  background: linear-gradient(180deg, rgba(37,99,235,0.10), rgba(29,78,216,0.06));
  border: 1px solid rgba(59,130,246,0.20);
  border-radius: var(--r-md);
  color: var(--t-s);
  font-size: 12px; font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(59,130,246,0.06);
  transition: border-color 0.16s, color 0.16s, background 0.16s, box-shadow 0.16s, transform 0.16s;
}
#new-conv-btn:hover { border-color: rgba(59,130,246,0.36); color: var(--t-p); background: linear-gradient(180deg, rgba(59,130,246,0.15), rgba(37,99,235,0.10)); box-shadow: 0 0 22px rgba(59,130,246,0.18); transform: translateY(-1px); }

/* Nav */
.nav-section { padding: 4px 0; }
.nav-item {
  display: flex; align-items: center; gap: 8px;
  margin: 1px 8px;
  padding: 6px 9px;
  border: 1px solid transparent;
  border-radius: var(--r);
  color: var(--t-s);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.16s, color 0.16s, border-color 0.16s, box-shadow 0.16s;
}
.nav-item:hover  { background: var(--bg-hover, rgba(255,255,255,0.04)); color: var(--t); }
.nav-item.active { background: linear-gradient(90deg, rgba(59,130,246,0.16), rgba(59,130,246,0.03) 85%, transparent); color: var(--t-p); border-color: rgba(59,130,246,0.24); box-shadow: 0 0 24px rgba(59,130,246,0.12); }
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
  margin: 1px 8px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: var(--r);
  cursor: pointer;
  transition: background 0.16s, border-color 0.16s, box-shadow 0.16s;
}
.conv-item:hover  { background: rgba(255,255,255,0.04); }
.conv-item.active { background: linear-gradient(90deg, rgba(59,130,246,0.14), rgba(59,130,246,0.03) 85%, transparent); border-color: rgba(59,130,246,0.22); box-shadow: 0 0 20px rgba(59,130,246,0.10); }
.conv-icon {
  width: 20px; height: 20px; border-radius: var(--r);
  background: rgba(255,255,255,0.035); border: 1px solid var(--bd);
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
  width: 26px; height: 26px; border-radius: 50%;
  border: 1px solid rgba(59,130,246,0.22);
  background: rgba(59,130,246,0.10);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--t-p);
  flex-shrink: 0;
  box-shadow: 0 0 12px rgba(59,130,246,0.10);
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
  position: relative;
  display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(255,255,255,0.012), transparent 28%);
  overflow: hidden;
  min-width: 0;
}
#main::before {
  content: "";
  position: absolute;
  top: 34%; left: 50%;
  transform: translateX(-50%);
  width: 620px; height: 260px;
  background: radial-gradient(circle, rgba(59,130,246,0.075), transparent 70%);
  filter: blur(68px);
  pointer-events: none;
  opacity: 0.8;
}

/* Header */
#chat-header {
  position: relative;
  z-index: 1;
  padding: 12px 18px;
  border-bottom: 1px solid var(--bd);
  display: flex; align-items: center; gap: 10px;
  background: rgba(10,15,26,0.78);
  backdrop-filter: blur(18px);
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
  padding: 5px 10px;
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--bd);
  border-radius: var(--r);
  color: var(--t-s); font-size: 11px; font-weight: 500;
  cursor: pointer; transition: border-color 0.16s, color 0.16s, background 0.16s, box-shadow 0.16s;
}
.hdr-btn:hover { border-color: rgba(59,130,246,0.25); color: var(--t-p); background: var(--accent-soft); box-shadow: var(--shadow-glow); }
.hdr-icon-btn {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--bd); border-radius: var(--r);
  cursor: pointer; color: var(--t-m);
  transition: border-color 0.1s, color 0.1s, background 0.1s;
}
.hdr-icon-btn:hover { border-color: rgba(59,130,246,0.25); color: var(--t-p); background: var(--accent-soft); box-shadow: var(--shadow-glow); }

/* ── Messages area ──────────────────────────────────────── */
#messages-wrap {
  position: relative;
  z-index: 1;
  flex: 1; overflow-y: auto;
  padding: 20px 22px;
  display: flex; flex-direction: column; gap: 0;
}

/* User message */
.msg-user { display: flex; justify-content: flex-end; margin: 5px 0; }
.msg-user-inner { max-width: 68%; }
.msg-user-bubble {
  background: linear-gradient(135deg, rgba(59,130,246,0.18), rgba(37,99,235,0.10));
  border: 1px solid rgba(59,130,246,0.24);
  border-radius: var(--r-lg) var(--r-lg) 4px var(--r-lg);
  padding: 11px 15px;
  color: var(--t-p);
  box-shadow: 0 8px 28px rgba(0,0,0,0.22), 0 0 24px rgba(59,130,246,0.10);
  font-size: 13px; line-height: 1.55;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.msg-user-bubble:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 32px rgba(0,0,0,0.28), 0 0 28px rgba(59,130,246,0.14);
}
.msg-user-meta { text-align: right; font-size: 10px; color: var(--t-m); margin-top: 3px; padding-right: 2px; }

/* Agent message */
.msg-agent { display: flex; gap: 9px; margin: 10px 0; max-width: 90%; }
.msg-agent-av {
  width: 26px; height: 26px; border-radius: 50%;
  border: 1px solid rgba(59,130,246,0.18);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-size: 9px; font-weight: 700;
  color: var(--t-s); margin-top: 1px;
  background: rgba(255,255,255,0.035);
  box-shadow: 0 0 18px rgba(59,130,246,0.06);
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
  background: rgba(255,255,255,0.02);
  backdrop-filter: blur(12px);
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
  margin: 7px 0;
  border: 1px solid var(--bd);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: rgba(17,24,39,0.60);
  backdrop-filter: blur(14px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.22);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.planning-block:hover {
  border-color: rgba(59,130,246,0.15);
  box-shadow: 0 0 20px rgba(59,130,246,0.07), 0 10px 30px rgba(0,0,0,0.24);
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
.code-block { margin: 8px 0; border: 1px solid var(--bd); border-radius: var(--r-md); overflow: hidden; background: rgba(9,14,24,0.96); box-shadow: 0 10px 30px rgba(0,0,0,0.26); position: relative; }
.code-block::before { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 1px; background: linear-gradient(90deg, transparent, rgba(59,130,246,0.50), transparent); z-index: 1; }
.code-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255,255,255,0.025); border-bottom: 1px solid var(--bd);
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
  padding: 12px 14px;
  font-family: "Menlo","Monaco","Consolas",monospace;
  font-size: 11px; line-height: 1.7;
  color: var(--t); overflow-x: auto; white-space: pre;
  background: rgba(9,14,24,0.95);
}
/* Syntax tones — desaturated for mono theme */
.hl-kw  { color: #93c5fd; font-weight: 600; }
.hl-str { color: #c7d2fe; opacity: 0.82; }
.hl-cmt { color: var(--t-m); font-style: italic; }
.hl-tag { color: var(--t-p); }
.hl-num { color: #bfdbfe; }

/* System message */
.msg-sys {
  display: flex; align-items: flex-start; gap: 11px;
  margin: 10px 0; padding: 12px 14px;
  border: 1px solid var(--bd-1); border-left-width: 2px;
  border-radius: var(--r-lg);
  background: rgba(17,24,39,0.62);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow-soft);
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
  background: rgba(17,24,39,0.62);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow-soft);
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
.msg-agent-body > .md-content {
  display: inline-block;
  max-width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--bd);
  border-radius: var(--r-lg);
  background: rgba(255,255,255,0.022);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.22);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.msg-agent-body > .md-content:hover {
  transform: translateY(-2px);
  border-color: rgba(59,130,246,0.22);
  box-shadow: 0 0 24px rgba(59,130,246,0.10), 0 12px 32px rgba(0,0,0,0.26);
}
.msg-agent-body > .runtime-events + .md-content { margin-top: 6px; }
.md-content h1,.md-content h2,.md-content h3 { color: var(--t-p); margin: 7px 0 3px; font-weight: 700; }
.md-content h1 { font-size: 15px; } .md-content h2 { font-size: 13px; } .md-content h3 { font-size: 12px; }
.md-content p { margin: 3px 0; color: var(--t); }
.md-content ul,.md-content ol { padding-left: 16px; margin: 3px 0; }
.md-content li { margin: 2px 0; }
.md-content code { background: rgba(59,130,246,0.10); border: 1px solid rgba(59,130,246,0.14); border-radius: 5px; padding: 1px 5px; font-family: "Menlo","Monaco","Consolas",monospace; font-size: 10px; color: var(--t-p); }
.md-content strong { color: var(--t-p); font-weight: 600; }
.md-content blockquote { border-left: 2px solid var(--bd-1); padding: 3px 10px; color: var(--t-s); margin: 5px 0; }
.md-link { color: #93c5fd; text-decoration: underline; text-underline-offset: 2px; }
.md-link:hover { color: var(--w); }

/* Runtime/tool events */
.runtime-events { display: flex; flex-direction: column; gap: 5px; margin: 5px 0 7px; }
.runtime-block {
  display: flex; align-items: flex-start; gap: 7px;
  border: 1px solid var(--bd); border-radius: var(--r);
  background: rgba(17,24,39,0.56); padding: 6px 8px;
  backdrop-filter: blur(12px);
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
  background: rgba(255,255,255,0.025); color: var(--t);
  transition: border-color 0.16s, color 0.16s, background 0.16s, box-shadow 0.16s, transform 0.16s;
}
.btn:hover { border-color: rgba(59,130,246,0.24); color: var(--t-p); background: var(--accent-soft); box-shadow: var(--shadow-glow); }
.btn-filled { background: linear-gradient(180deg, #2563eb, #1d4ed8); color: var(--w); border-color: rgba(255,255,255,0.10); font-weight: 600; box-shadow: 0 5px 18px rgba(37,99,235,0.22); }
.btn-filled:hover { transform: translateY(-1px); background: linear-gradient(180deg, #3b82f6, #2563eb); color: var(--w); border-color: rgba(255,255,255,0.16); box-shadow: 0 8px 26px rgba(37,99,235,0.30); }
.btn-sm { padding: 3px 9px; font-size: 10px; }

/* ── Input area ─────────────────────────────────────────── */
#input-area {
  position: relative;
  z-index: 2;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--bd);
  background: rgba(10,15,26,0.78);
  backdrop-filter: blur(18px);
  flex-shrink: 0;
}
#input-box {
  background: rgba(14,20,35,0.90);
  border: 1px solid var(--bd-1);
  border-radius: 24px;
  overflow: hidden;
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-soft);
  transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
}
#input-box:focus-within { border-color: rgba(59,130,246,0.38); box-shadow: 0 0 32px rgba(59,130,246,0.14), var(--shadow-soft); background: rgba(14,20,35,0.95); }
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
.tool-btn:hover { background: var(--accent-soft); color: var(--t-p); }
#send-btn {
  width: 28px; height: 28px; border-radius: 50%;
  background: linear-gradient(180deg, #3b82f6, #1d4ed8); color: var(--w);
  border: 1px solid rgba(255,255,255,0.12); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 5px 18px rgba(37,99,235,0.24);
  transition: background 0.16s, transform 0.14s, box-shadow 0.16s;
}
#send-btn:hover { transform: scale(1.06) translateY(-1px); box-shadow: 0 8px 26px rgba(37,99,235,0.34); }
#send-btn:disabled { background: var(--bg-4); color: var(--t-m); box-shadow: none; cursor: not-allowed; transform: none; }
#send-btn.working { background: var(--bg-4); color: var(--t-s); cursor: wait; }
#send-btn.working::before {
  content: ""; width: 11px; height: 11px; border-radius: 50%;
  border: 2px solid var(--t-m); border-top-color: var(--t-p);
  animation: stark-spin 0.8s linear infinite;
}
#send-btn.working svg { display: none; }
#chat-input:disabled { color: var(--t-m); cursor: wait; }

/* Agent questions / API key requests */
.agent-request-card {
  margin: 8px 0 10px;
  padding: 14px;
  border: 1px solid rgba(59,130,246,0.22);
  border-radius: var(--r-lg);
  background: linear-gradient(180deg, rgba(17,24,39,0.80), rgba(10,15,26,0.86));
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-soft), var(--shadow-glow);
  max-width: 560px;
}
.request-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.request-icon {
  width: 24px; height: 24px; border: 1px solid rgba(59,130,246,0.24); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--t-p); font-size: 9px; font-weight: 700; text-transform: uppercase;
  background: var(--accent-soft); flex-shrink: 0;
}
.request-title { font-size: 12px; font-weight: 700; color: var(--t-p); }
.request-status { font-size: 10px; color: var(--t-m); }
.request-message { font-size: 11px; color: var(--t); line-height: 1.6; margin-bottom: 8px; }
.request-label { display: block; font-size: 10px; color: var(--t-s); margin-bottom: 4px; }
.request-input, .request-textarea {
  width: 100%; background: rgba(7,11,20,0.78); border: 1px solid var(--bd); border-radius: var(--r);
  color: var(--t-p); font: inherit; font-size: 12px; padding: 8px 9px; outline: none;
}
.request-textarea { min-height: 74px; resize: vertical; }
.request-input:focus, .request-textarea:focus { border-color: rgba(59,130,246,0.36); box-shadow: 0 0 22px rgba(59,130,246,0.10); }
.request-help { margin-top: 6px; color: var(--t-m); font-size: 10px; line-height: 1.5; }
.request-choices { display: grid; gap: 6px; margin-top: 8px; }
.request-choice {
  width: 100%; text-align: left; padding: 8px 10px; border: 1px solid var(--bd);
  border-radius: var(--r); background: rgba(7,11,20,0.68); color: var(--t); cursor: pointer;
  font-size: 11px; transition: border-color 0.14s, background 0.14s, color 0.14s, box-shadow 0.14s, transform 0.14s;
}
.request-choice:hover { border-color: rgba(59,130,246,0.28); background: var(--accent-soft); color: var(--t-p); box-shadow: var(--shadow-glow); transform: translateY(-1px); }
.request-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 9px; }
.agent-request-card.submitted { opacity: 0.72; }
.agent-request-card.submitted .request-status { color: var(--t-s); }

@keyframes stark-spin { to { transform: rotate(360deg); } }

/* ── Empty state ────────────────────────────────────────── */
#empty-state { display: none; }
#empty-state.show {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 40px; text-align: center;
  flex: 1;
}
.empty-mark {
  width: 52px; height: 52px; border-radius: var(--r-lg);
  border: 1px solid rgba(59,130,246,0.24);
  background: var(--accent-soft);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px;
  box-shadow: 0 0 28px rgba(59,130,246,0.14);
  animation: glowPulse 5s ease-in-out infinite;
}
.empty-title { font-size: 20px; font-weight: 700; color: var(--t-p); letter-spacing: -0.02em; }
.empty-sub { font-size: 13px; color: var(--t-m); max-width: 340px; line-height: 1.6; }
.chips-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; width: 100%; max-width: 420px; }
.chip {
  background: var(--bg-2); border: 1px solid var(--bd);
  border-radius: var(--r-md); padding: 10px 13px;
  font-size: 11px; color: var(--t-s); cursor: pointer; text-align: left;
  transition: border-color 0.18s, color 0.18s, background 0.18s, box-shadow 0.18s, transform 0.18s;
}
.chip:hover { border-color: rgba(59,130,246,0.24); color: var(--t-p); background: rgba(255,255,255,0.05); box-shadow: 0 0 18px rgba(59,130,246,0.08); transform: translateY(-2px); }
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
  background: linear-gradient(180deg, rgba(12,18,30,0.96), rgba(8,12,22,0.99));
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
.rpanel-tab.active { color: var(--t-p); border-bottom-color: var(--accent); font-weight: 600; }
#rpanel-body { flex: 1; overflow-y: auto; }
.rpane { display: none; }
.rpane.active { display: block; }

/* Tasks */
.rp-sec { padding: 12px 14px; border-bottom: 1px solid var(--bd); }
.rp-sec-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
.rp-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--t-s); }
.rp-meta  { font-size: 10px; color: var(--t-m); }
.prog-track { height: 2px; background: var(--bg-4); border-radius: 1px; overflow: hidden; }
.prog-fill  { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); border-radius: 1px; transition: width 0.4s ease; box-shadow: 0 0 8px rgba(59,130,246,0.35); }

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
.task-chk.done { border-color: var(--accent); background: var(--accent); box-shadow: 0 0 8px rgba(59,130,246,0.30); }
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
  padding: 10px 12px;
  border: 1px solid var(--bd); border-radius: var(--r-md);
  font-size: 10px; color: var(--t-m); line-height: 1.70;
  background: rgba(17,24,39,0.60);
  backdrop-filter: blur(10px);
}
.note-box code { color: var(--t-s); font-family: "Menlo","Monaco",monospace; font-size: 9px; }
.note-box.compact { margin-top: 4px; }
.file-worked {
  display: flex; align-items: flex-start; gap: 7px;
  padding: 6px 14px; border-bottom: 1px solid var(--bd);
  font-size: 10px; color: var(--t);
}
.file-worked-path { flex: 1; min-width: 0; word-break: break-all; }
.file-worked-meta { color: var(--t-m); white-space: nowrap; font-size: 9px; }

/* ── Live section ───────────────────────────────────────── */
#live-section { display: none; }

/* ── Toast ──────────────────────────────────────────────── */
#toast {
  position: fixed; bottom: 20px; left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: rgba(17,24,39,0.92);
  border: 1px solid var(--bd-1);
  border-radius: var(--r-lg);
  backdrop-filter: blur(18px);
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
@keyframes blink      { 0%,100%{opacity:.4} 50%{opacity:1} }
@keyframes bounce     { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
@keyframes glowPulse  { 0%,100%{opacity:.45} 50%{opacity:.85} }
@keyframes fadeSlideUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }

.live-glow { animation: glowPulse 5s ease-in-out infinite; }
.fade-in   { animation: fadeSlideUp 0.28s ease forwards; }
`;
}
