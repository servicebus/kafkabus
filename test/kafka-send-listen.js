const log = require('debug')('servicebus:test')
const kafkabus = require('./kafka-bus-shim')

describe('kafka servicebus', function () {
  describe('#send & #listen', function () {
    it('should cause message to be received by listen', async function () {
      return new Promise(async (resolve, reject) => {
        let bus = await kafkabus()
        this.timeout(30000)
        log('bus.listen', bus.listen)
        await bus.listen('my.event.1', function (event) {
          console.log('event data', event.data)
          resolve(true)
        })
        await bus.send('my.event.1', { my: 'event' })
      })
    })
    it('should cause message to be received by listen without transactions', async function () {
      return new Promise(async (resolve, reject) => {
        let bus = await kafkabus()
        this.timeout(30000)
        log('bus.listen', bus.listen)
        await bus.listen('my.event.2', { transaction: false }, function (event) {
          console.log('event data', event.data)
          resolve(true)
        })
        await bus.send('my.event.2', { transaction: false }, { my: 'event' })
      })
    })

    it('can handle high event throughput without transactions', async function () {
      return new Promise(async (resolve, reject) => {
        let bus = await kafkabus()
        let time = 30000
        this.timeout(time)
        setTimeout(() => {
          console.log(`processed ${count} messages`)
        }, time - 100)
        var count = 0,
          batchSize = 2000,
          repeatBatch = 5
        function tryDone () {
          count++
          if (count >= batchSize * repeatBatch) {
            console.log(`processed ${count} messages`)
            resolve()
          }
        }

        await bus.listen('my.command.3', { transaction: false }, function (
          event
        ) {
          tryDone()
        })

        var i = 0
        var messages = []
        for (var i = 0; i < batchSize; ++i) {
          messages.push({ my: 'event' })
        }

        for (var r = 0; r < repeatBatch; ++r) {
          log('sending batch', r)
          await bus.produceBatch({
            topic: 'my.command.3',
            messages,
            messageType: 'command'
          })
        }
      })
    })
  })
})
