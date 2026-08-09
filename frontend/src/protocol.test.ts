import { describe, expect, it } from 'vitest';
import {
  hasSelectionUpdate,
  isRegistrationMessage,
  messageCards,
  messageChoices,
  messageError,
  messagePlayers,
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

  it('accepts only non-empty, unique string card decks', () => {
    expect(messageCards({ cards: ['small', 'medium', 'large'] })).toEqual(['small', 'medium', 'large']);
    expect(messageCards({ cards: [] })).toBeUndefined();
    expect(messageCards({ cards: ['small', 'small'] })).toBeUndefined();
    expect(messageCards({ cards: ['small', ''] })).toBeUndefined();
    expect(messageCards({ cards: ['small', 8] })).toBeUndefined();
    expect(messageCards({ cards: 'small' })).toBeUndefined();
  });

  it('normalizes valid players while ignoring malformed entries', () => {
    const message = {
      players: [
        { name: 'Alice', choice: '8', selected: true, snoozed: false, observer: false },
        { name: 'Watcher', choice: 13, snoozed: true, observer: true },
        { choice: '5' },
      ],
      choices: [
        { name: 'Bob', choice: null, snoozed: false, observer: false },
        null,
      ],
    };

    expect(messagePlayers(message)).toEqual([
      { name: 'Alice', choice: '8', selected: true, snoozed: false, observer: false },
      { name: 'Watcher', choice: undefined, selected: false, snoozed: true, observer: true },
    ]);
    expect(messageChoices(message)).toEqual([
      { name: 'Bob', choice: undefined, selected: false, snoozed: false, observer: false },
    ]);
    expect(messagePlayers({ players: 'invalid' })).toBeUndefined();
    expect(messageChoices({ choices: 'invalid' })).toBeUndefined();
    expect(toPlayer({ name: 42 })).toBeUndefined();
  });
});
