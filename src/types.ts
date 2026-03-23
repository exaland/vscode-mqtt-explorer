export interface MqttMessage {
  topic: string
  payload: string
  timestamp: number
  qos: 0 | 1 | 2
  retain: boolean
}

export interface ConnectionOptions {
  protocol: 'mqtt' | 'mqtts' | 'ws' | 'wss'
  host: string
  port: number
  username?: string
  password?: string
  clientId?: string
}

export interface ConnectionProfile {
  name: string
  options: ConnectionOptions
}

export interface ConnectionState {
  connected: boolean
  detail: string
}
