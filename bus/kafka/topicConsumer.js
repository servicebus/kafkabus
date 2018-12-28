const { EventEmitter } = require('events')
const requiredParam = require('../lib/requiredParam')

class TopicConsumer extends EventEmitter {
  constructor({
    topicName = requiredParam('topicName'),
    bus = requiredParam('bus'),
    messageHandler = requiredParam('messageHandler'),
    messageType = requiredParam('messageType')
  } = {}) {
    super()

    const self = this
    const { log, kafka, serviceName } = bus

    let groupId = `${serviceName}-${topicName}-${messageType}-consumer`

    Object.assign(this, {
      topicName,
      bus,
      messageHandler,
      log,
      groupId,
      messageType
    })

    log(`new consumer for topic ${topicName} with consumer group id ${groupId}`)

    this.consumer = kafka.consumer({
      groupId
    })
  }

  static init (options) {
    return (async function () {
      let topicConsumer = new TopicConsumer(options)
      // Do async stuff
      await topicConsumer.connect()
      await topicConsumer.subscribe()
      await topicConsumer.run()
      // Return instance

      topicConsumer.initialized = true
      return topicConsumer
    }())
  }

  async connect () {
    try {
      return await this.consumer.connect()
    } catch (error) {
      log('kafka consumer - error connecting', error)
      throw error
    }
  }

  async disconnect () {
    try {
      return await this.consumer.disconnect()
    } catch (error) {
      log('kafka consumer - error disconnecting', error)
      throw error
    }
  }
  
  // TODO: partition option
  async subscribe () {
    const { consumer, bus } = this
    const { log } = bus
    log(`consumer subscribing to topic ${this.topicName}`)
    try {
      await consumer.subscribe({ topic: this.topicName })
    } catch (error) {
      log('kafka consumer - error subscribing to topic', error)
      throw error
    }
    log(`consumer has subscribed to topic ${this.topicName}`)
  }

  async run () {
    const { consumer, bus, messageHandler } = this
    const { handleIncoming, log } = bus
    log(`starting consumer processing`)
    try {
      await consumer.run({
        eachMessage: ({ topic, partition, message }) => {
          log(`handling incoming message on topic ${topic} on partion ${partition}`, message)
          message.content = JSON.parse(message.value && message.value.toString())

          const options = {}
          if (message.content.properties && message.content.properties.ack) options.ack = true
          // log({ message })
          handleIncoming.call(
            bus,
            consumer, 
            message, 
            options, 
            function (consumer, message, options) {
              try {
                
                let { properties } = message.content
                // delete messageData.properties
                // log('messageData:', messageData)
                messageHandler(message.content, { properties });
              } catch (err) {
                log('Error handling message')
                throw err
              }
            }
          )
        }
      })
    } catch (error) {
      log('kafka consumer - error running', error)
      throw error
    }
    log('consumer processing has started')
  }
}

module.exports = async function topicConsumer (options) {
  let topic = await TopicConsumer.init(options)
  return topic
}
