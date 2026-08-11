import {
    CLIENT_CAPABILITIES_META_KEY,
    CLIENT_INFO_META_KEY,
    PROTOCOL_VERSION_META_KEY,
} from '@modelcontextprotocol/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createPlanningPokerServer, type PlanningPokerServer } from '../src'
import {
    createPlanningPokerMcpHandler,
    MCP_PROTOCOL_VERSION,
    SESSION_RESOURCE_URI,
} from '../src/mcp-server'
import { PLANNING_POKER_SERVER_INSTRUCTIONS } from '../src/prompts'
import {
    PLANNING_POKER_CARDS,
    PlanningPokerSession,
} from '../src/planning-poker-session'

const envelope = {
    [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
    [CLIENT_INFO_META_KEY]: { name: 'planning-poker-test', version: '1.0.0' },
    [CLIENT_CAPABILITIES_META_KEY]: {},
}

interface ToolDescription {
    readonly name: string
    readonly description?: string
    readonly inputSchema?: {
        readonly properties?: Record<string, unknown>
        readonly required?: readonly string[]
    }
}

interface PromptDescription {
    readonly name: string
    readonly arguments?: readonly {
        readonly name: string
        readonly required?: boolean
    }[]
}

interface JsonRpcResponse {
    readonly result?: {
        readonly supportedVersions?: readonly string[]
        readonly instructions?: string
        readonly tools?: readonly ToolDescription[]
        readonly prompts?: readonly PromptDescription[]
        readonly messages?: readonly {
            readonly role: string
            readonly content: { readonly type: string; readonly text?: string }
        }[]
        readonly content?: readonly { readonly type: string; readonly text?: string }[]
        readonly contents?: readonly { readonly uri: string; readonly text?: string }[]
        readonly isError?: boolean
    }
    readonly error?: { readonly code: number; readonly message: string }
}

interface JoinedToolResult {
    readonly participantId: string
    readonly sessionResource: string
    readonly cards: readonly string[]
    readonly round: { readonly roundId: string }
}

interface StateToolResult {
    readonly stateRevision?: number
    readonly cards: readonly string[]
    readonly round: {
        readonly roundId: string
        readonly status: string
        readonly subject?: string
    }
    readonly participants: readonly {
        readonly name: string
        readonly type?: string
        readonly selected: boolean
        readonly snoozed?: boolean
    }[]
    readonly ownVote?: object
    readonly votes?: readonly object[]
}

function caller(participant: JoinedToolResult): { readonly participantId: string } {
    return { participantId: participant.participantId }
}

describe('planning poker MCP endpoint', () => {
    let server: PlanningPokerServer
    let endpoint: string

    beforeEach(async () => {
        server = createPlanningPokerServer({ leaseCleanupIntervalMs: 10_000 })
        const port = await server.listen(0, '127.0.0.1')
        endpoint = `http://127.0.0.1:${port}/mcp`
    })

    afterEach(async () => {
        await server.close()
    })

    test('discovers only MCP 2026-07-28 with participation instructions and exactly eight tools', async () => {
        const discover = await sendModern(endpoint, 'server/discover', {})
        expect(discover.response.status).toBe(200)
        expect(discover.body.result?.supportedVersions).toEqual([MCP_PROTOCOL_VERSION])
        expect(discover.body.result?.instructions).toBe(PLANNING_POKER_SERVER_INSTRUCTIONS)
        expect(PLANNING_POKER_SERVER_INSTRUCTIONS).toContain('effort/complexity and risk/uncertainty')
        expect(PLANNING_POKER_SERVER_INSTRUCTIONS).toContain('`5` should represent the effort of an average task')
        expect(PLANNING_POKER_SERVER_INSTRUCTIONS).toContain('definition of done')
        expect(PLANNING_POKER_SERVER_INSTRUCTIONS).toContain('Use `?` when you do not have enough context')
        expect(PLANNING_POKER_SERVER_INSTRUCTIONS).toContain('Estimate independently')
        expect(PLANNING_POKER_SERVER_INSTRUCTIONS).toContain('Compare the lowest and highest rationales first')
        expect(PLANNING_POKER_SERVER_INSTRUCTIONS).toContain('Do not automatically average the results')
        expect(PLANNING_POKER_SERVER_INSTRUCTIONS).toContain('Consensus is useful, but does not prove the estimate is correct')

        const tools = await sendModern(endpoint, 'tools/list', {})
        expect(tools.response.status).toBe(200)
        const listedTools = tools.body.result?.tools ?? []
        expect(listedTools.map(tool => tool.name).sort()).toEqual([
            'get_session_state',
            'heartbeat',
            'join_session',
            'leave_session',
            'reset_round',
            'snooze_participant',
            'submit_vote',
            'wait_for_update',
        ])
        expect(toolInputNames(listedTools, 'join_session')).toEqual(['name', 'observer'])
        expect(toolInputNames(listedTools, 'get_session_state')).toEqual(['participantId'])
        expect(toolInputNames(listedTools, 'wait_for_update')).toEqual([
            'participantId',
            'sinceRevision',
            'timeoutSeconds',
            'until',
        ])
        const waitForUpdate = listedTools.find(tool => tool.name === 'wait_for_update')
        expect(waitForUpdate?.description).toContain('timeoutSeconds defaults to 25 and cannot exceed 25')
        expect(waitForUpdate?.description).toContain('the response still includes the current state')
        expect(waitForUpdate?.description).toContain('Always process the returned state before polling again')
        expect(toolInputNames(listedTools, 'submit_vote')).toEqual([
            'card',
            'participantId',
            'rationale',
            'roundId',
        ])
        expect(toolInputNames(listedTools, 'reset_round')).toEqual(['participantId', 'subject'])
        expect(toolInputNames(listedTools, 'snooze_participant')).toEqual(['participantId', 'targetName'])
        expect(toolInputNames(listedTools, 'heartbeat')).toEqual(['participantId'])
        expect(toolInputNames(listedTools, 'leave_session')).toEqual(['participantId'])
    })

    test('lists only the participation prompt and validates and uses its arguments', async () => {
        const listed = await sendModern(endpoint, 'prompts/list', {})
        expect(listed.response.status).toBe(200)
        expect(listed.body.result?.prompts).toEqual([expect.objectContaining({
            name: 'participate-in-planning-poker',
            arguments: [
                expect.objectContaining({ name: 'name', required: true }),
                expect.objectContaining({ name: 'observer', required: false }),
            ],
        })])

        const voter = await sendModern(endpoint, 'prompts/get', {
            name: 'participate-in-planning-poker',
            arguments: { name: 'Estimator' },
        })
        expect(voter.response.status).toBe(200)
        expect(voter.body.result?.messages).toHaveLength(1)
        expect(voter.body.result?.messages?.[0]).toMatchObject({ role: 'user', content: { type: 'text' } })
        const voterText = voter.body.result?.messages?.[0]?.content.text ?? ''
        expect(voterText).toContain('as “Estimator”')
        expect(voterText).toContain('observer false')
        expect(voterText).toContain('When observer is false, submit exactly one server-advertised card')
        expect(voterText).toContain('effort/complexity and risk/uncertainty')
        expect(voterText).toContain('`5` should represent the effort of an average task')
        expect(voterText).toContain('Use `?` when you do not have enough context')
        expect(voterText).toContain('Estimate independently')
        expect(voterText).toContain('Compare the lowest and highest rationales first')
        expect(voterText).toContain('Do not automatically average the results')

        const observer = await sendModern(endpoint, 'prompts/get', {
            name: 'participate-in-planning-poker',
            arguments: { name: 'Observer', observer: 'true' },
        })
        expect(observer.response.status).toBe(200)
        const observerText = observer.body.result?.messages?.[0]?.content.text ?? ''
        expect(observerText).toContain('as “Observer”')
        expect(observerText).toContain('observer true')
        expect(observerText).toContain('do not submit a vote')

        const invalid = await sendModern(endpoint, 'prompts/get', {
            name: 'participate-in-planning-poker',
            arguments: { name: 'No' },
        })
        expect(invalid.body.error?.code).toBe(-32602)
        expect(invalid.body.error?.message).toContain('Invalid arguments for prompt participate-in-planning-poker')

        const invalidObserver = await sendModern(endpoint, 'prompts/get', {
            name: 'participate-in-planning-poker',
            arguments: { name: 'Observer', observer: 'sometimes' },
        })
        expect(invalidObserver.body.error?.code).toBe(-32602)
    })

    test('runs stateless participant tools with explicit IDs and caller-safe state', async () => {
        const alice = await callTool<JoinedToolResult>(endpoint, 'join_session', { name: 'Alice' })
        const bob = await callTool<JoinedToolResult>(endpoint, 'join_session', { name: 'Robert' })
        const carol = await callTool<JoinedToolResult>(endpoint, 'join_session', { name: 'Carol' })
        expect(Object.keys(alice).sort()).toEqual([
            'cards',
            'heartbeatIntervalSeconds',
            'leaseDurationSeconds',
            'participantId',
            'round',
            'sessionResource',
        ])
        expect(alice.cards).toEqual(PLANNING_POKER_CARDS)

        const aliceVote = await callTool<StateToolResult>(endpoint, 'submit_vote', {
            ...caller(alice),
            roundId: alice.round.roundId,
            card: '5',
            rationale: 'Touches storage',
        })

        expect(aliceVote.ownVote).toEqual({ card: '5', rationale: 'Touches storage' })
        expect(JSON.stringify(aliceVote)).not.toContain('participantId')

        const bobState = await callTool<StateToolResult>(endpoint, 'get_session_state', caller(bob))
        expect(bobState.cards).toEqual(alice.cards)
        expect(bobState.ownVote).toBeUndefined()
        expect(bobState.votes).toBeUndefined()
        expect(bobState.participants.find(participant => participant.name === 'Alice')?.selected).toBe(true)
        expect(bobState.participants.find(participant => participant.name === 'Alice')?.type).toBe('agent')
        expect(JSON.stringify(bobState)).not.toContain('participantId')

        await callTool(endpoint, 'submit_vote', {
            ...caller(bob),
            roundId: bob.round.roundId,
            card: '8',
        })
        const revealed = await callTool<StateToolResult>(endpoint, 'submit_vote', {
            ...caller(carol),
            roundId: carol.round.roundId,
            card: '3',
        })
        expect(revealed.round.status).toBe('revealed')
        expect(revealed.votes).toContainEqual(expect.objectContaining({
            name: 'Alice',
            card: '5',
            rationale: 'Touches storage',
        }))
        expect(JSON.stringify(revealed)).not.toContain('participantId')

        const reset = await callTool<StateToolResult>(endpoint, 'reset_round', {
            ...caller(bob),
            subject: 'Next story',
        })
        expect(reset.round.status).toBe('voting')
        expect(reset.round.subject).toBe('Next story')
        expect(JSON.stringify(reset)).not.toContain('participantId')

        const snoozed = await callTool<StateToolResult>(endpoint, 'snooze_participant', {
            ...caller(alice),
            targetName: 'Robert',
        })
        expect(snoozed.participants.find(participant => participant.name === 'Robert')).toMatchObject({
            name: 'Robert',
            snoozed: true,
        })
        expect(JSON.stringify(snoozed)).not.toContain('participantId')

        const privateTarget = await sendModern(endpoint, 'tools/call', {
            name: 'snooze_participant',
            arguments: {
                ...caller(alice),
                targetName: bob.participantId,
            },
        })
        expect(privateTarget.body.result?.isError).toBe(true)
        expect(privateTarget.body.result?.content?.[0]?.text).toContain('participant_not_found')

        const left = await callTool(endpoint, 'leave_session', caller(carol))
        expect(left).toEqual({ left: true })
    })

    test('keeps participant handles and unrevealed votes out of shared state', async () => {
        const alice = await callTool<JoinedToolResult>(endpoint, 'join_session', { name: 'Alice' })
        const bob = await callTool<JoinedToolResult>(endpoint, 'join_session', { name: 'Robert' })
        await callTool(endpoint, 'join_session', { name: 'Carol' })
        await callTool(endpoint, 'submit_vote', {
            ...caller(alice),
            roundId: alice.round.roundId,
            card: '13',
            rationale: 'SECRET RATIONALE',
        })

        const resource = await sendModern(endpoint, 'resources/read', { uri: SESSION_RESOURCE_URI })
        const publicText = resource.body.result?.contents?.[0]?.text ?? '{}'
        const publicState = JSON.parse(publicText) as StateToolResult
        expect(publicState.participants.find(participant => participant.name === 'Alice')).toMatchObject({
            name: 'Alice',
            selected: true,
        })
        expect(publicText).not.toContain('participantId')
        expect(publicText).not.toContain(alice.participantId)
        expect(publicText).not.toContain(bob.participantId)
        expect(publicText).not.toContain('SECRET RATIONALE')

        const nameAsHandle = await sendModern(endpoint, 'tools/call', {
            name: 'get_session_state',
            arguments: { participantId: 'Alice' },
        })
        expect(nameAsHandle.body.result?.isError).toBe(true)
        expect(nameAsHandle.body.result?.content?.[0]?.text).toContain('invalid_participant_handle')
        expect(nameAsHandle.body.result?.content?.[0]?.text).not.toContain('SECRET RATIONALE')
    })

    test('long-polls with wait_for_update, returning fresh state, timeouts, and participant errors', async () => {
        const alice = await callTool<JoinedToolResult>(endpoint, 'join_session', { name: 'Alice' })
        const aliceState = await callTool<Required<Pick<StateToolResult, 'stateRevision'>>>(
            endpoint,
            'get_session_state',
            caller(alice),
        )

        const pending = callTool<{ timedOut: boolean; leaseExpiresAt: string; state: StateToolResult }>(
            endpoint,
            'wait_for_update',
            { ...caller(alice), sinceRevision: aliceState.stateRevision, timeoutSeconds: 25 },
        )
        await server.session.joinParticipant({ name: 'Robert', transport: 'mcp' })
        const changed = await pending
        expect(changed.timedOut).toBe(false)
        expect(changed.state.participants.some(participant => participant.name === 'Robert')).toBe(true)
        expect(new Date(changed.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now())

        const timedOut = await sendModern(endpoint, 'tools/call', {
            name: 'wait_for_update',
            arguments: {
                ...caller(alice),
                sinceRevision: changed.state.stateRevision,
                timeoutSeconds: 1,
            },
        })
        const timedOutText = timedOut.body.result?.content?.find(item => item.type === 'text')?.text
        expect(JSON.parse(timedOutText!)).toMatchObject({ timedOut: true })

        const unknownParticipant = await sendModern(endpoint, 'tools/call', {
            name: 'wait_for_update',
            arguments: { participantId: 'unknown', sinceRevision: 0 },
        })
        expect(unknownParticipant.body.result?.isError).toBe(true)
        expect(unknownParticipant.body.result?.content?.[0]?.text).toContain('invalid_participant_handle')
    })

    test('renews MCP leases without returning the private participant handle', async () => {
        const alice = await callTool<JoinedToolResult>(endpoint, 'join_session', { name: 'Alice' })
        const heartbeat = await callTool<{ alive: boolean; leaseExpiresAt: string }>(
            endpoint,
            'heartbeat',
            caller(alice),
        )
        expect(heartbeat.alive).toBe(true)
        expect(heartbeat).not.toHaveProperty('participantId')
        expect(JSON.stringify(heartbeat)).not.toContain(alice.participantId)
        expect(new Date(heartbeat.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now())
    })

    test('rejects initialize, malformed modern headers, and disallowed origins', async () => {
        const initialize = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'old', version: '1' } },
            }),
        })
        expect(initialize.status).toBe(400)
        expect((await initialize.json() as JsonRpcResponse).error?.code).toBe(-32022)

        const mismatch = await sendModern(endpoint, 'tools/call', {
            name: 'join_session',
            arguments: { name: 'Alice' },
        }, { 'mcp-name': 'heartbeat' })
        expect(mismatch.response.status).toBe(400)
        expect(mismatch.body.error?.code).toBe(-32020)

        const disallowedOrigin = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                origin: 'https://attacker.example',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: envelope } }),
        })
        expect(disallowedOrigin.status).toBe(403)
        expect(disallowedOrigin.headers.get('x-accel-buffering')).toBe('no')
    })

    test('returns 405 for GET and DELETE and ignores obsolete transport headers', async () => {
        for (const method of ['GET', 'DELETE']) {
            const response = await fetch(endpoint, {
                method,
                headers: {
                    'mcp-session-id': 'obsolete-session',
                    'last-event-id': 'obsolete-event',
                },
            })
            expect(response.status).toBe(405)
            expect(response.headers.get('mcp-session-id')).toBeNull()
            expect(response.headers.get('last-event-id')).toBeNull()
        }

        const discover = await sendModern(endpoint, 'server/discover', {}, {
            'mcp-session-id': 'obsolete-session',
            'last-event-id': 'obsolete-event',
        })
        expect(discover.response.status).toBe(200)
        expect(discover.response.headers.get('mcp-session-id')).toBeNull()
        expect(discover.response.headers.get('last-event-id')).toBeNull()
    })

    test('serves POST subscriptions/listen SSE and publishes resource updates', async () => {
        const controller = new AbortController()
        const listenBody = modernBody('subscriptions/listen', {
            notifications: { resourceSubscriptions: [SESSION_RESOURCE_URI] },
        })
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: modernHeaders(listenBody),
            body: JSON.stringify(listenBody),
            signal: controller.signal,
        })
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('text/event-stream')
        expect(response.headers.get('x-accel-buffering')).toBe('no')
        const reader = response.body!.getReader()
        const acknowledged = await readUntil(reader, 'notifications/subscriptions/acknowledged')
        expect(acknowledged).toContain(SESSION_RESOURCE_URI)

        const alice = server.session.joinParticipant({ name: 'Alice', transport: 'mcp' })
        const updated = await readUntil(reader, 'notifications/resources/updated')
        expect(updated).toContain(SESSION_RESOURCE_URI)
        expect(updated).not.toContain('id:')
        expect(updated).not.toContain('participantId')
        expect(updated).not.toContain(alice.participantId)

        controller.abort()
        await reader.cancel().catch(() => undefined)

        const reconnectController = new AbortController()
        const reconnectResponse = await fetch(endpoint, {
            method: 'POST',
            headers: modernHeaders(listenBody),
            body: JSON.stringify(listenBody),
            signal: reconnectController.signal,
        })
        const reconnectReader = reconnectResponse.body!.getReader()
        await readUntil(reconnectReader, 'notifications/subscriptions/acknowledged')
        const state = await sendModern(endpoint, 'resources/read', { uri: SESSION_RESOURCE_URI })
        expect(state.body.result?.contents?.[0]?.text).toContain('Alice')
        reconnectController.abort()
        await reconnectReader.cancel().catch(() => undefined)
    })

    test('detaches resource notifications before closing the MCP handler', async () => {
        const isolatedSession = new PlanningPokerSession()
        const mcpHandler = createPlanningPokerMcpHandler(isolatedSession)
        const notify = vi.spyOn(mcpHandler.handler.notify, 'resourceUpdated')

        await mcpHandler.close()
        isolatedSession.joinParticipant({ name: 'Alice', transport: 'mcp' })

        expect(notify).not.toHaveBeenCalled()
    })

    test('derives the advertised resource URI from the configured session ID', async () => {
        const customServer = createPlanningPokerServer({ sessionId: 'team alpha' })
        const customPort = await customServer.listen(0, '127.0.0.1')
        const customEndpoint = `http://127.0.0.1:${customPort}/mcp`
        try {
            const joined = await callTool<JoinedToolResult>(customEndpoint, 'join_session', { name: 'Alice' })
            expect(joined.sessionResource).toBe('planning-poker://sessions/team%20alpha')
            const resource = await sendModern(customEndpoint, 'resources/read', { uri: joined.sessionResource })
            expect(resource.response.status).toBe(200)
            expect(resource.body.result?.contents?.[0]?.uri).toBe(joined.sessionResource)
        } finally {
            await customServer.close()
        }
    })
})

function toolInputNames(tools: readonly ToolDescription[], name: string): string[] {
    return Object.keys(tools.find(tool => tool.name === name)?.inputSchema?.properties ?? {}).sort()
}

function modernBody(method: string, params: Record<string, unknown>, id = 1): Record<string, unknown> {
    return {
        jsonrpc: '2.0',
        id,
        method,
        params: { ...params, _meta: envelope },
    }
}

function modernHeaders(body: Record<string, unknown>, overrides: Record<string, string> = {}): Record<string, string> {
    const params = body.params as { name?: unknown; uri?: unknown }
    const method = body.method as string
    const name = method === 'resources/read' ? params.uri : params.name
    return {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': MCP_PROTOCOL_VERSION,
        'mcp-method': method,
        ...(typeof name === 'string' && { 'mcp-name': name }),
        ...overrides,
    }
}

async function sendModern(
    endpoint: string,
    method: string,
    params: Record<string, unknown>,
    headerOverrides: Record<string, string> = {},
): Promise<{ response: Response; body: JsonRpcResponse }> {
    const body = modernBody(method, params)
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: modernHeaders(body, headerOverrides),
        body: JSON.stringify(body),
    })
    return { response, body: await response.json() as JsonRpcResponse }
}

async function callTool<Result extends object = Record<string, unknown>>(
    endpoint: string,
    name: string,
    args: Record<string, unknown>,
): Promise<Result> {
    const { response, body } = await sendModern(endpoint, 'tools/call', { name, arguments: args })
    expect(response.status).toBe(200)
    const text = body.result?.content?.find(item => item.type === 'text')?.text
    expect(text).toBeDefined()
    return JSON.parse(text!) as Result
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string): Promise<string> {
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes(needle)) {
        const read = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${needle}`)), 2_000)),
        ])
        if (read.done) {
            throw new Error(`Stream ended before ${needle}`)
        }
        text += decoder.decode(read.value, { stream: true })
    }
    return text
}
