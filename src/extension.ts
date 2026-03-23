import * as vscode from 'vscode'
import { ConnectionManagerPanel } from './connectionManagerPanel'
import { LiveTopicPanel } from './liveTopicPanel'
import { MqttService } from './mqttService'
import { TopicNode, TopicTreeProvider } from './topicTreeProvider'
import { ConnectionOptions, ConnectionProfile } from './types'

const LAST_CONNECTION_KEY = 'mqttExplorer.lastConnection'
const CONNECTION_PROFILES_KEY = 'mqttExplorer.connectionProfiles'
const TOPIC_FILTER_KEY = 'mqttExplorer.topicFilter'

export function activate(context: vscode.ExtensionContext): void {
  const mqttService = new MqttService()
  const topicTreeProvider = new TopicTreeProvider()
  const liveTopicPanel = new LiveTopicPanel()
  const initialFilter = context.globalState.get<string>(TOPIC_FILTER_KEY) ?? ''
  topicTreeProvider.setFilter(initialFilter)
  let currentConnection: ConnectionOptions | undefined
  const connectionManagerPanel = new ConnectionManagerPanel({
    getProfiles: () => getProfiles(context),
    getCurrentConnection: () => currentConnection ?? context.globalState.get<ConnectionOptions>(LAST_CONNECTION_KEY),
    onSaveProfile: async (name, options) => {
      await saveProfile(context, name, options)
      void vscode.window.showInformationMessage(vscode.l10n.t('Profile saved: {0}', name))
    },
    onDeleteProfile: async name => {
      await deleteProfile(context, name)
      void vscode.window.showInformationMessage(vscode.l10n.t('Profile deleted: {0}', name))
    },
    onConnect: async options => {
      await connectWithOptions(context, mqttService, options)
      currentConnection = options
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Connected to {0}', `${options.protocol}://${options.host}:${options.port}`)
      )
    },
  })

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.name = vscode.l10n.t('MQTT Explorer')
  statusBar.command = 'mqttExplorer.openConnectionManager'
  statusBar.text = vscode.l10n.t('$(radio-tower) MQTT: disconnected')
  statusBar.show()

  context.subscriptions.push(
    mqttService,
    statusBar,
    connectionManagerPanel,
    vscode.window.registerTreeDataProvider('mqttExplorerView', topicTreeProvider)
  )

  mqttService.onDidReceiveMessage(message => {
    topicTreeProvider.upsertMessage(message)
    liveTopicPanel.update(message)
  })

  mqttService.onDidChangeConnection(state => {
    statusBar.text = state.connected
      ? vscode.l10n.t('$(plug) MQTT: connected')
      : vscode.l10n.t('$(circle-slash) MQTT: disconnected')
    statusBar.tooltip = state.detail
  })

  mqttService.onDidError(error => {
    void vscode.window.showErrorMessage(`MQTT Explorer: ${error.message}`)
  })

  context.subscriptions.push(
    vscode.commands.registerCommand('mqttExplorer.connect', async () => {
      const lastConnection = context.globalState.get<ConnectionOptions>(LAST_CONNECTION_KEY)
      const options = await askConnectionOptions(lastConnection)
      if (!options) {
        return
      }

      try {
        await connectWithOptions(context, mqttService, options)
        currentConnection = options
        void vscode.window.showInformationMessage(
          vscode.l10n.t('Connected to {0}', `${options.protocol}://${options.host}:${options.port}`)
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        void vscode.window.showErrorMessage(vscode.l10n.t('MQTT connection failed: {0}', message))
      }
    }),
    vscode.commands.registerCommand('mqttExplorer.openConnectionManager', () => {
      connectionManagerPanel.open()
    }),
    vscode.commands.registerCommand('mqttExplorer.disconnect', () => {
      mqttService.disconnect()
      topicTreeProvider.clear()
      currentConnection = undefined
      void vscode.window.showInformationMessage(vscode.l10n.t('MQTT disconnected.'))
    }),
    vscode.commands.registerCommand('mqttExplorer.connectProfile', async () => {
      const profiles = getProfiles(context)
      if (profiles.length === 0) {
        void vscode.window.showWarningMessage(vscode.l10n.t('No saved profile found. Use MQTT Explorer: Save Connection Profile.'))
        return
      }

      const selected = await vscode.window.showQuickPick(
        profiles.map(profile => ({
          label: profile.name,
          description: `${profile.options.protocol}://${profile.options.host}:${profile.options.port}`,
          profile,
        })),
        { title: vscode.l10n.t('Choose an MQTT profile') }
      )

      if (!selected) {
        return
      }

      try {
        await connectWithOptions(context, mqttService, selected.profile.options)
        currentConnection = selected.profile.options
        void vscode.window.showInformationMessage(vscode.l10n.t('Profile connected: {0}', selected.profile.name))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        void vscode.window.showErrorMessage(vscode.l10n.t('Profile connection failed: {0}', message))
      }
    }),
    vscode.commands.registerCommand('mqttExplorer.saveConnectionProfile', async () => {
      const base = currentConnection ?? context.globalState.get<ConnectionOptions>(LAST_CONNECTION_KEY)
      if (!base) {
        void vscode.window.showWarningMessage(vscode.l10n.t('No connection to save. Please connect first.'))
        return
      }

      const name = await vscode.window.showInputBox({
        title: vscode.l10n.t('Save an MQTT profile'),
        prompt: vscode.l10n.t('Profile name'),
        validateInput: value => (value.trim() ? undefined : vscode.l10n.t('Name is required')),
      })

      if (!name) {
        return
      }

      const profiles = getProfiles(context)
      const normalizedName = name.trim()
      await saveProfile(context, normalizedName, base)
      void vscode.window.showInformationMessage(vscode.l10n.t('Profile saved: {0}', normalizedName))
    }),
    vscode.commands.registerCommand('mqttExplorer.deleteConnectionProfile', async () => {
      const profiles = getProfiles(context)
      if (profiles.length === 0) {
        void vscode.window.showWarningMessage(vscode.l10n.t('No profile to delete.'))
        return
      }

      const selected = await vscode.window.showQuickPick(
        profiles.map(profile => ({
          label: profile.name,
          description: `${profile.options.protocol}://${profile.options.host}:${profile.options.port}`,
        })),
        { title: vscode.l10n.t('Delete an MQTT profile') }
      )

      if (!selected) {
        return
      }

      await deleteProfile(context, selected.label)
      void vscode.window.showInformationMessage(vscode.l10n.t('Profile deleted: {0}', selected.label))
    }),
    vscode.commands.registerCommand('mqttExplorer.publish', async (node?: TopicNode) => {
      const defaultTopic = node?.topic ?? ''
      const topic = await vscode.window.showInputBox({
        title: vscode.l10n.t('Publish an MQTT message'),
        prompt: vscode.l10n.t('Topic'),
        value: defaultTopic,
        validateInput: value => (value.trim() ? undefined : vscode.l10n.t('Topic is required')),
      })

      if (!topic) {
        return
      }

      const payload = await vscode.window.showInputBox({
        title: vscode.l10n.t('Publish an MQTT message'),
        prompt: vscode.l10n.t('Payload'),
        value: '',
      })

      if (payload === undefined) {
        return
      }

      const qosChoice = await vscode.window.showQuickPick(
        [
          { label: vscode.l10n.t('QoS 0'), qos: 0 as const },
          { label: vscode.l10n.t('QoS 1'), qos: 1 as const },
          { label: vscode.l10n.t('QoS 2'), qos: 2 as const },
        ],
        { placeHolder: vscode.l10n.t('QoS level') }
      )

      if (!qosChoice) {
        return
      }

      const retainChoice = await vscode.window.showQuickPick(
        [
          { label: vscode.l10n.t('No'), retain: false },
          { label: vscode.l10n.t('Yes'), retain: true },
        ],
        { placeHolder: vscode.l10n.t('Retain') }
      )

      if (!retainChoice) {
        return
      }

      try {
        await mqttService.publish(topic, payload, qosChoice.qos, retainChoice.retain)
        void vscode.window.showInformationMessage(vscode.l10n.t('Message published to {0}', topic))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        void vscode.window.showErrorMessage(vscode.l10n.t('Publish failed: {0}', message))
      }
    }),
    vscode.commands.registerCommand('mqttExplorer.inspectMessage', async (node?: TopicNode) => {
      if (!node) {
        void vscode.window.showWarningMessage(vscode.l10n.t('Select a topic with a message.'))
        return
      }

      const message = topicTreeProvider.getLatestMessage(node.topic)
      if (!message) {
        void vscode.window.showWarningMessage(vscode.l10n.t('No message received for this topic.'))
        return
      }

      const document = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(
          {
            topic: message.topic,
            qos: message.qos,
            retain: message.retain,
            timestamp: new Date(message.timestamp).toISOString(),
            payload: message.payload,
          },
          null,
          2
        ),
      })

      await vscode.window.showTextDocument(document, { preview: false })
    }),
    vscode.commands.registerCommand('mqttExplorer.copyTopic', async (node?: TopicNode) => {
      if (!node) {
        return
      }
      await vscode.env.clipboard.writeText(node.topic)
      void vscode.window.showInformationMessage(vscode.l10n.t('Topic copied: {0}', node.topic))
    }),
    vscode.commands.registerCommand('mqttExplorer.setTopicFilter', async () => {
      const value = await vscode.window.showInputBox({
        title: vscode.l10n.t('Topic filter'),
        prompt: vscode.l10n.t('Show only topics containing...'),
        value: topicTreeProvider.getFilter(),
      })

      if (value === undefined) {
        return
      }

      topicTreeProvider.setFilter(value)
      await context.globalState.update(TOPIC_FILTER_KEY, value)
      const suffix = value.trim() ? vscode.l10n.t(': {0}', value.trim()) : vscode.l10n.t(' (empty)')
      void vscode.window.showInformationMessage(vscode.l10n.t('Filter applied{0}', suffix))
    }),
    vscode.commands.registerCommand('mqttExplorer.clearTopicFilter', async () => {
      topicTreeProvider.setFilter('')
      await context.globalState.update(TOPIC_FILTER_KEY, '')
      void vscode.window.showInformationMessage(vscode.l10n.t('Topic filter cleared.'))
    }),
    vscode.commands.registerCommand('mqttExplorer.openLiveTopic', async (node?: TopicNode) => {
      const defaultTopic = node?.topic ?? ''
      const topic =
        defaultTopic ||
        (await vscode.window.showInputBox({
          title: vscode.l10n.t('Open a live topic'),
          prompt: vscode.l10n.t('Exact topic to follow'),
          validateInput: value => (value.trim() ? undefined : vscode.l10n.t('Topic is required')),
        }))

      if (!topic) {
        return
      }

      liveTopicPanel.open(topic)
      const latest = topicTreeProvider.getLatestMessage(topic)
      if (latest) {
        liveTopicPanel.update(latest)
      }
    })
  )
}

export function deactivate(): void {
  // Resources are cleaned up through disposables registered in activate.
}

async function askConnectionOptions(defaults: ConnectionOptions | undefined): Promise<ConnectionOptions | undefined> {
  const protocolInput = await vscode.window.showQuickPick(['mqtt', 'mqtts', 'ws', 'wss'], {
    title: vscode.l10n.t('MQTT connection'),
    placeHolder: vscode.l10n.t('Choose protocol'),
  })

  if (!protocolInput || !isProtocol(protocolInput)) {
    return undefined
  }

  const protocol: ConnectionOptions['protocol'] = protocolInput

  const host = await vscode.window.showInputBox({
    title: vscode.l10n.t('MQTT connection'),
    prompt: vscode.l10n.t('Host'),
    value: defaults?.host ?? 'localhost',
    validateInput: value => (value.trim() ? undefined : vscode.l10n.t('Host is required')),
  })

  if (!host) {
    return undefined
  }

  const defaultPort = defaults?.port?.toString() ?? defaultPortForProtocol(protocol)
  const portInput = await vscode.window.showInputBox({
    title: vscode.l10n.t('MQTT connection'),
    prompt: vscode.l10n.t('Port'),
    value: defaultPort,
    validateInput: value => {
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? undefined : vscode.l10n.t('Enter a valid port')
    },
  })

  if (!portInput) {
    return undefined
  }

  const username = await vscode.window.showInputBox({
    title: vscode.l10n.t('MQTT connection'),
    prompt: vscode.l10n.t('Username (optional)'),
    value: defaults?.username ?? '',
  })

  if (username === undefined) {
    return undefined
  }

  const password = await vscode.window.showInputBox({
    title: vscode.l10n.t('MQTT connection'),
    prompt: vscode.l10n.t('Password (optional)'),
    password: true,
    value: defaults?.password ?? '',
  })

  if (password === undefined) {
    return undefined
  }

  return {
    protocol,
    host,
    port: Number(portInput),
    username: username || undefined,
    password: password || undefined,
    clientId: defaults?.clientId ?? `vscode-mqtt-explorer-${Math.random().toString(16).slice(2, 8)}`,
  }
}

function defaultPortForProtocol(protocol: ConnectionOptions['protocol']): string {
  switch (protocol) {
    case 'mqtt':
      return '1883'
    case 'mqtts':
      return '8883'
    case 'ws':
      return '8083'
    case 'wss':
      return '8084'
    default:
      return '1883'
  }
}

function isProtocol(value: string): value is ConnectionOptions['protocol'] {
  return value === 'mqtt' || value === 'mqtts' || value === 'ws' || value === 'wss'
}

function getProfiles(context: vscode.ExtensionContext): ConnectionProfile[] {
  return context.globalState.get<ConnectionProfile[]>(CONNECTION_PROFILES_KEY) ?? []
}

async function connectWithOptions(
  context: vscode.ExtensionContext,
  mqttService: MqttService,
  options: ConnectionOptions
): Promise<void> {
  await mqttService.connect(options)
  await context.globalState.update(LAST_CONNECTION_KEY, options)
}

async function saveProfile(context: vscode.ExtensionContext, name: string, options: ConnectionOptions): Promise<void> {
  const profiles = getProfiles(context)
  const updatedProfiles = profiles.filter(profile => profile.name !== name)
  updatedProfiles.push({ name, options })
  await context.globalState.update(CONNECTION_PROFILES_KEY, updatedProfiles)
}

async function deleteProfile(context: vscode.ExtensionContext, name: string): Promise<void> {
  const profiles = getProfiles(context)
  const nextProfiles = profiles.filter(profile => profile.name !== name)
  await context.globalState.update(CONNECTION_PROFILES_KEY, nextProfiles)
}
