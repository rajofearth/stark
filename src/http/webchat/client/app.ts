/* App state, conversation management, orchestrator polling (embedded as JS) */
export const appScript = `
/* ─── App state ─────────────────────────────────────────────────────────── */
const App = { conv: null, ws: null, pollTimer: null, convs: new Map(), pendingAssistant: null };

function nowMs(){ return Date.now(); }
function timeAgo(value) {
  const ts = typeof value === 'number' ? value : Date.parse(value || '');
  if (!ts) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return 'just now';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
  return Math.floor(secs / 86400) + 'd ago';
}

function convTitleFromText(text) {
  const t = String(text || '').replace(new RegExp('\\\\s+', 'g'), ' ').trim();
  return t ? (t.length > 42 ? t.slice(0, 42) + '…' : t) : 'New Conversation';
}

function normalizeConv(raw) {
  const threadId = raw.threadId || raw.codexThreadId || null;
  const id = raw.id || threadId || ('local-' + nowMs());
  return Object.assign({}, raw, {
    id,
    threadId,
    codexThreadId: threadId,
    title: raw.title || 'New Conversation',
    createdAt: raw.createdAt || nowMs(),
    updatedAt: raw.updatedAt || nowMs(),
  });
}

function renderConversations() {
  const list = document.getElementById('conv-list');
  const convs = Array.from(App.convs.values()).sort((a,b) => {
    const at = typeof a.updatedAt === 'number' ? a.updatedAt : Date.parse(a.updatedAt || '') || 0;
    const bt = typeof b.updatedAt === 'number' ? b.updatedAt : Date.parse(b.updatedAt || '') || 0;
    return bt - at;
  });
  list.innerHTML = convs.map(c => '<div class="conv-item' + (c.id === App.conv ? ' active' : '') + '" data-conv="' + esc(c.id) + '">' +
    '<div class="conv-icon">◎</div>' +
    '<div class="conv-info"><div class="conv-title">' + esc(c.title) + '</div><div class="conv-time">' + timeAgo(c.updatedAt) + '</div></div>' +
    (c.active ? '<div class="conv-live"></div>' : '') +
  '</div>').join('');
  list.querySelectorAll('.conv-item').forEach(el => el.addEventListener('click', () => selectConv(el.dataset.conv)));
}

async function upsertConversation(raw, select) {
  const incomingThreadId = raw && (raw.threadId || raw.codexThreadId || null);
  const selected = select && App.conv ? App.convs.get(App.conv) : null;
  const existingByThread = incomingThreadId ? findConversationByThread(incomingThreadId) : null;
  let existing = existingByThread;
  if (!existing && selected && incomingThreadId && (!selected.threadId || selected.threadId === incomingThreadId || selected.codexThreadId === incomingThreadId)) {
    existing = selected;
  }
  if (existing && incomingThreadId) {
    const title = existing.title && existing.title !== 'New Conversation' ? existing.title : (raw.title || existing.title);
    raw = Object.assign({}, raw, { id: existing.id, title });
  }
  const conv = normalizeConv(raw);
  removeDuplicateThreadConversations(conv);
  App.convs.set(conv.id, conv);
  await dbPutConv(conv).catch(()=>{});
  if (select) App.conv = conv.id;
  renderConversations();
  if (select) updateHeader(conv);
  return conv;
}

function findConversationByThread(threadId) {
  if (!threadId) return null;
  const matches = Array.from(App.convs.values()).filter(c => c.threadId === threadId || c.codexThreadId === threadId);
  if (!matches.length) return null;
  const selected = App.conv ? matches.find(c => c.id === App.conv) : null;
  if (selected) return selected;
  return matches.find(c => c.id !== threadId) || matches[0];
}

function removeDuplicateThreadConversations(conv) {
  const threadId = conv.threadId || conv.codexThreadId;
  if (!threadId) return;
  for (const c of Array.from(App.convs.values())) {
    if (c.id === conv.id) continue;
    if (c.threadId === threadId || c.codexThreadId === threadId) {
      App.convs.delete(c.id);
      dbDeleteConv(c.id).catch(()=>{});
      if (App.conv === c.id) App.conv = conv.id;
    }
  }
}

async function mergeServerConvs(convs) {
  for (const c of convs || []) await upsertConversation(c, false);
  if (!App.conv && App.convs.size > 0) selectConv(Array.from(App.convs.values())[0].id);
}

function updateHeader(conv) {
  document.getElementById('chat-title-text').textContent = conv ? conv.title : 'New Conversation';
  document.getElementById('meta-agents').textContent = 'Direct Stark';
  document.getElementById('meta-time').textContent = conv ? timeAgo(conv.updatedAt) : '—';
}

async function loadConv(id) {
  const wrap = document.getElementById('messages-wrap');
  wrap.innerHTML = '';
  let msgs = [];
  try { msgs = await dbGetMsgs(id); } catch(e) {}
  msgs.forEach(m => {
    if (m.type === 'user') inject(wrap, buildUserMsg(m.text || '', new Date(m.ts || Date.now())));
    else if (m.type === 'assistant') {
      inject(wrap, buildAgentMsg('Stark', 'S', m.text || '', new Date(m.ts || Date.now())));
      updatePlanPanelFromText(m.text || '');
    }
    else if (m.html) inject(wrap, m.html);
  });
  document.getElementById('empty-state').style.display = msgs.length ? 'none' : '';
  scrollBottom(false);
}

async function selectConv(id) {
  if (!id) return;
  App.conv = id;
  const conv = App.convs.get(id) || await dbGetConv(id).catch(()=>null);
  if (conv) {
    App.convs.set(id, conv);
    updateHeader(conv);
  }
  renderConversations();
  await loadConv(id);
  if (conv && conv.threadId) wsSend({ type: 'conversation.resume', threadId: conv.threadId, title: conv.title });
}

async function newConv() {
  const conv = await upsertConversation({
    id: 'draft-' + Date.now(),
    title: 'New Conversation',
    createdAt: nowMs(),
    updatedAt: nowMs(),
    active: false,
  }, true);
  await loadConv(conv.id);
  toast('New conversation');
}

function currentConv() {
  return App.conv ? App.convs.get(App.conv) : null;
}

/* ─── Assistant streaming ───────────────────────────────────────────────── */
function startAssistantMessage() {
  hideTyping();
  const wrap = document.getElementById('messages-wrap');
  const id = 'assistant-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  App.pendingAssistant = { id, text: '' };
  inject(wrap, buildAgentMsg('Stark', 'S', '', new Date()));
  const node = wrap.lastElementChild;
  if (node) node.dataset.pendingAssistant = id;
  scrollBottom(true);
}

function appendAssistantDelta(delta) {
  if (!App.pendingAssistant) startAssistantMessage();
  App.pendingAssistant.text += String(delta || '');
  const node = document.querySelector('[data-pending-assistant="' + App.pendingAssistant.id + '"]');
  if (!node) return;
  const body = node.querySelector('.msg-agent-body');
  let content = body.querySelector('.md-content');
  if (!content) {
    content = document.createElement('div');
    content.className = 'md-content';
    body.appendChild(content);
  }
  content.innerHTML = renderMd(App.pendingAssistant.text);
  updatePlanPanelFromText(App.pendingAssistant.text);
  scrollBottom(true);
}

function appendRuntimeEvent(pkt) {
  if (!App.pendingAssistant) startAssistantMessage();
  const node = document.querySelector('[data-pending-assistant="' + App.pendingAssistant.id + '"]');
  if (!node) return;
  const body = node.querySelector('.msg-agent-body');
  let events = body.querySelector('.runtime-events');
  if (!events) {
    events = document.createElement('div');
    events.className = 'runtime-events';
    body.appendChild(events);
  }
  inject(events, buildRuntimeBlock(pkt));
  appendActivity(pkt);
  scrollBottom(true);
}

function appendActivity(pkt) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  const item = document.createElement('div');
  item.className = 'act-item';
  item.innerHTML = '<div class="act-av">S</div><div style="flex:1;"><div class="act-name">Stark</div><div class="act-desc">' + esc(pkt.title || pkt.event || 'Runtime event') + '</div></div><div class="act-time">now</div>';
  feed.prepend(item);
}

async function finishAssistantMessage(content) {
  hideTyping();
  if (!App.pendingAssistant) startAssistantMessage();
  if (content && content !== App.pendingAssistant.text) {
    App.pendingAssistant.text = content;
    const node = document.querySelector('[data-pending-assistant="' + App.pendingAssistant.id + '"] .md-content');
    if (node) node.innerHTML = renderMd(content);
  }
  const finalText = App.pendingAssistant.text || content || '';
  const id = App.pendingAssistant.id;
  const node = document.querySelector('[data-pending-assistant="' + id + '"]');
  if (node) delete node.dataset.pendingAssistant;
  if (finalText.trim()) {
    updatePlanPanelFromText(finalText);
    await dbAddMsg({ convId: App.conv, type: 'assistant', text: finalText, ts: nowMs() }).catch(()=>{});
  }
  App.pendingAssistant = null;
  scrollBottom(true);
}

/* ─── Plan panel ────────────────────────────────────────────────────────── */
function updatePlanPanelFromPlan(plan) {
  if (!plan) return;
  const items = Array.isArray(plan) ? plan : (Array.isArray(plan.items) ? plan.items : []);
  const normalized = items.map((item, i) => {
    if (typeof item === 'string') return { title: item, done: false };
    return { title: item.title || item.step || item.task || ('Step ' + (i + 1)), done: !!(item.done || item.completed || item.status === 'completed') };
  }).filter(i => i.title);
  renderPlanPanel(normalized, 'STARK PLAN');
}

function updatePlanPanelFromText(text) {
  const items = extractPlanItems(text);
  if (items.length) renderPlanPanel(items, 'AUTO-GENERATED');
}

function extractPlanItems(text) {
  text = String(text || '');
  if (!new RegExp('plan|steps|todo|approach|implement|implementation', 'i').test(text)) return [];
  const lines = text.split('\\n');
  const items = [];
  for (const line of lines) {
    const trimmed = line.trim();
    let m = trimmed.match(new RegExp('^[-*]\\\\s+\\\\[(x| )\\\\]\\\\s+(.+)$', 'i'));
    if (m) { items.push({ title: cleanPlanText(m[2]), done: m[1].toLowerCase() === 'x' }); continue; }
    m = trimmed.match(new RegExp('^\\\\d+[.)]\\\\s+(.+)$'));
    if (m) { items.push({ title: cleanPlanText(m[1]), done: false }); continue; }
    m = trimmed.match(new RegExp('^[-*]\\\\s+(.+)$'));
    if (m && items.length < 12) items.push({ title: cleanPlanText(m[1]), done: false });
  }
  return items.filter(i => i.title && i.title.length > 2).slice(0, 12);
}

function cleanPlanText(text) {
  return String(text || '').replace(new RegExp('[*_#]', 'g'), '').replace(new RegExp('^\\\\s*\\\\[[ x]\\\\]\\\\s*', 'i'), '').trim();
}

function renderPlanPanel(items, source) {
  const list = document.getElementById('plan-list');
  if (!list || !items.length) return;
  const done = items.filter(i => i.done).length;
  const total = items.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  document.getElementById('progress-label').textContent = done + ' / ' + total;
  document.getElementById('progress-bar').style.width = pct + '%';
  const src = document.getElementById('plan-source');
  if (src) src.textContent = source || 'AUTO-GENERATED';
  list.innerHTML = '<div class="task-sec"><div class="task-sec-hdr"><span class="task-num">1</span><span class="task-title">Stark Plan</span><span class="task-cnt">' + done + '/' + total + '</span></div>' +
    items.map(i => '<div class="task-row"><div class="task-chk' + (i.done ? ' done' : '') + '"></div><div><div class="task-text">' + esc(i.title) + '</div></div></div>').join('') +
    '</div>';
}

/* ─── Send message ──────────────────────────────────────────────────────── */
async function sendMsg(text) {
  text = String(text || '').trim();
  if (!text) return;

  let conv = currentConv();
  if (!conv) conv = await upsertConversation({ id: 'draft-' + Date.now(), title: convTitleFromText(text), createdAt: nowMs(), updatedAt: nowMs() }, true);
  if (!conv.threadId && conv.title === 'New Conversation') conv.title = convTitleFromText(text);
  conv.updatedAt = nowMs();
  await upsertConversation(conv, true);

  const wrap = document.getElementById('messages-wrap');
  document.getElementById('empty-state').style.display = 'none';
  inject(wrap, buildUserMsg(text));
  dbAddMsg({ convId: App.conv, type: 'user', text, ts: nowMs() }).catch(()=>{});
  scrollBottom(true);

  showTyping('Stark', 'S');
  const payload = { type: 'message.send', convId: App.conv, threadId: conv.threadId || '', title: conv.title, text };
  const sent = wsSend(payload);
  if (!sent) {
    try {
      const res = await fetch(HTTP_PATH, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: conv.threadId || null, title: conv.title, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || 'request_failed');
      if (data.conversation) await upsertConversation(data.conversation, true);
      startAssistantMessage();
      await finishAssistantMessage(data.content || '');
    } catch(e) {
      hideTyping();
      inject(wrap, buildSysMsg('Stark is not connected', e.message || 'Unable to send the message.', [], true));
      scrollBottom(true);
    }
  }
}

/* ─── Orchestrator polling ──────────────────────────────────────────────── */
function fmtN(n){ return String(n||0).replace(new RegExp('\\\\B(?=(\\\\d{3})+(?!\\\\d))', 'g'), ','); }
function fmtSec(s){ s=Math.max(0,s||0); return Math.floor(s/60)+'m '+s%60+'s'; }

function applySnapshot(snap) {
  const counts  = snap.counts        || {};
  const totals  = snap.codex_totals  || {};
  const health  = snap.health        || {};
  const tracker = snap.tracker       || {};
  const running = snap.running       || [];

  document.getElementById('badge-inbox').textContent  = (counts.running||0) + (counts.retrying||0);
  const agBadge = document.getElementById('badge-agents');
  agBadge.textContent = counts.running || 0;
  agBadge.className   = 'nav-badge' + (counts.running > 0 ? ' live' : '');

  document.getElementById('det-created').textContent  = snap.generated_at ? new Date(snap.generated_at).toLocaleString() : '—';
  document.getElementById('det-workspace').textContent = tracker.project_slug || '—';
  document.getElementById('det-tracker').textContent   = tracker.kind || 'memory';
  document.getElementById('det-status').textContent    = health.polling || '—';
  document.getElementById('det-agents').textContent    = (counts.running||0) + ' / ' + ((counts.running||0)+(health.available_slots||0));
  document.getElementById('det-tokens').textContent    = fmtN(totals.total_tokens);
  document.getElementById('det-runtime').textContent   = fmtSec(totals.seconds_running);

  const liveSec  = document.getElementById('live-section');
  const liveList = document.getElementById('live-agent-list');
  const liveCnt  = document.getElementById('live-count');
  if (running.length > 0) {
    liveSec.style.display = '';
    liveCnt.textContent   = running.length;
    liveList.innerHTML    = running.map(r => '<div class="ag-item"><div class="ag-av">' + String(r.issue_identifier||'AG').slice(0,2).toUpperCase() + '</div><div class="ag-name">' + esc(r.issue_identifier||'Agent') + '</div><div class="ag-dot"></div></div>').join('');
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

async function loadInitialConversations() {
  let convs = [];
  try { convs = await dbGetConvs(); } catch(e) {}
  for (const c of convs) App.convs.set(c.id, c);
  renderConversations();
  try {
    const res = await fetch('/api/webchat/conversations');
    if (res.ok) await mergeServerConvs((await res.json()).conversations || []);
  } catch(e) {}
  if (App.convs.size > 0) await selectConv(Array.from(App.convs.values()).sort((a,b) => convUpdatedMs(b) - convUpdatedMs(a))[0].id);
  else await newConv();
}

function convUpdatedMs(conv) {
  const value = conv && conv.updatedAt;
  if (typeof value === 'number') return value;
  return Date.parse(value || '') || 0;
}

/* ─── Event binding ─────────────────────────────────────────────────────── */
function bindEvents() {
  document.querySelectorAll('.rpanel-tab').forEach(el => el.addEventListener('click', () => switchTab(el.dataset.tab)));
  document.querySelectorAll('.nav-item').forEach(el => el.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    if (el.dataset.nav === 'agents') switchTab('agents');
  }));
  document.getElementById('new-conv-btn').addEventListener('click', newConv);
  document.getElementById('share-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).catch(()=>{});
    toast('Link copied');
  });

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
  document.querySelectorAll('.chip').forEach(el => el.addEventListener('click', () => {
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
  connectWS();
  await loadInitialConversations();
  pollOrchestrator();
  App.pollTimer = setInterval(pollOrchestrator, 5000);
}

document.addEventListener('DOMContentLoaded', init);
`;
