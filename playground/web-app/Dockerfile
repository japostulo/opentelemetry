FROM node:20-slim AS lib-builder

WORKDIR /build

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/web/package.json packages/web/tsconfig.json packages/web/tsconfig.build.json packages/web/
COPY packages/web/src/ packages/web/src/

RUN npm install --workspace=packages/web --include-workspace-root && \
    npm run build --workspace=packages/web && \
    cd packages/web && npm pack

# -------------------------------------------------------------------
FROM node:20-slim AS build

WORKDIR /app

COPY playground/web-app/package.json playground/web-app/tsconfig.json playground/web-app/vite.config.ts playground/web-app/index.html ./
COPY --from=lib-builder /build/packages/web/haocruz-opentelemetry-web-*.tgz /tmp/lib.tgz

RUN npm install /tmp/lib.tgz && npm install && rm /tmp/lib.tgz

COPY playground/web-app/src/ ./src/

RUN npx vite build

# -------------------------------------------------------------------
FROM node:20-slim AS dev

WORKDIR /app

COPY playground/web-app/package.json playground/web-app/tsconfig.json playground/web-app/vite.config.ts playground/web-app/index.html ./
COPY --from=lib-builder /build/packages/web/haocruz-opentelemetry-web-*.tgz /tmp/lib.tgz

RUN npm install /tmp/lib.tgz && npm install && rm /tmp/lib.tgz

COPY playground/web-app/src/ ./src/

EXPOSE 8090
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8090"]

# -------------------------------------------------------------------
FROM nginx:alpine

COPY playground/web-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
