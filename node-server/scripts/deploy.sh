#!/bin/bash
VERSION=`node -p "require('./package').version"`
docker build -t discorev/sprint-planning-poker-server:latest -t discorev/sprint-planning-poker-server:$VERSION .
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
docker push discorev/sprint-planning-poker-server:latest
docker push discorev/sprint-planning-poker-server:$VERSION
