FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases .yarn/releases
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN yarn workspaces focus stock-screener-backend --production

COPY backend ./backend

WORKDIR /app/backend

EXPOSE 5000

CMD ["node", "server.js"]
