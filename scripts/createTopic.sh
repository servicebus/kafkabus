#!/bin/bash -e

find_container_id() {
  echo $(docker ps \
    --filter "status=running" \
    --filter "name=kafka1" \
    --no-trunc \
    -q)
}

TOPIC=${TOPIC:='test-topic'}
PARTITIONS=${PARTITIONS:=3}

docker exec \
  $(find_container_id) \
  bash -c "/opt/kafka/bin/kafka-topics.sh --create --if-not-exists --topic ${TOPIC} --replication-factor 1 --partitions ${PARTITIONS} --zookeeper zk:2181"
