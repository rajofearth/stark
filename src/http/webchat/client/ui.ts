/* DOM utility functions (embedded as JS) */
export const uiScript = `
/* ─── DOM utilities ─────────────────────────────────────────────────────── */

function inject(wrap, html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  while (tmp.firstChild) wrap.appendChild(tmp.firstChild);
}

function scrollBottom(smooth) {
  const w = document.getElementById('messages-wrap');
  w.scrollTo({ top: w.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function showTyping(name, initials) {
  document.getElementById('typing-name').textContent = name;
  document.getElementById('typing-av').textContent   = initials || name[0];
  document.getElementById('typing-indicator').classList.add('show');
  scrollBottom(true);
}

function hideTyping() {
  document.getElementById('typing-indicator').classList.remove('show');
}

function setBadge(state) {
  const el  = document.getElementById('conn-badge');
  const lbl = document.getElementById('conn-label');
  el.className = 'conn-badge';
  if (state === 'ok') {
    el.classList.add('show','ok'); lbl.textContent = 'Connected';
    setTimeout(() => el.classList.remove('show'), 2500);
  } else if (state === 'connecting') {
    el.classList.add('show'); lbl.textContent = 'Connecting…';
  } else if (state === 'err') {
    el.classList.add('show','err'); lbl.textContent = 'Pipeline not connected';
    setTimeout(() => el.classList.remove('show'), 3500);
  } else {
    el.classList.remove('show');
  }
}

function toast(msg, ms) {
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms || 2800);
}

function copyCb(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent || '').then(() => {
    btn.textContent = 'Copied';
    setTimeout(() => btn.textContent = 'Copy', 1400);
  });
}

function togglePlanning() {
  const el = document.getElementById('planning-main');
  if (el) el.classList.toggle('collapsed');
}

function switchTab(tab) {
  document.querySelectorAll('.rpanel-tab').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.rpane').forEach(el =>
    el.classList.toggle('active', el.id === 'pane-' + tab));
}

function updateProgress(done, total) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const bar = document.getElementById('progress-bar');
  const lbl = document.getElementById('progress-label');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = done + ' / ' + total;
}
`;
