import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer, type RawData } from 'ws'

import * as Guards from './models/guards'
import {
    PlanningPokerError,
    PlanningPokerSession,
    type PlanningPokerEvent,
} from './planning-poker-session'

interface PlanningPokerSocket extends WebSocket {
    isAlive: boolean
    participantId?: string
}

export interface PlanningPokerWebSocketServer {
    readonly server: WebSocketServer
    close(): Promise<void>
}

export function attachPlanningPokerWebSocketServer(
    httpServer: HttpServer,
    session: PlanningPokerSession,
    heartbeatIntervalMs = 3_000,
): PlanningPokerWebSocketServer {
    const server = new WebSocketServer({ noServer: true })
    const handleUpgrade = (
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer,
    ): void => {
        const pathname = request.url?.split('?', 1)[0] ?? '/'
        if (!['/api/ws', '/sprint-planning-poker/ws', '/ws'].includes(pathname)) {
            socket.end(`HTTP/1.1 ${pathname === '/mcp' ? '405 Method Not Allowed' : '404 Not Found'}\r\nConnection: close\r\n\r\n`)
            return
        }
        server.handleUpgrade(request, socket, head, webSocket => {
            server.emit('connection', webSocket, request)
        })
    }
    httpServer.on('upgrade', handleUpgrade)

    const broadcast = (message: object, excluded?: PlanningPokerSocket): void => {
        const payload = JSON.stringify(message)
        for (const client of server.clients as Set<PlanningPokerSocket>) {
            if (client !== excluded && client.readyState === WebSocket.OPEN) {
                client.send(payload)
            }
        }
    }

    const broadcastPlayers = (excluded?: PlanningPokerSocket): void => {
        broadcast({ players: session.getWebSocketPlayers() }, excluded)
    }

    const broadcastChoices = (): void => {
        broadcast({ choices: session.getWebSocketPlayers() })
    }

    const handleDomainEvent = (event: PlanningPokerEvent): void => {
        switch (event.type) {
            case 'participant-joined':
                if (event.transport === 'mcp') {
                    broadcastPlayers()
                }
                return
            case 'participant-left':
                broadcast({
                    players: session.getWebSocketPlayers(),
                    ...(event.transport === 'websocket' && { reset: true }),
                })
                if (event.revealed) {
                    broadcastChoices()
                }
                return
            case 'participants-expired':
                broadcastPlayers()
                if (event.revealed) {
                    broadcastChoices()
                }
                return
            case 'vote-changed': {
                const name = session.getParticipantName(event.participantId)
                if (event.revealed) {
                    broadcastChoices()
                } else if (name) {
                    const participant = session.getWebSocketPlayers().find(player => player.name === name)
                    broadcast({ name, selected: participant?.selected ?? false })
                }
                return
            }
            case 'round-reset':
                broadcast({ reset: true, originator: session.getParticipantName(event.participantId) })
                return
            case 'participant-snoozed': {
                const name = session.getParticipantName(event.participantId)
                if (name) {
                    broadcast({ action: 'snooze', player: name, snoozed: event.snoozed })
                }
                if (event.revealed) {
                    broadcastChoices()
                }
            }
        }
    }

    const unsubscribe = session.subscribe(handleDomainEvent)

    const removeSocketParticipant = (socket: PlanningPokerSocket): void => {
        const participantId = socket.participantId
        socket.participantId = undefined
        if (participantId) {
            session.leaveParticipant(participantId)
        }
    }

    server.on('connection', (socket: PlanningPokerSocket) => {
        socket.isAlive = true
        socket.on('pong', () => {
            socket.isAlive = true
        })

        socket.on('message', (payload: RawData) => {
            const message = decodeJson(payload)
            if (!Guards.isAction(message)) {
                sendError(socket, 'malformed request, missing action')
                return
            }

            if (Guards.isRegisterAction(message)) {
                if (socket.participantId) {
                    sendError(socket, 'already registered', message.action)
                    return
                }
                try {
                    const joined = session.joinParticipant({
                        name: message.name,
                        observer: message.observer,
                        transport: 'websocket',
                    })
                    if (socket.readyState !== WebSocket.OPEN) {
                        session.leaveParticipant(joined.participantId)
                        return
                    }
                    socket.participantId = joined.participantId
                    const players = session.getWebSocketPlayers()
                    const state = session.getPublicState()
                    socket.send(JSON.stringify({
                        action: 'register',
                        cards: state.cards,
                        players,
                        reset: true,
                        ...(state.round.status === 'revealed' && { choices: players }),
                    }))
                    broadcast({ players, reset: true }, socket)
                } catch (error) {
                    sendDomainError(socket, error, message.action)
                }
                return
            }

            if (!socket.participantId) {
                sendError(socket, 'not registered')
                return
            }

            try {
                if (Guards.isResetAction(message)) {
                    session.resetWebSocketRound(socket.participantId)
                    return
                }
                if (Guards.isRecordChoiceAction(message)) {
                    session.setWebSocketVote(socket.participantId, message.choice)
                    return
                }
                if (Guards.isSnoozeAction(message)) {
                    session.toggleWebSocketSnoozeByName(socket.participantId, message.player)
                }
            } catch (error) {
                sendDomainError(socket, error, message.action)
            }
        })

        socket.on('close', () => removeSocketParticipant(socket))
    })

    const heartbeatTimer = setInterval(() => {
        for (const socket of server.clients as Set<PlanningPokerSocket>) {
            if (!socket.isAlive) {
                removeSocketParticipant(socket)
                socket.terminate()
                continue
            }
            socket.isAlive = false
            socket.ping()
        }
    }, heartbeatIntervalMs)

    return {
        server,
        close: async () => {
            clearInterval(heartbeatTimer)
            unsubscribe()
            httpServer.off('upgrade', handleUpgrade)
            for (const client of server.clients) {
                client.terminate()
            }
            await new Promise<void>((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve())
            })
        },
    }
}

function decodeJson(payload: RawData): unknown {
    try {
        return JSON.parse(payload.toString()) as unknown
    } catch {
        return undefined
    }
}

function sendDomainError(socket: PlanningPokerSocket, error: unknown, action?: string): void {
    if (error instanceof PlanningPokerError) {
        if (error.code === 'participant_not_found') {
            socket.participantId = undefined
        }
        sendError(socket, error.message, action)
        return
    }
    console.error('Planning poker WebSocket request failed', error)
    sendError(socket, 'internal server error', action)
}

function sendError(socket: PlanningPokerSocket, message: string, action?: string): void {
    const error: { error: string; action?: string } = { error: message }
    if (action) {
        error.action = action
    }
    socket.send(JSON.stringify(error))
}
