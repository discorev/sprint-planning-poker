FROM node:alpine as builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM node:alpine
WORKDIR /app
COPY ./package.json ./
RUN npm install --production
COPY --from=builder /app/dist .
CMD ["npm", "run", "start"]
