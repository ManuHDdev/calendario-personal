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
# /data holds the uploaded media. Created and owned by the unprivileged user so
# that a fresh named volume mounted here inherits writable ownership.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3018
CMD ["node", "dist/index.js"]
