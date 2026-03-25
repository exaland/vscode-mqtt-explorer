import * as vscode from 'vscode'

type IncomingMessage =
  | { type: 'requestState' }
  | { type: 'setFilter'; filter: string }
  | { type: 'copyTopic'; topic: string }

interface TopicItem {
  topic: string
  name: string
  payload?: string
  qos?: 0 | 1 | 2
  retain?: boolean
  timestamp?: number
  children: TopicItem[]
}

interface PanelState {
  topics: TopicItem[]
  filter: string
}

interface PanelActions {
  getTopicData: () => TopicItem[]
  getFilter: () => string
  setFilter: (filter: string) => void
  onCopyTopic: (topic: string) => void
}

export class TopicTreeEditorPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined

  public constructor(private readonly actions: PanelActions) {}

  public open(): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'mqttExplorerTopicTreeEditor',
        vscode.l10n.t('MQTT Topic Tree Editor'),
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      )

      this.panel.webview.html = this.getHtml(this.panel.webview)
      this.panel.webview.onDidReceiveMessage(message => {
        void this.handleMessage(message as IncomingMessage)
      })
      this.panel.onDidDispose(() => {
        this.panel = undefined
      })
    }

    this.panel.reveal(vscode.ViewColumn.Beside, true)
    void this.postState()
  }

  public dispose(): void {
    this.panel?.dispose()
  }

  public update(): void {
    if (this.panel) {
      void this.postState()
    }
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    switch (message.type) {
      case 'requestState': {
        await this.postState()
        return
      }
      case 'setFilter': {
        this.actions.setFilter(message.filter)
        await this.postState()
        return
      }
      case 'copyTopic': {
        this.actions.onCopyTopic(message.topic)
        return
      }
      default:
        return
    }
  }

  private async postState(): Promise<void> {
    if (!this.panel) {
      return
    }

    const state: PanelState = {
      topics: this.actions.getTopicData(),
      filter: this.actions.getFilter(),
    }

    await this.panel.webview.postMessage({ type: 'state', state })
  }

  private getHtml(_webview: vscode.Webview): string {
    const language = vscode.env.language || 'en'
    const nonce = this.getNonce()

    return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    :root {
      color-scheme: light dark;
      --color-text: var(--vscode-foreground);
      --color-background: var(--vscode-editor-background);
      --color-border: var(--vscode-inputBorder-color, #3e3e42);
      --color-accent: var(--vscode-focusBorder, #007fd4);
    }
    
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0;
      padding: 12px;
      color: var(--color-text);
      background: var(--color-background);
      line-height: 1.4;
    }
    
    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 12px;
    }
    
    .header {
      display: flex;
      gap: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--color-border);
    }
    
    .search-box {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--color-border);
      background: var(--vscode-input-background, transparent);
      color: var(--color-text);
      border-radius: 4px;
      font-size: 13px;
    }
    
    .search-box:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 1px var(--color-accent);
    }
    
    .button {
      padding: 6px 12px;
      border: 1px solid var(--color-border);
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.2s;
    }
    
    .button:hover {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }
    
    .button:active {
      transform: scale(0.98);
    }
    
    .content {
      flex: 1;
      overflow-y: auto;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.2);
    }
    
    .tree {
      padding: 8px 0;
    }
    
    .tree-item {
      display: flex;
      align-items: center;
      padding: 2px 8px;
      cursor: pointer;
      user-select: none;
    }
    
    .tree-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    
    .tree-item-toggle {
      display: inline-block;
      width: 20px;
      text-align: center;
      color: var(--color-text);
      opacity: 0.6;
      margin-right: 4px;
    }
    
    .tree-item-toggle.has-children {
      opacity: 1;
      cursor: pointer;
    }
    
    .tree-item-name {
      flex: 1;
      font-weight: 500;
    }
    
    .tree-item-topic {
      color: rgba(255, 255, 255, 0.5);
      font-size: 11px;
      margin-right: 8px;
      opacity: 0.7;
    }
    
    .tree-item-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .tree-item:hover .tree-item-actions {
      opacity: 1;
    }
    
    .action-btn {
      padding: 2px 6px;
      font-size: 11px;
      border: 1px solid var(--color-border);
      background: transparent;
      color: var(--color-text);
      cursor: pointer;
      border-radius: 2px;
      transition: 0.2s;
    }
    
    .action-btn:hover {
      background: var(--color-accent);
      color: white;
    }
    
    .tree-item-details {
      display: flex;
      gap: 12px;
      font-size: 11px;
      margin-left: 24px;
      margin-top: 2px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 2px;
      opacity: 0.8;
    }
    
    .tree-item-details-item {
      display: flex;
      gap: 4px;
    }
    
    .tree-item-details-label {
      font-weight: 600;
      opacity: 0.7;
    }
    
    .payload-preview {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 11px;
      margin-left: 24px;
      margin-top: 2px;
      padding: 6px 8px;
      background: rgba(0, 0, 0, 0.3);
      border-left: 2px solid var(--color-accent);
      border-radius: 2px;
      max-height: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: rgba(255, 255, 255, 0.5);
      font-size: 13px;
    }
    
    .tree-children {
      display: none;
      margin-left: 12px;
    }
    
    .tree-item.expanded .tree-children {
      display: block;
    }
    
    .tree-item.leaf .tree-item-toggle {
      opacity: 0;
      cursor: default;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <input type="text" id="filterInput" class="search-box" placeholder="Filter topics...">
      <button id="clearBtn" class="button">Clear Filter</button>
    </div>
    <div class="content">
      <div id="tree" class="tree"></div>
      <div id="emptyState" class="empty-state">No topics yet. Connect and subscribe to MQTT topics.</div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    let state = { topics: [], filter: '' };
    
    const filterInput = document.getElementById('filterInput');
    const clearBtn = document.getElementById('clearBtn');
    const tree = document.getElementById('tree');
    const emptyState = document.getElementById('emptyState');
    
    filterInput.addEventListener('input', (e) => {
      const filter = e.target.value;
      vscode.postMessage({ type: 'setFilter', filter });
    });
    
    clearBtn.addEventListener('click', () => {
      filterInput.value = '';
      vscode.postMessage({ type: 'setFilter', filter: '' });
    });
    
    function handleCopy(topic) {
      vscode.postMessage({ type: 'copyTopic', topic });
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function truncatePayload(payload, maxLength = 100) {
      if (payload.length > maxLength) {
        return payload.substring(0, maxLength) + '...';
      }
      return payload;
    }
    
    function renderTreeItem(item, index) {
      const hasChildren = item.children && item.children.length > 0;
      const hasPayload = item.payload !== undefined;
      
      const itemEl = document.createElement('div');
      itemEl.className = \`tree-item \${hasChildren ? 'expanded' : 'leaf'}\`;
      itemEl.innerHTML = \`
        <span class="tree-item-toggle \${hasChildren ? 'has-children' : ''}" data-index="\${index}">
          \${hasChildren ? '▼' : ''}
        </span>
        <span class="tree-item-name">\${escapeHtml(item.name)}</span>
        <span class="tree-item-topic">\${escapeHtml(item.topic)}</span>
        <div class="tree-item-actions">
          <button class="action-btn copy-btn" data-topic="\${escapeHtml(item.topic)}">Copy</button>
        </div>
      \`;
      
      // Toggle children
      const toggle = itemEl.querySelector('.tree-item-toggle.has-children');
      if (toggle) {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          itemEl.classList.toggle('expanded');
        });
      }
      
      // Copy button
      const copyBtn = itemEl.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleCopy(item.topic);
        });
      }
      
      // Add details if has payload
      if (hasPayload) {
        const detailsEl = document.createElement('div');
        detailsEl.className = 'tree-item-details';
        detailsEl.innerHTML = \`
          <div class="tree-item-details-item">
            <span class="tree-item-details-label">QoS:</span>
            <span>\${item.qos}</span>
          </div>
          <div class="tree-item-details-item">
            <span class="tree-item-details-label">Retain:</span>
            <span>\${item.retain ? 'Yes' : 'No'}</span>
          </div>
          \${item.timestamp ? \`
            <div class="tree-item-details-item">
              <span class="tree-item-details-label">Time:</span>
              <span>\${new Date(item.timestamp).toLocaleTimeString()}</span>
            </div>
          \` : ''}
        \`;
        itemEl.appendChild(detailsEl);
        
        // Add payload preview
        const payloadEl = document.createElement('div');
        payloadEl.className = 'payload-preview';
        payloadEl.textContent = truncatePayload(item.payload);
        itemEl.appendChild(payloadEl);
      }
      
      // Add children
      if (hasChildren) {
        const childrenEl = document.createElement('div');
        childrenEl.className = 'tree-children';
        item.children.forEach((child, idx) => {
          childrenEl.appendChild(renderTreeItem(child, idx));
        });
        itemEl.appendChild(childrenEl);
      }
      
      return itemEl;
    }
    
    function render() {
      tree.innerHTML = '';
      
      if (!state.topics || state.topics.length === 0) {
        emptyState.style.display = 'flex';
      } else {
        emptyState.style.display = 'none';
        state.topics.forEach((item, index) => {
          tree.appendChild(renderTreeItem(item, index));
        });
      }
      
      filterInput.value = state.filter;
    }
    
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        state = message.state;
        render();
      }
    });
    
    vscode.postMessage({ type: 'requestState' });
  </script>
</body>
</html>`
  }

  private getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
  }
}
