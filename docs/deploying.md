# Deployment instructions

Here are some others ways to deploy Pandora with more robust configurations

## Adding support for Pub/Sub

You may want to control the bit behaviour using another program instead of commands.

To way to achieve this is to simply add another Dapr component. In this sample, the same redis instance is used for both
state storage and pub/sub, you may want to use [another pubsub component](https://docs.dapr.io/reference/components-reference/supported-pubsub.

```yaml
#./components/pubsub.yaml
# A sample pubsub component using Redis
# as a backend
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: pubsub
spec:
  type: pubsub.redis
  version: v1
  metadata:
    - name: redisHost
      value: redis:6379
    - name: redisPassword
      value: ""
```

```yaml
version: "3.7"
services:
  # The bot itself, record into raw, unusable files
  pandora:
    image: sotrx/pandora:2.1.0
    container_name: pandora
    restart: always
    environment:
      # Discord bot token
      - PANDORA_TOKEN=<DISCORD_TOKEN>
      # Prefix for text-based command
      - COMMAND_PREFIX=<COMMAND_PREFIX>
      # Dapr component for state storage
      - STORE_NAME=statestore
      - PUBSUB_NAME=pubsub
    volumes:
      - pandora_recordings:/rec
    networks:
      - discord_recordings
  # Dapr sidecar, defining runtime implementations
  pandora-dapr:
    image: "daprio/daprd:edge"
    command:
      [
        "./daprd",
        "-app-id",
        "pandora",
        "-app-port",
        "50051",
        "-dapr-grpc-port",
        "50002",
        "-components-path",
        "/components",
      ]
    # In docker-compose, you have to provide components by sharing a volume
    # this is the dapr/components directory
    volumes:
      - "./components/:/components"
    depends_on:
      - pandora
    network_mode: "service:pandora"

  # Converts the raw files into audio files
  pandora-cooking-server:
    image: sotrx/pandora-cooking-server:2.1.0
    container_name: pandora-cooking-server
    ports:
      - "3004:3004"
    restart: always
    volumes:
      - pandora_recordings:/app/rec
    networks:
      - discord_recordings

  # State store
  redis:
    image: "redis:alpine"
    networks:
      - discord_recordings

# Storing the recordings
volumes:
  pandora_recordings:

# Default docker network doesn't always provide name resolution
# so we create a new one
networks:
  discord_recordings:
```

## Saving the recordings on an external storage

The deployment we used so far used a volume to share recordings files between Pandora and the cooking server.
Although simple and effective, this solution doesn't allow for any true scaling
(as all instances have to be scheduled on the same node). It also introduces coupling.

One way to prevent this is to use an external object storage, such as Amazon S3. Once again this is another dapr component to add

This sample uses [Minio](https://min.io/)

```yaml
#./components/object-store.yaml
# Object storage using Minio
# see https://docs.dapr.io/reference/components-reference/supported-bindings/s3/
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: object-store
spec:
  type: bindings.aws.s3
  version: v1
  metadata:
    # Bucket name, should be created BEFOREHAND using the Minio UI
    - name: bucket
      value: recordings-test
    # Anything is fine, its not used in Minio
    - name: region
      value: us-east-1
    # Minio API endpoint
    - name: endpoint
      value: http://minio:9000
    # Mandatory for Minio
    - name: forcePathStyle
      value: true
    # We're using the docker-network without certificates
    - name: disableSSL
      value: true
    # Dapr is encoding all files in B64 before uploading it
    # The following two attributes tells Dapr decode b64 before uploading
    # it on the stoarge backend, and to encode it back when data are retrieved
    - name: encodeBase64
      value: true
    - name: decodeBase64
      value: true
    # An user must be created on Minio using the Minio console to get
    # These attributes
    - name: accessKey
      value: "XnZwvzujlWEzBG5T"
    - name: secretKey
      value: "9p2dKraexj5RzN7kHV9S9H2EAj7RSI9o"
```

```yaml
version: "3.7"
services:
  # The bot itself, record into raw, unusable files
  pandora:
    image: sotrx/pandora:2.1.0
    container_name: pandora
    restart: always
    environment:
      # Discord bot token
      - PANDORA_TOKEN=<DISCORD_TOKEN>
      # Prefix for text-based command
      - COMMAND_PREFIX=<COMMAND_PREFIX>
      # Dapr component for state storage
      - STORE_NAME=statestore
      - PUBSUB_NAME=pubsub
      - OBJECT_STORE_NAME=object-store
    networks:
      - discord_recordings
  # Dapr sidecar, defining runtime implementations
  pandora-dapr:
    image: "daprio/daprd:edge"
    command:
      [
        "./daprd",
        "-app-id",
        "pandora",
        "-app-port",
        "50051",
        "-dapr-grpc-port",
        "50002",
        "-components-path",
        "/components",
      ]
    # In docker-compose, you have to provide components by sharing a volume
    # this is the dapr/components directory
    volumes:
      - "./components/:/components"
    depends_on:
      - pandora
    network_mode: "service:pandora"

  # Converts the raw files into audio files
  pandora-cooking-server:
    image: sotrx/pandora-cooking-server:2.1.0
    container_name: pandora-cooking-server
    environment:
      - OBJECT_STORE_NAME=object-store
    ports:
      - "3004:3004"
    networks:
      - discord_recordings

  # State store
  redis:
    image: "redis:alpine"
    networks:
      - discord_recordings

  # Object storage
  # /!\ This is just an example, and there is no data persistence /!\
  # For real deployment, see https://docs.min.io/docs/deploy-minio-on-docker-compose.html
  minio:
    image: "minio/minio"
    ports:
      # Minio API
      - "9000:9000"
      # Minio UI
      - "9001:9001"
    networks:
      - discord_recordings
# Default docker network doesn't always provide name resolution
# so we create a new one
networks:
  discord_recordings:
```
