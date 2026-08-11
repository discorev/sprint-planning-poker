import { describe, expect, it } from 'vitest';
import { LEGACY_REGISTRATION_CARD_FALLBACK } from '../legacy-card-deck';
import type { Player } from '../protocol';
import { allActivePlayersAgree, appReducer, initialAppState, type AppState } from './app-state';

const players: readonly Player[] = [
  { name: 'one', type: 'user', choice: undefined, rationale: undefined, selected: false, snoozed: false, observer: false, disconnected: false },
  { name: 'two', type: 'user', choice: undefined, rationale: undefined, selected: false, snoozed: false, observer: false, disconnected: false },
];

function state(overrides: Partial<AppState> = {}): AppState {
  return { ...initialAppState, players, ...overrides };
}

describe('appReducer', () => {
  it('tracks connection, registration, and local card selection state', () => {
    const connected = appReducer(initialAppState, { type: 'connection-changed', connected: true });
    const named = appReducer(connected, { type: 'name-changed', name: 'Alice' });
    const observing = appReducer(named, { type: 'observer-changed', observer: true });
    const submitting = appReducer(observing, { type: 'registration-started' });
    const rejected = appReducer(submitting, {
      type: 'registration-finished',
      success: false,
      error: 'name is already taken',
    });
    const registered = appReducer(rejected, { type: 'registration-finished', success: true });
    const selected = appReducer(registered, { type: 'selection-changed', selection: '8' });

    expect(selected).toMatchObject({
      connected: true,
      name: 'Alice',
      observer: true,
      registered: true,
      submitting: false,
      error: undefined,
      selection: '8',
    });
  });

  it('uses valid server cards from successful registration', () => {
    const cards = ['server-small', 'server-medium', 'server-large'];
    const result = appReducer(initialAppState, {
      type: 'server-message',
      message: { action: 'register', cards },
    });

    expect(result.cards).toEqual(cards);
    expect(result.cards).not.toBe(LEGACY_REGISTRATION_CARD_FALLBACK);
  });

  it('keeps the legacy fallback for omitted, malformed, and failed registration decks', () => {
    const registrations = [
      { action: 'register' },
      { action: 'register', cards: [] },
      { action: 'register', cards: ['1', '1'] },
      { action: 'register', cards: ['1', ''] },
      { action: 'register', cards: ['1', 2] },
      { action: 'register', cards: ['server-card'], error: 'name is already taken' },
    ];

    for (const message of registrations) {
      const result = appReducer(initialAppState, { type: 'server-message', message });
      expect(result.cards).toBe(LEGACY_REGISTRATION_CARD_FALLBACK);
    }
  });

  it('returns the same state for a duplicate connection update', () => {
    const current = state({ connected: true });
    expect(appReducer(current, { type: 'connection-changed', connected: true })).toBe(current);
  });

  it('applies overlapping server fields in legacy branch order', () => {
    const result = appReducer(state({ selection: '3' }), {
      type: 'server-message',
      message: {
        name: 'temporary',
        selected: true,
        players: [{ name: 'one', choice: null, snoozed: false, observer: false, disconnected: false }],
        action: 'snooze',
        player: 'one',
        snoozed: true,
        reset: true,
        choices: [{ name: 'one', choice: '5', snoozed: false, observer: false, disconnected: false }],
      },
    });

    expect(result.players).toEqual([
      { name: 'one', type: 'user', choice: '5', rationale: undefined, selected: true, snoozed: false, observer: false, disconnected: false },
    ]);
    expect(result.selection).toBeUndefined();
    expect(result.showReset).toBe(true);
  });

  it('merges revealed rationales onto existing players from a choices message', () => {
    const result = appReducer(state(), {
      type: 'server-message',
      message: {
        choices: [
          { name: 'one', choice: '5', rationale: 'Touches storage', snoozed: false, observer: false, disconnected: false },
          { name: 'two', choice: '8', snoozed: false, observer: false, disconnected: false },
        ],
      },
    });

    expect(result.players).toEqual([
      { name: 'one', type: 'user', choice: '5', rationale: 'Touches storage', selected: true, snoozed: false, observer: false, disconnected: false },
      { name: 'two', type: 'user', choice: '8', rationale: undefined, selected: true, snoozed: false, observer: false, disconnected: false },
    ]);
  });

  it('carries disconnected through the choices merge for retained ghosts', () => {
    const result = appReducer(state(), {
      type: 'server-message',
      message: {
        choices: [
          { name: 'one', choice: '5', snoozed: false, observer: false, disconnected: true },
          { name: 'two', choice: '8', snoozed: false, observer: false, disconnected: false },
        ],
      },
    });

    expect(result.players[0]).toMatchObject({ name: 'one', disconnected: true });
    expect(result.players[1]).toMatchObject({ name: 'two', disconnected: false });
  });

  it('adds selection updates for unknown players and wakes known players', () => {
    const withUnknown = appReducer(state(), {
      type: 'server-message',
      message: { name: 'three', selected: true },
    });
    const snoozedPlayers: readonly Player[] = [
      { ...players[0], snoozed: true },
      players[1],
    ];
    const withKnown = appReducer(state({ players: snoozedPlayers }), {
      type: 'server-message',
      message: { name: 'one', selected: false },
    });

    expect(withUnknown.players.at(-1)).toEqual({
      name: 'three',
      type: 'user',
      choice: undefined,
      rationale: undefined,
      selected: true,
      snoozed: false,
      observer: false,
      disconnected: false,
    });
    expect(withKnown.players[0]).toEqual({ ...players[0], snoozed: false });
  });

  it('replaces server player lists while preserving unchanged references', () => {
    const current = state();
    const result = appReducer(current, {
      type: 'server-message',
      message: {
        players: [
          { name: 'two', choice: null, snoozed: false, observer: false, disconnected: false },
          { name: 'one', choice: '3', snoozed: false, observer: false, disconnected: false },
        ],
      },
    });

    expect(result.players[0]).toBe(current.players[1]);
    expect(result.players[1]).not.toBe(current.players[0]);
    expect(result.players[1].choice).toBe('3');
  });

  it('preserves the state for repeated reset broadcasts with server null choices', () => {
    const current = state();
    const message = {
      players: [
        { name: 'one', choice: null, snoozed: false, observer: false, disconnected: false },
        { name: 'two', choice: null, snoozed: false, observer: false, disconnected: false },
      ],
      reset: true,
    };

    const first = appReducer(current, { type: 'server-message', message });
    const second = appReducer(first, { type: 'server-message', message });

    expect(first).toBe(current);
    expect(second).toBe(first);
    expect(second.players[0]).toBe(current.players[0]);
    expect(second.players[1]).toBe(current.players[1]);
  });

  it('updates snooze messages without changing unrelated players', () => {
    const current = state();
    const result = appReducer(current, {
      type: 'server-message',
      message: { action: 'snooze', player: 'one', snoozed: true },
    });

    expect(result.players[0]).toEqual({ ...players[0], snoozed: true });
    expect(result.players[1]).toBe(current.players[1]);
  });

  it('resets choices and rationale without changing snooze and observer state', () => {
    const currentPlayers: readonly Player[] = [
      { name: 'one', type: 'user', choice: '3', rationale: 'Touches storage', selected: true, snoozed: true, observer: false, disconnected: false },
      { name: 'watcher', type: 'agent', choice: undefined, rationale: undefined, selected: false, snoozed: false, observer: true, disconnected: false },
    ];
    const result = appReducer(state({ players: currentPlayers, showReset: true, confettiFired: true }), {
      type: 'server-message',
      message: { reset: true },
    });

    expect(result.players).toEqual([
      { name: 'one', type: 'user', choice: undefined, rationale: undefined, selected: false, snoozed: true, observer: false, disconnected: false },
      currentPlayers[1],
    ]);
    expect(result.players[1]).toBe(currentPlayers[1]);
    expect(result).toMatchObject({ showReset: false, selection: undefined, confettiFired: false });
  });

  it('reveals choices, adds missing players, and fires celebration once per round', () => {
    const choices = {
      choices: [
        { name: 'one', choice: '5', snoozed: false, observer: false, disconnected: false },
        { name: 'two', choice: '5', snoozed: false, observer: false, disconnected: false },
        { name: 'watcher', choice: undefined, snoozed: false, observer: true, disconnected: false },
      ],
    };
    const first = appReducer(state(), { type: 'server-message', message: choices });
    const duplicate = appReducer(first, { type: 'server-message', message: choices });
    const reset = appReducer(duplicate, { type: 'server-message', message: { reset: true } });
    const nextRound = appReducer(reset, { type: 'server-message', message: choices });

    expect(first.players.at(-1)).toEqual({
      name: 'watcher',
      type: 'user',
      choice: undefined,
      rationale: undefined,
      selected: true,
      snoozed: false,
      observer: true,
      disconnected: false,
    });
    expect(first.showReset).toBe(true);
    expect(first.celebrationCount).toBe(1);
    expect(duplicate.celebrationCount).toBe(1);
    expect(nextRound.celebrationCount).toBe(2);
  });
});

describe('allActivePlayersAgree', () => {
  it('requires at least two non-observer, non-snoozed matching choices', () => {
    expect(allActivePlayersAgree([
      { name: 'one', type: 'user', choice: '8', rationale: undefined, selected: true, snoozed: false, observer: false, disconnected: false },
      { name: 'two', type: 'user', choice: '8', rationale: undefined, selected: true, snoozed: false, observer: false, disconnected: false },
      { name: 'watcher', type: 'user', choice: '13', rationale: undefined, selected: true, snoozed: false, observer: true, disconnected: false },
    ])).toBe(true);
    expect(allActivePlayersAgree([
      { name: 'one', type: 'user', choice: '8', rationale: undefined, selected: true, snoozed: false, observer: false, disconnected: false },
      { name: 'two', type: 'user', choice: '8', rationale: undefined, selected: true, snoozed: true, observer: false, disconnected: false },
    ])).toBe(false);
  });

  it('rejects missing or different active choices', () => {
    expect(allActivePlayersAgree(players)).toBe(false);
    expect(allActivePlayersAgree([
      { ...players[0], choice: '5', selected: true },
      { ...players[1], choice: '8', selected: true },
    ])).toBe(false);
  });
});
