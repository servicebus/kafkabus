const log = require('debug')('servicebus:test')
const kafkabus = require('./kafka-bus-shim')

describe('kafka servicebus', function () {
  describe('#send & #listen', function () {
    it('should cause message to be received by listen', async function () {
      return new Promise(async (resolve, reject) => {
        let bus = await kafkabus()
        this.timeout(30000)
        log('bus.listen', bus.listen)
        let listener = await bus.listen('my.event.1', function (event) {
          console.log('event data', event.data)
          resolve(true)
        })
        await bus.send('my.event.1', { my: 'event' })
      })
    })

    // TODO: each could be created with different consumer group - but is that really what we want?
    // messages ARE NOT distributed in the same way as rmq so I don't think this really makes sense
    // the way to distribute to multiple listeners is having multiple partitions
    // xit('should distribute out to subsequent listeners when multiple listening', async function (){
    //   return new Promise(async (resolve, reject) => {
    //     let bus = await kafkabus()
    //     this.timeout(30000);
    //     var count = 0
    //     var results = []
    //     function tryDone(){
    //       count++;
    //       if (count === 4) {
    //         expect(results).to.equal([1,2,3,4])
    //         resolve(true);
    //       }
    //     }
    //     await bus.listen('my.event.2', function (event) {
    //       results.push(1)
    //       console.log(1)
    //       tryDone();
    //     });
    //     await bus.listen('my.event.2', function (event) {
    //       results.push(2)
    //       console.log(2)
    //       tryDone();
    //     });
    //     await bus.listen('my.event.2', function (event) {
    //       results.push(3)
    //       console.log(3)
    //       tryDone();
    //     });
    //     await bus.listen('my.event.2', function (event) {
    //       results.push(4)
    //       console.log(4)
    //       tryDone();
    //     });

    //     await bus.send('my.event.2', { my: 'event' });
    //     await bus.send('my.event.2', { my: 'event' });
    //     await bus.send('my.event.2', { my: 'event' });
    //     await bus.send('my.event.2', { my: 'event' });
    //   })
    // });

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

    // it.only('can handle higher event throughput with batch produce', async function (){
    //   return new Promise(async (resolve, reject) => {
    //     let bus = await kafkabus()
    //     let time = 30000
    //     this.timeout(time);
    //     setTimeout(() => {
    //       console.log(`processed ${count} messages`)
    //     }, time - 100)
    //     var count = 0, endCount = 24000;
    //     function tryDone(){
    //       count++;
    //       if (count >= endCount) {
    //         console.log(`processed ${count} messages`)
    //         resolve();
    //       }
    //     }
    //     var i = 0;
    //     await bus.listen('my.event.3', function (event) {
    //       tryDone();
    //     });
    //     let batch = []
    //     for(var i = 0; i <= endCount; ++i) {
    //       let event = { topic: 'my.event.3', payload: { my: 'event' }};
    //       batch.push(event)
    //     }
    //     await bus.sendBatch(batch)
    //   })
    // });

    // TODO: KafkaBus autoacks, so need to revist this - also destroyListener is not implemented yet
    // it('sends subsequent messages only after previous messages are acknowledged', async function (){
    //   return new Promise(async (resolve, reject) => {
    //     let bus = await kafkabus()
    //     this.timeout(90000);
    //     var count = 0;
    //     var interval = setInterval(function checkDone () {
    //       if (count === 4) {
    //         clearInterval(interval);
    //         bus.destroyListener('my.event.4').on('success', function () {
    //           resolve();
    //         });
    //       }
    //     }, 10);
    //     await bus.listen('my.event.4', function (event) {
    //       count++;
    //       event.handle.ack();
    //     });
    //     setTimeout(function () {
    //       await bus.send('my.event.4', { my: Math.random() });
    //       await bus.send('my.event.4', { my: Math.random() });
    //       await bus.send('my.event.4', { my: Math.random() });
    //       await bus.send('my.event.4', { my: Math.random() });
    //     }, 10);
    //   })
    // });

    // TODO: enableConfirms not implemented
    // it.skip('should use callback in confirm mode', function (done) {
    //   confirmBus.send('my.event.19', { my: 'event' }, {}, function (err, ok) {
    //     done(err);
    //   });
    // });

    // it.skip('should use callback in confirm mode with options supplied', function (done) {
    //   confirmBus.send('my.event.19', { my: 'event' }, function (err, ok) {
    //     done(err);
    //   });
    // });

    // it.skip('should throw error when using callback and not confirmsEnabled', function (done) {
    //   bus.send('my.event.15', { my: 'event' }, function (err, ok) {
    //     err.should.not.eql(null);
    //     err.message.should.eql('callbacks only supported when created with bus({ enableConfirms:true })');
    //     done();
    //   });
    // });

    it('should allow ack:true', async function () {
      return new Promise(async (resolve, reject) => {
        let bus = await kafkabus()
        await bus.listen('my.event.25', { ack: true }, function (msg, message) {
          log('msg')
          log(msg)
          log('message')
          log(message)

          msg.handle.ack()

          resolve()
        })
        setTimeout(async function () {
          await bus.send(
            'my.event.25',
            { payload: 'test' },
            { ack: true, correlationId: 'test-id' }
          )
        }, 100)
      })
    })
  })

  //   describe('#unlisten', function() {

  //     it('should cause message to not be received by listen', function (done){
  //       var completed = false;
  //       function tryDone () {
  //         if (completed) return true;
  //         completed = true;
  //         done();
  //       }
  //       bus.listen('my.event.17', function (event) {
  //         tryDone(new Error('should not receive events after unlisten'));
  //       });
  //       setTimeout(function () {
  //         bus.unlisten('my.event.17').on('success', function () {
  //           bus.send('my.event.17', { test: 'data'});
  //           setTimeout(function () {
  //             tryDone();
  //           }, 100);
  //         });
  //       }, 1500);
  //     });

  //   });

  //   describe('#destroyListener', function() {

  //     it('should cause message to not be received by listen', function (done){
  //       var completed = false;
  //       function tryDone () {
  //         if (completed) return true;
  //         completed = true;
  //         done();
  //       }
  //       bus.listen('my.event.18', { ack: true }, function (event) {
  //         event.handle.ack();
  //         tryDone(new Error('should not receive events after destroy'));
  //       });
  //       // setTimeout(function () {
  //         bus.destroyListener('my.event.18').on('success', function () {
  //           bus.send('my.event.18', { test: 'data'}, { ack: true, expiration: 100 });
  //           setTimeout(tryDone, 100);
  //         });
  //       // }, 1500);
  //     });

  //   });
})
