FROM node:20-alpine

WORKDIR /app

# better-sqlite3 compila un binario nativo en el install
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

# Copiar fuentes y compilar
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev

EXPOSE 3001

CMD ["node", "dist/index.js"]
