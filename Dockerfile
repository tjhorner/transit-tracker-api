FROM node:24-alpine AS base

RUN npm i -g pnpm@11

FROM base AS dependencies

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install

FROM base AS build

WORKDIR /app
COPY . .
COPY --from=dependencies /app/node_modules ./node_modules
RUN pnpm build
RUN pnpm prune --prod

FROM base AS deploy

RUN apk add --no-cache apprise

ARG BUILD_FOR_FLY

RUN if [[ -n "${BUILD_FOR_FLY}" ]] ; then apk add curl jq && \ 
  curl -L https://fly.io/install.sh | sh && \ 
  ln -s /root/.fly/bin/fly /usr/local/bin/fly ; fi

WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/db ./db
COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/scripts ./scripts

ENTRYPOINT [ "/bin/sh", "-c" ]
CMD [ "node dist/main.js" ]