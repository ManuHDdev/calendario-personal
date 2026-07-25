FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# tesseract-ocr: binario nativo de OCR (motor elegido en design.md — sin GPU,
# sin runtime Python/ML). tesseract-ocr-data-spa: datos de idioma español.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-spa \
    && mkdir -p /app/data/images

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 3005
CMD ["node", "dist/index.js"]
