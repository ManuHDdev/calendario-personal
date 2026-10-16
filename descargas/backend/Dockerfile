FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
# Thumbnail cache (a named volume is mounted here; /data itself is read-only).
RUN mkdir -p /cache && chown node:node /cache
ENV THUMB_CACHE_DIR=/cache
EXPOSE 3016
CMD ["node", "dist/index.js"]
