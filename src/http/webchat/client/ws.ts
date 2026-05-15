/* WebSocket connection + server event handler (embedded as JS) */
export const wsScript = `
/* ─── WebSocket ─────────────────────────────────────────────────────────── */
const WS_PATH  = '/api/webchat/stream';
const HTTP_PATH = '/api/webchat/send';

function connectWS() {
  if (App.ws) { try { App.ws.close(); } catch(e){} App.ws = null; }
  setBadge('connecting');
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(proto + '://' + location.host + WS_PATH);
    App.ws = ws;

    ws.addEventListener('open', () => {
      setBadge('ok');
      const conv = App.convs.get(App.conv);
      if (conv && conv.threadId) wsSend({ type: 'conversation.resume', threadId: conv.threadId, title: conv.title });
    });

    ws.addEventListener('message', e => {
      let pkt; try { pkt = JSON.parse(e.data); } catch { return; }
      handleServerEvent(pkt);
    });

    ws.addEventListener('close', () => {
      App.ws = null;
      setBadge('off');
      setTimeout(() => { if (!App.ws) connectWS(); }, 2500);
    });

    ws.addEventListener('error', () => { setBadge('err'); });
  } catch(e) { setBadge('err'); }
}

function wsSend(payload) {
  if (App.ws && App.ws.readyState === WebSocket.OPEN) {
    App.ws.send(JSON.stringify(payload)); return true;
  }
  return false;
}

/* ─── Server event dispatch ─────────────────────────────────────────────── */
function handleServerEvent(pkt) {
  const wrap = document.getElementById('messages-wrap');
  switch (pkt.event) {
    case 'connected':
      mergeServerConvs(pkt.conversations || []);
      break;

    case 'session.created':
      if (pkt.conversation) upsertConversation(pkt.conversation, true);
      break;

    case 'session.resumed':
      if (pkt.conversation) upsertConversation(pkt.conversation, false, { preserveExistingTime: true });
      break;

    case 'message.started':
      if (pkt.conversation) upsertConversation(pkt.conversation, true);
      setComposerBusy(true);
      applyStatsUpdate(pkt.threadId || (pkt.conversation && pkt.conversation.threadId) || '', { status: 'working' });
      startAssistantMessage();
      break;

    case 'message.delta':
      appendAssistantDelta(pkt.delta || '');
      break;

    case 'message.completed':
      finishAssistantMessage(pkt.content || '');
      if (pkt.conversation) upsertConversation(pkt.conversation, true);
      applyStatsUpdate(pkt.threadId || (pkt.conversation && pkt.conversation.threadId) || '', Object.assign({}, pkt.stats || {}, { status: 'idle' }));
      setComposerBusy(false);
      break;

    case 'message.stopped':
      hideTyping();
      App.pendingAssistant = null;
      if (pkt.conversation) upsertConversation(pkt.conversation, false, { preserveExistingTime: true });
      applyStatsUpdate(pkt.threadId || (pkt.conversation && pkt.conversation.threadId) || '', { status: 'stopped' });
      setComposerBusy(false);
      break;

    case 'plan.update': {
      const conv = App.convs.get(App.conv);
      if (!pkt.threadId || (conv && (conv.threadId === pkt.threadId || conv.codexThreadId === pkt.threadId))) updatePlanPanelFromPlan(pkt.plan);
      break;
    }

    case 'stats.update':
      applyStatsUpdate(pkt.threadId || '', pkt.stats || {});
      break;

    case 'file.update':
      applyFileUpdate(pkt.threadId || '', pkt.file || {});
      break;

    case 'runtime.activity':
    case 'runtime.tool':
      appendRuntimeEvent(pkt);
      break;

    case 'input.required':
    case 'api_key.required':
      renderInputRequest(pkt);
      applyStatsUpdate(pkt.threadId || '', { status: pkt.event === 'api_key.required' ? 'api key required' : 'waiting for user' });
      break;

    case 'message.error':
    case 'turn_failed': {
      hideTyping();
      setComposerBusy(false);
      const msg = pkt.message || pkt.reason || 'An error occurred.';
      if (/api.?key|token|credential|missing_linear_api_token/i.test(String(pkt.code || '') + ' ' + String(msg || ''))) {
        renderInputRequest({ event: 'api_key.required', kind: 'api_key', provider: inferProviderFromText(msg), message: msg, threadId: pkt.threadId || '' });
        applyStatsUpdate(pkt.threadId || '', { status: 'api key required' });
        break;
      }
      applyStatsUpdate(pkt.threadId || '', { status: 'error' });
      App.pendingAssistant = null;
      inject(wrap, buildSysMsg('Stark run failed', msg, [], true));
      scrollBottom(true);
      break;
    }

    case 'approval_required':
      hideTyping();
      setComposerBusy(false);
      applyStatsUpdate(pkt.threadId || '', { status: 'approval required' });
      inject(wrap, buildSysMsg('Approval required', 'This direct webchat currently supports auto-approved runs only.', [], true));
      scrollBottom(true);
      break;

    default:
      console.debug('[STARK WS]', pkt);
  }
}
`;
