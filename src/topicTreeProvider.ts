import * as vscode from 'vscode'
import { MqttMessage } from './types'

interface TopicBranch {
  name: string
  fullTopic: string
  children: Map<string, TopicBranch>
  message?: MqttMessage
}

export class TopicNode extends vscode.TreeItem {
  constructor(public readonly branch: TopicBranch) {
    const hasChildren = branch.children.size > 0
    super(branch.name, hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None)

    this.contextValue = branch.message ? 'topicLeaf' : 'topicBranch'
    this.description = branch.message ? previewPayload(branch.message.payload) : undefined
    this.tooltip = buildTooltip(branch)

    if (branch.message) {
      this.command = {
        title: vscode.l10n.t('Inspect Message'),
        command: 'mqttExplorer.inspectMessage',
        arguments: [this],
      }
    }
  }

  public get topic(): string {
    return this.branch.fullTopic
  }
}

function previewPayload(payload: string): string {
  const compact = payload.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return vscode.l10n.t('(empty)')
  }
  return compact.length > 50 ? `${compact.slice(0, 47)}...` : compact
}

function buildTooltip(branch: TopicBranch): string {
  if (!branch.message) {
    return branch.fullTopic
  }

  const date = new Date(branch.message.timestamp).toLocaleString()
  return [
    vscode.l10n.t('Topic: {0}', branch.fullTopic),
    vscode.l10n.t('QoS: {0}', String(branch.message.qos)),
    vscode.l10n.t('Retain: {0}', branch.message.retain ? vscode.l10n.t('yes') : vscode.l10n.t('no')),
    vscode.l10n.t('Date: {0}', date),
    '',
    branch.message.payload,
  ].join('\n')
}

export class TopicTreeProvider implements vscode.TreeDataProvider<TopicNode> {
  private readonly root: TopicBranch = {
    name: 'root',
    fullTopic: '',
    children: new Map<string, TopicBranch>(),
  }

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TopicNode | undefined>()
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event
  private topicFilter = ''

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined)
  }

  public clear(): void {
    this.root.children.clear()
    this.refresh()
  }

  public setFilter(filter: string): void {
    this.topicFilter = filter.trim().toLowerCase()
    this.refresh()
  }

  public getFilter(): string {
    return this.topicFilter
  }

  public upsertMessage(message: MqttMessage): void {
    const segments = message.topic.split('/').filter(part => part.length > 0)
    let current = this.root

    for (const segment of segments) {
      const nextTopic = current.fullTopic ? `${current.fullTopic}/${segment}` : segment
      let child = current.children.get(segment)
      if (!child) {
        child = {
          name: segment,
          fullTopic: nextTopic,
          children: new Map<string, TopicBranch>(),
        }
        current.children.set(segment, child)
      }
      current = child
    }

    current.message = message
    this.refresh()
  }

  public getLatestMessage(topic: string): MqttMessage | undefined {
    const segments = topic.split('/').filter(part => part.length > 0)
    let current: TopicBranch | undefined = this.root

    for (const segment of segments) {
      current = current.children.get(segment)
      if (!current) {
        return undefined
      }
    }

    return current.message
  }

  public getTreeItem(element: TopicNode): vscode.TreeItem {
    return element
  }

  public getChildren(element?: TopicNode): TopicNode[] {
    const branch = element?.branch ?? this.root
    const children = Array.from(branch.children.values())
      .filter(child => this.matchesFilter(child))
      .sort((a, b) => a.name.localeCompare(b.name))
    return children.map(child => new TopicNode(child))
  }

  private matchesFilter(branch: TopicBranch): boolean {
    if (!this.topicFilter) {
      return true
    }

    if (branch.fullTopic.toLowerCase().includes(this.topicFilter)) {
      return true
    }

    for (const child of branch.children.values()) {
      if (this.matchesFilter(child)) {
        return true
      }
    }

    return false
  }
}
