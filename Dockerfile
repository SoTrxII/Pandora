# Expected size : 440Mb
# We're using yarn berry in legacy node_modules mode. PnP isn't that reliable for the moment
FROM node:18-alpine as build
WORKDIR /app
RUN apk add python3 make alpine-sdk yarn py3-setuptools
COPY . /app/
# Add nodelinker to node modules if it doesn't exists
RUN corepack enable \
    && corepack prepare yarn@stable --activate \
    && yarn config set nodeLinker node-modules
RUN yarn install
RUN yarn run build

FROM node:18-alpine as prod
WORKDIR /app
COPY --from=build /app/dist /app
RUN apk add --no-cache --virtual=.build-deps alpine-sdk python3 py3-setuptools yarn \
    && apk add ffmpeg \
    && npm install -g pm2 \
    && corepack enable \
    && corepack prepare yarn@stable --activate \
    && yarn config set nodeLinker node-modules \
    && yarn workspaces focus --all --production \
    && apk del .build-deps
CMD ["pm2-runtime", "/app/main.js"]