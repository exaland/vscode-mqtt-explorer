import * as vscode from 'vscode'
import { MqttMessage } from './types'

export class LiveTopicPanel {
  private panel: vscode.WebviewPanel | undefined
  private topic: string | undefined

  public open(topic: string): void {
    this.topic = topic

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'mqttExplorerLiveTopic',
        vscode.l10n.t('MQTT Live: {0}', topic),
        vscode.ViewColumn.Beside,
        { enableScripts: false }
      )

      this.panel.onDidDispose(() => {
        this.panel = undefined
      })
    }

    this.panel.title = vscode.l10n.t('MQTT Live: {0}', topic)
    this.panel.webview.html = this.buildHtml(topic)
    this.panel.reveal(vscode.ViewColumn.Beside, true)
  }

  public update(message: MqttMessage): void {
    if (!this.panel || !this.topic || message.topic !== this.topic) {
      return
    }

    const payload = this.escapeHtml(message.payload)
    const now = new Date(message.timestamp).toLocaleString()
    this.panel.webview.html = this.buildHtml(this.topic, {
      payload,
      qos: message.qos,
      retain: message.retain,
      time: now,
    })
  }

  private buildHtml(
    topic: string,
    details?: { payload: string; qos: 0 | 1 | 2; retain: boolean; time: string }
  ): string {
    const language = vscode.env.language || 'en'
    const payload = details?.payload ?? `<i>${vscode.l10n.t('No message received for this topic since opening the panel.')}</i>`
    const meta = details
      ? `<div><strong>${vscode.l10n.t('QoS')}:</strong> ${details.qos} | <strong>${vscode.l10n.t('Retain')}:</strong> ${details.retain ? vscode.l10n.t('yes') : vscode.l10n.t('no')} | <strong>${vscode.l10n.t('Date')}:</strong> ${details.time}</div>`
      : ''

    return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      margin: 16px;
      line-height: 1.4;
    }
    .topic {
      margin-bottom: 12px;
      font-weight: 600;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid rgba(127, 127, 127, 0.35);
      border-radius: 8px;
      padding: 12px;
      background: rgba(127, 127, 127, 0.08);
    }
  </style>
</head>
<body>
  <div class="topic">${vscode.l10n.t('Topic')}: ${this.escapeHtml(topic)}</div>
  ${meta}
  <pre>${payload}</pre>
</body>
</html>`
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }
}
