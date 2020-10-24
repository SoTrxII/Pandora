# Expected size : 214Mb
FROM node:current-alpine as build
WORKDIR /app
COPY package.json /app/
RUN apk add alpine-sdk git python \
    && npm config set update-notifier false \
    && npm install

COPY . /app/
RUN npm run build

FROM node:current-alpine as prod
WORKDIR /app
COPY --from=build /app/dist /app
RUN apk add --no-cache --virtual=.build-deps alpine-sdk git python \
    && apk add --no-cache ffmpeg \
    && npm config set update-notifier false \
    && npm install -g pm2 modclean \
    && npm install --only=prod \
    && modclean -r \
    && modclean -r /usr/local/lib/node_modules/pm2 \
    && npm uninstall -g modclean \
    && npm cache clear --force \
    && apk del .build-deps \
    && rm -rf /root/.npm /usr/local/lib/node_modules/npm

CMD ["pm2-runtime", "/app/main.js"]
