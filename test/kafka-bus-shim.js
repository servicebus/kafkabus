require('should');
require('longjohn');
let log = require('debug')('servicebus')
let { connectionOpts } = require('../testHelpers')

// if ( ! process.env.KAFKA_HOSTS)
//   throw new Error('Tests require a KAFKA_HOSTS environment variable to be set, pointing to the Kafka instance you wish to use.');

// var brokers = process.env.KAFKA_HOSTS;
var retry = require('servicebus-retry');

let kafkaBus = require('../').bus

var store = new retry.RedisStore({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

module.exports = async function () {
  let bus 
  
  try {
    bus = await kafkaBus({
      ...connectionOpts(),
      brokers: ['localhost:9093', 'localhost:9095', 'localhost:9097'],
      serviceName: 'test',
    });
  } catch (e) {
    throw e
  }

  log('applying middleware')

  log(bus)

  // bus.use(bus.messageDomain());
  bus.use(bus.package());
  bus.use(bus.correlate());
  // bus.use(bus.logger());
  bus.use(retry({
    setRetriesRemaining: true,
    store,
    keyExpireTTL: 0
  }))

  return bus
};