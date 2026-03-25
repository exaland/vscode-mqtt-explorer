import * as vscode from 'vscode'
import { ConnectionOptions, ConnectionProfile } from './types'

type IncomingMessage =
  | { type: 'requestState' }
  | { type: 'selectProfile'; profileName: string }
  | { type: 'saveProfile'; profileName: string; options: DraftOptions }
  | { type: 'deleteProfile'; profileName: string }
  | { type: 'connect'; options: DraftOptions }

interface DraftOptions {
  protocol: string
  host: string
  port: number | string
  username?: string
  password?: string
  clientId?: string
}

interface PanelState {
  profiles: ConnectionProfile[]
  selectedProfileName: string
  currentConnection?: ConnectionOptions
}

interface PanelActions {
  getProfiles: () => ConnectionProfile[]
  getCurrentConnection: () => ConnectionOptions | undefined
  onSaveProfile: (name: string, options: ConnectionOptions) => Promise<void>
  onDeleteProfile: (name: string) => Promise<void>
  onConnect: (options: ConnectionOptions) => Promise<void>
}

export class ConnectionManagerPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined
  private selectedProfileName = ''

  public constructor(private readonly actions: PanelActions) {}

  public open(): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'mqttExplorerConnectionManager',
        vscode.l10n.t('MQTT Connection Manager'),
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

  private async handleMessage(message: IncomingMessage): Promise<void> {
    switch (message.type) {
      case 'requestState': {
        await this.postState()
        return
      }
      case 'selectProfile': {
        this.selectedProfileName = message.profileName
        await this.postState()
        return
      }
      case 'saveProfile': {
        const normalizedName = message.profileName.trim()
        if (!normalizedName) {
          void vscode.window.showWarningMessage(vscode.l10n.t('Profile name is required.'))
          return
        }

        const options = this.normalizeOptions(message.options)
        if (!options) {
          return
        }

        await this.actions.onSaveProfile(normalizedName, options)
        this.selectedProfileName = normalizedName
        await this.postState()
        return
      }
      case 'deleteProfile': {
        const normalizedName = message.profileName.trim()
        if (!normalizedName) {
          return
        }

        await this.actions.onDeleteProfile(normalizedName)
        if (this.selectedProfileName === normalizedName) {
          this.selectedProfileName = ''
        }
        await this.postState()
        return
      }
      case 'connect': {
        const options = this.normalizeOptions(message.options)
        if (!options) {
          return
        }

        await this.actions.onConnect(options)
        await this.postState()
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

    const profiles = this.actions.getProfiles()
    if (!profiles.some(profile => profile.name === this.selectedProfileName)) {
      this.selectedProfileName = profiles[0]?.name ?? ''
    }

    const state: PanelState = {
      profiles,
      selectedProfileName: this.selectedProfileName,
      currentConnection: this.actions.getCurrentConnection(),
    }

    await this.panel.webview.postMessage({ type: 'state', state })
  }

  private normalizeOptions(draft: DraftOptions): ConnectionOptions | undefined {
    if (!isProtocol(draft.protocol)) {
      void vscode.window.showWarningMessage(vscode.l10n.t('Invalid protocol.'))
      return undefined
    }

    const host = String(draft.host ?? '').trim()
    if (!host) {
      void vscode.window.showWarningMessage(vscode.l10n.t('Host is required.'))
      return undefined
    }

    const port = Number(draft.port)
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      void vscode.window.showWarningMessage(vscode.l10n.t('Invalid port.'))
      return undefined
    }

    return {
      protocol: draft.protocol,
      host,
      port,
      username: (draft.username ?? '').trim() || undefined,
      password: draft.password || undefined,
      clientId: (draft.clientId ?? '').trim() || undefined,
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = String(Date.now())
    const language = vscode.env.language || 'en'
    const strings = {
      disconnected: vscode.l10n.t('Disconnected'),
      connectedTo: vscode.l10n.t('Connected to'),
      profiles: vscode.l10n.t('Profiles'),
      newProfile: vscode.l10n.t('New profile'),
      brokerConfiguration: vscode.l10n.t('Broker configuration'),
      profileName: vscode.l10n.t('Profile name'),
      profileNamePlaceholder: vscode.l10n.t('e.g. Production AWS'),
      protocol: vscode.l10n.t('Protocol'),
      host: vscode.l10n.t('Host'),
      port: vscode.l10n.t('Port'),
      username: vscode.l10n.t('Username'),
      password: vscode.l10n.t('Password'),
      optional: vscode.l10n.t('Optional'),
      enableTls: vscode.l10n.t('Enable TLS encryption (secure)'),
      delete: vscode.l10n.t('Delete'),
      save: vscode.l10n.t('Save'),
      connect: vscode.l10n.t('Connect'),
      noProfile: vscode.l10n.t('No profile'),
      urlPrefix: vscode.l10n.t('URL:'),
    }

    return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    :root {
      --radius: 8px;
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --border: var(--vscode-panel-border);
    }

    body {
      margin: 0;
      padding: 0;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background-color: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* --- Top Navigation --- */
    .nav-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--vscode-sideBar-background);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      font-size: 1.2em;
      color: var(--vscode-symbolIcon-interfaceForeground);
    }

    .status-badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      text-transform: uppercase;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border: 1px solid var(--border);
    }

    /* --- Main Layout --- */
    .main-container {
      display: grid;
      grid-template-columns: 260px 1fr;
      flex-grow: 1;
      overflow: hidden;
    }

    /* --- Sidebar Profiles --- */
    .sidebar {
      background: var(--vscode-sideBar-background);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
    }

    .sidebar-title {
      padding: 16px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.7;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .btn-icon {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }

    .btn-icon:hover { background: var(--vscode-toolbar-hoverBackground); }

    .profile-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 8px;
    }

    .profile-item {
      padding: 10px 12px;
      margin-bottom: 4px;
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid transparent;
    }

    .profile-item:hover { background: var(--vscode-list-hoverBackground); }
    .profile-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    .profile-item .p-name { font-weight: 500; display: block; }
    .profile-item .p-url { 
      font-size: 0.85em; 
      opacity: 0.6; 
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }

    /* --- Config Space --- */
    .config-pane {
      padding: 40px;
      overflow-y: auto;
      display: flex;
      justify-content: center;
    }

    .form-container {
      width: 100%;
      max-width: 600px;
    }

    .section-title {
      margin-bottom: 24px;
      font-size: 1.5em;
      color: var(--vscode-settings-headerForeground);
    }

    .grid-form {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 20px;
    }

    .group { display: flex; flex-direction: column; gap: 8px; }
    .span-6 { grid-column: span 6; }
    .span-4 { grid-column: span 4; }
    .span-3 { grid-column: span 3; }
    .span-2 { grid-column: span 2; }

    label {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-input-placeholderForeground);
    }

    input, select {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 8px 12px;
      border-radius: 4px;
      outline: none;
      font-family: inherit;
    }

    input:focus { border-color: var(--vscode-focusBorder); }

    /* --- Toggle Switch --- */
    .switch-group {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--vscode-textBlockQuote-background);
      padding: 12px;
      border-radius: var(--radius);
      margin-top: 10px;
    }

    /* --- Footer Actions --- */
    .footer-actions {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
    }

    button.main-btn {
      padding: 8px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: opacity 0.2s;
    }

    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    
    .btn-outline { 
      background: transparent; 
      color: var(--vscode-button-secondaryForeground); 
      border: 1px solid var(--vscode-button-secondaryBackground);
    }
    .btn-outline:hover { background: var(--vscode-button-secondaryHoverBackground); }

    .btn-danger { color: #f14c4c; background: transparent; }
    .btn-danger:hover { background: rgba(241, 76, 76, 0.1); }

    .empty-state {
      text-align: center;
      margin-top: 40px;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <header class="nav-header">
    <div class="brand">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L1 4v8l7 3 7-3V4L8 1zm0 1.35L13.15 4.5 8 6.75 2.85 4.5 8 2.35zM2 11.15V5.5l5 2.15v5.65l-5-2.15zm9 2.15l-5-2.15V7.65l5-2.15v5.65z"/></svg>
      MQTT Explorer
      <span style="font-size:0.75em; opacity:0.6; margin-left:4px">By Exaland - www.exaland.app</span>
    </div>
    <div id="connectionStatus" class="status-badge">${strings.disconnected}</div>
  </header>

  <main class="main-container">
    <aside class="sidebar">
      <div class="sidebar-title">
        <span>${strings.profiles.toUpperCase()}</span>
        <button class="btn-icon" id="btnNew" title="${strings.newProfile}">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 7H9V2H7v5H2v2h5v5h2V9h5z"/></svg>
        </button>
      </div>
      <div class="profile-list" id="profileList">
        </div>
    </aside>

    <section class="config-pane">
      <div class="form-container">
        <h2 class="section-title" id="formTitle">${strings.brokerConfiguration}</h2>
        
        <div class="grid-form">
          <div class="group span-6">
            <label>${strings.profileName.toUpperCase()}</label>
            <input type="text" id="profileName" placeholder="${strings.profileNamePlaceholder}" />
          </div>

          <div class="group span-2">
            <label>${strings.protocol.toUpperCase()}</label>
            <select id="protocol">
              <option value="mqtt">mqtt://</option>
              <option value="mqtts">mqtts://</option>
              <option value="ws">ws://</option>
              <option value="wss">wss://</option>
            </select>
          </div>

          <div class="group span-3">
            <label>${strings.host.toUpperCase()}</label>
            <input type="text" id="host" placeholder="broker.emqx.io" />
          </div>

          <div class="group span-1">
            <label>${strings.port.toUpperCase()}</label>
            <input type="number" id="port" value="1883" />
          </div>

          <div class="group span-3">
            <label>${strings.username.toUpperCase()}</label>
            <input type="text" id="username" placeholder="${strings.optional}" />
          </div>

          <div class="group span-3">
            <label>${strings.password.toUpperCase()}</label>
            <input type="password" id="password" placeholder="${strings.optional}" />
          </div>

          <div class="group span-6">
            <div class="switch-group">
               <input type="checkbox" id="tls" />
               <label for="tls" style="margin:0; cursor:pointer">${strings.enableTls}</label>
            </div>
          </div>
        </div>

        <div class="footer-actions">
          <button id="btnDelete" class="main-btn btn-danger">${strings.delete}</button>
          <div style="display:flex; gap:12px">
            <button id="btnSave" class="main-btn btn-outline">${strings.save}</button>
            <button id="btnConnect" class="main-btn btn-primary">${strings.connect}</button>
          </div>
        </div>
        
        <div id="subtitle" style="margin-top:20px; font-family:monospace; opacity:0.4; font-size:11px; text-align:center"></div>
      </div>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const i18n = ${JSON.stringify(strings)};

    const el = {
      profileList: document.getElementById('profileList'),
      profileName: document.getElementById('profileName'),
      protocol: document.getElementById('protocol'),
      host: document.getElementById('host'),
      port: document.getElementById('port'),
      username: document.getElementById('username'),
      password: document.getElementById('password'),
      tls: document.getElementById('tls'),
      subtitle: document.getElementById('subtitle'),
      btnSave: document.getElementById('btnSave'),
      btnConnect: document.getElementById('btnConnect'),
      btnDelete: document.getElementById('btnDelete'),
      btnNew: document.getElementById('btnNew'),
      statusBadge: document.getElementById('connectionStatus')
    };

    let state = { profiles: [], selectedProfileName: '', currentConnection: undefined };

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'state') {
        state = message.state;
        render();
      }
    });

    function render() {
      if (state.currentConnection) {
        el.statusBadge.textContent = i18n.connectedTo + " " + state.currentConnection.host;
        el.statusBadge.style.background = "var(--vscode-testing-iconPassedColor)";
        el.statusBadge.style.color = "white";
      } else {
        el.statusBadge.textContent = i18n.disconnected;
        el.statusBadge.style.background = "var(--vscode-badge-background)";
      }

      const selected = state.profiles.find(p => p.name === state.selectedProfileName) || {
        name: '',
        options: { protocol: 'mqtt', host: '', port: 1883 }
      };

      el.profileName.value = selected.name;
      el.protocol.value = selected.options.protocol;
      el.host.value = selected.options.host;
      el.port.value = selected.options.port;
      el.username.value = selected.options.username || '';
      el.password.value = selected.options.password || '';
      el.tls.checked = ['mqtts', 'wss'].includes(selected.options.protocol);

      if (state.profiles.length === 0) {
        el.profileList.innerHTML = '<div class="empty-state">' + i18n.noProfile + '</div>';
      } else {
        el.profileList.innerHTML = state.profiles.map(p => \`
          <div class="profile-item \${p.name === state.selectedProfileName ? 'active' : ''}" data-profile="\${escapeHtml(p.name)}">
            <span class="p-name">\${escapeHtml(p.name)}</span>
            <span class="p-url">\${escapeHtml(p.options.protocol)}://\${escapeHtml(p.options.host)}</span>
          </div>
        \`).join('');
        el.profileList.querySelectorAll('.profile-item[data-profile]').forEach(item => {
          item.addEventListener('click', () => {
            const name = item.getAttribute('data-profile');
            if (name !== null) {
              vscode.postMessage({ type: 'selectProfile', profileName: name });
            }
          });
        });
      }
      syncSubtitle();
    }

    function getDraftOptions() {
      let proto = el.protocol.value;
      if (el.tls.checked) {
        if (proto === 'mqtt') proto = 'mqtts';
        if (proto === 'ws') proto = 'wss';
      } else {
        if (proto === 'mqtts') proto = 'mqtt';
        if (proto === 'wss') proto = 'ws';
      }

      return {
        protocol: proto,
        host: el.host.value.trim(),
        port: parseInt(el.port.value),
        username: el.username.value.trim(),
        password: el.password.value
      };
    }

    function syncSubtitle() {
      const opt = getDraftOptions();
      el.subtitle.textContent = i18n.urlPrefix + ' ' + opt.protocol + '://' + (opt.host || '...') + ':' + opt.port + '/';
    }

    function escapeHtml(str) {
      const p = document.createElement('p');
      p.textContent = str;
      return p.innerHTML;
    }

    // Event Listeners
    el.btnSave.onclick = () => vscode.postMessage({ type: 'saveProfile', profileName: el.profileName.value, options: getDraftOptions() });
    el.btnConnect.onclick = () => vscode.postMessage({ type: 'connect', options: getDraftOptions() });
    el.btnDelete.onclick = () => vscode.postMessage({ type: 'deleteProfile', profileName: el.profileName.value });
    el.btnNew.onclick = () => {
        state.selectedProfileName = '';
        render();
        el.profileName.focus();
    };

    [el.protocol, el.host, el.port, el.tls].forEach(i => i.oninput = syncSubtitle);

    // Init
    vscode.postMessage({ type: 'requestState' });
  </script>
</body>
</html>`;
  }
}

function isProtocol(value: string): value is ConnectionOptions['protocol'] {
  return value === 'mqtt' || value === 'mqtts' || value === 'ws' || value === 'wss'
}
