/* App state, conversation management, orchestrator polling (embedded as JS) */
export const appScript = `
/* ─── App state ─────────────────────────────────────────────────────────── */
const App = { conv: null, ws: null, pollTimer: null, convs: new Map(), pendingAssistant: null, busy: false, statsByConv: new Map(), filesByConv: new Map(), pendingRequests: new Map(), systemStats: {} };

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
  if (!list) return;
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

async function upsertConversation(raw, select, opts) {
  opts = opts || {};
  const incomingThreadId = raw && (raw.threadId || raw.codexThreadId || null);
  const selected = select && App.conv ? App.convs.get(App.conv) : null;
  const existingByThread = incomingThreadId ? findConversationByThread(incomingThreadId) : null;
  let existing = existingByThread;
  if (!existing && selected && incomingThreadId && (!selected.threadId || selected.threadId === incomingThreadId || selected.codexThreadId === incomingThreadId)) {
    existing = selected;
  }
  if (existing && incomingThreadId) {
    const title = existing.title && existing.title !== 'New Conversation' ? existing.title : (raw.title || existing.title);
    raw = Object.assign({}, raw, {
      id: existing.id,
      title,
      aliases: mergeAliases(existing.aliases, raw.aliases),
      createdAt: opts.preserveExistingTime ? existing.createdAt : (existing.createdAt || raw.createdAt),
      updatedAt: opts.preserveExistingTime ? existing.updatedAt : (raw.updatedAt || existing.updatedAt),
    });
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
      conv.aliases = mergeAliases(conv.aliases, [c.id, c.threadId, c.codexThreadId].concat(c.aliases || []));
      App.convs.delete(c.id);
      dbDeleteConv(c.id).catch(()=>{});
      if (App.conv === c.id) App.conv = conv.id;
    }
  }
}

async function mergeServerConvs(convs) {
  for (const c of convs || []) await upsertConversation(c, false, { preserveExistingTime: true });
  if (!App.conv && App.convs.size > 0) selectConv(Array.from(App.convs.values())[0].id);
}

function mergeAliases(a, b) {
  return Array.from(new Set([].concat(a || [], b || []).filter(Boolean)));
}

function updateHeader(conv) {
  document.getElementById('chat-title-text').textContent = conv ? conv.title : 'New Conversation';
  document.getElementById('meta-agents').textContent = App.busy ? 'Direct Stark · working' : 'Direct Stark';
  document.getElementById('meta-time').textContent = conv ? timeAgo(conv.updatedAt) : '—';
  updateChatDetails(conv);
}

function setComposerBusy(busy) {
  App.busy = !!busy;
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  if (input) {
    input.disabled = App.busy;
    input.placeholder = App.busy ? 'Stark is working…' : 'Ask anything or @mention an agent…';
  }
  if (sendBtn) {
    sendBtn.classList.toggle('working', App.busy);
    sendBtn.disabled = !App.busy && !(input && input.value.trim());
    sendBtn.title = App.busy ? 'Stop Stark' : 'Send (Enter)';
    sendBtn.setAttribute('aria-label', App.busy ? 'Stop Stark' : 'Send message');
  }
  updateHeader(currentConv());
}

function statsKeyForThread(threadId) {
  const conv = threadId ? findConversationByThread(threadId) : null;
  return (conv && conv.id) || App.conv || threadId || 'draft';
}

function applyStatsUpdate(threadId, stats) {
  const key = statsKeyForThread(threadId);
  const prev = App.statsByConv.get(key) || {};
  const normalized = normalizeStatsPayload(stats || {});
  App.statsByConv.set(key, Object.assign({}, prev, normalized, { threadId: threadId || normalized.threadId || prev.threadId, updatedAt: nowMs() }));
  if (key === App.conv || !App.conv) updateChatDetails(currentConv());
}

function normalizeStatsPayload(stats) {
  const raw = stats && typeof stats === 'object' ? stats : {};
  const usage = raw.usage || raw.tokenUsage || raw.token_usage || raw.total_token_usage || raw.tokens || {};
  const context = raw.context || raw.contextUsage || raw.context_usage || {};
  const next = Object.assign({}, raw);
  const totalTokens = firstFinite(raw.totalTokens, raw.total_tokens, raw.totalTokenCount, raw.total_token_count, usage.totalTokens, usage.total_tokens, usage.tokens, usage.total);
  const inputTokens = firstFinite(raw.inputTokens, raw.input_tokens, raw.promptTokens, raw.prompt_tokens, usage.inputTokens, usage.input_tokens, usage.promptTokens, usage.prompt_tokens);
  const outputTokens = firstFinite(raw.outputTokens, raw.output_tokens, raw.completionTokens, raw.completion_tokens, usage.outputTokens, usage.output_tokens, usage.completionTokens, usage.completion_tokens);
  const cachedTokens = firstFinite(raw.cachedTokens, raw.cached_tokens, raw.cachedInputTokens, raw.cached_input_tokens, usage.cachedTokens, usage.cached_tokens, usage.cachedInputTokens, usage.cached_input_tokens, usage.input_tokens_details && usage.input_tokens_details.cached_tokens);
  const contextWindow = firstFinite(raw.contextWindow, raw.context_window, raw.maxContextTokens, raw.max_context_tokens, raw.contextWindowTokens, context.window, context.contextWindow, context.maxTokens, usage.contextWindow, usage.context_window);
  const contextUsedTokens = firstFinite(raw.contextUsedTokens, raw.context_used_tokens, raw.usedContextTokens, raw.used_context_tokens, context.usedTokens, context.used_tokens, context.used, usage.contextUsedTokens, usage.context_used_tokens);
  const contextRemainingTokens = firstFinite(raw.contextRemainingTokens, raw.context_remaining_tokens, context.remainingTokens, context.remaining_tokens, context.remaining);
  const costUsd = firstFinite(raw.costUsd, raw.cost_usd, raw.cost, raw.estimatedCostUsd, raw.estimated_cost_usd, usage.costUsd, usage.cost_usd, usage.cost);
  if (typeof totalTokens === 'number') next.totalTokens = totalTokens;
  else if (typeof inputTokens === 'number' || typeof outputTokens === 'number') next.totalTokens = (inputTokens || 0) + (outputTokens || 0);
  if (typeof inputTokens === 'number') next.inputTokens = inputTokens;
  if (typeof outputTokens === 'number') next.outputTokens = outputTokens;
  if (typeof cachedTokens === 'number') next.cachedTokens = cachedTokens;
  if (typeof contextWindow === 'number') next.contextWindow = contextWindow;
  if (typeof contextUsedTokens === 'number') next.contextUsedTokens = contextUsedTokens;
  if (typeof contextRemainingTokens === 'number') next.contextRemainingTokens = contextRemainingTokens;
  if (typeof costUsd === 'number') next.costUsd = costUsd;
  return next;
}

function firstFinite() {
  for (let i = 0; i < arguments.length; i += 1) {
    const v = arguments[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const cleaned = v.trim().replace(/^\$/, '');
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function applyFileUpdate(threadId, file) {
  if (!file || !file.path) return;
  const key = statsKeyForThread(threadId);
  const files = App.filesByConv.get(key) || [];
  const existing = files.find(f => f.path === file.path);
  const next = Object.assign({}, existing || {}, file, { updatedAt: nowMs() });
  if (existing) files.splice(files.indexOf(existing), 1, next);
  else files.unshift(next);
  App.filesByConv.set(key, files.slice(0, 50));
  if (key === App.conv || !App.conv) updateChatDetails(currentConv());
}

function updateChatDetails(conv) {
  const directStats = App.statsByConv.get(App.conv) || {};
  const threadStats = conv && conv.threadId ? (App.statsByConv.get(conv.threadId) || {}) : {};
  const stats = Object.assign({}, App.systemStats || {}, threadStats, directStats);
  setText('det-created', conv ? new Date(conv.createdAt || Date.now()).toLocaleString() : (App.systemStats.generatedAt ? new Date(App.systemStats.generatedAt).toLocaleString() : '—'));
  setText('det-thread', conv && conv.threadId ? shortId(conv.threadId) : '—');
  setText('det-turn', stats.turnId ? shortId(stats.turnId) : '—');
  setText('det-model', stats.model || 'Stark App Server');
  setText('det-status', App.busy ? 'working' : (stats.status || 'idle'));
  setText('det-tokens', typeof stats.totalTokens === 'number' ? fmtN(stats.totalTokens) : 'not reported');
  setText('det-io-tokens', (typeof stats.inputTokens === 'number' || typeof stats.outputTokens === 'number') ? fmtN(stats.inputTokens || 0) + ' / ' + fmtN(stats.outputTokens || 0) : 'not reported');
  setText('det-cached-tokens', typeof stats.cachedTokens === 'number' ? fmtN(stats.cachedTokens) : 'not reported');
  setText('det-context', formatContextStats(stats));
  setText('det-cost', typeof stats.costUsd === 'number' ? '$' + stats.costUsd.toFixed(4) : 'not reported');
  renderFilesWorked();
}

function formatContextStats(stats) {
  const hasUsed = typeof stats.contextUsedTokens === 'number';
  const hasWindow = typeof stats.contextWindow === 'number';
  const hasRemaining = typeof stats.contextRemainingTokens === 'number';
  if (hasUsed && hasWindow) return fmtN(stats.contextUsedTokens) + ' / ' + fmtN(stats.contextWindow);
  if (hasWindow) return fmtN(stats.contextWindow) + ' window';
  if (hasUsed) return fmtN(stats.contextUsedTokens) + ' used';
  if (hasRemaining) return fmtN(stats.contextRemainingTokens) + ' remaining';
  return 'not reported';
}

function renderInputRequest(pkt) {
  hideTyping();
  setComposerBusy(false);
  const wrap = document.getElementById('messages-wrap');
  const request = normalizeInputRequest(pkt);
  App.pendingRequests.set(request.id, request);
  document.getElementById('empty-state').style.display = 'none';
  inject(wrap, request.kind === 'api_key' ? buildApiKeyRequestCard(request) : buildQuestionRequestCard(request));
  scrollBottom(true);
}

function normalizeInputRequest(pkt) {
  pkt = pkt || {};
  const id = pkt.requestId || pkt.id || ('req-' + nowMs() + '-' + Math.random().toString(36).slice(2));
  const message = pkt.message || pkt.question || pkt.prompt || (pkt.kind === 'api_key' ? 'The agent needs an API key to continue.' : 'The agent needs more information to continue.');
  return {
    id,
    kind: pkt.kind || (pkt.event === 'api_key.required' ? 'api_key' : 'question'),
    provider: pkt.provider || inferProviderFromText(message),
    title: pkt.title || (pkt.kind === 'api_key' || pkt.event === 'api_key.required' ? 'API key required' : 'Question from Stark'),
    message,
    placeholder: pkt.placeholder || '',
    choices: Array.isArray(pkt.choices) ? pkt.choices.map(c => String(c)).filter(Boolean) : [],
    threadId: pkt.threadId || ''
  };
}

function inferProviderFromText(text) {
  text = String(text || '').toLowerCase();
  if (text.includes('linear')) return 'Linear';
  if (text.includes('openai')) return 'OpenAI';
  if (text.includes('anthropic')) return 'Anthropic';
  if (text.includes('github')) return 'GitHub';
  return 'Service';
}

function submitUserQuestionRequest(id) {
  const req = App.pendingRequests.get(id) || { message: 'Question' };
  const input = document.getElementById('req-answer-' + id);
  const answer = input ? input.value.trim() : '';
  if (!answer) { toast('Enter an answer first'); return; }
  markRequestSubmitted(id, 'Answer sent');
  sendMsg('Answer to your question: ' + answer);
}

function submitChoiceRequest(id, answer) {
  answer = String(answer || '').trim();
  if (!answer) { toast('Choose an option first'); return; }
  markRequestSubmitted(id, 'Selected: ' + answer);
  sendMsg('Selected answer: ' + answer);
}

function submitApiKeyRequest(id) {
  const req = App.pendingRequests.get(id) || { provider: 'Service' };
  const input = document.getElementById('req-key-' + id);
  const key = input ? input.value.trim() : '';
  if (!key) { toast('Paste the API key first'); return; }
  markRequestSubmitted(id, 'API key sent to Stark');
  sendMsg('API key provided for ' + (req.provider || 'the requested service') + ': ' + key);
}

function dismissRequestCard(id) {
  markRequestSubmitted(id, 'Dismissed');
  App.pendingRequests.delete(id);
}

function markRequestSubmitted(id, label) {
  const node = document.querySelector('[data-request-id="' + cssEscape(id) + '"]');
  if (!node) return;
  node.classList.add('submitted');
  node.querySelectorAll('input, textarea, button').forEach(el => el.disabled = true);
  const status = node.querySelector('.request-status');
  if (status) status.textContent = label;
}

function renderFilesWorked() {
  const list = document.getElementById('det-files');
  if (!list) return;
  const files = App.filesByConv.get(App.conv) || [];
  if (!files.length) {
    list.innerHTML = '<div class="note-box compact">No file activity yet.</div>';
    return;
  }
  list.innerHTML = files.slice(0, 12).map(f => {
    const p = String(f.path || '');
    const label = esc(p);
    const pathHtml = p.startsWith('/') ? '<a class="md-link" href="' + attr(fileUrl(p)) + '" target="_blank" rel="noreferrer">' + label + '</a>' : label;
    return '<div class="file-worked"><div class="file-worked-path">' + pathHtml + '</div><div class="file-worked-meta">' + esc(f.kind || 'file') + (f.status ? ' · ' + esc(f.status) : '') + '</div></div>';
  }).join('');
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function shortId(value) {
  value = String(value || '');
  return value.length > 18 ? value.slice(0, 10) + '…' + value.slice(-6) : value;
}

async function loadConv(id) {
  const wrap = document.getElementById('messages-wrap');
  wrap.innerHTML = '';
  resetPlanPanel();
  const conv = App.convs.get(id) || await dbGetConv(id).catch(()=>null);
  let msgs = [];
  try { msgs = await dbGetMsgsForConv(conv || { id }); } catch(e) {}
  if (!msgs.length && conv && conv.threadId) {
    try {
      msgs = await loadServerMessages(conv);
    } catch(e) {}
  }
  msgs.forEach(m => {
    if (m.html) {
      inject(wrap, m.html);
      if (m.text) updatePlanPanelFromText(m.text || '');
    }
    else if (m.type === 'user') inject(wrap, buildUserMsg(m.text || '', new Date(m.ts || Date.now())));
    else if (m.type === 'assistant') {
      inject(wrap, buildAgentMsg('Stark', 'S', m.text || '', new Date(m.ts || Date.now())));
      updatePlanPanelFromText(m.text || '');
    }
  });
  document.getElementById('empty-state').style.display = msgs.length ? 'none' : '';
  scrollBottom(false);
}

async function loadServerMessages(conv) {
  const res = await fetch('/api/webchat/conversations/' + encodeURIComponent(conv.threadId) + '/messages');
  if (!res.ok) return [];
  const data = await res.json();
  const messages = (data.messages || []).map(m => Object.assign({}, m, { convId: m.convId || conv.threadId }));
  for (const msg of messages) await dbPutMsg(msg).catch(()=>{});
  return messages;
}

async function dbGetMsgsForConv(conv) {
  const ids = Array.from(new Set([conv.id, conv.threadId, conv.codexThreadId].concat(conv.aliases || []).filter(Boolean)));
  const all = [];
  for (const id of ids) {
    const rows = await dbGetMsgs(id).catch(()=>[]);
    all.push(...rows);
  }
  const byId = new Map();
  all.forEach(m => byId.set(m.id, m));
  return Array.from(byId.values()).sort((a,b) => (a.ts||0) - (b.ts||0));
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
  App.pendingAssistant = { id, text: '', convId: App.conv, ts: nowMs() };
  inject(wrap, buildAgentMsg('Stark', 'S', '', new Date(App.pendingAssistant.ts)));
  const node = wrap.lastElementChild;
  if (node) node.dataset.pendingAssistant = id;
  persistPendingAssistant().catch(()=>{});
  scrollBottom(true);
}

async function persistPendingAssistant() {
  if (!App.pendingAssistant) return;
  const node = document.querySelector('[data-pending-assistant="' + App.pendingAssistant.id + '"]');
  if (!node) return;
  await dbPutMsg({
    id: App.pendingAssistant.id,
    convId: App.pendingAssistant.convId || App.conv,
    type: 'assistant',
    text: App.pendingAssistant.text || '',
    html: node.outerHTML,
    ts: App.pendingAssistant.ts || nowMs(),
  }).catch(()=>{});
}

function appendAssistantDelta(delta) {
  if (!App.pendingAssistant) startAssistantMessage();
  delta = String(delta || '');
  App.pendingAssistant.text += delta;
  const node = document.querySelector('[data-pending-assistant="' + App.pendingAssistant.id + '"]');
  if (!node) return;
  const body = node.querySelector('.msg-agent-body');
  let content = body.lastElementChild && body.lastElementChild.classList.contains('md-content') ? body.lastElementChild : null;
  if (!content) {
    content = document.createElement('div');
    content.className = 'md-content';
    content.dataset.raw = '';
    body.appendChild(content);
  }
  content.dataset.raw = (content.dataset.raw || '') + delta;
  content.innerHTML = renderMd(content.dataset.raw);
  updatePlanPanelFromText(App.pendingAssistant.text);
  persistPendingAssistant().catch(()=>{});
  scrollBottom(true);
}

function appendRuntimeEvent(pkt) {
  if (!App.pendingAssistant) startAssistantMessage();
  const node = document.querySelector('[data-pending-assistant="' + App.pendingAssistant.id + '"]');
  if (!node) return;
  const body = node.querySelector('.msg-agent-body');
  let events = body.lastElementChild && body.lastElementChild.classList.contains('runtime-events') ? body.lastElementChild : null;
  if (!events) {
    events = document.createElement('div');
    events.className = 'runtime-events';
    body.appendChild(events);
  }
  upsertRuntimeBlock(events, pkt);
  updateRuntimeCollapse(events);
  appendActivity(pkt);
  persistPendingAssistant().catch(()=>{});
  scrollBottom(true);
}

function upsertRuntimeBlock(events, pkt) {
  const html = buildRuntimeBlock(pkt);
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const next = tmp.firstElementChild;
  if (!next) return;
  const key = next.dataset.runtimeKey;
  const existing = key ? events.querySelector('.runtime-block[data-runtime-key="' + cssEscape(key) + '"]') : null;
  if (existing) existing.replaceWith(next);
  else events.appendChild(next);
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function updateRuntimeCollapse(events) {
  const blocks = Array.from(events.querySelectorAll('.runtime-block'));
  let toggle = events.querySelector('.runtime-toggle');
  if (blocks.length <= 4) {
    blocks.forEach(b => b.classList.remove('runtime-hidden'));
    if (toggle) toggle.remove();
    return;
  }
  const expanded = events.dataset.expanded === '1';
  blocks.forEach((b, i) => b.classList.toggle('runtime-hidden', !expanded && i >= 4));
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'runtime-toggle';
    toggle.addEventListener('click', () => {
      events.dataset.expanded = events.dataset.expanded === '1' ? '0' : '1';
      updateRuntimeCollapse(events);
      scrollBottom(true);
    });
    events.appendChild(toggle);
  }
  toggle.textContent = expanded ? 'show less' : 'show ' + (blocks.length - 4) + ' more';
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
    const msg = document.querySelector('[data-pending-assistant="' + App.pendingAssistant.id + '"]');
    const body = msg ? msg.querySelector('.msg-agent-body') : null;
    if (body) {
      body.querySelectorAll('.md-content').forEach(n => n.remove());
      const node = document.createElement('div');
      node.className = 'md-content';
      node.dataset.raw = content;
      node.innerHTML = renderMd(content);
      body.appendChild(node);
    }
  }
  const finalText = App.pendingAssistant.text || content || '';
  const id = App.pendingAssistant.id;
  const node = document.querySelector('[data-pending-assistant="' + id + '"]');
  if (node) delete node.dataset.pendingAssistant;
  if (finalText.trim()) updatePlanPanelFromText(finalText);
  if (node) {
    await dbPutMsg({ id, convId: App.pendingAssistant.convId || App.conv, type: 'assistant', text: finalText, html: node.outerHTML, ts: App.pendingAssistant.ts || nowMs() }).catch(()=>{});
  } else if (finalText.trim()) {
    await dbAddMsg({ convId: App.conv, type: 'assistant', text: finalText, ts: nowMs() }).catch(()=>{});
  }
  App.pendingAssistant = null;
  scrollBottom(true);
}

/* ─── Plan panel ────────────────────────────────────────────────────────── */
function resetPlanPanel() {
  const list = document.getElementById('plan-list');
  if (list) list.innerHTML = '<div class="note-box">When Stark proposes a plan, it will appear here and update while the response streams.</div>';
  const label = document.getElementById('progress-label');
  if (label) label.textContent = '0 / 0';
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = '0%';
  const src = document.getElementById('plan-source');
  if (src) src.textContent = 'WAITING';
}

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
  if (!text || App.busy) return;

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
  setComposerBusy(true);
  applyStatsUpdate(conv.threadId || '', { status: 'working' });
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
      setComposerBusy(false);
      applyStatsUpdate((data.conversation && data.conversation.threadId) || conv.threadId || '', { status: 'idle' });
    } catch(e) {
      hideTyping();
      setComposerBusy(false);
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
  App.systemStats = normalizeStatsPayload({
    totalTokens: totals.total_tokens,
    inputTokens: totals.input_tokens,
    outputTokens: totals.output_tokens,
    costUsd: totals.cost_usd,
    contextWindow: totals.context_window,
    contextUsedTokens: totals.context_used_tokens,
    generatedAt: snap.generated_at,
    status: health.polling || 'idle'
  });
  const running = snap.running       || [];

  const badgeInbox = document.getElementById('badge-inbox');
  if (badgeInbox) badgeInbox.textContent = (counts.running||0) + (counts.retrying||0);
  const agBadge = document.getElementById('badge-agents');
  if (agBadge) {
    agBadge.textContent = counts.running || 0;
    agBadge.className = 'nav-badge' + (counts.running > 0 ? ' live' : '');
  }

  setText('det-created', snap.generated_at ? new Date(snap.generated_at).toLocaleString() : '—');
  setText('det-workspace', tracker.project_slug || '—');
  setText('det-tracker', tracker.kind || 'memory');
  setText('det-status', health.polling || '—');
  setText('det-agents', (counts.running||0) + ' / ' + ((counts.running||0)+(health.available_slots||0)));
  setText('det-tokens', fmtN(totals.total_tokens));
  setText('det-runtime', fmtSec(totals.seconds_running));
  updateChatDetails(currentConv());

  const liveSec  = document.getElementById('live-section');
  const liveList = document.getElementById('live-agent-list');
  const liveCnt  = document.getElementById('live-count');
  if (liveSec && liveList && liveCnt) {
    if (running.length > 0) {
      liveSec.style.display = '';
      liveCnt.textContent   = running.length;
      liveList.innerHTML    = running.map(r => '<div class="ag-item"><div class="ag-av">' + String(r.issue_identifier||'AG').slice(0,2).toUpperCase() + '</div><div class="ag-name">' + esc(r.issue_identifier||'Agent') + '</div><div class="ag-dot"></div></div>').join('');
    } else {
      liveSec.style.display = 'none';
    }
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

/* ─── Billing view ─────────────────────────────────────────────────────── */
const Billing = { from: '', to: '', preset: '30d', page: 1, modelFilter: '', lastSummary: null };

function fmtYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function applyBillingPreset(preset) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(end);
  if (preset === '1d') { /* same day */ }
  else if (preset === '7d') start.setDate(start.getDate() - 6);
  else if (preset === '30d') start.setDate(start.getDate() - 29);
  else if (preset === 'mtd') start = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (preset === 'lastmonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    Billing.from = fmtYMD(start);
    Billing.to = fmtYMD(last);
    Billing.preset = preset;
    return;
  }
  Billing.from = fmtYMD(start);
  Billing.to = fmtYMD(end);
  Billing.preset = preset;
}

function showMainView(which) {
  const chat = document.getElementById('view-chat');
  const bill = document.getElementById('view-billing');
  if (!chat || !bill) return;
  if (which === 'billing') {
    chat.classList.add('view-hidden');
    chat.setAttribute('aria-hidden', 'true');
    bill.classList.remove('view-hidden');
    bill.setAttribute('aria-hidden', 'false');
  } else {
    bill.classList.add('view-hidden');
    bill.setAttribute('aria-hidden', 'true');
    chat.classList.remove('view-hidden');
    chat.setAttribute('aria-hidden', 'false');
  }
}

function billingQuery() {
  const q = '?from=' + encodeURIComponent(Billing.from) + '&to=' + encodeURIComponent(Billing.to);
  const m = Billing.modelFilter ? '&model=' + encodeURIComponent(Billing.modelFilter) : '';
  return q + m;
}

function populateBillingModelSelect(allModels) {
  const sel = document.getElementById('billing-group-model');
  if (!sel) return;
  const cur = Billing.modelFilter;
  const opts = ['<option value="">All models</option>'].concat(
    (allModels || []).map(function (id) {
      return '<option value="' + esc(id) + '"' + (id === cur ? ' selected' : '') + '>' + esc(id) + '</option>';
    }),
  );
  sel.innerHTML = opts.join('');
  sel.value = cur;
}

function drawBillingChart(summary) {
  const svg = document.getElementById('billing-chart');
  if (!svg || !summary || !summary.daily) return;
  const metricEl = document.getElementById('billing-metric');
  const metric = metricEl && metricEl.value === 'tokens' ? 'tokens' : 'spend';
  const daily = summary.daily;
  const W = 640;
  const H = 200;
  const pl = 20;
  const pr = 16;
  const pt = 12;
  const pb = 26;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const n = daily.length;
  const baseY = pt + ih;
  const baselineD = 'M ' + pl + ' ' + baseY + ' L ' + (pl + iw) + ' ' + baseY;

  function pathD(top, bot) {
    if (!top.length || top.length !== bot.length) return '';
    var d = 'M ' + top[0].x.toFixed(2) + ' ' + top[0].y.toFixed(2);
    for (var a = 1; a < top.length; a += 1) {
      d += ' L ' + top[a].x.toFixed(2) + ' ' + top[a].y.toFixed(2);
    }
    for (var b = bot.length - 1; b >= 0; b -= 1) {
      d += ' L ' + bot[b].x.toFixed(2) + ' ' + bot[b].y.toFixed(2);
    }
    return d + ' Z';
  }

  if (n === 0) {
    svg.innerHTML =
      '<path fill="none" stroke="rgba(148,163,184,0.35)" stroke-width="1" d="' +
      baselineD +
      '" />' +
      '<text x="' +
      (pl + iw / 2) +
      '" y="' +
      (pt + ih / 2) +
      '" fill="#8b96ad" font-size="12" text-anchor="middle">No data in range</text>';
    return;
  }

  var max = 0;
  var cumTok = 0;
  if (metric === 'spend') {
    for (var i = 0; i < n; i += 1) {
      max = Math.max(max, daily[i].cumulativeTotalUsd || 0);
    }
  } else {
    for (var j = 0; j < n; j += 1) {
      cumTok += daily[j].tokens || 0;
      max = Math.max(max, cumTok);
    }
  }
  var denom = max > 0 ? max : 1;
  function ys(v) {
    return pt + ih - (v / denom) * ih;
  }

  var basePts = [];
  var lowPts = [];
  var highPts = [];
  cumTok = 0;

  if (n === 1) {
    var x0 = pl + iw * 0.06;
    var x1 = pl + iw * 0.94;
    basePts.push({ x: x0, y: ys(0) }, { x: x1, y: ys(0) });
    if (metric === 'spend') {
      var yr = ys(daily[0].cumulativeReportedUsd || 0);
      var yt = ys(daily[0].cumulativeTotalUsd || 0);
      lowPts.push({ x: x0, y: yr }, { x: x1, y: yr });
      highPts.push({ x: x0, y: yt }, { x: x1, y: yt });
    } else {
      var tok = daily[0].tokens || 0;
      var yt2 = ys(tok);
      lowPts.push({ x: x0, y: ys(0) }, { x: x1, y: ys(0) });
      highPts.push({ x: x0, y: yt2 }, { x: x1, y: yt2 });
    }
  } else {
    for (var k = 0; k < n; k += 1) {
      var x = pl + (k / (n - 1)) * iw;
      basePts.push({ x: x, y: ys(0) });
      if (metric === 'spend') {
        lowPts.push({ x: x, y: ys(daily[k].cumulativeReportedUsd || 0) });
        highPts.push({ x: x, y: ys(daily[k].cumulativeTotalUsd || 0) });
      } else {
        cumTok += daily[k].tokens || 0;
        lowPts.push({ x: x, y: ys(0) });
        highPts.push({ x: x, y: ys(cumTok) });
      }
    }
  }

  var fillRep = metric === 'spend' ? 'rgba(59,130,246,0.42)' : 'rgba(59,130,246,0.32)';
  var fillEst = metric === 'spend' ? 'rgba(96,165,250,0.35)' : 'rgba(96,165,250,0.22)';
  var strokeTop = 'rgba(147,197,253,0.85)';
  var d1 = metric === 'spend' ? pathD(lowPts, basePts) : '';
  var d2 = pathD(highPts, metric === 'spend' ? lowPts : basePts);

  var parts = [
    '<path fill="none" stroke="rgba(148,163,184,0.4)" stroke-width="1" d="' + baselineD + '" />',
  ];
  if (metric === 'spend' && d2) {
    parts.push(
      '<path fill="' +
        fillEst +
        '" stroke="' +
        strokeTop +
        '" stroke-width="0.75" d="' +
        d2 +
        '" />',
    );
  }
  if (metric === 'spend' && d1) {
    parts.push(
      '<path fill="' +
        fillRep +
        '" stroke="' +
        strokeTop +
        '" stroke-width="0.75" d="' +
        d1 +
        '" />',
    );
  }
  if (metric !== 'spend' && d2) {
    parts.push(
      '<path fill="' +
        fillRep +
        '" stroke="' +
        strokeTop +
        '" stroke-width="0.75" d="' +
        d2 +
        '" />',
    );
  }
  if (max <= 0 && n > 0) {
    parts.push(
      '<text x="' +
        (pl + iw / 2) +
        '" y="' +
        (pt + ih / 2) +
        '" fill="#8b96ad" font-size="12" text-anchor="middle">No usage in this range</text>',
    );
  }
  svg.innerHTML = parts.join('');
}

function fmtMoney(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return 'US$' + n.toFixed(2);
}

function fmtTokens(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

async function refreshBilling() {
  var label = document.getElementById('billing-range-label');
  if (label) label.textContent = Billing.from + ' – ' + Billing.to;
  try {
    var res = await fetch('/api/webchat/billing/summary' + billingQuery());
    if (!res.ok) throw new Error('summary');
    var summary = await res.json();
    Billing.lastSummary = summary;
    populateBillingModelSelect(summary.allModels || []);
    document.getElementById('bill-m-total').textContent = fmtMoney(summary.totalSpendUsd);
    var sub = document.getElementById('bill-m-total-sub');
    if (sub) {
      sub.textContent =
        'Reported ' +
        fmtMoney(summary.totalReportedUsd) +
        ' · Est. ' +
        fmtMoney(summary.totalEstimatedUsd);
    }
    document.getElementById('bill-m-tokens').textContent = fmtTokens(summary.totalTokens);
    document.getElementById('bill-m-events').textContent = String(summary.eventCount || 0);
    drawBillingChart(summary);
    var exp = document.getElementById('billing-export-btn');
    if (exp) exp.href = '/api/webchat/billing/export.csv' + billingQuery();
  } catch (e) {
    toast('Billing summary failed');
  }
  await refreshBillingEvents();
}

async function refreshBillingEvents() {
  var tbody = document.getElementById('billing-tbody');
  var info = document.getElementById('billing-pager-info');
  var btns = document.getElementById('billing-pager-btns');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="color:var(--t-m)">Loading…</td></tr>';
  try {
    var url =
      '/api/webchat/billing/events' +
      billingQuery() +
      '&page=' +
      encodeURIComponent(String(Billing.page)) +
      '&pageSize=20';
    var res = await fetch(url);
    if (!res.ok) throw new Error('events');
    var data = await res.json();
    var events = data.events || [];
    if (events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--t-m)">No usage in this range yet.</td></tr>';
    } else {
      tbody.innerHTML = events
        .map(function (ev) {
          var dt = new Date(ev.recordedAt);
          var dateStr = isNaN(dt.getTime()) ? esc(ev.recordedAt) : dt.toLocaleString();
          var typ = ev.type === 'reported' ? 'reported' : ev.type === 'estimated' ? 'estimated' : '—';
          var pillClass = typ === 'reported' ? 'billing-pill reported' : typ === 'estimated' ? 'billing-pill estimated' : 'billing-pill';
          var cost =
            ev.costUsdReported != null
              ? fmtMoney(ev.costUsdReported)
              : ev.costUsdEstimated != null
                ? fmtMoney(ev.costUsdEstimated)
                : '—';
          return (
            '<tr><td>' +
            esc(dateStr) +
            '</td><td><span class="' +
            pillClass +
            '">' +
            esc(typ) +
            '</span></td><td>' +
            esc(ev.model || '') +
            '</td><td>' +
            esc(ev.description || '') +
            '</td><td class="num">' +
            esc(String(ev.tokens != null ? ev.tokens : '')) +
            '</td><td class="num">' +
            esc(cost) +
            '</td></tr>'
          );
        })
        .join('');
    }
    var total = data.total || 0;
    var page = data.page || 1;
    var ps = data.pageSize || 20;
    var last = Math.max(1, Math.ceil(total / ps));
    if (info) {
      info.textContent =
        total === 0
          ? 'No records'
          : 'Showing ' + (total === 0 ? 0 : (page - 1) * ps + 1) + '–' + Math.min(page * ps, total) + ' of ' + total;
    }
    if (btns) {
      var pages = [];
      var win = 5;
      var start = Math.max(1, page - 2);
      var end = Math.min(last, start + win - 1);
      if (end - start < win - 1) start = Math.max(1, end - win + 1);
      for (var p = start; p <= end; p++) pages.push(p);
      btns.innerHTML = pages
        .map(function (p) {
          return (
            '<button type="button" class="billing-page-btn' +
            (p === page ? ' active' : '') +
            '" data-page="' +
            p +
            '">' +
            p +
            '</button>'
          );
        })
        .join('');
      btns.querySelectorAll('[data-page]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          Billing.page = Number(btn.getAttribute('data-page')) || 1;
          refreshBillingEvents();
        });
      });
    }
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--t-m)">Failed to load events</td></tr>';
  }
}

function bindBillingUi() {
  document.querySelectorAll('#billing-chips .billing-chip').forEach(function (el) {
    el.addEventListener('click', function () {
      document.querySelectorAll('#billing-chips .billing-chip').forEach(function (c) {
        c.classList.remove('active');
      });
      el.classList.add('active');
      Billing.preset = el.getAttribute('data-preset') || '30d';
      applyBillingPreset(Billing.preset);
      Billing.page = 1;
      refreshBilling();
    });
  });
  var selModel = document.getElementById('billing-group-model');
  if (selModel)
    selModel.addEventListener('change', function () {
      Billing.modelFilter = selModel.value || '';
      Billing.page = 1;
      refreshBilling();
    });
  var selMetric = document.getElementById('billing-metric');
  if (selMetric)
    selMetric.addEventListener('change', function () {
      drawBillingChart(Billing.lastSummary);
    });
  var refBtn = document.getElementById('billing-refresh-btn');
  if (refBtn)
    refBtn.addEventListener('click', function () {
      refreshBilling();
    });
}

/* ─── Event binding ─────────────────────────────────────────────────────── */
function bindEvents() {
  document.querySelectorAll('.rpanel-tab').forEach(el => el.addEventListener('click', () => switchTab(el.dataset.tab)));
  document.querySelectorAll('.nav-item').forEach(el => el.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    const nav = el.dataset.nav;
    if (nav === 'billing') {
      showMainView('billing');
      applyBillingPreset(Billing.preset);
      Billing.page = 1;
      void refreshBilling();
      return;
    }
    showMainView('chat');
    if (nav === 'agents') switchTab('agents');
  }));
  document.getElementById('new-conv-btn').addEventListener('click', newConv);
  document.getElementById('share-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).catch(()=>{});
    toast('Link copied');
  });

  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  input.addEventListener('input', () => {
    sendBtn.disabled = App.busy || !input.value.trim();
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

function stopCurrentRun() {
  if (!App.busy) return;
  const conv = currentConv();
  const threadId = conv && (conv.threadId || conv.codexThreadId || '');
  if (threadId) wsSend({ type: 'message.stop', threadId });
  hideTyping();
  setComposerBusy(false);
  applyStatsUpdate(threadId || '', { status: 'stopping' });
  toast('Stopping Stark…');
}

function doSend() {
  if (App.busy) { stopCurrentRun(); return; }
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
  bindBillingUi();
  applyBillingPreset('30d');
  applySnapshot(window.__STARK_STATE__ || {});
  connectWS();
  await loadInitialConversations();
  pollOrchestrator();
  App.pollTimer = setInterval(pollOrchestrator, 5000);
}

document.addEventListener('DOMContentLoaded', init);
`;
