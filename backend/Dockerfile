# Single-stage image — one npm install, then prune dev deps (low disk use on small EC2).
FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force \
  && rm -rf /root/.npm

ENV NODE_ENV=production
RUN mkdir -p uploads/master-data-imports uploads/csv-imports

EXPOSE 4000
CMD ["node", "dist/main.js"]
