const EventEmitter = require('events').EventEmitter;
const readableId = require('readable-id-mjs');
const util = require('util');
const correlate = require('@servicebus/bus/bus/middleware/correlate');
const messageDomain = require('@servicebus/bus/bus/middleware/messageDomain');
const logger = require('@servicebus/bus/bus/middleware/logger');
const packageMiddleware = require('@servicebus/bus/bus/middleware/package');
const retry = require('@servicebus/bus/bus/middleware/retry');

class Bus extends EventEmitter {
  constructor({
    log
  }) {
    super()
    this.incomingMiddleware = [];
    this.outgoingMiddleware = [];
    this.setMaxListeners(Infinity);
    this.correlate = correlate
    this.messageDomain = messageDomain
    this.logger = logger
    this.package = packageMiddleware
    this.retry = retry
  }

  use(middleware) {
    if (middleware.handleIncoming) this.incomingMiddleware.push(middleware.handleIncoming);
    if (middleware.handleOutgoing) this.outgoingMiddleware.push(middleware.handleOutgoing);
    return this;
  };
  
  handleIncoming (/* channel, message, options, callback */) {
    var index = this.incomingMiddleware.length - 1;
    var self = this;
  
    var args = Array.prototype.slice.call(arguments);
  
    var callback = args.pop();
  
    function next (err) {
      if (err) return callback(err);
  
      var layer;
      var args = Array.prototype.slice.call(arguments, 1);
  
      layer = self.incomingMiddleware[index];
  
      index = index - 1;
  
      if ( undefined === layer) {
        return callback.apply(self, args);
      } else {
        args.push(next);
        return layer.apply(self, args);
      }
    }
  
    args.unshift(null);
  
    return next.apply(this, args);
  };
  
  handleOutgoing (queueName, message, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }
  
    var index = 0;
    var self = this;
  
  
    function next (err) {
      if (err) return callback(err);
  
      var layer;
      var args = Array.prototype.slice.call(arguments, 1);
  
      layer = self.outgoingMiddleware[index];
  
      index++;
  
      if ( undefined === layer) {
        return callback.apply(self, args);
      } else  {
        args.push(next);
        return layer.apply(self, args);
      }
    }
  
    return next(null, queueName, message, options);
  };
  
  correlationId (forceNew) {
    if (process.domain && process.domain.correlationId && ! forceNew) {
      return process.domain.correlationId;
    }
    return readableId();
  };

  createCorrelationId (forceNew) {
    return this.correlationId(forceNew)
  }
  
}

module.exports = Bus;
