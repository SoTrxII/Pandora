FROM ubuntu:latest
WORKDIR /app
COPY package.json /app/
RUN apt update -y  && DEBIAN_FRONTEND=noninteractive apt install -y nodejs npm ffmpeg flac vorbis-tools build-essential zip fdkaac git \
    && npm install -g pm2 modclean \
    && npm install --only=prod \
    && modclean -r \
    && modclean -r /usr/local/lib/node_modules/pm2 \
    && npm uninstall -g modclean \
    && npm cache clear --force \
    && rm -rf /root/.npm /usr/local/lib/node_modules/npm
COPY . /app/