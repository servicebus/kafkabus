var noop = function () {};
var log = require('debug')('servicebus:test');
const kafkabus = require('./kafka-bus-shim');

// the following code is being used in the above shim
// var pack = require('../../bus/middleware/package');

// bus.use(pack());

describe('kafka properties', function() {

  it('should add a properties property in message if an options is passed as third argument in producers', async function () {
    return new Promise(async (resolve, reject) => {
      let bus = await kafkabus()
      this.timeout(30000);

      await bus.listen('my.message.props.1', function (msg, message) {
        log('msg')
        log(msg)
        log('message')
        log(message)
        message.should.have.property('properties');
        message.properties.should.have.property('correlationId', 'test-value');
        resolve();
      });

      setTimeout(async function () {
        await bus.send('my.message.props.1', { my: 'message' }, { correlationId: 'test-value' });
      }, 1000);
    })
    
  });

  it('should add a headers property in message if an options is passed as third argument in producers', async function () {
    return new Promise(async (resolve, reject) => {
      let bus = await kafkabus()
      this.timeout(30000);

      await bus.listen('my.message.props.2', function (msg, message) {
        message.should.have.property('properties');
        message.properties.should.have.property('headers');
        message.properties.headers.should.have.property('audit', 'value');
        resolve();
      });
      setTimeout(async function () {
        bus.send('my.message.props.2', { my: 'message' }, { headers: { audit: 'value', sub: { doc: 'ument' } } });
      }, 1000);
    })
  });

  it('should have access to properties and headers in middleware', async function () {

    return new Promise(async (resolve, reject) => {
      let bus = await kafkabus()
      this.timeout(30000);

      bus.use({
        handleOutgoing: function (queueName, event, options) {
          options.should.have.property('headers');
          options.headers.should.have.property('audit', 'value');
          resolve();
        }
      });

      setTimeout(function () {
        bus.send('my.message.props.3', { my: 'message' }, { headers: { audit: 'value', sub: { doc: 'ument' } } });
      }, 1000);

    })
  })
})