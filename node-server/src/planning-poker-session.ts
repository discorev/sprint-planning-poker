import { randomUUID } from 'node:crypto'

export const PLANNING_POKER_CARDS = ['?', '1', '2', '3', '5', '8', '13', '21'] as const

export type PlanningPokerCard = typeof PLANNING_POKER_CARDS[number]
export type ParticipantTransport = 'websocket' | 'mcp'
export type RoundStatus = 'voting' | 'revealed'

interface Participant {
    readonly participantId: string
    readonly name: string
    readonly observer: boolean
    readonly transport: ParticipantTransport
    snoozed: boolean
    leaseExpiresAt?: number
}

type McpParticipant = Participant & {
    leaseExpiresAt: number
    readonly transport: 'mcp'
}

interface Vote {
    readonly card: PlanningPokerCard
    readonly rationale?: string
}

export interface PublicParticipant {
    readonly name: string
    readonly observer: boolean
    readonly snoozed: boolean
    readonly selected: boolean
}

export interface PublicVote extends Vote {
    readonly name: string
}

export interface PlanningPokerState {
    readonly sessionId: string
    readonly stateRevision: number
    readonly cards: readonly PlanningPokerCard[]
    readonly round: {
        readonly roundId: string
        readonly subject?: string
        readonly status: RoundStatus
    }
    readonly participants: readonly PublicParticipant[]
    readonly ownVote?: Vote
    readonly votes?: readonly PublicVote[]
}

export interface WebSocketPlayerState {
    readonly name: string
    readonly choice?: string
    readonly selected: boolean
    readonly snoozed: boolean
    readonly observer: boolean
}

export type PlanningPokerEvent =
    | { readonly type: 'participant-joined'; readonly participantId: string; readonly transport: ParticipantTransport }
    | { readonly type: 'participant-left'; readonly participantId: string; readonly transport: ParticipantTransport; readonly revealed: boolean }
    | { readonly type: 'participants-expired'; readonly participantIds: readonly string[]; readonly revealed: boolean }
    | { readonly type: 'vote-changed'; readonly participantId: string; readonly revealed: boolean }
    | { readonly type: 'round-reset'; readonly participantId: string }
    | { readonly type: 'participant-snoozed'; readonly participantId: string; readonly snoozed: boolean; readonly revealed: boolean }

export type PlanningPokerListener = (event: PlanningPokerEvent) => void

export interface PlanningPokerSessionOptions {
    readonly sessionId?: string
    readonly heartbeatIntervalMs?: number
    readonly leaseDurationMs?: number
    readonly now?: () => number
    readonly idGenerator?: () => string
}

export interface JoinParticipantInput {
    readonly name: string
    readonly observer?: boolean
    readonly transport: ParticipantTransport
}

export interface JoinedParticipant {
    readonly participantId: string
    readonly sessionId: string
    readonly roundId: string
    readonly heartbeatIntervalMs?: number
    readonly leaseDurationMs?: number
    readonly leaseExpiresAt?: string
}

export class PlanningPokerError extends Error {
    constructor(readonly code: string, message: string) {
        super(message)
        this.name = 'PlanningPokerError'
    }
}

export class PlanningPokerSession {
    readonly sessionId: string
    readonly heartbeatIntervalMs: number
    readonly leaseDurationMs: number

    private readonly participants = new Map<string, Participant>()
    private readonly votes = new Map<string, Vote>()
    private readonly listeners = new Set<PlanningPokerListener>()
    private readonly now: () => number
    private readonly idGenerator: () => string
    private revision = 0
    private roundId: string
    private roundSubject?: string
    private roundStatus: RoundStatus = 'voting'

    constructor(options: PlanningPokerSessionOptions = {}) {
        this.sessionId = options.sessionId ?? 'default'
        this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000
        this.leaseDurationMs = options.leaseDurationMs ?? 90_000
        this.now = options.now ?? Date.now
        this.idGenerator = options.idGenerator ?? randomUUID
        this.roundId = this.nextId('round')
    }

    subscribe(listener: PlanningPokerListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    joinParticipant(input: JoinParticipantInput): JoinedParticipant {
        this.pruneExpiredParticipants()
        const name = input.name
        if (name.length < 3) {
            throw new PlanningPokerError('name_too_short', 'name is too short')
        }
        if (this.findParticipantByName(name)) {
            throw new PlanningPokerError('name_taken', 'name is already taken')
        }

        const participantId = this.nextId('participant')
        const leaseExpiresAt = input.transport === 'mcp' ? this.now() + this.leaseDurationMs : undefined
        const participant: Participant = {
            participantId,
            name,
            observer: input.observer ?? false,
            snoozed: false,
            transport: input.transport,
            ...(leaseExpiresAt !== undefined && { leaseExpiresAt }),
        }
        this.participants.set(participantId, participant)
        this.changed({ type: 'participant-joined', participantId, transport: input.transport })

        return {
            participantId,
            sessionId: this.sessionId,
            roundId: this.roundId,
            ...(leaseExpiresAt !== undefined && {
                heartbeatIntervalMs: this.heartbeatIntervalMs,
                leaseDurationMs: this.leaseDurationMs,
                leaseExpiresAt: new Date(leaseExpiresAt).toISOString(),
            }),
        }
    }

    getStateFor(participantId: string): PlanningPokerState {
        const participant = this.requireMcpParticipant(participantId)
        this.renewLease(participant)
        return this.projectState(participantId)
    }

    getPublicState(): PlanningPokerState {
        this.pruneExpiredParticipants()
        return this.projectState()
    }

    submitVote(
        participantId: string,
        roundId: string,
        choice: string,
        rationale?: string,
    ): PlanningPokerState {
        const participant = this.requireMcpParticipant(participantId)
        this.assertCurrentRound(roundId)
        this.assertVotingRound()
        if (participant.observer) {
            throw new PlanningPokerError('observer_cannot_vote', 'observers cannot vote')
        }
        if (!isPlanningPokerCard(choice)) {
            throw new PlanningPokerError('invalid_card', 'choice is not a valid planning poker card')
        }

        this.renewLease(participant)
        participant.snoozed = false
        this.votes.set(participantId, {
            card: choice,
            ...(rationale?.trim() && { rationale: rationale.trim() }),
        })
        const revealed = this.revealIfComplete()
        this.changed({ type: 'vote-changed', participantId, revealed })
        return this.projectState(participantId)
    }

    setWebSocketVote(participantId: string, choice?: string): void {
        const participant = this.requireWebSocketParticipant(participantId)
        this.assertVotingRound()
        if (participant.observer) {
            return
        }
        participant.snoozed = false

        if (choice === undefined) {
            this.votes.delete(participantId)
        } else {
            if (!isPlanningPokerCard(choice)) {
                throw new PlanningPokerError('invalid_card', 'choice is not a valid planning poker card')
            }
            this.votes.set(participantId, { card: choice })
        }
        const revealed = this.revealIfComplete()
        this.changed({ type: 'vote-changed', participantId, revealed })
    }

    resetRound(participantId: string, subject?: string): PlanningPokerState {
        const participant = this.requireMcpParticipant(participantId)
        this.resetRoundFor(participant, subject)
        return this.projectState(participantId)
    }

    resetWebSocketRound(participantId: string): void {
        this.resetRoundFor(this.requireWebSocketParticipant(participantId))
    }

    toggleSnoozeByName(participantId: string, targetName: string): PlanningPokerState {
        const participant = this.requireMcpParticipant(participantId)
        this.toggleSnoozeFor(participant, this.requireParticipantByName(targetName))
        return this.projectState(participantId)
    }

    toggleWebSocketSnoozeByName(participantId: string, targetName: string): void {
        const participant = this.requireWebSocketParticipant(participantId)
        this.toggleSnoozeFor(participant, this.requireParticipantByName(targetName))
    }

    heartbeat(participantId: string): { readonly leaseExpiresAt: string } {
        const participant = this.requireMcpParticipant(participantId)
        this.renewLease(participant)
        return { leaseExpiresAt: new Date(participant.leaseExpiresAt).toISOString() }
    }

    leaveMcpParticipant(participantId: string): boolean {
        this.requireMcpParticipant(participantId)
        return this.leaveParticipant(participantId)
    }

    leaveParticipant(participantId: string): boolean {
        this.pruneExpiredParticipants()
        const participant = this.participants.get(participantId)
        if (!participant) {
            return false
        }
        this.participants.delete(participantId)
        this.votes.delete(participantId)
        const revealed = this.revealIfComplete()
        this.changed({ type: 'participant-left', participantId, transport: participant.transport, revealed })
        return true
    }

    pruneExpiredParticipants(): readonly string[] {
        const now = this.now()
        const expired = [...this.participants.values()]
            .filter(participant => participant.leaseExpiresAt !== undefined && participant.leaseExpiresAt <= now)
            .map(participant => participant.participantId)

        if (expired.length === 0) {
            return expired
        }
        for (const participantId of expired) {
            this.participants.delete(participantId)
            this.votes.delete(participantId)
        }
        const revealed = this.revealIfComplete()
        this.changed({ type: 'participants-expired', participantIds: expired, revealed })
        return expired
    }

    findParticipantIdByName(name: string): string | undefined {
        return this.findParticipantByName(name)?.participantId
    }

    getParticipantName(participantId: string): string | undefined {
        return this.participants.get(participantId)?.name
    }

    getWebSocketPlayers(): readonly WebSocketPlayerState[] {
        this.pruneExpiredParticipants()
        return [...this.participants.values()].map(participant => {
            const vote = this.votes.get(participant.participantId)
            return {
                name: participant.name,
                ...(this.roundStatus === 'revealed' && vote && { choice: vote.card }),
                selected: vote !== undefined,
                snoozed: participant.snoozed,
                observer: participant.observer,
            }
        })
    }

    private projectState(viewerId?: string): PlanningPokerState {
        const ownVote = viewerId ? this.votes.get(viewerId) : undefined
        const participants = [...this.participants.values()].map(participant => ({
            name: participant.name,
            observer: participant.observer,
            snoozed: participant.snoozed,
            selected: this.votes.has(participant.participantId),
        }))
        const revealedVotes = this.roundStatus === 'revealed'
            ? [...this.votes.entries()].flatMap(([participantId, vote]) => {
                const participant = this.participants.get(participantId)
                return participant ? [{ name: participant.name, ...vote }] : []
            })
            : undefined

        return {
            sessionId: this.sessionId,
            stateRevision: this.revision,
            cards: PLANNING_POKER_CARDS,
            round: {
                roundId: this.roundId,
                ...(this.roundSubject && { subject: this.roundSubject }),
                status: this.roundStatus,
            },
            participants,
            ...(this.roundStatus === 'voting' && ownVote && { ownVote: { ...ownVote } }),
            ...(revealedVotes && { votes: revealedVotes }),
        }
    }

    private resetRoundFor(participant: Participant, subject?: string): void {
        if (this.roundStatus !== 'revealed') {
            throw new PlanningPokerError('round_not_revealed', 'the current round has not been revealed')
        }
        this.renewLease(participant)
        this.votes.clear()
        this.roundId = this.nextId('round')
        this.roundSubject = subject?.trim() || undefined
        this.roundStatus = 'voting'
        this.changed({ type: 'round-reset', participantId: participant.participantId })
    }

    private toggleSnoozeFor(participant: Participant, target: Participant): void {
        this.renewLease(participant)
        target.snoozed = !target.snoozed
        const revealed = this.revealIfComplete()
        this.changed({
            type: 'participant-snoozed',
            participantId: target.participantId,
            snoozed: target.snoozed,
            revealed,
        })
    }

    private requireMcpParticipant(participantId: string): McpParticipant {
        this.pruneExpiredParticipants()
        const participant = this.participants.get(participantId)
        if (participant?.transport !== 'mcp' || participant.leaseExpiresAt === undefined) {
            throw new PlanningPokerError(
                'invalid_participant_handle',
                'participantId is unknown, expired, or not managed by MCP; join the session again',
            )
        }
        return participant as McpParticipant
    }

    private requireWebSocketParticipant(participantId: string): Participant {
        const participant = this.requireParticipant(participantId)
        if (participant.transport !== 'websocket') {
            throw new PlanningPokerError('invalid_participant_transport', 'participant is not a WebSocket participant')
        }
        return participant
    }

    private requireParticipant(participantId: string): Participant {
        this.pruneExpiredParticipants()
        const participant = this.participants.get(participantId)
        if (!participant) {
            throw new PlanningPokerError('participant_not_found', 'participant is unknown or expired; join the session again')
        }
        return participant
    }

    private requireParticipantByName(name: string): Participant {
        this.pruneExpiredParticipants()
        const participant = this.findParticipantByName(name)
        if (!participant) {
            throw new PlanningPokerError('participant_not_found', 'Player not found')
        }
        return participant
    }

    private assertCurrentRound(roundId: string): void {
        if (roundId !== this.roundId) {
            throw new PlanningPokerError('stale_round', 'roundId does not match the current round')
        }
    }

    private assertVotingRound(): void {
        if (this.roundStatus === 'revealed') {
            throw new PlanningPokerError('round_revealed', 'votes cannot be changed after reveal')
        }
    }

    private renewLease(participant: Participant): void {
        if (participant.transport === 'mcp') {
            participant.leaseExpiresAt = this.now() + this.leaseDurationMs
        }
    }

    private revealIfComplete(): boolean {
        if (this.roundStatus === 'revealed') {
            return false
        }
        const activeVoters = [...this.participants.values()]
            .filter(participant => !participant.observer && !participant.snoozed)
        if (activeVoters.length <= 1 || !activeVoters.every(participant => this.votes.has(participant.participantId))) {
            return false
        }
        this.roundStatus = 'revealed'
        return true
    }

    private findParticipantByName(name: string): Participant | undefined {
        return [...this.participants.values()].find(participant => participant.name === name)
    }

    private changed(event: PlanningPokerEvent): void {
        this.revision += 1
        for (const listener of [...this.listeners]) {
            try {
                listener(event)
            } catch (error) {
                console.error('Planning poker state listener failed', error)
            }
        }
    }

    private nextId(prefix: string): string {
        return `${prefix}-${this.idGenerator()}`
    }
}

export function isPlanningPokerCard(value: string): value is PlanningPokerCard {
    return PLANNING_POKER_CARDS.some(card => card === value)
}
