FROM node:lts-alpine as builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:lts-alpine
WORKDIR /app
COPY ./package.json ./package-lock.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist .
EXPOSE 8080
CMD ["node", "index.js"]
