FROM node:20-slim AS lib-builder

WORKDIR /build

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/node/package.json packages/node/tsconfig.json packages/node/tsconfig.build.json packages/node/
COPY packages/node/src/ packages/node/src/

RUN npm install --workspace=packages/node --include-workspace-root && \
    npm run build --workspace=packages/node && \
    cd packages/node && npm pack

# -------------------------------------------------------------------
FROM node:20-slim AS app

WORKDIR /app

COPY playground/nestjs-app/package.json playground/nestjs-app/tsconfig.json ./
COPY --from=lib-builder /build/packages/node/haocruz-opentelemetry-*.tgz /tmp/lib.tgz

RUN npm install /tmp/lib.tgz && npm install && rm /tmp/lib.tgz

COPY playground/nestjs-app/src/ ./src/

RUN npx tsc -p tsconfig.json

EXPOSE 3010
CMD ["node", "dist/main.js"]
