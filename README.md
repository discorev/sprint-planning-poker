# Sprint Planning Poker
[![build](https://github.com/discorev/sprint-planning-poker/actions/workflows/action.yml/badge.svg)](https://github.com/discorev/sprint-planning-poker/actions/workflows/action.yml)
[![codecov](https://codecov.io/gh/discorev/sprint-planning-poker/branch/main/graph/badge.svg?token=8IRZ65UZSB)](https://codecov.io/gh/discorev/sprint-planning-poker)
[![CodeFactor](https://www.codefactor.io/repository/github/discorev/sprint-planning-poker/badge)](https://www.codefactor.io/repository/github/discorev/sprint-planning-poker)

This project implements sprint planning poker using a WebSocket based api. This has been implemented in both nodejs and as a serverless api using AWS API Gateway to host a serverless WebSocket layer and lambda functions that react to data being transferred.
```
.
├── README.md              <-- This instructions file
├── frontend               <-- Angular based frontend website
├── node-server            <-- nodejs WebSocket server use for rapid development
└── sam-server             <-- Serverless WebSocket implementation
```
