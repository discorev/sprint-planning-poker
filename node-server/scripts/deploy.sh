#!/bin/bash
VERSION=$(node -p "require('./package').version")
# login first to ensure pulls are done against my limit not the travis limit
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
docker build -t discorev/sprint-planning-poker-server:latest -t discorev/sprint-planning-poker-server:$VERSION .
docker push discorev/sprint-planning-poker-server:latest
docker push discorev/sprint-planning-poker-server:$VERSION
