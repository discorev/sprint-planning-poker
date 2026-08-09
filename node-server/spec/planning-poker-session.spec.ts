import { describe, expect, test } from 'vitest'

import {
    PlanningPokerError,
    PlanningPokerSession,
} from '../src/planning-poker-session'

function createSession(overrides: { now?: () => number } = {}): PlanningPokerSession {
    let nextId = 0
    return new PlanningPokerSession({
        idGenerator: () => String(++nextId),
        heartbeatIntervalMs: 30_000,
        leaseDurationMs: 90_000,
        ...overrides,
    })
}

describe('PlanningPokerSession', () => {
    test('keeps active votes when a participant joins', () => {
        const session = createSession()
        const alice = session.joinParticipant({ name: 'Alice', transport: 'websocket' })
        session.joinParticipant({ name: 'Bob', transport: 'websocket' })

        session.setWebSocketVote(alice.participantId, '5')
        session.joinParticipant({ name: 'Carol', transport: 'mcp' })

        const publicState = session.getPublicState()
        expect(publicState.round.status).toBe('voting')
        expect(publicState.ownVote).toBeUndefined()
        expect(publicState.participants.find(participant => participant.name === 'Alice')?.selected).toBe(true)
        expect(session.getWebSocketPlayers().find(player => player.name === 'Alice')).toMatchObject({ selected: true })
    })

    test('uses names publicly while hiding private handles and another participant vote until reveal', () => {
        const session = createSession()
        const alice = session.joinParticipant({ name: 'Alice', transport: 'mcp' })
        const bob = session.joinParticipant({ name: 'Robert', transport: 'mcp' })
        const carol = session.joinParticipant({ name: 'Carol', transport: 'mcp' })

        session.submitVote(alice.participantId, alice.roundId, '5', 'Touches storage')

        expect(session.getStateFor(alice.participantId).ownVote).toEqual({
            card: '5',
            rationale: 'Touches storage',
        })
        const bobView = session.getStateFor(bob.participantId)
        expect(bobView.ownVote).toBeUndefined()
        expect(bobView.votes).toBeUndefined()
        expect(bobView.participants.find(participant => participant.name === 'Alice')?.selected).toBe(true)
        expect(JSON.stringify(bobView)).not.toContain('participantId')
        expect(JSON.stringify(session.getPublicState())).not.toContain('participantId')

        session.submitVote(bob.participantId, bob.roundId, '8', 'Touches APIs')
        const revealed = session.submitVote(carol.participantId, carol.roundId, '3')

        expect(revealed.round.status).toBe('revealed')
        expect(revealed.ownVote).toBeUndefined()
        expect(revealed.votes).toEqual([
            { name: 'Alice', card: '5', rationale: 'Touches storage' },
            { name: 'Robert', card: '8', rationale: 'Touches APIs' },
            { name: 'Carol', card: '3' },
        ])
        expect(JSON.stringify(revealed)).not.toContain('participantId')
    })

    test('requires a private MCP handle for caller-aware and lifecycle operations', () => {
        const session = createSession()
        const alice = session.joinParticipant({ name: 'Alice', transport: 'mcp' })
        const browser = session.joinParticipant({ name: 'Browser', transport: 'websocket' })

        session.submitVote(alice.participantId, alice.roundId, '13', 'Secret rationale')

        expect(() => session.getStateFor('Alice')).toThrowError(
            expect.objectContaining({ code: 'invalid_participant_handle' }),
        )
        expect(() => session.getStateFor(browser.participantId)).toThrowError(
            expect.objectContaining({ code: 'invalid_participant_handle' }),
        )
        expect(() => session.leaveMcpParticipant(browser.participantId)).toThrowError(
            expect.objectContaining({ code: 'invalid_participant_handle' }),
        )
        expect(() => session.heartbeat(browser.participantId)).toThrowError(
            expect.objectContaining({ code: 'invalid_participant_handle' }),
        )
        expect(session.getPublicState().ownVote).toBeUndefined()
    })

    test('rejects stale, invalid, observer, and post-reveal votes', () => {
        const session = createSession()
        const observer = session.joinParticipant({ name: 'Observer', observer: true, transport: 'mcp' })
        const alice = session.joinParticipant({ name: 'Alice', transport: 'mcp' })
        const bob = session.joinParticipant({ name: 'Robert', transport: 'mcp' })

        expect(() => session.submitVote(observer.participantId, observer.roundId, '5')).toThrowError(
            expect.objectContaining({ code: 'observer_cannot_vote' }),
        )
        expect(() => session.submitVote(alice.participantId, 'round-stale', '5')).toThrowError(
            expect.objectContaining({ code: 'stale_round' }),
        )
        expect(() => session.submitVote(alice.participantId, alice.roundId, '100')).toThrowError(
            expect.objectContaining({ code: 'invalid_card' }),
        )

        session.submitVote(alice.participantId, alice.roundId, '5')
        session.submitVote(bob.participantId, bob.roundId, '8')
        expect(() => session.submitVote(alice.participantId, alice.roundId, '3')).toThrowError(
            expect.objectContaining({ code: 'round_revealed' }),
        )
    })

    test('targets snooze by unique public name and resets only after reveal', () => {
        const session = createSession()
        const alice = session.joinParticipant({ name: 'Alice', transport: 'mcp' })
        const bob = session.joinParticipant({ name: 'Robert', transport: 'websocket' })
        const carol = session.joinParticipant({ name: 'Carol', transport: 'mcp' })

        expect(() => session.resetRound(alice.participantId)).toThrowError(
            expect.objectContaining({ code: 'round_not_revealed' }),
        )
        session.submitVote(alice.participantId, alice.roundId, '5')
        session.setWebSocketVote(bob.participantId, '8')
        const revealed = session.toggleSnoozeByName(alice.participantId, 'Carol')
        expect(revealed.round.status).toBe('revealed')
        expect(revealed.participants.find(participant => participant.name === 'Carol')?.snoozed).toBe(true)
        expect(() => session.toggleSnoozeByName(alice.participantId, carol.participantId)).toThrowError(
            expect.objectContaining({ code: 'participant_not_found' }),
        )

        const reset = session.resetRound(alice.participantId, 'Next story')
        expect(reset.round).toMatchObject({ subject: 'Next story', status: 'voting' })
        expect(reset.participants.every(participant => !participant.selected)).toBe(true)
        expect(reset.votes).toBeUndefined()
    })

    test('renews MCP leases and expires abandoned agents independently', () => {
        let now = 0
        const session = createSession({ now: () => now })
        const alice = session.joinParticipant({ name: 'Alice', transport: 'mcp' })
        const browser = session.joinParticipant({ name: 'Browser', transport: 'websocket' })

        now = 60_000
        expect(session.heartbeat(alice.participantId).leaseExpiresAt).toBe(new Date(150_000).toISOString())
        now = 100_000
        expect(session.pruneExpiredParticipants()).toEqual([])
        now = 151_000
        expect(session.pruneExpiredParticipants()).toEqual([alice.participantId])
        expect(session.findParticipantIdByName('Browser')).toBe(browser.participantId)
        expect(() => session.getStateFor(alice.participantId)).toThrow(PlanningPokerError)

        const replacement = session.joinParticipant({ name: 'Alice', transport: 'mcp' })
        expect(replacement.participantId).not.toBe(alice.participantId)
    })
})
