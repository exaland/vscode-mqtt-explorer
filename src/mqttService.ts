import * as vscode from 'vscode'
import mqtt, { MqttClient } from 'mqtt'
import { ConnectionOptions, ConnectionState, MqttMessage } from './types'

export class MqttService implements vscode.Disposable {
  private client: MqttClient | undefined
  private isConnected = false

  private readonly onDidReceiveMessageEmitter = new vscode.EventEmitter<MqttMessage>()
  private readonly onDidChangeConnectionEmitter = new vscode.EventEmitter<ConnectionState>()
  private readonly onDidErrorEmitter = new vscode.EventEmitter<Error>()

  public readonly onDidReceiveMessage = this.onDidReceiveMessageEmitter.event
  public readonly onDidChangeConnection = this.onDidChangeConnectionEmitter.event
  public readonly onDidError = this.onDidErrorEmitter.event

  public async connect(options: ConnectionOptions): Promise<void> {
    if (this.client) {
      this.disconnect()
    }

    const brokerUrl = `${options.protocol}://${options.host}:${options.port}`
    this.onDidChangeConnectionEmitter.fire({
      connected: false,
      detail: vscode.l10n.t('Connecting to {0}...', brokerUrl),
    })

    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(brokerUrl, {
        username: options.username,
        password: options.password,
        clientId: options.clientId,
        clean: true,
        reconnectPeriod: 2000,
        connectTimeout: 10000,
      })

      this.client = client

      const onConnect = () => {
        this.isConnected = true
        this.onDidChangeConnectionEmitter.fire({
          connected: true,
          detail: vscode.l10n.t('Connected to {0}', brokerUrl),
        })

        client.subscribe('#', { qos: 0 }, error => {
          if (error) {
            this.onDidErrorEmitter.fire(error)
          }
        })

        cleanup()
        resolve()
      }

      const onError = (error: Error) => {
        this.onDidErrorEmitter.fire(error)
        cleanup()
        reject(error)
      }

      const cleanup = () => {
        client.off('connect', onConnect)
        client.off('error', onError)
      }

      client.once('connect', onConnect)
      client.once('error', onError)

      client.on('reconnect', () => {
        this.onDidChangeConnectionEmitter.fire({
          connected: false,
          detail: vscode.l10n.t('Reconnecting...'),
        })
      })

      client.on('close', () => {
        this.isConnected = false
        this.onDidChangeConnectionEmitter.fire({
          connected: false,
          detail: vscode.l10n.t('Disconnected'),
        })
      })

      client.on('message', (topic, payload, packet) => {
        const payloadAsString = payload.toString('utf8')
        this.onDidReceiveMessageEmitter.fire({
          topic,
          payload: payloadAsString,
          timestamp: Date.now(),
          qos: (packet.qos ?? 0) as 0 | 1 | 2,
          retain: packet.retain ?? false,
        })
      })

      client.on('error', error => {
        this.onDidErrorEmitter.fire(error)
      })
    })
  }

  public disconnect(): void {
    if (!this.client) {
      return
    }

    this.client.end(true)
    this.client.removeAllListeners()
    this.client = undefined
    this.isConnected = false
    this.onDidChangeConnectionEmitter.fire({
      connected: false,
      detail: vscode.l10n.t('Disconnected'),
    })
  }

  public publish(topic: string, payload: string, qos: 0 | 1 | 2, retain: boolean): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error(vscode.l10n.t('The MQTT client is not connected.'))
    }

    return new Promise((resolve, reject) => {
      this.client?.publish(topic, payload, { qos, retain }, error => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  public dispose(): void {
    this.disconnect()
    this.onDidReceiveMessageEmitter.dispose()
    this.onDidChangeConnectionEmitter.dispose()
    this.onDidErrorEmitter.dispose()
  }
}
