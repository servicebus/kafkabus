const log = require('debug')('servicebus:test')
const kafkabus = require('./kafka-bus-shim')

let timeout = 60000

describe('kafka servicebus', function () {
  describe('#send & #listen', function () {
    it('should cause message to be received by listen', async function () {
      return new Promise(async (resolve, reject) => {
        let bus = await kafkabus()
        const data = { my: 'event' }
        this.timeout(timeout)
        log('bus.listen', bus.listen)
        await bus.listen('my.command.1', function (event, message, done, fail) {
          console.log(event.data.should)
          console.log(arguments)
          event.data.my.should.be.equal(data.my)
          done()
          resolve(true)
        })
        await bus.send('my.command.1', data)
      })
    })
    it('can handle high event throughput without transactions', async function () {
      return new Promise(async (resolve, reject) => {
        let bus = await kafkabus()
        // starting consumer takes longest - once it's going it is very fast
        this.timeout(timeout)
        setTimeout(() => {
          console.log(`processed ${count} messages`)
        }, timeout - 100)
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
          event,
          message
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
