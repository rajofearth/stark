/* App state, conversation management, demo, orchestrator polling (embedded as JS) */
export const appScript = `
/* ─── App state ─────────────────────────────────────────────────────────── */
const App = { conv: 'analytics-dashboard', ws: null, pollTimer: null };

/* ─── Demo conversation ─────────────────────────────────────────────────── */
function loadDemo() {
  const wrap = document.getElementById('messages-wrap');
  wrap.innerHTML = '';

  const msgs = [
    () => buildUserMsg(
      'Create a real-time analytics dashboard for our SaaS metrics.',
      new Date('2024-01-15T10:30:00')
    ),
    () => buildPlanning([
      { name: 'Data Analyst',       initials: 'DA', status: 'Analyzing requirements…' },
      { name: 'Backend Engineer',   initials: 'BE', status: 'Designing API endpoints…' },
      { name: 'Frontend Developer', initials: 'FD', status: 'Planning components…' },
      { name: 'UI/UX Designer',     initials: 'UX', status: 'Creating wireframes…' },
      { name: 'QA Engineer',        initials: 'QA', status: 'Defining test cases…' },
      { name: 'DevOps Engineer',    initials: 'DO', status: 'Preparing deployment…' },
    ]),
    () => buildAgentMsg('Frontend Developer', 'FD', '', new Date('2024-01-15T10:31:00'), {
      thinking:    'The user wants a real-time analytics dashboard. I should scaffold a React component that uses recharts for data visualization with a responsive grid layout.',
      thinkingSec: 4,
      code: \`import { LineChart, BarChart } from 'recharts'

export function Dashboard() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricCard title="Revenue" />
      <LineChart data={revenueData} />
      <BarChart data={usageData} />
    </div>
  )
}\`,
      codeFile: 'dashboard.tsx',
    }),
    () => buildAgentMsg('Backend Engineer', 'BE', '', new Date('2024-01-15T10:32:00'), {
      code: \`app.get('/api/metrics', async (req, res) => {
  const data = await getMetrics()
  res.json({ success: true, data })
})\`,
      codeFile: 'metrics.api.ts',
      badge:   'API endpoint created',
    }),
    () => buildSysMsg(
      'All agents completed their tasks',
      'Dashboard is ready for review',
      [{ label: 'Preview Dashboard ↗', action: "toast('Opening preview…')" }]
    ),
    () => buildNotif({
      icon:    '●',
      title:   'API Key Manager',
      time:    new Date('2024-01-15T10:34:00'),
      message: 'API key access required for deployment',
      sub:     'Agent: DevOps Engineer',
      actions: [
        { label: 'Provide Key', filled: true, action: "toast('Opening key vault…')" },
        { label: 'Skip',                      action: "toast('Skipped')" },
      ],
    }),
  ];

  let delay = 0;
  msgs.forEach((build, i) => {
    setTimeout(() => {
      inject(wrap, build());
      scrollBottom(i > 0);
    }, delay);
    delay += i === 0 ? 60 : 180;
  });

  // Persist demo to IndexedDB after render
  setTimeout(async () => {
    try {
      await dbClearMsgs('analytics-dashboard');
      const nodes = wrap.querySelectorAll(':scope > *');
      let idx = 0;
      for (const node of nodes)
        await dbAddMsg({ convId: 'analytics-dashboard', type: 'html', html: node.outerHTML, ts: Date.now() + idx++ });
    } catch(e) {}
  }, delay + 400);
}

/* ─── Conversation management ───────────────────────────────────────────── */
async function loadConv(id) {
  const wrap = document.getElementById('messages-wrap');
  wrap.innerHTML = '';

  let msgs = [];
  try { msgs = await dbGetMsgs(id); } catch(e) {}

  if (msgs.length > 0) {
    msgs.forEach(m => inject(wrap, m.html || buildUserMsg(m.text || '')));
    scrollBottom(false);
    return;
  }
  if (id === 'analytics-dashboard') loadDemo();
}

function selectConv(id) {
  if (App.conv === id) return;
  App.conv = id;

  document.querySelectorAll('.conv-item').forEach(el =>
    el.classList.toggle('active', el.dataset.conv === id));

  const meta = {
    'analytics-dashboard': { title: 'Analytics Dashboard', agents: '6 agents', time: '2m ago' },
    'user-onboarding':     { title: 'User Onboarding Flow', agents: '3 agents', time: '1h ago' },
    'bug-triage':          { title: 'Bug Triage Assistant',  agents: '2 agents', time: '3h ago' },
    'report-gen':          { title: 'Report Generation',     agents: '1 agent',  time: 'Yesterday' },
    'data-sync':           { title: 'Data Sync Pipeline',    agents: '4 agents', time: '2d ago' },
  };
  const m = meta[id] || { title: id, agents: '—', time: '—' };
  document.getElementById('chat-title-text').textContent = m.title;
  document.getElementById('meta-agents').textContent = m.agents;
  document.getElementById('meta-time').textContent   = m.time;

  loadConv(id);
  connectWS(id);
}

function newConv() {
  const id  = 'conv-' + Date.now();
  const el  = document.createElement('div');
  el.className  = 'conv-item';
  el.dataset.conv = id;
  el.innerHTML  = \`
    <div class="conv-icon">◎</div>
    <div class="conv-info">
      <div class="conv-title">New Conversation</div>
      <div class="conv-time">just now</div>
    </div>\`;
  el.addEventListener('click', () => selectConv(id));
  const list = document.getElementById('conv-list');
  list.insertBefore(el, list.firstChild);
  dbPutConv({ id, title: 'New Conversation', createdAt: Date.now() }).catch(()=>{});
  selectConv(id);
}

/* ─── Send message ──────────────────────────────────────────────────────── */
async function sendMsg(text) {
  if (!text.trim()) return;
  const wrap = document.getElementById('messages-wrap');
  inject(wrap, buildUserMsg(text));
  dbAddMsg({ convId: App.conv, type: 'user', text, ts: Date.now() }).catch(()=>{});
  scrollBottom(true);

  // Update conv time
  const timeEl = document.querySelector('[data-conv="' + App.conv + '"] .conv-time');
  if (timeEl) timeEl.textContent = 'just now';

  // Try WS first, fall back to HTTP
  const sent = wsSend({ type: 'user_message', convId: App.conv, text });
  if (!sent) {
    showTyping('S.T.A.R.K', 'S');
    try {
      const res = await fetch(HTTP_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ convId: App.conv, text }),
      });
      if (!res.ok) throw new Error('not_ready');
    } catch {
      hideTyping();
      inject(wrap, buildSysMsg(
        'Pipeline not connected',
        'Implement WS /api/webchat/stream to enable live agent responses.',
        [], true
      ));
      scrollBottom(true);
    }
  } else {
    showTyping('S.T.A.R.K', 'S');
  }
}

/* ─── Orchestrator polling ──────────────────────────────────────────────── */
function fmtN(n){ return String(n||0).replace(/\\B(?=(\\d{3})+(?!\\d))/g,','); }
function fmtSec(s){ s=Math.max(0,s||0); return Math.floor(s/60)+'m '+s%60+'s'; }

function applySnapshot(snap) {
  const counts  = snap.counts        || {};
  const totals  = snap.codex_totals  || {};
  const health  = snap.health        || {};
  const tracker = snap.tracker       || {};
  const running = snap.running       || [];

  // Sidebar badges
  const inboxN = (counts.running||0) + (counts.retrying||0);
  document.getElementById('badge-inbox').textContent  = inboxN;
  const agBadge = document.getElementById('badge-agents');
  agBadge.textContent = counts.running || 0;
  agBadge.className   = 'nav-badge' + (counts.running > 0 ? ' live' : '');

  // Details pane
  document.getElementById('det-created').textContent  = snap.generated_at ? new Date(snap.generated_at).toLocaleString() : '—';
  document.getElementById('det-workspace').textContent = tracker.project_slug || '—';
  document.getElementById('det-tracker').textContent   = tracker.kind || 'memory';
  document.getElementById('det-status').textContent    = health.polling || '—';
  document.getElementById('det-agents').textContent    = (counts.running||0) + ' / ' + ((counts.running||0)+(health.available_slots||0));
  document.getElementById('det-tokens').textContent    = fmtN(totals.total_tokens);
  document.getElementById('det-runtime').textContent   = fmtSec(totals.seconds_running);

  // Live orchestrator section in Agents pane
  const liveSec  = document.getElementById('live-section');
  const liveList = document.getElementById('live-agent-list');
  const liveCnt  = document.getElementById('live-count');
  if (running.length > 0) {
    liveSec.style.display = '';
    liveCnt.textContent   = running.length;
    liveList.innerHTML    = running.map(r => \`
      <div class="ag-item">
        <div class="ag-av">\${String(r.issue_identifier||'AG').slice(0,2).toUpperCase()}</div>
        <div class="ag-name">\${r.issue_identifier||'Agent'}</div>
        <div class="ag-dot"></div>
      </div>\`).join('');
  } else {
    liveSec.style.display = 'none';
  }
}

async function pollOrchestrator() {
  try {
    const res = await fetch('/api/v1/state');
    if (res.ok) applySnapshot(await res.json());
  } catch(e){}
}

/* ─── Event binding ─────────────────────────────────────────────────────── */
function bindEvents() {
  // Right panel tabs
  document.querySelectorAll('.rpanel-tab').forEach(el =>
    el.addEventListener('click', () => switchTab(el.dataset.tab)));

  // Nav items
  document.querySelectorAll('.nav-item').forEach(el =>
    el.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      if (el.dataset.nav === 'agents') switchTab('agents');
    }));

  // Conversation list
  document.querySelectorAll('.conv-item').forEach(el =>
    el.addEventListener('click', () => selectConv(el.dataset.conv)));

  // New conversation
  document.getElementById('new-conv-btn').addEventListener('click', newConv);

  // Share button
  document.getElementById('share-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).catch(()=>{});
    toast('Link copied');
  });

  // Input
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });

  sendBtn.addEventListener('click', doSend);

  // Suggestion chips
  document.querySelectorAll('.chip').forEach(el =>
    el.addEventListener('click', () => {
      input.value = el.dataset.suggest || '';
      input.dispatchEvent(new Event('input'));
      input.focus();
    }));
}

function doSend() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;
  sendMsg(text);
}

/* ─── Init ──────────────────────────────────────────────────────────────── */
async function init() {
  bindEvents();
  applySnapshot(window.__STARK_STATE__ || {});
  await loadConv(App.conv);
  connectWS(App.conv);
  pollOrchestrator();
  App.pollTimer = setInterval(pollOrchestrator, 5000);
  document.getElementById('det-created').textContent = new Date().toLocaleString();
}

document.addEventListener('DOMContentLoaded', init);
`;
