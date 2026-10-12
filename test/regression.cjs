const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const Module = require('node:module')
const clients = []
const panels = []
class Client extends EventEmitter {
  subscribe() { this.subscriptions = (this.subscriptions || 0) + 1 }
  publish(topic, payload, options, callback) { callback() }
  end() { this.ended = true }
}
const originalLoad = Module._load
Module._load = function (id, ...args) {
  if (id === 'vscode') return {
    EventEmitter: class {
      emitter = new EventEmitter()
      event = listener => { this.emitter.on('event', listener); return { dispose: () => this.emitter.off('event', listener) } }
      fire(value) { this.emitter.emit('event', value) }
      dispose() { this.emitter.removeAllListeners() }
    },
    TreeItem: class { constructor(label) { this.label = label } },
    TreeItemCollapsibleState: { Collapsed: 1, None: 0 },
    l10n: { t: (text, ...values) => text.replace(/\{(\d+)\}/g, (_, i) => values[i]) },
    env: { language: 'fr' },
    ViewColumn: { Beside: 2 },
    window: { createWebviewPanel: () => {
      const panel = { webview: { html: '' }, onDidDispose() {}, reveal() {}, dispose() {} }
      panels.push(panel)
      return panel
    } },
  }
  if (id === 'mqtt') return { connect: () => { const client = new Client(); clients.push(client); return client } }
  return originalLoad.call(this, id, ...args)
}
const { MqttService } = require('../out/mqttService')
const { TopicTreeProvider } = require('../out/topicTreeProvider')
const { LiveTopicPanel } = require('../out/liveTopicPanel')
const { validateTopicName } = require('../out/topicValidation')
Module._load = originalLoad
const options = { protocol: 'mqtt', host: 'localhost', port: 1883 }

test('reconnect restores publishing and subscribes again', async () => {
  const service = new MqttService()
  const pending = service.connect(options)
  const client = clients.at(-1)
  client.emit('connect')
  await pending
  client.emit('close')
  assert.throws(() => service.publish('a', 'b', 0, false), /not connected/)
  client.emit('reconnect')
  client.emit('connect')
  await service.publish('a', 'b', 0, false)
  assert.equal(client.subscriptions, 2)
  service.dispose()
})

test('disconnect settles pending connection; initial errors stop retrying', async () => {
  const service = new MqttService()
  const pending = service.connect(options)
  service.disconnect()
  await assert.rejects(pending, /cancelled/)
  const failed = service.connect(options)
  const client = clients.at(-1)
  client.emit('error', new Error('refused'))
  await assert.rejects(failed, /refused/)
  assert.equal(client.ended, true)
  service.dispose()
})

test('empty topic levels stay distinct in lookups and exported tree', () => {
  const tree = new TopicTreeProvider()
  const topics = ['sensor', '/sensor', 'sensor/', 'sensor//value', 'sensor/value', '/']
  for (const topic of topics) tree.upsertMessage({ topic, payload: topic, timestamp: 0, qos: 0, retain: false })
  for (const topic of topics) assert.equal(tree.getLatestMessage(topic).payload, topic)
  const exported = []
  const visit = items => items.forEach(item => { if (item.payload !== undefined) exported.push(item.topic); visit(item.children) })
  visit(tree.getTopicsAsItems())
  assert.deepEqual(exported.sort(), topics.sort())
  tree.dispose()
})

test('message bursts produce one refresh and clear cancels pending refresh', async () => {
  const tree = new TopicTreeProvider()
  let refreshes = 0
  tree.onDidChangeTreeData(() => refreshes++)
  for (let i = 0; i < 100; i++) tree.upsertMessage({ topic: 'a', payload: String(i), timestamp: 0, qos: 0, retain: false })
  assert.equal(refreshes, 0)
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(refreshes, 1)
  assert.equal(tree.getLatestMessage('a').payload, '99')
  tree.upsertMessage({ topic: 'b', payload: '', timestamp: 0, qos: 0, retain: false })
  tree.clear()
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(refreshes, 2)
  assert.deepEqual(tree.getChildren(), [])
  tree.dispose()
})

test('publication rejects invalid topic names before sending to the broker', async () => {
  const service = new MqttService()
  const pending = service.connect(options)
  clients.at(-1).emit('connect')
  await pending
  for (const topic of ['', 'a/+', '#', 'a\u0000b', 'é'.repeat(32768)]) {
    assert.ok(validateTopicName(topic))
    assert.throws(() => service.publish(topic, '', 0, false))
  }
  for (const topic of [' ', '/', 'a//b/', 'é'.repeat(32767)]) {
    assert.equal(validateTopicName(topic), undefined)
    await service.publish(topic, '', 0, false)
  }
  service.dispose()
})

test('events already queued by an old client cannot affect a new connection', async () => {
  const service = new MqttService()
  const first = service.connect(options)
  const oldClient = clients.at(-1)
  oldClient.emit('connect')
  await first
  const staleClose = oldClient.listeners('close')[0]
  const staleMessage = oldClient.listeners('message')[0]
  const second = service.connect(options)
  clients.at(-1).emit('connect')
  await second
  let messages = 0
  service.onDidReceiveMessage(() => messages++)
  staleClose()
  staleMessage('old/topic', Buffer.from('old'), { qos: 0 })
  assert.equal(messages, 0)
  await service.publish('new/topic', 'new', 0, false)
  service.dispose()
})

test('live panel formats JSON, escapes payloads and resets previous broker data', () => {
  const live = new LiveTopicPanel()
  live.open('sensor')
  const panel = panels.at(-1)
  const message = { topic: 'sensor', payload: '{"value":"<script>"}', qos: 1, retain: false, timestamp: 0 }
  live.update(message)
  assert.ok(panel.webview.html.includes('\n  &quot;value&quot;: &quot;&lt;script&gt;&quot;\n'))
  live.update({ ...message, topic: 'other', payload: 'ignored' })
  assert.ok(!panel.webview.html.includes('ignored'))
  live.update({ ...message, payload: 'plain <text>' })
  assert.ok(panel.webview.html.includes('plain &lt;text&gt;'))
  live.reset()
  assert.ok(!panel.webview.html.includes('plain &lt;text&gt;'))
  assert.ok(panel.webview.html.includes('No message received'))
  live.dispose()
})
