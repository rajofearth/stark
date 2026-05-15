/* Client-side message builder functions (embedded as JS in the page) */
export const messagesScript = `
/* ─── Helpers ───────────────────────────────────────────────────────────── */
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function attr(s){ return esc(s).replace(/"/g,'&quot;'); }
function fmtTime(d){ d=d||new Date(); return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
function fileUrl(p){ return '/api/webchat/files?path=' + encodeURIComponent(String(p||'')); }
function fileNameFromPath(p){ p=String(p||''); return p.split(/[\\/]/).filter(Boolean).pop() || p; }
function trimLinkPunct(v){ const m=String(v||'').match(/^(.+?)([.,;:!?)]*)$/); return { href: m ? m[1] : v, trail: m ? m[2] : '' }; }
function buildAnchor(label, href, download) {
  const safeHref = String(href||'');
  const attrs = download ? ' download' : ' target="_blank" rel="noreferrer"';
  return \`<a class="md-link" href="\${attr(safeHref)}"\${attrs}>\${esc(label || safeHref)}</a>\`;
}
function buildFileAnchor(path) {
  return buildAnchor(fileNameFromPath(path) + ' ↗', fileUrl(path), false);
}

/* ─── Syntax highlighter ────────────────────────────────────────────────── */
function hlCode(raw) {
  if (!raw) return '';
  let s = esc(raw);
  // comments
  s = s.replace(new RegExp('(//[^\\\\n]*)', 'g'), '<span class="hl-cmt">$1</span>');
  // single-quoted strings
  s = s.replace(/'[^'\\n]*'/g, '<span class="hl-str">$&</span>');
  // double-quoted strings
  s = s.replace(/"[^"\\n]*"/g, '<span class="hl-str">$&</span>');
  // keywords
  const kw = /\\b(import|export|from|default|function|const|let|var|return|async|await|if|else|for|while|class|extends|new|this|typeof|instanceof|null|undefined|true|false|void|throw|try|catch|finally|type|interface|enum|as|of|in|break|continue|switch|case|static|readonly|private|public|protected|abstract|declare)\\b/g;
  s = s.replace(kw, '<span class="hl-kw">$1</span>');
  // JSX/HTML tags
  s = s.replace(/(&lt;\\/?)([A-Z][\\w.]*|[a-z][\\w-]*)/g, (m,p1,p2) => p1+'<span class="hl-tag">'+p2+'</span>');
  // numbers
  s = s.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="hl-num">$1</span>');
  return s;
}

/* ─── Markdown renderer ─────────────────────────────────────────────────── */
function renderMd(text) {
  if (!text) return '';
  const parsed = extractStarkRequestBlocks(text);
  let h = esc(parsed.text);
  // block code — replaced before inline
  h = h.replace(/\`\`\`[^\\n]*(\\n[\\s\\S]*?\\n)\`\`\`/g, (_,code) =>
    \`<pre style="background:var(--bg-2);border-radius:var(--r);padding:8px 10px;overflow-x:auto;font-family:Menlo,Monaco,Consolas,monospace;font-size:10px;color:var(--t);">\${code}</pre>\`);
  // inline code
  h = h.replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>');
  // markdown links + auto-links
  h = h.replace(/\\[([^\\]]+)\\]\\(((?:https?:\\/\\/|\\/)[^)\\s]+)\\)/g, (m,label,href) => {
    return href.startsWith('http') ? buildAnchor(label, href, false) : buildFileAnchor(href);
  });
  h = h.replace(/(^|[\\s(])((?:https?:\\/\\/)[^\\s<]+)/g, (m,prefix,url) => {
    const t = trimLinkPunct(url); return prefix + buildAnchor(t.href, t.href, false) + t.trail;
  });
  h = h.replace(/(^|[\\s(])((?:\\/Users|\\/Volumes|\\/private|\\/tmp)\\/[^\\s<)]*?\\.(?:docx|pdf|txt|md|csv|json|xlsx|png|jpe?g|gif|webp|zip|html?))/gi, (m,prefix,path) => {
    const t = trimLinkPunct(path); return prefix + buildFileAnchor(t.href) + t.trail;
  });
  // bold / italic
  h = h.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
  h = h.replace(/\\*(.+?)\\*/g,   '<em>$1</em>');
  // headers
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  // bullets
  h = h.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>[\\s\\S]*?<\\/li>)/g, '<ul>$1</ul>');
  // blockquotes
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // paragraphs
  h = h.split('\\n\\n').map(p => {
    p = p.trim(); if (!p) return '';
    return p.startsWith('<') ? p : '<p>' + p.replace(/\\n/g,'<br>') + '</p>';
  }).join('');
  const requestHtml = parsed.requests.map(req => buildInlineRequestCard(req)).join('');
  return h + requestHtml;
}

function extractStarkRequestBlocks(text) {
  const requests = [];
  const fence = String.fromCharCode(96, 96, 96);
  const cleaned = String(text || '').replace(new RegExp(fence + '(?:stark-request|stark_request)\\\\s*\\\\n([\\\\s\\\\S]*?)\\\\n' + fence, 'gi'), (match, body) => {
    const req = parseStarkRequestBody(body);
    if (req) requests.push(req);
    return '';
  });
  return { text: cleaned, requests };
}

function parseStarkRequestBody(body) {
  try {
    const raw = JSON.parse(String(body || '').trim());
    if (!raw || typeof raw !== 'object') return null;
    const type = String(raw.type || raw.kind || '').toLowerCase();
    const choices = Array.isArray(raw.choices) ? raw.choices.map(c => String(c)).filter(Boolean) : [];
    const req = {
      id: raw.id || raw.requestId || ('inline-req-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      kind: type === 'api_key' || type === 'apikey' || type === 'api-key' ? 'api_key' : 'question',
      provider: raw.provider || raw.service || 'Service',
      title: raw.title || (type === 'api_key' || type === 'apikey' || type === 'api-key' ? 'API key required' : 'Question from Stark'),
      message: raw.message || raw.question || raw.prompt || '',
      placeholder: raw.placeholder || '',
      choices
    };
    rememberInlineRequest(req);
    return req;
  } catch(e) {
    return null;
  }
}

function rememberInlineRequest(req) {
  try {
    if (typeof App !== 'undefined' && App.pendingRequests) App.pendingRequests.set(req.id, req);
  } catch(e) {}
}

function buildInlineRequestCard(req) {
  return req.kind === 'api_key' ? buildApiKeyRequestCard(req) : buildQuestionRequestCard(req);
}

/* ─── User message ──────────────────────────────────────────────────────── */
function buildUserMsg(text, time) {
  return \`<div class="msg-user">
    <div class="msg-user-inner">
      <div class="msg-user-bubble">\${esc(text)}</div>
      <div class="msg-user-meta">\${fmtTime(time)} ✓</div>
    </div>
  </div>\`;
}

/* ─── Thinking block (collapsible) ─────────────────────────────────────── */
function buildThinking(content, secs) {
  const dur = secs ? \` · \${secs}s\` : '';
  return \`<div class="thinking-block" onclick="this.classList.toggle('open')">
    <div class="thinking-trigger">
      <div class="thinking-pulse"></div>
      <span class="thinking-caret">▶</span>
      <span>Thinking\${dur}</span>
    </div>
    <div class="thinking-body">
      <div class="thinking-text">\${esc(content)}</div>
    </div>
  </div>\`;
}

/* ─── Code block ────────────────────────────────────────────────────────── */
function buildCode(filename, code) {
  const id = 'cb_' + Math.random().toString(36).slice(2);
  return \`<div class="code-block">
    <div class="code-head">
      <span class="code-filename">\${esc(filename)}</span>
      <button class="code-copy btn btn-sm" onclick="copyCb('\${id}',this)">Copy</button>
    </div>
    <div class="code-body" id="\${id}">\${hlCode(code)}</div>
  </div>\`;
}

/* ─── Agent message ─────────────────────────────────────────────────────── */
function buildAgentMsg(name, initials, content, time, opts) {
  opts = opts || {};
  const thinking  = opts.thinking  ? buildThinking(opts.thinking, opts.thinkingSec) : '';
  const codeBlock = opts.code      ? buildCode(opts.codeFile || 'output.ts', opts.code) : '';
  const badge     = opts.badge     ? \`<div class="check-badge">✓ \${opts.badge}</div>\` : '';
  const mdContent = content        ? \`<div class="md-content">\${renderMd(content)}</div>\` : '';
  return \`<div class="msg-agent">
    <div class="msg-agent-av">\${esc(initials)}</div>
    <div class="msg-agent-body">
      <div class="msg-agent-header"><strong>\${esc(name)}</strong> · \${fmtTime(time)}</div>
      \${thinking}\${codeBlock}\${mdContent}\${badge}
    </div>
  </div>\`;
}

/* ─── Runtime/tool event block ─────────────────────────────────────────── */
function buildRuntimeBlock(opts) {
  opts = opts || {};
  const cls = opts.status === 'failed' || opts.kind === 'error' ? ' failed' : '';
  const icon = opts.status === 'failed' || opts.kind === 'error' ? '!' : (opts.kind === 'done' ? '✓' : '•');
  const title = truncateRuntimeText(opts.title || 'Runtime event', 90);
  const detail = truncateRuntimeText(opts.detail || '', 180);
  const key = opts.key || opts.title || '';
  return \`<div class="runtime-block\${cls}" data-runtime-key="\${attr(key)}">
    <div class="runtime-dot">\${icon}</div>
    <div class="runtime-body">
      <div class="runtime-title" title="\${attr(opts.title || '')}">\${esc(title)}</div>
      \${detail ? \`<div class="runtime-detail" title="\${attr(opts.detail || '')}">\${esc(detail)}</div>\` : ''}
    </div>
  </div>\`;
}

function truncateRuntimeText(text, max) {
  text = String(text || '').replace(new RegExp('\\\\s+', 'g'), ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/* ─── Planning block (collapsible) ─────────────────────────────────────── */
function buildPlanning(agents) {
  const rows = agents.map(a => \`
    <div class="planning-agent-row">
      <div class="pa-av">\${esc(a.initials)}</div>
      <div style="flex:1;">
        <div class="pa-name">\${esc(a.name)}</div>
        <div class="pa-status">\${esc(a.status)}</div>
      </div>
      <div class="pa-menu">···</div>
    </div>\`).join('');
  return \`<div class="planning-block" id="planning-main">
    <div class="planning-header" onclick="togglePlanning()">
      <span class="planning-caret">▼</span>
      Planning
    </div>
    <div class="planning-body">
      <div class="planning-inner">
        <div class="planning-shimmer">⚡ \${agents.length} agents coordinating…</div>
        \${rows}
      </div>
    </div>
  </div>\`;
}

/* ─── Agent input request cards ─────────────────────────────────────────── */
function buildQuestionRequestCard(req) {
  const id = attr(req.id);
  const choices = Array.isArray(req.choices) ? req.choices : [];
  const choiceHtml = choices.length ? \`<div class="request-choices">\${choices.map(choice => {
    const label = String(choice || '');
    const encoded = encodeURIComponent(label);
    return \`<button class="request-choice" onclick="submitChoiceRequest('\${id}', decodeURIComponent('\${encoded}'))">\${esc(label)}</button>\`;
  }).join('')}</div>\` : '';
  const textareaHtml = choices.length ? '' : \`<textarea class="request-textarea" id="req-answer-\${id}" placeholder="\${attr(req.placeholder || 'Type your answer…')}"></textarea>\`;
  const sendHtml = choices.length ? '' : \`<button class="btn btn-filled btn-sm" onclick="submitUserQuestionRequest('\${id}')">Send answer</button>\`;
  return \`<div class="agent-request-card question" data-request-id="\${id}">
    <div class="request-head">
      <div class="request-icon">?</div>
      <div style="flex:1;min-width:0;">
        <div class="request-title">\${esc(req.title || 'Question from Stark')}</div>
        <div class="request-status">\${choices.length ? 'Choose an option' : 'Waiting for your answer'}</div>
      </div>
    </div>
    <div class="request-message">\${esc(req.message || 'The agent needs more information to continue.')}</div>
    \${choiceHtml}\${textareaHtml}
    <div class="request-actions">
      <button class="btn btn-sm" onclick="dismissRequestCard('\${id}')">Dismiss</button>
      \${sendHtml}
    </div>
  </div>\`;
}

function buildApiKeyRequestCard(req) {
  const id = attr(req.id);
  const provider = req.provider || 'Service';
  return \`<div class="agent-request-card api-key" data-request-id="\${id}">
    <div class="request-head">
      <div class="request-icon">key</div>
      <div style="flex:1;min-width:0;">
        <div class="request-title">\${esc(req.title || 'API key required')}</div>
        <div class="request-status">Waiting for \${esc(provider)} key</div>
      </div>
    </div>
    <div class="request-message">\${esc(req.message || 'The agent needs an API key to continue.')}</div>
    <label class="request-label" for="req-key-\${id}">\${esc(provider)} API key</label>
    <input class="request-input" id="req-key-\${id}" type="password" autocomplete="off" spellcheck="false" placeholder="Paste API key…" />
    <div class="request-help">The value is sent to the local Stark agent for this conversation. Avoid sharing keys you do not want in thread history.</div>
    <div class="request-actions">
      <button class="btn btn-sm" onclick="dismissRequestCard('\${id}')">Dismiss</button>
      <button class="btn btn-filled btn-sm" onclick="submitApiKeyRequest('\${id}')">Send key</button>
    </div>
  </div>\`;
}

/* ─── System message ────────────────────────────────────────────────────── */
function buildSysMsg(title, sub, actions, warn) {
  const cls = warn ? 'msg-sys warn' : 'msg-sys ok';
  const icon = warn ? '!' : '✓';
  const acts = (actions||[]).map(a =>
    \`<button class="btn\${a.filled?' btn-filled':''} btn-sm" onclick="\${a.action||''}">\${a.label}</button>\`
  ).join('');
  return \`<div class="\${cls}">
    <div class="sys-icon">\${icon}</div>
    <div>
      <div class="sys-title">\${esc(title)}</div>
      \${sub ? \`<div class="sys-sub">\${esc(sub)}</div>\` : ''}
      \${acts ? \`<div class="sys-actions">\${acts}</div>\` : ''}
    </div>
  </div>\`;
}

/* ─── Notification card ─────────────────────────────────────────────────── */
function buildNotif(opts) {
  const acts = (opts.actions||[]).map(a =>
    \`<button class="btn\${a.filled?' btn-filled':''} btn-sm" onclick="\${a.action||''}">\${a.label}</button>\`
  ).join('');
  return \`<div class="notif-card">
    <div class="notif-head">
      <div class="notif-icon">\${opts.icon||'●'}</div>
      <div style="flex:1;">
        <div class="notif-title">\${esc(opts.title)}</div>
        <div class="notif-time">\${fmtTime(opts.time)}</div>
      </div>
    </div>
    <div class="notif-body">
      <div class="notif-msg">\${esc(opts.message)}</div>
      \${opts.sub ? \`<div class="notif-sub">\${esc(opts.sub)}</div>\` : ''}
      \${acts ? \`<div class="notif-acts">\${acts}</div>\` : ''}
    </div>
  </div>\`;
}
`;
