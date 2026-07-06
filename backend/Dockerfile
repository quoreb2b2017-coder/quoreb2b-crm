# Single-stage image — avoids copying node_modules between layers (saves disk on small EC2).
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force \
  && rm -rf /root/.npm

RUN mkdir -p uploads/master-data-imports uploads/csv-imports

EXPOSE 4000
CMD ["node", "dist/main.js"]
