# Image de production : application web + API + LibreOffice (conversion des graphiques EMF).
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-draw fonts-liberation fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production PORT=3001 DATA_DIR=/data
VOLUME /data
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
