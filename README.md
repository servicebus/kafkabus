[![Build Status](https://travis-ci.com/servicebus/kafkabus.svg?branch=master)](https://travis-ci.com/servicebus/kafkabus)

# servicebus

> NOTE: The Kafka version is still in development. If you want a stable servicebus now, check out rabbitbus. It's been used in production to process billions of dollars in transactions in trading systems.

Simple service bus for sending events between processes using kafka.

`@servicebus` is a collection of components made for building distributed systems, and as such, some of the tools exist to help implement patterns such as CQRS (see more below).

You can use servicebus `send/listen` for one to one messaging, or `publish/subscribe` for one to many messaging.

## Send / Listen

Servicebus allows simple sending and recieving of messages in a 1:1 sender:listener configuration. The following two processes will send an event message called 'my.event' every second from process A to process B via RabbitMQ and print out the sent event:

Process A:
```js
var bus = require('servicebus').bus();
bus.listen('my.event', function (event) {
  console.log(event);
});
```
Process B:
```js
var bus = require('servicebus').bus();

setInterval(function () {
  bus.send('my.event', { my: 'event' });
}, 1000);
```
### Round-Robin Load Distribution

Simply running multiple versions of Process A, above, will cause servicebus to distribute sent messages evenly accross the list of listeners, in a round-robin pattern. 

### Message Acknowledgement

(Note: message acking requires use of the https://github.com/mateodelnorte/servicebus-retry middleware)

When using servicebus-retry with kafka, each message will be tracked in Redis or InMemory and given individual ack's to denote a message has been processed successfully.

Messages can be acknowledged or rejected with the following syntax. To use ack and reject, it must be specified when defining the listening function: 

```js
bus.listen('my.event', { ack: true }, function (event) {
  event.handle.acknowledge(); // acknowledge a message
  event.handle.ack(); // short hand is also available
  event.handle.reject(); // reject a message
});
```

Message acknowledgement is suited for use in load distribution scenarios. 

## Authentication

TODO: Kafka auth config

## Publish / Subscribe

Servicebus can also send messages from 1:N processes in a fan-out architecture. In this pattern, one sender publishes a message and any number of subscribers can receive. The pattern for usage looks very similar to send/listen:

Process A (can be run any number of times, all will receive the event):
```js
var bus = require('servicebus').bus();
bus.subscribe('my.event', function (event) {
  console.log(event);
});
```
Process B:
```js    
var bus = require('servicebus').bus();

setInterval(function () {
  bus.publish('my.event', { my: 'event' });
}, 1000);
```    
### Topic Routing

TODO

To use topic routing to accept multiple events in a single handler, use publish and subscribe and the following syntax:
  
  ```js
  bus.publish('event.one', { event: 'one' });
  bus.publish('event.two', { event: 'two' });
  ```
  and for the listener...
  ```js
  bus.subscribe('event.*', function (msg) ...
  ```

## Middleware

Servicebus allows for middleware packages to enact behavior at the time a message is sent or received. They are very similar to connect middleware in their usage: 

```js
  if ( ! process.env.RABBITMQ_URL)
    throw new Error('Tests require a RABBITMQ_URL environment variable to be set, pointing to the RabbiqMQ instance you wish to use.');

  var busUrl = process.env.RABBITMQ_URL

  var bus = require('../').bus({ url: busUrl });

  bus.use(bus.package());
  bus.use(bus.correlate());
  bus.use(bus.logger());

  module.exports.bus = bus;
```

Middleware may define one or two functions to modify incoming or outgoing messages:

```js
...

  function logIncoming (queueName, message, options, next) {
    log('received ' + util.inspect(message));
    next(null, queueName, message, options);
  }

  function logOutgoing (queueName, message, options, next) {    
    log('sending ' + util.inspect(message));
    next(null, queueName, message, options);
  }

  return {
    handleIncoming: logIncoming,
    handleOutgoing: logOutgoing
  };
```

`handleIncoming` pipelines behavior to be enacted on an incoming message. `handleOutgoing` pipelines behavior to be enacted on an outgoing message. To say that the behavior is pipelined is to say that each middleware is called in succession, allowing each to enact its behavior before the next. (in from protocol->servicebus->middleware 1->middleware 2->servicebus->user code)

## Official Middleware

### Correlate

Correlate simply adds a .cid (Correlation Identity) property to any outgoing message that doesn't already have one. This is useful for following messages in logs across services.

[Correlate Middleware - View on GitHub](https://github.com/servicebus/correlate)

### Logger

Logger ensures that incoming and outgoing messages are logged to stdout via the debug module. (Use this in non-high throughput scenarios, otherwise you'll have some very quickly growing logs)

[Logger Middleware - View on GitHub](https://github.com/servicebus/logger)

### Package

Package repackages outgoing messages, encapsulating the original message as a .data property and adding additional properties for information like message type and datetime sent: 

```js
  // bus.publish('my:event', { my: 'event' });
  {
    my: 'event'
  };
```
becomes
```js
  {
    data: {
      my: 'event'
    }
    , datetime: 'Wed, 04 Sep 2013 19:31:11 GMT'
    , type: 'my:event'
  };
```

[Package Middleware - View on GitHub](https://github.com/servicebus/package)

### Retry

Retry provides ability to specify a max number of times an erroring message will be retried before being placed on an error queue. The retry middleware requires the correlate middleware. 

[Retry Middleware - View on GitHub](https://github.com/servicebus/retry)

## CQRS/ES and servicebus-register-handlers

[register-handlers](https://github.com/servicebus/register-handlers) is a package that allows you to register and entire folder of handlers at once. It also contains some syntactical sugar for use in CQRS systems, allowing you to easy create command handlers and event handlers by simply creating a folder of handlers, and providing `register-handlers` with that folder name.

```javascript
await registerHandlers({
  bus,
  path: path.resolve(process.cwd(), 'handlers'),
  queuePrefix
})
```

If using ES Modules, set `modules: true`.

```javascript
await registerHandlers({
  bus,
  path: path.resolve(process.cwd(), 'handlers'),
  modules: true,
  queuePrefix
})
```

### Example Command Handler

To use a command handler you must export a `command` string, and a `function` named `listen`.

```javascript
import log from 'llog'
import { TodoList } from '../lib/models/TodoList'
import { todoListRepository } from '../lib/repos/todoListRepository.mjs'

export const command = 'list.item.add'

log.info({ msg: `registering ${command}`, command })

//
// WARNING: You can not use an () => {} function here, because the context
// that contains the bus will not be bound properly!
//
export const listen = async function ({ type, data, datetime }, done) {
  try {
    const { bus } = this
    const { todoListId, item } = data
    const { todo, complete } = item

    if (!todoListId) throw new Error(`${command} - todoListId must be defined!`)

    // JSON logging
    // Great for filtering in Kibana
    log.info({ msg: `executing listen handler for ${command}`, command, todo, complete, type, datetime })

    // do something, if it's a model, probably with a repository pattern
    //  * I'm using sourced, and sourced-repo-mongo in this example

    let todoList

    try {
      todoList = await todoListRepository.getAsync(todoListId)
    } catch (err) {
      log.error('Error calling todoListRepository.getAsync')
      log.error(err)
      throw new Error({ name: 'ERROR_GET_ASYNC' })
    }

    if (!todoList) {
      todoList = new TodoList()

      todoList.initialize({
        id: todoListId
      })
    }

    todoList.addItem(item)
    todoList.on('item.added', () => {
      bus.publish('list.item.added', item)
      log.info({ msg: 'list.item.added', item })
      done()
    })

    await todoListRepository.commitAsync(todoList)

  } catch (err) {
    log.error(err)
    done(`Command Handler Failed for ${command} - ${err}`)
  }
}

// meanwhile... in another service...
//
// bus.send('list.item.add', {
//   item: {
//     todo: "Make this",
//     complete: false
//   }
// })
//
//
```

### Example Event Handler

To use an event handler you must export a `event` string, and a function named `subscribe`.

```javascript
import log from 'llog'

export const event = 'list.item.added'

log.info({ msg: `registering ${event}`, event })

export const subscribe = function ({ type, datetime, data }, done) {
  const { item } = data
  const { todo, complete } = item

  log.info({ msg: `executing listen handler for ${event}`, event, todo, complete, type, datetime })
  // do something
  done()
}

// meanwhile... in another service...
//
// bus.publish('list.item.added', item)
//
```