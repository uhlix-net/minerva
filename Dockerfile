# syntax=docker/dockerfile:1
FROM docker.io/library/node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

# Production dependencies of the server only (the web app is static files).
FROM docker.io/library/node:24-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server --ignore-scripts

FROM docker.io/library/node:24-alpine
ARG VERSION=0.3.0-rc.4
LABEL org.opencontainers.image.title="Minerva" \
      org.opencontainers.image.description="Modular, self-hosted knowledge base" \
      org.opencontainers.image.source="https://github.com/uhlix-net/minerva" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production MINERVA_VERSION=${VERSION} PORT=8080 MINERVA_DATA_DIR=/data MINERVA_WEB_DIR=/app/web/dist
WORKDIR /app
COPY --from=build /src/package.json ./
COPY --from=deps /src/node_modules ./node_modules
COPY --from=build /src/server/package.json server/
COPY --from=build /src/server/dist server/dist
COPY --from=build /src/web/dist web/dist
RUN mkdir -p /data && chown 10001:10001 /data
USER 10001
EXPOSE 8080
VOLUME /data
CMD ["node", "server/dist/index.js"]
