import { describe, expect, it } from 'vitest';
import {
  hasSelectionUpdate,
  isRegistrationMessage,
  messageCards,
  messageChoices,
  messageError,
  messagePlayers,
  messageSubject,
  parseServerMessage,
  toPlayer,
} from './protocol';

describe('server protocol parsing', () => {
  it('accepts object messages and rejects invalid JSON and non-objects', () => {
    expect(parseServerMessage('{"reset":true}')).toEqual({ reset: true });
    expect(parseServerMessage('not-json')).toBeUndefined();
    expect(parseServerMessage('null')).toBeUndefined();
    expect(parseServerMessage('[]')).toBeUndefined();
  });

  it('recognizes registration, error, and selection fields narrowly', () => {
    const registration = { action: 'register', error: 'name is already taken' };
    expect(isRegistrationMessage(registration)).toBe(true);
    expect(messageError(registration)).toBe('name is already taken');
    expect(messageError({ error: 500 })).toBeUndefined();
    expect(hasSelectionUpdate({ name: 'Alice', selected: false })).toBe(true);
    expect(hasSelectionUpdate({ name: 'Alice' })).toBe(false);
  });

  it('defaults type to user when missing or unrecognized', () => {
    expect(toPlayer({ name: 'Alice' })).toMatchObject({ type: 'user' });
    expect(toPlayer({ name: 'Alice', type: 'robot' })).toMatchObject({ type: 'user' });
    expect(toPlayer({ name: 'Agent', type: 'agent' })).toMatchObject({ type: 'agent' });
  });

  it('parses a string rationale and defaults it to undefined otherwise', () => {
    expect(toPlayer({ name: 'Alice', rationale: 'Touches storage' })).toMatchObject({ rationale: 'Touches storage' });
    expect(toPlayer({ name: 'Alice' })).toMatchObject({ rationale: undefined });
    expect(toPlayer({ name: 'Alice', rationale: 42 })).toMatchObject({ rationale: undefined });
  });

  it('parses disconnected and defaults it to false otherwise', () => {
    expect(toPlayer({ name: 'Alice', disconnected: true })).toMatchObject({ disconnected: true });
    expect(toPlayer({ name: 'Alice' })).toMatchObject({ disconnected: false });
    expect(toPlayer({ name: 'Alice', disconnected: 'yes' })).toMatchObject({ disconnected: false });
  });

  it('accepts only non-empty, unique string card decks', () => {
    expect(messageCards({ cards: ['small', 'medium', 'large'] })).toEqual(['small', 'medium', 'large']);
    expect(messageCards({ cards: [] })).toBeUndefined();
    expect(messageCards({ cards: ['small', 'small'] })).toBeUndefined();
    expect(messageCards({ cards: ['small', ''] })).toBeUndefined();
    expect(messageCards({ cards: ['small', 8] })).toBeUndefined();
    expect(messageCards({ cards: 'small' })).toBeUndefined();
  });

  it('distinguishes an absent subject from a cleared or set one', () => {
    expect(messageSubject({})).toBeUndefined();
    expect(messageSubject({ subject: null })).toBeNull();
    expect(messageSubject({ subject: 'Login flow' })).toBe('Login flow');
    expect(messageSubject({ subject: 42 })).toBeNull();
  });

  it('normalizes valid players while ignoring malformed entries', () => {
    const message = {
      players: [
        { name: 'Alice', choice: '8', selected: true, snoozed: false, observer: false, type: 'user' },
        { name: 'Watcher', choice: 13, snoozed: true, observer: true, type: 'agent' },
        { choice: '5' },
      ],
      choices: [
        { name: 'Bob', choice: null, snoozed: false, observer: false },
        null,
      ],
    };

    expect(messagePlayers(message)).toEqual([
      { name: 'Alice', type: 'user', choice: '8', rationale: undefined, selected: true, snoozed: false, observer: false, disconnected: false },
      { name: 'Watcher', type: 'agent', choice: undefined, rationale: undefined, selected: false, snoozed: true, observer: true, disconnected: false },
    ]);
    expect(messageChoices(message)).toEqual([
      { name: 'Bob', type: 'user', choice: undefined, rationale: undefined, selected: false, snoozed: false, observer: false, disconnected: false },
    ]);
    expect(messagePlayers({ players: 'invalid' })).toBeUndefined();
    expect(messageChoices({ choices: 'invalid' })).toBeUndefined();
    expect(toPlayer({ name: 42 })).toBeUndefined();
  });
});
