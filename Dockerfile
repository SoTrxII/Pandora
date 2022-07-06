# Expected size : 214Mb
# We're using yarn berry in legacy node_modules mode. PnP isn't that reliable for the moment
FROM node:current-alpine as build
WORKDIR /app
RUN apk add python3 make alpine-sdk yarn
COPY . /app/
RUN rm -f .yanrc.yml && yarn set version berry && echo "nodeLinker: node-modules" >> .yarnrc.yml
RUN yarn install
RUN yarn run build

FROM node:current-alpine as prod
WORKDIR /app
COPY --from=build /app/dist /app
RUN apk add --no-cache --virtual=.build-deps alpine-sdk python3 yarn \
    && rm -f .yanrc.yml && yarn set version berry && echo "nodeLinker: node-modules" >> .yarnrc.yml \
    && yarn plugin import workspace-tools  \
    && yarn workspaces focus --all --production \
    && apk del .build-deps
CMD ["node", "/app/main.js"]
