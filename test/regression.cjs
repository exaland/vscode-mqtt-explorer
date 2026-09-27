const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const Module = require('node:module')
const clients = []
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
  }
  if (id === 'mqtt') return { connect: () => { const client = new Client(); clients.push(client); return client } }
  return originalLoad.call(this, id, ...args)
}
const { MqttService } = require('../out/mqttService')
const { TopicTreeProvider } = require('../out/topicTreeProvider')
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
