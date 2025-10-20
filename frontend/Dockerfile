FROM node:lts-alpine as builder
ARG FONTAWESOME_NPM_TOKEN
WORKDIR /app
COPY ./.npmrc ./package.json ./package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx
EXPOSE 4200
COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html