# @servicebus/kafkabus
[![Build Status](https://travis-ci.org/servicebus/kafkabus.svg?branch=master)](https://travis-ci.org/servicebus/kafkabus)
[![codecov](https://codecov.io/gh/servicebus/kafkabus/branch/master/graph/badge.svg)](https://codecov.io/gh/servicebus/kafkabus)

Simple service bus for sending events between processes using kafka.

`@servicebus` is a collection of components made for building distributed systems, and as such, some of the tools exist to help implement patterns such as CQRS (see more below).

You can use servicebus `send/listen` for one to one messaging, or `publish/subscribe` for one to many messaging.

## Send / Listen

Servicebus allows simple sending and recieving of messages in a 1:1 sender:listener configuration. The following two processes will send an event message called 'my.event' every second from process A to process B via Kafka.

Calling `done` will commit the message offset, marking it as processed.

Process A:
```js
var bus = require('servicebus').bus();
bus.listen('my.event', function (event, message, done, fail) {
  console.log(event);
  done() 
});
```
Process B:
```js
var bus = require('servicebus').bus();

setInterval(async function () {
  bus.send('my.event', { my: 'event' });
}, 1000);
```

### Streaming

Kafkabus uses Transactions by default, but they can be disabled in favor of sending messages as fast as possible. There is also a `produceBatch` function for publishing many messages at once.

```js
await bus.send('my.event', { my: 'event' }, { transaction: false });
```

```js
await bus.listen('my.event', { transaction: false }, function (event) {
  console.log(event)
});
```

## Authentication

TODO: Kafka auth config

## Publish / Subscribe

Servicebus can also send messages from 1:N processes in a fan-out architecture. In this pattern, one sender publishes a message and any number of subscribers can receive. The pattern for usage looks very similar to send/listen, and under the hood, makes use of the same `produce`/`consume` with different options configured:

Process A (can be run any number of times, all will receive the event):
```js
var bus = require('servicebus').bus();
bus.subscribe('my.event', function (event, message, done, fail) {
  console.log(event);
  done()
});
```
Process B:
```js    
var bus = require('servicebus').bus();

setInterval(async function () {
  await bus.publish('my.event', { my: 'event' });
}, 1000);
```    

## Middleware

Servicebus allows for middleware packages to enact behavior at the time a message is sent or received. They are very similar to connect middleware in their usage: 

```js
  bus.use(bus.package());
  bus.use(bus.correlate());
```

Middleware may define one or two functions to modify incoming or outgoing messages:

```js
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

## CQRS/ES and servicebus-register-handlers

[register-handlers](https://github.com/servicebus/register-handlers) is a package that allows you to register and entire folder of handlers at once. It also contains some syntactical sugar for use in CQRS systems, allowing you to easy create command handlers and event handlers by simply creating a folder of handlers, and providing `register-handlers` with that folder name.

```javascript
await registerHandlers({
  bus,
  path: path.resolve(process.cwd(), 'handlers')
})
```

If using ES Modules, set `modules: true`.

```javascript
await registerHandlers({
  bus,
  path: path.resolve(process.cwd(), 'handlers'),
  modules: true
})
```

### Example Command Handler

To use a command handler you must export a `command` string, and a `function` named `listen`.

```javascript
import log from 'llog'
import { TodoList } from '../lib/models/TodoList'
import { todoListRepository } from '../lib/repos/todoListRepository.mjs'

export const command = 'list.item.add'
export const ack = false // kafka has it's own acks - we don't need servicebus's

log.info({ msg: `registering ${command}`, command })

//
// WARNING: You can not use an () => {} function here, because the context
// that contains the bus will not be bound properly!
//
export const listen = async function ({ type, data, datetime }, done, fail) {
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
    fail(`Command Handler Failed for ${command} - ${err}`)
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

To use an event handler you must export an `event` string, and a function named `subscribe`.

```javascript
import log from 'llog'

export const event = 'list.item.added'
export const ack = false

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