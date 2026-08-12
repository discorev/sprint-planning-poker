FROM oven/bun:1.3.9-alpine AS builder
WORKDIR /app
COPY ./.npmrc ./bunfig.toml ./package.json ./bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM nginx:alpine
EXPOSE 4200
COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html/sprint-planning-poker
