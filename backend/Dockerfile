# Single npm install in builder — avoids 2× node_modules during build (fixes EC2 disk full).
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force \
  && rm -rf /root/.npm

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
RUN mkdir -p uploads/master-data-imports uploads/csv-imports

EXPOSE 4000
CMD ["node", "dist/main.js"]
