/* WebSocket connection + server event handler (embedded as JS) */
export const wsScript = `
/* ─── WebSocket ─────────────────────────────────────────────────────────── */
const WS_PATH  = '/api/webchat/stream';
const HTTP_PATH = '/api/webchat/send';

function connectWS(convId) {
  if (App.ws) { try { App.ws.close(); } catch(e){} App.ws = null; }
  setBadge('connecting');
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(proto + '://' + location.host + WS_PATH + '?conv=' + convId);
    App.ws = ws;

    ws.addEventListener('open', () => setBadge('ok'));

    ws.addEventListener('message', e => {
      let pkt; try { pkt = JSON.parse(e.data); } catch { return; }
      handleServerEvent(pkt);
    });

    ws.addEventListener('close', () => {
      App.ws = null;
      setBadge('off');
      setTimeout(() => { if (App.conv === convId) connectWS(convId); }, 3000);
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

    case 'session_started':
      showTyping(pkt.agentName || 'S.T.A.R.K', pkt.agentInitials || 'S');
      break;

    case 'turn_completed':
    case 'notification': {
      hideTyping();
      const html = pkt.html || buildAgentMsg(
        pkt.agentName || 'S.T.A.R.K', pkt.agentInitials || 'S',
        pkt.content || '', new Date(),
        { thinking: pkt.thinking, thinkingSec: pkt.thinkingSec,
          code: pkt.code, codeFile: pkt.codeFile, badge: pkt.badge }
      );
      inject(wrap, html);
      dbAddMsg({ convId: App.conv, type: 'html', html, ts: Date.now() }).catch(()=>{});
      break;
    }

    case 'approval_required': {
      hideTyping();
      inject(wrap, buildNotif({
        icon: '●', title: 'Approval Required', time: new Date(),
        message: pkt.message || 'Agent requires approval.',
        sub: 'Agent: ' + (pkt.agentName || 'Unknown'),
        actions: [
          { label: 'Approve', filled: true,  action: \`sendApproval('\${pkt.approvalId}',true)\` },
          { label: 'Reject',                 action: \`sendApproval('\${pkt.approvalId}',false)\` },
        ],
      }));
      break;
    }

    case 'turn_failed':
      hideTyping();
      inject(wrap, buildSysMsg('Agent run failed', pkt.reason || 'An error occurred.', [], true));
      break;

    case 'plan_update':
      updateProgress(pkt.completed || 0, pkt.total || 1);
      break;

    default:
      console.debug('[STARK WS]', pkt);
  }
  scrollBottom();
}

function sendApproval(approvalId, approved) {
  wsSend({ type: 'approval_response', approvalId, approved });
  toast(approved ? '✓ Approved' : '✕ Rejected');
}
`;
