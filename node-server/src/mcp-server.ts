import { createMcpHandler, McpServer, type CallToolResult, type McpHttpHandler } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

import {
    PLANNING_POKER_CARDS,
    PlanningPokerError,
    PlanningPokerSession,
} from './planning-poker-session'

export const MCP_PROTOCOL_VERSION = '2026-07-28'
export const SESSION_RESOURCE_URI = sessionResourceUri('default')
export const PARTICIPATION_PROMPT_NAME = 'participate-in-planning-poker'
export const PLANNING_POKER_SERVER_INSTRUCTIONS = [
    'Participate in planning poker with this lifecycle:',
    '1. Call join_session once with a unique display name; observers set observer true and do not vote.',
    '2. Keep participantId private. It is private application state for addressing your participant, not authentication, a bearer token, or MCP transport/session state.',
    '3. Read the round subject, participants, and server-owned cards. Voters submit one advertised card for the current roundId with an optional concise rationale.',
    '4. Use subscriptions/listen for the session resource, then call get_session_state after each resource update. Use heartbeat while otherwise idle.',
    '5. Never attempt to access another participant’s unrevealed vote. Reveal is automatic when all active voters have selected.',
    '6. If a roundId is stale, reread state instead of retrying blindly. Reset only after reveal when asked to start another round.',
    '7. Snooze by unique public name when instructed, and call leave_session when finished.',
].join('\n')

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

async function runTool(operation: () => object): Promise<CallToolResult> {
    try {
        return result(operation())
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
        PARTICIPATION_PROMPT_NAME,
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

function participationPrompt(name: string, observer: boolean): string {
    const roleInstruction = observer
        ? 'You are an observer: read state and participate in discussion, but do not submit a vote.'
        : 'You are a voter: submit exactly one server-advertised card for the current roundId, with an optional concise rationale.'

    return [
        `Participate in this planning poker session as “${name}”.`,
        `Call join_session once with name “${name}” and observer ${observer}. Keep the returned participantId private: it is application state for your participant, not authentication, a bearer token, or MCP transport/session state.`,
        'Read the round subject, participants, and server-owned cards.',
        roleInstruction,
        'Use subscriptions/listen for the session resource and call get_session_state after every resource update. Use heartbeat while otherwise idle.',
        'Never attempt to access another participant’s unrevealed vote. Reveal happens automatically after all active voters select.',
        'If a roundId is stale, reread state instead of retrying blindly. Reset only after reveal when asked to start another round.',
        'Snooze a participant by unique public name when instructed, and call leave_session when finished.',
    ].join('\n')
}
