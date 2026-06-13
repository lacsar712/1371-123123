FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data
EXPOSE 8137
CMD ["node", "src/index.js"]
