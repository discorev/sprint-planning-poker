export interface Player {
  readonly name: string;
  readonly choice: string | undefined;
  readonly selected: boolean;
  readonly snoozed: boolean;
  readonly observer: boolean;
}

export type ClientMessage =
  | { readonly action: 'register'; readonly name: string; readonly observer?: boolean }
  | { readonly action: 'record-choice'; readonly choice?: string }
  | { readonly action: 'reset' }
  | { readonly action: 'snooze'; readonly player: string };

export type ServerMessage = Readonly<Record<string, unknown>>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseServerMessage(data: string): ServerMessage | undefined {
  try {
    const value: unknown = JSON.parse(data);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function isRegistrationMessage(message: ServerMessage): boolean {
  return message.action === 'register';
}

export function messageError(message: ServerMessage): string | undefined {
  return typeof message.error === 'string' ? message.error : undefined;
}

export function hasSelectionUpdate(
  message: ServerMessage,
): message is ServerMessage & { readonly name: string; readonly selected: unknown } {
  return typeof message.name === 'string' && Object.hasOwn(message, 'selected');
}

export function messagePlayers(message: ServerMessage): readonly Player[] | undefined {
  if (!Array.isArray(message.players)) {
    return undefined;
  }

  const players: Player[] = [];
  for (const value of message.players) {
    const player = toPlayer(value);
    if (player) {
      players.push(player);
    }
  }
  return players;
}

export function messageChoices(message: ServerMessage): readonly Player[] | undefined {
  if (!Array.isArray(message.choices)) {
    return undefined;
  }

  const choices: Player[] = [];
  for (const value of message.choices) {
    const player = toPlayer(value);
    if (player) {
      choices.push(player);
    }
  }
  return choices;
}

export function toPlayer(value: unknown): Player | undefined {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return undefined;
  }

  return {
    name: value.name,
    choice: typeof value.choice === 'string' ? value.choice : undefined,
    selected: value.selected === true,
    snoozed: value.snoozed === true,
    observer: value.observer === true,
  };
}
