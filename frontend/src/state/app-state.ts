import { LEGACY_REGISTRATION_CARD_FALLBACK } from '../legacy-card-deck';
import {
  hasSelectionUpdate,
  messageCards,
  messageChoices,
  messageError,
  messagePlayers,
  messageSubject,
  type Player,
  type ServerMessage,
} from '../protocol';

export interface AppState {
  readonly connected: boolean;
  readonly name: string;
  readonly observer: boolean;
  readonly registered: boolean;
  readonly submitting: boolean;
  readonly error?: string;
  readonly selection?: string;
  readonly showReset: boolean;
  readonly confettiFired: boolean;
  readonly celebrationCount: number;
  readonly cards: readonly string[];
  readonly players: readonly Player[];
  readonly subject?: string;
}

export type AppAction =
  | { readonly type: 'connection-changed'; readonly connected: boolean }
  | { readonly type: 'name-changed'; readonly name: string }
  | { readonly type: 'observer-changed'; readonly observer: boolean }
  | { readonly type: 'registration-started' }
  | { readonly type: 'registration-finished'; readonly success: boolean; readonly error?: string }
  | { readonly type: 'selection-changed'; readonly selection?: string }
  | { readonly type: 'server-message'; readonly message: ServerMessage };

export const initialAppState: AppState = {
  connected: false,
  name: '',
  observer: false,
  registered: false,
  submitting: false,
  showReset: false,
  confettiFired: false,
  celebrationCount: 0,
  cards: LEGACY_REGISTRATION_CARD_FALLBACK,
  players: [],
};

function playerEquals(left: Player, right: Player): boolean {
  return left.name === right.name
    && left.type === right.type
    && left.choice === right.choice
    && left.rationale === right.rationale
    && left.selected === right.selected
    && left.snoozed === right.snoozed
    && left.observer === right.observer
    && left.disconnected === right.disconnected;
}

function replacePlayersWithSharing(
  current: readonly Player[],
  incoming: readonly Player[],
): readonly Player[] {
  let changed = current.length !== incoming.length;
  const byName = new Map(current.map((player) => [player.name, player]));
  const next = incoming.map((player, index) => {
    const existing = byName.get(player.name);
    if (existing && playerEquals(existing, player)) {
      if (current[index] !== existing) {
        changed = true;
      }
      return existing;
    }
    changed = true;
    return player;
  });
  return changed ? next : current;
}

function updatePlayer(
  players: readonly Player[],
  name: string,
  update: (player: Player) => Player,
): readonly Player[] {
  const index = players.findIndex((player) => player.name === name);
  if (index === -1) {
    return players;
  }
  const current = players[index];
  const updated = update(current);
  if (updated === current || playerEquals(current, updated)) {
    return players;
  }
  const next = players.slice();
  next[index] = updated;
  return next;
}

export function activePlayers(players: readonly Player[]): readonly Player[] {
  return players.filter((player) => !player.snoozed && !player.observer);
}

export function allActivePlayersAgree(players: readonly Player[]): boolean {
  const active = activePlayers(players);
  if (active.length < 2 || !active[0].choice) {
    return false;
  }
  return active.every((player) => player.choice === active[0].choice);
}

function applyServerMessage(state: AppState, message: ServerMessage): AppState {
  let next = state;

  if (message.action === 'register' && !messageError(message)) {
    const cards = messageCards(message);
    if (cards) {
      next = { ...next, cards };
    }
  }

  // These branches intentionally remain independent and ordered to match the legacy client.
  const subject = messageSubject(message);
  if (subject !== undefined) {
    const nextSubject = subject ?? undefined;
    if (next.subject !== nextSubject) {
      next = { ...next, subject: nextSubject };
    }
  }

  if (hasSelectionUpdate(message)) {
    const existing = next.players.some((player) => player.name === message.name);
    const players = existing
      ? updatePlayer(next.players, message.name, (player) => ({
          ...player,
          selected: message.selected === true,
          snoozed: false,
        }))
      : [...next.players, {
          name: message.name,
          type: 'user' as const,
          choice: undefined,
          rationale: undefined,
          selected: message.selected === true,
          snoozed: false,
          observer: false,
          disconnected: false,
        }];
    if (players !== next.players) {
      next = { ...next, players };
    }
  }

  const playersMessage = messagePlayers(message);
  if (playersMessage) {
    const players = replacePlayersWithSharing(next.players, playersMessage);
    if (players !== next.players) {
      next = { ...next, players };
    }
  }

  if (message.action === 'snooze' && typeof message.player === 'string') {
    const players = updatePlayer(next.players, message.player, (player) => ({
      ...player,
      snoozed: message.snoozed === true,
    }));
    if (players !== next.players) {
      next = { ...next, players };
    }
  }

  if (message.reset) {
    const resetPlayers = next.players.map((player) => {
      if (player.choice === undefined && player.rationale === undefined && !player.selected) {
        return player;
      }
      return { ...player, choice: undefined, rationale: undefined, selected: false };
    });
    const players = resetPlayers.every((player, index) => player === next.players[index])
      ? next.players
      : resetPlayers;
    if (next.showReset || next.selection !== undefined || next.confettiFired || players !== next.players) {
      next = {
        ...next,
        showReset: false,
        selection: undefined,
        confettiFired: false,
        players,
      };
    }
  }

  const choices = messageChoices(message);
  if (choices) {
    let players = next.players;
    for (const choice of choices) {
      const existing = players.some((player) => player.name === choice.name);
      if (existing) {
        players = updatePlayer(players, choice.name, (player) => ({
          ...player,
          choice: choice.choice,
          rationale: choice.rationale,
          selected: choice.choice !== undefined,
          snoozed: choice.snoozed,
          disconnected: choice.disconnected,
        }));
      } else {
        players = [...players, { ...choice, selected: true }];
      }
    }

    const shouldCelebrate = !next.confettiFired && allActivePlayersAgree(players);
    next = {
      ...next,
      players,
      showReset: true,
      confettiFired: next.confettiFired || shouldCelebrate,
      celebrationCount: shouldCelebrate ? next.celebrationCount + 1 : next.celebrationCount,
    };
  }

  return next;
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'connection-changed':
      return state.connected === action.connected ? state : { ...state, connected: action.connected };
    case 'name-changed':
      return { ...state, name: action.name };
    case 'observer-changed':
      return { ...state, observer: action.observer };
    case 'registration-started':
      return { ...state, error: undefined, submitting: true };
    case 'registration-finished':
      return {
        ...state,
        registered: action.success,
        submitting: false,
        error: action.success ? undefined : action.error,
      };
    case 'selection-changed':
      return { ...state, selection: action.selection };
    case 'server-message':
      return applyServerMessage(state, action.message);
  }
}
