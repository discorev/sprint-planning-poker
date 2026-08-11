import {
    CLIENT_CAPABILITIES_META_KEY,
    CLIENT_INFO_META_KEY,
    PROTOCOL_VERSION_META_KEY,
} from '@modelcontextprotocol/server'
import WebSocket, { type RawData } from 'ws'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createPlanningPokerServer, type PlanningPokerServer } from '../src'
import { MCP_PROTOCOL_VERSION } from '../src/mcp-server'
import { PLANNING_POKER_CARDS } from '../src/planning-poker-session'

interface ServerMessage {
    readonly action?: string
    readonly error?: string
    readonly name?: string
    readonly selected?: boolean
    readonly reset?: boolean
    readonly originator?: string
    readonly player?: string
    readonly snoozed?: boolean
    readonly players?: readonly PlayerMessage[]
    readonly choices?: readonly PlayerMessage[]
    readonly cards?: readonly string[]
    readonly subject?: string | null
}

interface PlayerMessage {
    readonly name: string
    readonly type?: string
    readonly choice?: string
    readonly rationale?: string
    readonly selected?: boolean
    readonly snoozed?: boolean
    readonly observer?: boolean
}

interface JoinedMcpParticipant {
    readonly participantId: string
    readonly round: { readonly roundId: string }
}

function caller(participant: JoinedMcpParticipant): { readonly participantId: string } {
    return { participantId: participant.participantId }
}

describe('planning poker WebSocket adapter', () => {
    let server: PlanningPokerServer
    let url: string
    let mcpEndpoint: string
    const sockets: WebSocket[] = []

    beforeEach(async () => {
        // 250ms keeps the liveness test fast while tolerating event-loop
        // stalls on loaded CI runners (a missed pong within one interval
        // gets the socket terminated mid-test).
        server = createPlanningPokerServer({ webSocketHeartbeatIntervalMs: 250 })
        const port = await server.listen(0, '127.0.0.1')
        url = `ws://127.0.0.1:${port}/api/ws`
        mcpEndpoint = `http://127.0.0.1:${port}/mcp`
    })

    afterEach(async () => {
        for (const socket of sockets) {
            socket.terminate()
        }
        await server.close()
    })

    test('preserves the browser protocol while sharing state with MCP participants', async () => {
        const alice = await connect(url)
        const bob = await connect(url)
        sockets.push(alice.socket, bob.socket)

        alice.socket.send(JSON.stringify({ action: 'register', name: 'Alice' }))
        const registration = await alice.next(message => message.action === 'register')
        expect(registration).toMatchObject({ reset: true })
        expect(registration.cards).toEqual(PLANNING_POKER_CARDS)

        bob.socket.send(JSON.stringify({ action: 'register', name: 'Robert' }))
        expect(await bob.next(message => message.action === 'register')).toMatchObject({ reset: true })
        expect(await alice.next(message => message.players?.length === 2)).toMatchObject({ reset: true })

        alice.socket.send(JSON.stringify({ action: 'record-choice', choice: '5' }))
        const hiddenVote = await bob.next(message => message.name === 'Alice' && message.selected === true)
        expect(hiddenVote).toEqual({ name: 'Alice', selected: true })

        const agent = await callMcpTool<JoinedMcpParticipant>(
            mcpEndpoint,
            'join_session',
            { name: 'Agent' },
        )
        const joined = await bob.next(message => message.players?.length === 3, 'MCP participant join')
        expect(joined.reset).toBeUndefined()
        expect(JSON.stringify(joined)).not.toContain('participantId')
        expect(JSON.stringify(joined)).not.toContain(agent.participantId)
        expect(joined.players?.find(player => player.name === 'Alice')).toMatchObject({ selected: true, type: 'user' })
        expect(joined.players?.find(player => player.name === 'Alice')?.choice).toBeUndefined()
        expect(joined.players?.find(player => player.name === 'Agent')?.type).toBe('agent')

        bob.socket.send(JSON.stringify({ action: 'record-choice', choice: '8' }))
        await alice.next(message => message.name === 'Robert' && message.selected === true)
        await callMcpTool(mcpEndpoint, 'submit_vote', {
            ...caller(agent),
            roundId: agent.round.roundId,
            card: '3',
        })
        const reveal = await alice.next(message => Array.isArray(message.choices), 'automatic reveal')
        expect(reveal.choices?.find(player => player.name === 'Alice')?.choice).toBe('5')
        expect(reveal.choices?.find(player => player.name === 'Robert')?.choice).toBe('8')
        expect(reveal.choices?.find(player => player.name === 'Agent')?.choice).toBe('3')

        await callMcpTool(mcpEndpoint, 'reset_round', caller(agent))
        expect(await alice.next(message => message.reset === true, 'MCP round reset')).toMatchObject({
            reset: true,
            originator: 'Agent',
        })

        await callMcpTool(mcpEndpoint, 'snooze_participant', {
            ...caller(agent),
            targetName: 'Agent',
        })
        expect(await bob.next(message => message.action === 'snooze', 'MCP snooze')).toMatchObject({
            player: 'Agent',
            snoozed: true,
        })
    })

    test('exposes an MCP vote rationale over WebSocket only after reveal', async () => {
        const alice = await connect(url)
        sockets.push(alice.socket)
        alice.socket.send(JSON.stringify({ action: 'register', name: 'Alice' }))
        await alice.next(message => message.action === 'register')

        const agent = await callMcpTool<JoinedMcpParticipant>(
            mcpEndpoint,
            'join_session',
            { name: 'Agent' },
        )
        await alice.next(message => message.players?.length === 2, 'MCP participant join')

        await callMcpTool(mcpEndpoint, 'submit_vote', {
            ...caller(agent),
            roundId: agent.round.roundId,
            card: '3',
            rationale: 'Touches storage',
        })
        const hiddenVote = await alice.next(message => message.name === 'Agent' && message.selected === true)
        expect(hiddenVote).toEqual({ name: 'Agent', selected: true })

        alice.socket.send(JSON.stringify({ action: 'record-choice', choice: '5' }))
        const reveal = await alice.next(message => Array.isArray(message.choices), 'automatic reveal')
        expect(reveal.choices?.find(player => player.name === 'Agent')).toMatchObject({
            choice: '3',
            rationale: 'Touches storage',
        })
    })

    test('rejects invalid registration states and allows observers without blocking reveal', async () => {
        const alice = await connect(url)
        const bob = await connect(url)
        const observer = await connect(url)
        sockets.push(alice.socket, bob.socket, observer.socket)

        alice.socket.send(JSON.stringify({ action: 'record-choice', choice: '5' }))
        expect(await alice.next(message => message.error === 'not registered')).toEqual({ error: 'not registered' })

        alice.socket.send(JSON.stringify({ action: 'register', name: 'Al' }))
        expect(await alice.next(message => message.action === 'register' && Boolean(message.error))).toMatchObject({
            action: 'register',
            error: 'name is too short',
        })

        alice.socket.send(JSON.stringify({ action: 'register', name: 'Alice' }))
        await alice.next(message => message.action === 'register' && !message.error)
        alice.socket.send(JSON.stringify({ action: 'register', name: 'Alice Again' }))
        expect(await alice.next(message => message.error === 'already registered')).toMatchObject({ action: 'register' })

        bob.socket.send(JSON.stringify({ action: 'register', name: 'Alice' }))
        expect(await bob.next(message => message.error === 'name is already taken')).toMatchObject({ action: 'register' })
        bob.socket.send(JSON.stringify({ action: 'register', name: 'Robert' }))
        await bob.next(message => message.action === 'register' && !message.error)

        observer.socket.send(JSON.stringify({ action: 'register', name: 'Observer', observer: true }))
        await observer.next(message => message.action === 'register' && !message.error)
        alice.socket.send(JSON.stringify({ action: 'record-choice', choice: '5' }))
        bob.socket.send(JSON.stringify({ action: 'record-choice', choice: '8' }))

        const reveal = await observer.next(message => Array.isArray(message.choices))
        expect(reveal.choices?.find(player => player.name === 'Alice')?.choice).toBe('5')
        expect(reveal.choices?.find(player => player.name === 'Robert')?.choice).toBe('8')
        expect(reveal.choices?.find(player => player.name === 'Observer')?.choice).toBeUndefined()
    })

    test('keeps the legacy reset flag and recomputes reveal on browser disconnect', async () => {
        const alice = await connect(url)
        const bob = await connect(url)
        const carol = await connect(url)
        sockets.push(alice.socket, bob.socket, carol.socket)
        alice.socket.send(JSON.stringify({ action: 'register', name: 'Alice' }))
        await alice.next(message => message.action === 'register')
        bob.socket.send(JSON.stringify({ action: 'register', name: 'Robert' }))
        await bob.next(message => message.action === 'register')
        await alice.next(message => message.players?.length === 2)
        carol.socket.send(JSON.stringify({ action: 'register', name: 'Carol' }))
        await carol.next(message => message.action === 'register')
        await alice.next(message => message.players?.length === 3)

        alice.socket.send(JSON.stringify({ action: 'record-choice', choice: '5' }))
        await bob.next(message => message.name === 'Alice' && message.selected === true)
        bob.socket.send(JSON.stringify({ action: 'record-choice', choice: '8' }))
        await alice.next(message => message.name === 'Robert' && message.selected === true)
        carol.socket.close()

        const disconnect = await alice.next(message => message.players?.length === 2)
        expect(disconnect.reset).toBe(true)
        expect(disconnect.players).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Alice', selected: true }),
            expect.objectContaining({ name: 'Robert', selected: true }),
        ]))
        const reveal = await alice.next(message => Array.isArray(message.choices))
        expect(reveal.choices).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Alice', choice: '5' }),
            expect.objectContaining({ name: 'Robert', choice: '8' }),
        ]))
    })

    test('prevents MCP lifecycle tools from evicting browser participants', async () => {
        const browser = await connect(url)
        sockets.push(browser.socket)
        browser.socket.send(JSON.stringify({ action: 'register', name: 'Human' }))
        await browser.next(message => message.action === 'register')
        const browserId = server.session.findParticipantIdByName('Human')
        if (!browserId) {
            throw new Error('Expected registered browser participant')
        }
        await callMcpTool<JoinedMcpParticipant>(mcpEndpoint, 'join_session', { name: 'Agent' })

        const attemptedLeave = await callMcpTool<{ code: string }>(mcpEndpoint, 'leave_session', {
            participantId: browserId,
        })
        expect(attemptedLeave.code).toBe('invalid_participant_handle')
        const attemptedHeartbeat = await callMcpTool<{ code: string }>(mcpEndpoint, 'heartbeat', {
            participantId: browserId,
        })
        expect(attemptedHeartbeat.code).toBe('invalid_participant_handle')

        browser.socket.send(JSON.stringify({ action: 'record-choice', choice: '5' }))
        expect(await browser.next(message => message.name === 'Human')).toMatchObject({ selected: true })
    })

    test('clears a stale socket participant so it can register again', async () => {
        const browser = await connect(url)
        sockets.push(browser.socket)
        browser.socket.send(JSON.stringify({ action: 'register', name: 'Human' }))
        await browser.next(message => message.action === 'register')
        const browserId = server.session.findParticipantIdByName('Human')
        if (!browserId) {
            throw new Error('Expected registered browser participant')
        }
        server.session.leaveParticipant(browserId)
        await browser.next(message => message.players?.length === 0)

        browser.socket.send(JSON.stringify({ action: 'record-choice', choice: '5' }))
        expect(await browser.next(message => message.action === 'record-choice')).toMatchObject({
            error: 'participant is unknown or expired; join the session again',
        })
        browser.socket.send(JSON.stringify({ action: 'register', name: 'Human' }))
        expect(await browser.next(message => message.action === 'register')).toMatchObject({ reset: true })
    })

    test('broadcasts MCP lease expiry without the browser-only reset flag', async () => {
        await server.close()
        server = createPlanningPokerServer({
            leaseDurationMs: 40,
            leaseCleanupIntervalMs: 10,
            webSocketHeartbeatIntervalMs: 250,
        })
        const port = await server.listen(0, '127.0.0.1')
        url = `ws://127.0.0.1:${port}/api/ws`
        mcpEndpoint = `http://127.0.0.1:${port}/mcp`

        const browser = await connect(url)
        sockets.push(browser.socket)
        browser.socket.send(JSON.stringify({ action: 'register', name: 'Human' }))
        await browser.next(message => message.action === 'register')
        await callMcpTool<JoinedMcpParticipant>(mcpEndpoint, 'join_session', { name: 'Agent' })
        await browser.next(message => message.players?.length === 2)

        const expired = await browser.next(message => message.players?.length === 1)
        expect(expired.reset).toBeUndefined()
        expect(expired.players?.[0]?.name).toBe('Human')
    })

    test('terminates WebSocket participants that fail the ping/pong liveness check', async () => {
        const browser = await connect(url)
        sockets.push(browser.socket)
        browser.socket.send(JSON.stringify({ action: 'register', name: 'Human' }))
        await browser.next(message => message.action === 'register')
        const serverSocket = [...server.webSocketServer.server.clients][0] as WebSocket & { isAlive: boolean }
        serverSocket.isAlive = false

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timed out waiting for heartbeat termination')), 1_000)
            browser.socket.once('close', () => {
                clearTimeout(timeout)
                resolve()
            })
        })
        expect(server.session.getPublicState().participants).toEqual([])
    })

    test('retains a departed MCP voter and their rationale through a revealed round, then purges them on reset', async () => {
        const alice = await connect(url)
        sockets.push(alice.socket)
        alice.socket.send(JSON.stringify({ action: 'register', name: 'Alice' }))
        await alice.next(message => message.action === 'register')

        const agent = await callMcpTool<JoinedMcpParticipant>(
            mcpEndpoint,
            'join_session',
            { name: 'Agent' },
        )
        await alice.next(message => message.players?.length === 2, 'MCP participant join')

        await callMcpTool(mcpEndpoint, 'submit_vote', {
            ...caller(agent),
            roundId: agent.round.roundId,
            card: '3',
            rationale: 'Touches storage',
        })
        alice.socket.send(JSON.stringify({ action: 'record-choice', choice: '5' }))
        const reveal = await alice.next(message => Array.isArray(message.choices), 'automatic reveal')
        expect(reveal.choices?.find(player => player.name === 'Agent')).toMatchObject({
            choice: '3',
            rationale: 'Touches storage',
        })

        const departure = await callMcpTool<{ code?: string }>(mcpEndpoint, 'leave_session', caller(agent))
        expect(departure.code).toBeUndefined()

        const afterLeave = await alice.next(message => Array.isArray(message.players), 'agent departure')
        expect(afterLeave.reset).toBeUndefined()
        expect(afterLeave.players).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Agent', choice: '3', rationale: 'Touches storage', disconnected: true }),
        ]))

        alice.socket.send(JSON.stringify({ action: 'reset' }))
        const resetMessage = await alice.next(message => message.reset === true, 'browser round reset')
        expect(resetMessage.originator).toBe('Alice')
        expect(resetMessage.players?.some(player => player.name === 'Agent')).toBe(false)
    })

    test('broadcasts subject changes, surfaces them at registration, and clears them on reset', async () => {
        const alice = await connect(url)
        const bob = await connect(url)
        sockets.push(alice.socket, bob.socket)
        alice.socket.send(JSON.stringify({ action: 'register', name: 'Alice' }))
        const registration = await alice.next(message => message.action === 'register')
        expect(registration.subject).toBeNull()
        // Drain the {players, reset: true} broadcast bob (already connected but
        // unregistered) receives from Alice's registration, so it doesn't satisfy a
        // later `reset === true` wait.
        await bob.next(message => message.players?.length === 1, 'broadcast from Alice registering')

        alice.socket.send(JSON.stringify({ action: 'set-subject', subject: '  Login flow  ' }))
        expect(await bob.next(message => message.subject === 'Login flow', 'subject broadcast to Bob')).toEqual({
            subject: 'Login flow',
        })

        bob.socket.send(JSON.stringify({ action: 'register', name: 'Robert' }))
        const bobRegistration = await bob.next(message => message.action === 'register')
        expect(bobRegistration.subject).toBe('Login flow')

        alice.socket.send(JSON.stringify({ action: 'record-choice', choice: '5' }))
        bob.socket.send(JSON.stringify({ action: 'record-choice', choice: '8' }))
        await bob.next(message => Array.isArray(message.choices), 'automatic reveal')

        alice.socket.send(JSON.stringify({ action: 'reset' }))
        const reset = await bob.next(message => message.reset === true, 'round reset')
        expect(reset.subject).toBeNull()

        alice.socket.send(JSON.stringify({ action: 'set-subject', subject: 'Signup flow' }))
        await bob.next(message => message.subject === 'Signup flow', 'second subject broadcast')

        alice.socket.send(JSON.stringify({ action: 'set-subject', subject: '' }))
        const cleared = await bob.next(message => Object.hasOwn(message, 'subject') && message.subject === null, 'subject cleared')
        expect(cleared).toEqual({ subject: null })
    })

    test('wakes an MCP wait_for_update long-poll when a WebSocket user sets the subject', async () => {
        const alice = await connect(url)
        sockets.push(alice.socket)
        alice.socket.send(JSON.stringify({ action: 'register', name: 'Alice' }))
        await alice.next(message => message.action === 'register')

        const agent = await callMcpTool<JoinedMcpParticipant & { round: { roundId: string }; stateRevision?: number }>(
            mcpEndpoint,
            'join_session',
            { name: 'Agent' },
        )
        await alice.next(message => message.players?.length === 2, 'MCP participant join')
        const state = await callMcpTool<{ stateRevision: number }>(mcpEndpoint, 'get_session_state', caller(agent))

        const pending = callMcpTool<{ timedOut: boolean; state: { round: { subject?: string } } }>(
            mcpEndpoint,
            'wait_for_update',
            { ...caller(agent), sinceRevision: state.stateRevision, timeoutSeconds: 5 },
        )

        alice.socket.send(JSON.stringify({ action: 'set-subject', subject: 'Login flow' }))
        const result = await pending
        expect(result.timedOut).toBe(false)
        expect(result.state.round.subject).toBe('Login flow')
    })

    test('rejects WebSocket upgrades outside the allowlist', async () => {
        expect(await rejectedUpgradeStatus(`ws://127.0.0.1:${new URL(mcpEndpoint).port}/not-websocket`)).toBe(404)
        expect(await rejectedUpgradeStatus(`ws://127.0.0.1:${new URL(mcpEndpoint).port}/mcp`)).toBe(405)
    })
})

async function rejectedUpgradeStatus(url: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(url)
        socket.once('unexpected-response', (_request, response) => {
            resolve(response.statusCode ?? 0)
            response.resume()
        })
        socket.once('open', () => {
            socket.terminate()
            reject(new Error(`Unexpectedly upgraded ${url}`))
        })
        socket.once('error', error => {
            if (socket.readyState !== WebSocket.CLOSED) {
                reject(error)
            }
        })
    })
}

async function callMcpTool<Result extends object = Record<string, unknown>>(
    endpoint: string,
    name: string,
    args: Record<string, unknown>,
): Promise<Result> {
    const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name,
            arguments: args,
            _meta: {
                [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
                [CLIENT_INFO_META_KEY]: { name: 'websocket-test', version: '1.0.0' },
                [CLIENT_CAPABILITIES_META_KEY]: {},
            },
        },
    }
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
            'mcp-protocol-version': MCP_PROTOCOL_VERSION,
            'mcp-method': 'tools/call',
            'mcp-name': name,
        },
        body: JSON.stringify(body),
    })
    expect(response.status).toBe(200)
    const json = await response.json() as {
        readonly result?: { readonly content?: readonly { readonly type: string; readonly text?: string }[] }
    }
    const text = json.result?.content?.find(item => item.type === 'text')?.text
    expect(text).toBeDefined()
    return JSON.parse(text!) as Result
}

async function connect(url: string): Promise<{
    socket: WebSocket
    next: (
        predicate: (message: ServerMessage) => boolean,
        description?: string,
    ) => Promise<ServerMessage>
}> {
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
        socket.once('open', resolve)
        socket.once('error', reject)
    })

    const messages: ServerMessage[] = []
    const waiters: Array<{
        readonly predicate: (message: ServerMessage) => boolean
        readonly resolve: (message: ServerMessage) => void
    }> = []

    socket.on('message', (data: RawData) => {
        const message = JSON.parse(data.toString()) as ServerMessage
        const waiterIndex = waiters.findIndex(waiter => waiter.predicate(message))
        if (waiterIndex >= 0) {
            waiters.splice(waiterIndex, 1)[0]?.resolve(message)
        } else {
            messages.push(message)
        }
    })

    return {
        socket,
        next: (predicate, description = 'matching message') => {
            const messageIndex = messages.findIndex(predicate)
            if (messageIndex >= 0) {
                return Promise.resolve(messages.splice(messageIndex, 1)[0]!)
            }
            return new Promise<ServerMessage>((resolve, reject) => {
                const waiter = { predicate, resolve }
                waiters.push(waiter)
                setTimeout(() => {
                    const waiterIndex = waiters.indexOf(waiter)
                    if (waiterIndex >= 0) {
                        waiters.splice(waiterIndex, 1)
                        reject(new Error(`Timed out waiting for WebSocket ${description}`))
                    }
                }, 2_000)
            })
        },
    }
}
