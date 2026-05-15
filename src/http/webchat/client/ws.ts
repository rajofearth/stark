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
    case 'session.resumed':
      if (pkt.conversation) upsertConversation(pkt.conversation, true);
      break;

    case 'message.started':
      if (pkt.conversation) upsertConversation(pkt.conversation, true);
      startAssistantMessage();
      break;

    case 'message.delta':
      appendAssistantDelta(pkt.delta || '');
      break;

    case 'message.completed':
      finishAssistantMessage(pkt.content || '');
      if (pkt.conversation) upsertConversation(pkt.conversation, true);
      break;

    case 'plan.update':
      updatePlanPanelFromPlan(pkt.plan);
      break;

    case 'message.error':
    case 'turn_failed':
      hideTyping();
      App.pendingAssistant = null;
      inject(wrap, buildSysMsg('Codex run failed', pkt.message || pkt.reason || 'An error occurred.', [], true));
      scrollBottom(true);
      break;

    case 'approval_required':
      hideTyping();
      inject(wrap, buildSysMsg('Approval required', 'This direct webchat currently supports auto-approved runs only.', [], true));
      scrollBottom(true);
      break;

    default:
      console.debug('[STARK WS]', pkt);
  }
}
`;
