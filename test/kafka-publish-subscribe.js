const kafkabus = require('./kafka-bus-shim');
const log = require('debug')('servicebus:test')

describe('kafka servicebus', function(){

  describe('#publish & #subscribe', function(){

    it('should cause message to be received by subscribe', async function (){

      return new Promise(async (resolve, reject) => {
        let bus = await kafkabus()
        this.timeout(30000);

        await bus.subscribe('my.event.11', function (event) {
          log(event)
          event.should.have.property('data')
          event.data.should.have.property('my')
          event.should.have.property('type')
          event.should.have.property('cid')
          event.should.have.property('datetime')
          resolve(true);
        });
        setTimeout(async function () {
          await bus.publish('my.event.11', { my: 'event' });
        }, 100);
      })  

    });
    
    it('should be received by multiple subscribers', async function (){

      return new Promise(async (resolve, reject) => {
        let bus = await kafkabus()
        let bus2 = await kafkabus({ serviceName: 'test2' })
        this.timeout(60000);
        let done1, done2

        const checkDone = () => {
          if (done1 && done2) {
            resolve(true);
          }
        }

        await bus.subscribe('my.event.12', function (event) {
          log(event)
          done1 = true
          log('done 1')
          checkDone()
        });
        await bus2.subscribe('my.event.12', function (event) {
          log(event)
          done2 = true
          log('done 2')
          checkDone()
        });

        setTimeout(async function () {
          await bus.publish('my.event.12', { my: 'event' });
        }, 100);
      })  

    });
	});
});
