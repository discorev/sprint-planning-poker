import { createMcpHandler, McpServer, type CallToolResult, type McpHttpHandler } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

import {
    PLANNING_POKER_CARDS,
    PlanningPokerError,
    PlanningPokerSession,
} from './planning-poker-session'
import {
    PLANNING_POKER_SERVER_INSTRUCTIONS,
    participationPrompt,
} from './prompts'

export const MCP_PROTOCOL_VERSION = '2026-07-28'
export const SESSION_RESOURCE_URI = sessionResourceUri('default')

const participantInput = z.object({
    participantId: z.string().min(1),
})

export interface PlanningPokerMcpHandler {
    readonly handler: McpHttpHandler
    readonly sessionResourceUri: string
    close(): Promise<void>
}

export function sessionResourceUri(sessionId: string): string {
    return `planning-poker://sessions/${encodeURIComponent(sessionId)}`
}

function result(value: object): CallToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(value) }],
    }
}

async function runTool(operation: () => object | Promise<object>): Promise<CallToolResult> {
    try {
        return result(await operation())
    } catch (error) {
        if (error instanceof PlanningPokerError) {
            return {
                isError: true,
                content: [{ type: 'text', text: JSON.stringify({ code: error.code, error: error.message }) }],
            }
        }
        throw error
    }
}

export function createPlanningPokerMcpHandler(session: PlanningPokerSession): PlanningPokerMcpHandler {
    const resourceUri = sessionResourceUri(session.sessionId)
    const handler = createMcpHandler(() => createPlanningPokerMcpServer(session, resourceUri), {
        legacy: 'reject',
        keepAliveMs: 15_000,
    })
    const unsubscribe = session.subscribe(() => handler.notify.resourceUpdated(resourceUri))
    return {
        handler,
        sessionResourceUri: resourceUri,
        close: async () => {
            unsubscribe()
            await handler.close()
        },
    }
}

function createPlanningPokerMcpServer(session: PlanningPokerSession, resourceUri: string): McpServer {
    const server = new McpServer(
        {
            name: 'sprint-planning-poker',
            version: '1.0.0',
        },
        {
            capabilities: { resources: { subscribe: true } },
            instructions: PLANNING_POKER_SERVER_INSTRUCTIONS,
        },
    )

    server.registerPrompt(
        'participate-in-planning-poker',
        {
            title: 'Participate in planning poker',
            description: 'Join and participate in the current planning poker session as a voter or observer.',
            argsSchema: z.object({
                name: z.string().min(3).describe('Unique public display name to use when joining.'),
                observer: z.stringbool().optional().describe('Whether to join as an observer who does not vote.'),
            }),
        },
        ({ name, observer = false }) => ({
            messages: [{
                role: 'user',
                content: {
                    type: 'text',
                    text: participationPrompt(name, observer),
                },
            }],
        }),
    )

    server.registerResource(
        'planning-poker-session',
        resourceUri,
        {
            title: 'Planning poker session',
            description: 'Current public planning poker state. Use get_session_state for the caller-safe view before reveal.',
            mimeType: 'application/json',
        },
        async uri => ({
            contents: [{
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify(session.getPublicState()),
            }],
        }),
    )

    server.registerTool(
        'join_session',
        {
            description: 'Join under a unique public display name. The returned participantId is a private opaque handle for this caller’s subsequent actions.',
            inputSchema: z.object({
                name: z.string().min(3),
                observer: z.boolean().optional(),
            }),
        },
        async ({ name, observer }): Promise<CallToolResult> => runTool(() => {
            const joined = session.joinParticipant({ name, observer, transport: 'mcp' })
            const state = session.getStateFor(joined.participantId)
            return {
                participantId: joined.participantId,
                heartbeatIntervalSeconds: session.heartbeatIntervalMs / 1_000,
                leaseDurationSeconds: session.leaseDurationMs / 1_000,
                sessionResource: resourceUri,
                cards: state.cards,
                round: state.round,
            }
        }),
    )

    server.registerTool(
        'get_session_state',
        {
            description: 'Get caller-safe state using the caller’s private participantId. Before reveal, only that participant’s vote is included.',
            inputSchema: participantInput,
        },
        async ({ participantId }): Promise<CallToolResult> =>
            runTool(() => session.getStateFor(participantId)),
    )

    server.registerTool(
        'wait_for_update',
        {
            description: 'Long-poll for session changes: blocks until stateRevision advances past sinceRevision (optionally only until reveal or a new round), or until timeout. Renews the caller’s lease, so use it instead of heartbeat while waiting. On timedOut: true, call it again.',
            inputSchema: z.object({
                participantId: z.string().min(1),
                sinceRevision: z.number().int().min(0).describe('The stateRevision from the last state the caller saw.'),
                timeoutSeconds: z.number().int().min(1).max(25).optional(),
                until: z.enum(['any-change', 'reveal-or-new-round']).optional()
                    .describe('Use \'reveal-or-new-round\' after voting to sleep through other participants’ individual votes.'),
            }),
        },
        async ({ participantId, sinceRevision, timeoutSeconds, until }): Promise<CallToolResult> =>
            runTool(() => session.waitForUpdate(participantId, {
                sinceRevision,
                timeoutMs: (timeoutSeconds ?? 25) * 1_000,
                until,
            })),
    )

    server.registerTool(
        'submit_vote',
        {
            description: 'Submit a planning poker card and optional private-until-reveal rationale for the current round.',
            inputSchema: z.object({
                participantId: z.string().min(1),
                roundId: z.string().min(1),
                card: z.enum(PLANNING_POKER_CARDS),
                rationale: z.string().max(2_000).optional(),
            }),
        },
        async ({ participantId, roundId, card, rationale }): Promise<CallToolResult> =>
            runTool(() => session.submitVote(participantId, roundId, card, rationale)),
    )

    server.registerTool(
        'reset_round',
        {
            description: 'Start a new round after automatic reveal.',
            inputSchema: z.object({
                participantId: z.string().min(1),
                subject: z.string().max(500).optional(),
            }),
        },
        async ({ participantId, subject }): Promise<CallToolResult> =>
            runTool(() => session.resetRound(participantId, subject)),
    )

    server.registerTool(
        'snooze_participant',
        {
            description: 'Toggle snooze for the caller or another participant by their unique public display name.',
            inputSchema: z.object({
                participantId: z.string().min(1),
                targetName: z.string().min(3),
            }),
        },
        async ({ participantId, targetName }): Promise<CallToolResult> =>
            runTool(() => session.toggleSnoozeByName(participantId, targetName)),
    )

    server.registerTool(
        'heartbeat',
        {
            description: 'Renew the MCP participant’s application lease using its private participantId.',
            inputSchema: participantInput,
        },
        async ({ participantId }): Promise<CallToolResult> => runTool(() => ({
            alive: true,
            leaseDurationSeconds: session.leaseDurationMs / 1_000,
            ...session.heartbeat(participantId),
        })),
    )

    server.registerTool(
        'leave_session',
        {
            description: 'Leave the planning poker session and release the participant name and vote.',
            inputSchema: participantInput,
        },
        async ({ participantId }): Promise<CallToolResult> => runTool(() => ({
            left: session.leaveMcpParticipant(participantId),
        })),
    )

    return server
}
