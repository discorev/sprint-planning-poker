import { describe, expect, test } from 'vitest'

import {
    PLANNING_POKER_CARDS,
    PlanningPokerSession,
} from '../src/planning-poker-session'

describe('planning poker card contract', () => {
    test('advertises the canonical domain deck and accepts every advertised card', () => {
        const session = new PlanningPokerSession({ idGenerator: () => 'test-id' })
        const participant = session.joinParticipant({ name: 'Alice', transport: 'websocket' })
        const advertisedCards = session.getPublicState().cards

        expect(advertisedCards).toBe(PLANNING_POKER_CARDS)
        expect(advertisedCards.length).toBeGreaterThan(0)
        expect(new Set(advertisedCards).size).toBe(advertisedCards.length)
        for (const card of advertisedCards) {
            expect(() => session.setWebSocketVote(participant.participantId, card)).not.toThrow()
        }
    })
})
