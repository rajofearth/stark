/* S.T.A.R.K Web Chat — main assembler */
import { renderStyles }      from './styles.js';
import { renderSidebar }     from './components/sidebar.js';
import { renderChatArea }    from './components/chatArea.js';
import { renderRightPanel }  from './components/rightPanel.js';
import { renderClientScript } from './client/index.js';

export function renderWebchat(snapshot: Record<string, any>): string {
  const snapshotJson = JSON.stringify(snapshot);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>S.T.A.R.K — Web Chat</title>
  <style>${renderStyles()}</style>
</head>
<body>

<div id="app">
  ${renderSidebar()}
  ${renderChatArea()}
  ${renderRightPanel()}
</div>

${renderClientScript(snapshotJson)}

</body>
</html>`;
}
