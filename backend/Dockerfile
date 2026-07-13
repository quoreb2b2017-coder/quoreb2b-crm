# Multi-stage build — smaller final image, less disk during export on small EC2 volumes.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install \
  && npm cache clean --force \
  && rm -rf /root/.npm

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force \
  && rm -rf /root/.npm

FROM node:20-alpine
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

ENV NODE_ENV=production
RUN mkdir -p uploads/master-data-imports uploads/csv-imports

EXPOSE 4000
CMD ["node", "dist/main.js"]
