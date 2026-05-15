/* Assembles all client-side JS modules into a single <script> block */
import { messagesScript } from './messages.js';
import { dbScript }       from './db.js';
import { wsScript }       from './ws.js';
import { uiScript }       from './ui.js';
import { appScript }      from './app.js';

export function renderClientScript(snapshotJson: string): string {
  return `
<!-- Toast -->
<div id="toast" role="status">
  <span id="toast-msg"></span>
</div>

<!-- Connection badge -->
<div id="conn-badge">
  <div class="cd"></div>
  <span id="conn-label">Disconnected</span>
</div>

<script>
window.__STARK_STATE__ = ${snapshotJson};

${messagesScript}
${dbScript}
${uiScript}
${wsScript}
${appScript}
</script>`;
}
