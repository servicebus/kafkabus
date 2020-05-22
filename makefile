DEBUG?=servicebus-kafka
HOST_IP=127.0.0.1
DO_NOT_STOP?=false
REDIS_HOST?=localhost
REDIS_PORT?=6379

docker-test:
	echo "Starting Docker Test..."
	HOST_IP=$(HOST_IP) docker-compose up -d
	echo "Backend Coming Up... Waiting..."
	sleep 25
	make test-debug

down:
	docker-compose down --remove-orphans

test:
	KAFKA_HOSTS=$(KAFKA_HOSTS) DEBUG= ./node_modules/.bin/mocha -R spec --recursive --exit

test-debug:
	REDIS_HOST=$(REDIS_HOST) REDIS_PORT=${REDIS_PORT} HOST_IP=$(HOST_IP) DEBUG=$(DEBUG) KAFKAJS_LOG_LEVEL=error DO_NOT_STOP=$(DO_NOT_STOP)\
		./scripts/testWithKafka.sh "./node_modules/.bin/mocha -R spec --recursive --exit"

.PHONY: test test-debug
