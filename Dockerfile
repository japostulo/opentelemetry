FROM node:20-slim

WORKDIR /app

# Root workspace files
COPY package.json package-lock.json* tsconfig.base.json ./

# Node package
COPY packages/node/package.json packages/node/tsconfig.json packages/node/tsconfig.build.json packages/node/
COPY packages/node/src/ packages/node/src/

# Web package
COPY packages/web/package.json packages/web/tsconfig.json packages/web/tsconfig.build.json packages/web/
COPY packages/web/src/ packages/web/src/

RUN npm install --workspaces

CMD ["npm", "run", "build", "--workspaces"]
