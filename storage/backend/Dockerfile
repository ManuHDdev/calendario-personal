FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copiar fuentes y compilar
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev

EXPOSE 3001

CMD ["node", "dist/index.js"]
