const { Kafka, CompressionTypes } = require('kafkajs')
const Bus = require('@servicebus/core')
const json = require('@servicebus/json-formatter')
const debug = require('debug')('servicebus-kafka')
const readableId = require('readable-id-mjs')
const topicConsumer = require('./topicConsumer')
const requiredParam = require('../lib/requiredParam')

class KafkaBus extends Bus {
  constructor ({
    brokers = ['localhost:9092'],
    serviceName = requiredParam('serviceName'),
    log = debug,
    ssl = false,
    sasl = false,
    connectionTimeout,
    port,
    host
  } = {}) {
    super({ log })

    log('creating kafkabus')

    Object.assign(this, {
      brokers,
      serviceName: `servicebus-${serviceName}`,
      log,
      // clientOptions,
      // correlator: new Correlator(options),
      formatter: json,
      initialized: false,
      topics: {
        command: {},
        event: {},
        topic: {}
      }
    })

    log('creating kafka client')

    this.kafka = new Kafka({
      clientId: this.serviceName,
      brokers,
      ssl,
      sasl,
      connectionTimeout,
      port,
      host
    })

    log('creating kafka producer')

    this.transactionalProducer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionalId: `${this.serviceName}-${readableId()}`
    })
    this.producer = this.kafka.producer()

    log('kafkabus constructed')
  }

  static init (options) {
    return (async function () {
      debug(`creating new KafkaBus instance with options`, options)
      let kafkaBus = new KafkaBus(options)
      kafkaBus.log('initializing kafkabus')
      // Do async stuff
      await kafkaBus.connect()
      kafkaBus.log('connected to producer')
      kafkaBus.log(kafkaBus.listen)

      kafkaBus.initialized = true
      // Return instance
      return kafkaBus
    })()
  }

  async connect () {
    const { log, producer } = this
    log('connecting to producer')
    try {
      await producer.connect()
    } catch (error) {
      log('ERROR CONNECTING TO PRODUCER')
      log(error)
      throw error
    }
  }

  async disconnect () {
    return await this.producer.disconnect()
  }

  async consume ({
    topicName = requiredParam('topicName'),
    messageType = 'topic',
    messageHandler = requiredParam('messageHandler'),
    callingFunction = 'consume',
    transaction = true,
    options
  }) {
    const bus = this
    const { log, client, topics, serviceName } = bus

    log(
      `${callingFunction} called - creating a consumer for ${messageType} "${topicName}"`
    )

    return new Promise(async (resolve, reject) => {
      let topic

      if (topics[messageType][topicName] === undefined) {
        log(`registering new consumer for ${messageType} ${topicName}`)
        try {
          topic = await topicConsumer({
            serviceName,
            topicName,
            bus,
            client,
            messageHandler,
            messageType,
            transaction,
            ...options
          })
        } catch (error) {
          log('error creating topicConsumer', error)
          throw error
        }

        topics[messageType][topicName] = topic
        log('topic registered', topicName)

        return resolve(topic)
      } else {
        return resolve(topics[messageType][topicName])
      }
    })
  }

  async listen (topicName, options = {}, messageHandler) {
    if (typeof options === 'function') {
      messageHandler = options
      options = {}
    }

    return this.consume({
      topicName,
      messageType: 'command',
      messageHandler,
      options,
      callingFunction: 'listen',
      transaction: options.transaction === false ? false : true
    })
  }

  async subscribe (topicName, options = {}, messageHandler) {
    if (typeof options === 'function') {
      messageHandler = options
      options = {}
    }

    return this.consume({
      topicName,
      messageType: 'event',
      messageHandler,
      options,
      callingFunction: 'subscribe',
      transaction: options.transaction === false ? false : true
    })
  }

  async produce ({
    topicName = requiredParam('topicName'),
    messageType = 'topic',
    message = requiredParam('message'),
    callingFunction = 'produce',
    options = {},
    transaction = true
  }) {
    const { log, producer, transactionalProducer } = this

    log(`${callingFunction} called - producing ${messageType} ${topicName}`)

    const sendTransactionalMessage = async function (
      topicName,
      message,
      options
    ) {
      const transaction = await transactionalProducer.transaction()

      try {
        log(
          `sending transactional message ${message.cid} to topic ${topicName}`,
          message,
          options
        )
        message.properties = options
        const { partitionKey = 'default' } = options
        let result = await transaction.send({
          topic: topicName,
          compression: CompressionTypes.GZIP,
          messages: [
            {
              key: `${partitionKey}-${messageType}`,
              value: JSON.stringify(message)
            }
          ]
        })

        await transaction.commit()
        log(`committed ${topicName} message ${message.cid}`)
        return result
      } catch (err) {
        await transaction.abort()
      }
    }

    const sendMessage = async function (topicName, message, options) {
      log(`sending message to topic ${topicName}`, message, options)
      message.properties = options
      const { partitionKey = 'default' } = options
      let result = await producer.send({
        topic: topicName,
        compression: CompressionTypes.GZIP,
        messages: [
          {
            key: `${partitionKey}-${messageType}`,
            value: JSON.stringify(message)
          }
        ]
      })

      return result
    }

    return this.handleOutgoing(
      topicName,
      message,
      options,
      transaction ? sendTransactionalMessage.bind(this) : sendMessage.bind(this)
    )
  }

  async send (topicName, message, options = {}) {
    return this.produce({
      topicName,
      messageType: 'command',
      message,
      options,
      transaction: options.transaction === false ? false : true
    })
  }

  async publish (topicName, message, options = {}) {
    return this.produce({
      topicName,
      messageType: 'event',
      message,
      options,
      transaction: options.transaction === false ? false : true
    })
  }

  async produceBatch (
    { topic, messages, messageType = 'topic' },
    options = {},
    callback
  ) {
    const { log, producer } = this

    log(`producing message on topic ${topic}`)

    let batchSize = messages.length
    let count = 0
    let batch = []
    let partitionKey = options.partitionKey

    const sendMessages = async function (topic, message, options) {
      count++

      let kafkaMessage = {
        key: `${partitionKey}-${messageType}`,
        value: JSON.stringify(message),
        headers: {
          'correlation-id': message.cid
        }
      }

      batch.push(kafkaMessage)

      if (count === batchSize) {
        log(`producer sending messages to topic ${topic}`)
        const topicMessages = [
          {
            topic,
            messages: batch
          }
        ]
        let result = await producer.sendBatch({
          topicMessages
        })

        return result
      }
    }

    messages.map(message => {
      this.handleOutgoing(topic, message, options, sendMessages.bind(this))
    })
  }
}

module.exports = async function kafkabus (options) {
  let kafkaBus = await KafkaBus.init(options)
  return kafkaBus
}
