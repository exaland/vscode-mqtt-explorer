import * as vscode from 'vscode'

/** Validate a topic name, preserving significant spaces and empty levels. */
export function validateTopicName(topic: string): string | undefined {
  if (!topic) return vscode.l10n.t('Topic is required')
  if (topic.includes('\u0000')) return vscode.l10n.t('Topic must not contain a null character.')
  if (/[+#]/.test(topic)) return vscode.l10n.t('Topic must not contain MQTT wildcards (+ or #).')
  if (Buffer.byteLength(topic, 'utf8') > 65535) return vscode.l10n.t('Topic must not exceed 65535 UTF-8 bytes.')
  return undefined
}
